// runs/runEngine.ts — Run 编排
//
// 生命周期：enqueueRun → mn_runs(queued) → pick → running → 各 axis × subDim
//   → snapshot → mn_axis_versions → cross-axis links → succeeded/failed → emit
//
// PR4 为进程内实现。并发 = options.runConcurrency (默认 2)。
// PR5 起可替换为 BullMQ Adapter 以支持分布式。

import type {
  MeetingNotesDeps,
  EnqueueRunRequest,
  RunRecord,
  RunState,
  ScopeRef,
  AxisName,
  Preset,
  RunTrigger,
} from '../types.js';
import { RunQueue } from './runQueue.js';
import { VersionStore } from './versionStore.js';
import { hostname as osHostname } from 'node:os';
import { ALL_AXES, AXIS_SUBDIMS, runAxisAll } from '../axes/registry.js';
import type { ComputeResult } from '../axes/_shared.js';
import { llmUsageStorage, type LLMUsageCounter } from '../adapters/pipeline.js';
import { buildDispatchPlan, type DispatchPlan, type ExpertSlot } from './dispatchPlan.js';
import {
  loadExpertSnapshots,
  buildExpertPersonaByAxis,
  type ExpertRoleAssignment,
} from './expertProfileLoader.js';
import { strategyStorage, splitDecorators, applyDecoratorStack } from '../axes/decoratorStack.js';
import { synthesizeDeliverables } from './synthesis.js';
import { renderMultiDim } from './renderMultiDim.js';
import { composeAnalysisFromAxes, persistAnalysisToAsset } from './composeAnalysis.js';
import { autoMatchAndBindScopes } from './scopeMatcher.js';
import { parseMeeting } from '../parse/meetingParser.js';

interface QueuePayload {
  runId: string;
  scope: ScopeRef;
  axis: AxisName;
  subDims: string[];
  preset: Preset;
  strategySpec: string | null;
  triggeredBy: RunTrigger;
  parentRunId: string | null;
  meetingId?: string;
  /** Step 2 用户为各角色指定的真实 expert id 列表（持久化在 mn_runs.metadata.expertRoles） */
  expertRoles?: ExpertRoleAssignment | null;
  /** 生成模式：'multi-axis'（默认 16 轴循环）/ 'claude-cli'（一次性 spawn claude -p）/ 'api-oneshot'（一次性 SDK 调用） */
  mode?: 'multi-axis' | 'claude-cli' | 'api-oneshot';
}

const RUN_TRIGGERS = new Set<RunTrigger>(['auto', 'manual', 'schedule', 'cascade']);
const PRESETS = new Set<Preset>(['lite', 'standard', 'max']);
/** mn_runs.scope_id 为 UUID；前端可能传 ref 或非 UUID 占位符，非法则置空避免 INSERT 失败 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function coerceRunTrigger(v: unknown): RunTrigger {
  return typeof v === 'string' && RUN_TRIGGERS.has(v as RunTrigger) ? (v as RunTrigger) : 'manual';
}

function coercePreset(v: unknown): Preset | undefined {
  return typeof v === 'string' && PRESETS.has(v as Preset) ? (v as Preset) : undefined;
}

/**
 * preset → 默认装饰器栈：当 meetingKindStrategyMap 没匹配上（如 workshop / general）
 * 时回退到 preset 提供的合理默认值。否则会出现"用户选了 standard 但 strategy=null、
 * 装饰器栈为空"的退化 — UI 上显示深度模式，实际生成跟 lite 没区别。
 *
 * 与 services/expert-application/presets.ts 的 PRESET_COMBOS 主旋律保持一致，
 * 但提取成单一字符串（meeting-notes 侧只用单一 strategySpec，不按 task type 切分）。
 */
const PRESET_DEFAULT_STRATEGY: Record<Preset, string> = {
  lite: 'failure_check|emm_iterative|signature_style|single',
  standard:
    'failure_check|emm_iterative|rubric_anchored_output|calibrated_confidence|signature_style|debate',
  max:
    'failure_check|emm_iterative|evidence_anchored|rubric_anchored_output|track_record_verify|signature_style|mental_model_rotation',
};

/** 校验 expertRoles：仅保留 people/projects/knowledge 三个角色 + 字符串 id */
function sanitizeExpertRoles(raw: unknown): ExpertRoleAssignment | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const allowed = ['people', 'projects', 'knowledge'] as const;
  const cleaned: ExpertRoleAssignment = {};
  let any = false;
  for (const role of allowed) {
    const ids = (raw as Record<string, unknown>)[role];
    if (Array.isArray(ids)) {
      const filtered = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (filtered.length > 0) {
        cleaned[role] = filtered;
        any = true;
      }
    }
  }
  return any ? cleaned : undefined;
}

/** 兼容 scope.ref；非 UUID 的 id/ref 不写入 scope_id（DB 列为 UUID） */
function normalizeScopeForDb(scope: ScopeRef & { ref?: unknown }): ScopeRef {
  const raw = scope.id ?? (typeof scope.ref === 'string' ? scope.ref : undefined);
  let id: string | undefined =
    typeof raw === 'string' && raw.length > 0 && UUID_RE.test(raw) ? raw : undefined;
  return { kind: scope.kind, id };
}

function mapRun(row: Record<string, any>): RunRecord {
  const meta = row.metadata ?? {};
  const inputTokens = Number(meta.inputTokens ?? 0);
  const outputTokens = Number(meta.outputTokens ?? 0);
  return {
    id: row.id,
    scope: { kind: row.scope_kind, id: row.scope_id ?? undefined },
    axis: row.axis,
    subDims: row.sub_dims ?? [],
    preset: row.preset,
    strategy: row.strategy_spec,
    state: row.state,
    triggeredBy: row.triggered_by,
    parentRunId: row.parent_run_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    costTokens: row.cost_tokens ?? 0,
    costMs: row.cost_ms ?? 0,
    progressPct: Number(row.progress_pct ?? 0),
    errorMessage: row.error_message,
    metadata: meta,
    // Phase 15.6 surfaces — frontend reads these directly
    tokens: { input: inputTokens, output: outputTokens },
    currentStep: typeof meta.currentStep === 'string' ? meta.currentStep : null,
    currentStepKey: typeof meta.currentStepKey === 'string' ? meta.currentStepKey : null,
    llmCalls: Number(meta.llmCalls ?? 0),
    // Phase 15.8 — surface dispatchPlan / decorators / synthesis / render so
    // 前端 GenerationCenter / NewMeeting 不必再去解析 metadata jsonb
    surfaces: {
      dispatchPlan: meta.dispatchPlan ?? null,
      decorators: meta.decorators ?? null,
      synthesis: meta.synthesis ?? null,
      render: meta.render ?? null,
    },
  };
}

export class RunEngine {
  private readonly queue: RunQueue<QueuePayload>;
  private readonly versionStore: VersionStore;
  /** F3 · 进程稳定标识：hostname:pid:start-epoch-ms。同一进程的所有 run 共享。 */
  private readonly workerId: string = `${process.env.HOSTNAME ?? 'host'}:${process.pid}:${Date.now()}`;
  /** F3 · heartbeat 间隔（ms）。zombie 检测用 5 min × 2 = 10 min 安全裕度。 */
  private static readonly HEARTBEAT_MS = 30_000;

  /** API-only 模式：不执行 run（不消费内存队列、不从 DB 拉 queued）。
   *  专门用来让 dev API 进程（tsx watch 容易抖动）不再持有 claude 子进程，
   *  把执行权交给 worker 进程（npm run worker:mn）。
   *  housekeeping（orphan-recovery + zombie cleanup）继续跑，无副作用。
   */
  private readonly executorDisabled: boolean = process.env.MN_API_ONLY === 'true';

  constructor(
    private readonly deps: MeetingNotesDeps,
    private readonly getMeetingAxes: (meetingId: string) => Promise<any>,
    opts: { concurrency?: number; zombieTimeoutMin?: number } = {},
  ) {
    this.queue = new RunQueue<QueuePayload>(opts.concurrency ?? 2);
    this.versionStore = new VersionStore(deps);
    if (!this.executorDisabled) {
      // P2 worker-pool：queue 自驱，不再用 drainSoon
      this.queue.start((item) => this.execute(item.payload));
    } else {
      console.log('[RunEngine] MN_API_ONLY=true → executor disabled (worker process is responsible for executing runs)');
    }

    // Opt-3 (O4) + P2 recovery：启动时清扫僵尸 + 把 DB 里残留的 queued runs 重新捡回内存队列
    // RunQueue 是 in-memory，进程重启 / 崩溃后 mn_runs.state='running'/'queued' 会丢失内存追踪。
    // - cleanupZombieRuns: started_at < NOW() - zombieTimeoutMin 的 running 标 failed
    // - recoverQueuedRuns: state='queued' 的 run 全部重 enqueue 到 in-memory，让 worker 接管
    const zombieMin = opts.zombieTimeoutMin ?? 30;
    const initialReap = () => {
      // 先按 cliPid 精确扫一遍：API 重启后立即收掉孤儿 claude 进程组 + 标 run failed，
      // 不用等 15min heartbeat 超时；零误杀（pgid 验证）。
      this.recoverOrphanCliRuns().catch((e) =>
        console.warn('[RunEngine] orphan-cli recovery failed:', (e as Error).message),
      );
      this.cleanupZombieRuns(zombieMin).catch((e) =>
        console.warn('[RunEngine] zombie cleanup failed:', (e as Error).message),
      );
      // executorDisabled 时不拉 queued —— worker 进程会拉
      if (!this.executorDisabled) {
        this.recoverQueuedRuns().catch((e) =>
          console.warn('[RunEngine] queued run recovery failed:', (e as Error).message),
        );
      }
    };
    setImmediate(initialReap);
    // F4 · 周期 reaper：每 60 秒跑一次，让 zombie 检测 + 队列恢复持续生效
    // 替代之前只在启动时跑一次的语义，覆盖了：
    //   - 长跑进程中 worker 崩溃导致的 zombie（heartbeat 5min 超时 + 这里 60s 检测）
    //   - 多进程时其它 worker 入了 queued 状态本进程没看到（重新捡回内存队列）
    //   - 浏览器/外部直接 INSERT mn_runs(state='queued') 的运维口径
    const reaperInterval = setInterval(initialReap, 60_000);
    if (typeof reaperInterval.unref === 'function') reaperInterval.unref();
  }

  /**
   * P2 recovery：把 mn_runs 中 state='queued' 的 run 重新 enqueue 到内存队列。
   * PM2 重启 / 进程崩溃后 in-memory queue 会丢，但 DB 里的 run 行还在；
   * 没有这个方法，那些 run 会等 1 小时后 cleanupZombieRuns 把它们标 cancelled，
   * 用户看到 stuck-queued。
   *
   * expertRoles 在 mn_runs 没存（run 入队时只在 in-memory payload 里），recover 时丢失。
   * 影响：恢复跑的 run 不会按用户上次指定的真实专家展开 → 用 strategy/preset 默认。
   */
  async recoverQueuedRuns(): Promise<{ recovered: number }> {
    let recovered = 0;
    try {
      const r = await this.deps.db.query(
        `SELECT id, scope_kind, scope_id::text AS scope_id, axis, sub_dims, preset,
                strategy_spec, triggered_by, parent_run_id, metadata
           FROM mn_runs
          WHERE state = 'queued'
          ORDER BY created_at ASC`,
      );
      for (const row of r.rows) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const mode: 'multi-axis' | 'claude-cli' | 'api-oneshot' =
          meta.mode === 'claude-cli' ? 'claude-cli'
          : meta.mode === 'api-oneshot' ? 'api-oneshot'
          : 'multi-axis';
        this.queue.enqueue({
          id: row.id,
          payload: {
            runId: row.id,
            scope: { kind: row.scope_kind, id: row.scope_id ?? undefined },
            axis: row.axis,
            subDims: row.sub_dims ?? [],
            preset: row.preset,
            strategySpec: row.strategy_spec ?? null,
            triggeredBy: row.triggered_by,
            parentRunId: row.parent_run_id ?? null,
            meetingId: row.scope_kind === 'meeting' ? row.scope_id : undefined,
            expertRoles: undefined,
            mode,
          },
          enqueuedAt: Date.now(),
        });
        recovered += 1;
      }
      if (recovered > 0) console.log(`[RunEngine] recovered ${recovered} queued runs from DB`);
    } catch (e) {
      console.warn('[RunEngine] recoverQueuedRuns failed:', (e as Error).message);
    }
    return { recovered };
  }

  /**
   * pid-based 孤儿恢复：API 重启 / SIGKILL 后跑的清扫。
   *
   * claudeCliRunner spawn 后把 cliPid (= sh.pid = pgid，detached:true 让 sh 当组 leader)
   * 和 apiPid (本 Node API 的 process.pid) 持久化到 metadata。这里只扫
   * apiPid != 本进程 pid 的 run —— 即"上一辈 API 起的、现在没人管"的 —— 避免误伤当前 API
   * 自己正在跑的活 run。
   *
   *   1) SELECT state='running' AND metadata.apiPid != 我.pid AND 有 cliPid
   *   2) process.kill(-pgid, 0) 探活：组里还有人活着 = 孤儿 → 整组 SIGKILL；探不到 = 进程早死
   *   3) 无论哪种，都把 run 标 failed（记 wasGroupAlive 区分场景）
   *
   * 比 heartbeat-based zombie 兜底（15min 阈值）快得多 —— 60s reaper 周期内必结。
   */
  async recoverOrphanCliRuns(): Promise<{ killedAlive: number; markedDead: number }> {
    let killedAlive = 0;
    let markedDead = 0;
    const myPid = process.pid;
    const myHost = osHostname();
    try {
      // 跨机器场景下：不能去扫别的机器 spawn 的 claude（process.kill 只能查本机 pid）。
      // 只扫"apiHost = 我.hostname AND apiPid != 我.pid"的行 —— 那一定是同机器上一辈进程留下的孤儿。
      // 老 run（没 apiHost 字段，例如 metadata 里只有 cliPid 没 apiHost）也只在 apiHost 缺失时才扫，
      // 假定它是本机老格式（向后兼容）。
      const r = await this.deps.db.query(
        `SELECT id,
                (metadata->>'cliPid')::int  AS cli_pid,
                (metadata->>'cliPgid')::int AS cli_pgid,
                (metadata->>'apiPid')::int  AS api_pid,
                metadata->>'apiHost'        AS api_host
           FROM mn_runs
          WHERE state = 'running'
            AND metadata ? 'cliPid'
            AND (metadata->>'apiPid')::int IS DISTINCT FROM $1::int
            AND (
              metadata->>'apiHost' = $2::text       -- 同机器且 pid 不同 → 上一辈孤儿
              OR NOT (metadata ? 'apiHost')         -- 老 run 缺字段，按"同机器"处理（向后兼容）
            )`,
        [myPid, myHost],
      );
      for (const row of r.rows) {
        const pid = Number(row.cli_pid);
        const pgid = Number(row.cli_pgid ?? row.cli_pid);
        const ownerApiPid = Number(row.api_pid);
        if (!pid || !pgid) continue;

        // 关键：探一下原来 spawn 这个 claude 的 API/worker 进程是否还活着。
        // 如果活着 → 这条 run 不是孤儿，是兄弟进程在跑（split mode：API + Worker 同时跑）→ 跳过！
        // 如果死了 → 真孤儿，按原逻辑收。
        // 这一步必须有，否则 API + Worker 分离后两个进程会互相把对方的活 run 当孤儿杀。
        if (ownerApiPid) {
          let ownerAlive = false;
          try {
            process.kill(ownerApiPid, 0);
            ownerAlive = true;
          } catch { /* ESRCH = owner 已死 */ }
          if (ownerAlive) {
            // owner 还活着 → 它在管这条 run，别动
            continue;
          }
        }

        let groupAlive = false;
        try {
          // signal 0 = 仅探测；整组探测时只要有任何成员活就 OK
          process.kill(-pgid, 0);
          groupAlive = true;
        } catch {
          // ESRCH: 组里没人
        }

        if (groupAlive) {
          try {
            process.kill(-pgid, 'SIGKILL');
            console.warn(`[RunEngine] orphan claude pgid=${pgid} (run ${row.id}, owner apiPid=${row.api_pid}) killed`);
          } catch (e) {
            console.warn(`[RunEngine] kill pgid=${pgid} failed:`, (e as Error).message);
          }
          killedAlive += 1;
        } else {
          markedDead += 1;
        }

        await this.deps.db.query(
          `UPDATE mn_runs SET
             state = 'failed', finished_at = NOW(),
             error_message = COALESCE(error_message, $2),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'currentStep', '失败 · 进程恢复扫描'::text,
               'currentStepKey', 'orphan-recovery',
               'orphanRecoveredAt', NOW()::text,
               'wasGroupAlive', $3::boolean,
               'recoveredCliPid', $4::int,
               'recoveredCliPgid', $5::int
             )
           WHERE id = $1 AND state = 'running'`,
          [
            row.id,
            groupAlive
              ? 'orphan-after-restart: claude process group killed during sweep'
              : 'process-gone-after-restart: parent API died before claude finished',
            groupAlive,
            pid,
            pgid,
          ],
        );
      }
      if (killedAlive + markedDead > 0) {
        console.log(`[RunEngine] orphan-cli recovery: killed ${killedAlive} alive group(s), marked ${markedDead} dead`);
      }
    } catch (e) {
      console.warn('[RunEngine] recoverOrphanCliRuns failed:', (e as Error).message);
    }
    return { killedAlive, markedDead };
  }

  /**
   * Opt-3 (O4): 把 started_at 早于 zombieTimeoutMin 分钟前但仍 state='running'
   * 的 run 标 failed，并写明确的 error_message 让运维 / 前端可见。
   * 同时清理 state='queued' 但 created_at 太久以前的 run（队列已丢）。
   */
  async cleanupZombieRuns(zombieMin: number): Promise<{ failedRuns: number; cancelledQueued: number }> {
    let failedRuns = 0;
    let cancelledQueued = 0;
    try {
      // F3 · 用 last_heartbeat_at 替代 started_at 检测 zombie：
      //   - 有 heartbeat 列：last_heartbeat_at < NOW() - 15min（claude-cli opus 单次 run 7-10min,
      //     5min 太激进会误杀正常 run; 远小于 zombieMin=30min, 反应仍及时）
      //   - 没 heartbeat 列（旧 run 或 worker 崩溃前 30s 内）：fallback 走 started_at < NOW() - zombieMin
      const heartbeatStaleMin = Number(process.env.MN_HEARTBEAT_STALE_MIN ?? 15);
      const r1 = await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'failed', finished_at = NOW(),
                error_message = COALESCE(error_message, 'heartbeat-timeout: process restart or crash'),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'currentStep', '失败 · 心跳超时',
                  'currentStepKey', 'zombie',
                  'zombieDetectedAt', NOW()::text,
                  'lastHeartbeatAt', last_heartbeat_at::text,
                  'staleSeconds', EXTRACT(EPOCH FROM (NOW() - COALESCE(last_heartbeat_at, started_at)))
                )
          WHERE state = 'running'
            AND (
              (last_heartbeat_at IS NOT NULL
                AND last_heartbeat_at < NOW() - ($2::int * INTERVAL '1 minute'))
              OR (last_heartbeat_at IS NULL
                AND started_at IS NOT NULL
                AND started_at < NOW() - ($1::int * INTERVAL '1 minute'))
            )
          RETURNING id`,
        [zombieMin, heartbeatStaleMin],
      );
      failedRuns = (r1 as any).rowCount ?? r1.rows?.length ?? 0;
    } catch (e) {
      console.warn('[RunEngine] cleanup running zombies failed:', (e as Error).message);
    }
    try {
      // F5 · queued 超过 6 小时无人处理 → 标 cancelled
      // 阈值从 1h 上调到 6h：用户实测下午入队的 run 因 concurrency=2 排队等几小时是正常的，
      // 1h 太激进会误杀。错误信息也改为更诚实的字面意思（不假设是重启）。
      const r2 = await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'cancelled', finished_at = NOW(),
                error_message = COALESCE(error_message, 'queued-timeout: not picked up by worker within 6h')
          WHERE state = 'queued'
            AND created_at < NOW() - INTERVAL '6 hours'
          RETURNING id`,
      );
      cancelledQueued = (r2 as any).rowCount ?? r2.rows?.length ?? 0;
    } catch (e) {
      console.warn('[RunEngine] cleanup queued orphans failed:', (e as Error).message);
    }
    if (failedRuns > 0 || cancelledQueued > 0) {
      console.log(`[RunEngine] zombie cleanup: failed=${failedRuns} cancelled=${cancelledQueued}`);
    }
    return { failedRuns, cancelledQueued };
  }

  /** 入队一条 run 并立即触发 drain（异步） */
  async enqueue(req: EnqueueRunRequest): Promise<{ ok: boolean; runId?: string; reason?: string }> {
    const scopeNorm = normalizeScopeForDb(req.scope as ScopeRef & { ref?: unknown });
    const reqNorm: EnqueueRunRequest = { ...req, scope: scopeNorm };
    const triggeredBy = coerceRunTrigger(req.triggeredBy);

    // F5 · scope+axis 级去重：同 scope+axis 已有 queued/running 时直接复用，
    // 避免用户连点 / scheduler 反复触发把同一作业堆 30+ 条进队（实测 4-28 美租金融
    // 一天堆 30 条全 cancelled）。命中已有 run 时返回它的 id 让前端能跟 SSE 进度，
    // 而不是悄悄插一条新的让用户在生成中心看到一堆复制品。
    try {
      const dup = await this.deps.db.query(
        `SELECT id::text FROM mn_runs
          WHERE scope_kind = $1
            AND COALESCE(scope_id::text,'') = COALESCE($2::text,'')
            AND axis = $3
            AND state IN ('queued','running')
          ORDER BY created_at DESC
          LIMIT 1`,
        [scopeNorm.kind, scopeNorm.id ?? null, req.axis],
      );
      if (dup.rows.length > 0) {
        const existingId = dup.rows[0].id as string;
        return { ok: true, runId: existingId, reason: 'dedupe-existing' };
      }
    } catch (e) {
      console.warn('[RunEngine] enqueue dedupe lookup failed:', (e as Error).message);
      // 查重失败不阻塞，继续走正常 INSERT 路径
    }

    // 1. 解析 strategy / preset
    //    优先级：req.strategy > meetingKind 映射的 default > preset 兜底默认
    //    最后这层兜底是关键：workshop / general 这种 kind 在 MEETING_KIND_STRATEGY 里
    //    没条目，否则前端选 preset='standard' 但实际 strategy=null，装饰器栈全空。
    const meetingKind = await this.lookupMeetingKind(reqNorm);
    const strategyFromApp = this.deps.expertApplication.resolveForMeetingKind(meetingKind);
    const preset: Preset =
      coercePreset(req.preset)
      ?? coercePreset(strategyFromApp?.preset as unknown)
      ?? 'standard';
    const strategySpec =
      req.strategy
      ?? strategyFromApp?.default
      ?? PRESET_DEFAULT_STRATEGY[preset]
      ?? null;

    // 2. 拉直 subDims：若未指定，使用 axis 全量子维度
    const subDims = req.subDims && req.subDims.length > 0
      ? req.subDims
      : (req.axis === 'all' ? [] : (AXIS_SUBDIMS[req.axis] ?? []));

    // 2.5 校验 expertRoles：丢空角色、仅保留字符串 id
    const expertRoles = sanitizeExpertRoles(req.expertRoles);

    // 3. 落 mn_runs(queued)
    const initialMeta: Record<string, any> = { meetingKind };
    if (expertRoles) initialMeta.expertRoles = expertRoles;
    // mode：'multi-axis' 不写入（默认值）；'claude-cli' / 'api-oneshot' 写到 metadata，供 execute() 分叉判断
    const runMode: 'multi-axis' | 'claude-cli' | 'api-oneshot' =
      req.mode === 'claude-cli' ? 'claude-cli'
      : req.mode === 'api-oneshot' ? 'api-oneshot'
      : 'multi-axis';
    if (runMode !== 'multi-axis') initialMeta.mode = runMode;
    // workspace_id 显式注入；不传时由 mn_runs 的 DEFAULT (default ws) 兜底
    const ins = req.workspaceId
      ? await this.deps.db.query(
          `INSERT INTO mn_runs
             (scope_kind, scope_id, axis, sub_dims, preset, strategy_spec,
              state, triggered_by, parent_run_id, metadata, workspace_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $9::jsonb, $10)
           RETURNING id`,
          [
            scopeNorm.kind,
            scopeNorm.id ?? null,
            req.axis,
            subDims,
            preset,
            strategySpec,
            triggeredBy,
            req.parentRunId ?? null,
            JSON.stringify(initialMeta),
            req.workspaceId,
          ],
        )
      : await this.deps.db.query(
          `INSERT INTO mn_runs
             (scope_kind, scope_id, axis, sub_dims, preset, strategy_spec,
              state, triggered_by, parent_run_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $9::jsonb)
           RETURNING id`,
          [
            scopeNorm.kind,
            scopeNorm.id ?? null,
            req.axis,
            subDims,
            preset,
            strategySpec,
            triggeredBy,
            req.parentRunId ?? null,
            JSON.stringify(initialMeta),
          ],
        );
    const runId = ins.rows[0].id as string;

    // 4. 入队
    // executorDisabled（API-only 进程）跳过 in-memory enqueue —— 否则会泄漏。
    // worker 进程的周期 reaper（recoverQueuedRuns，60s）会从 DB 拉 state='queued' 的 run。
    // 代价：API 起的 run 最多延迟 60s 才被 worker pickup；可接受（claude 自己 spawn + TTFB 也是这个量级）。
    if (this.executorDisabled) {
      return { ok: true, runId };
    }
    this.queue.enqueue({
      id: runId,
      payload: {
        runId,
        scope: scopeNorm,
        axis: req.axis,
        subDims,
        preset,
        strategySpec,
        triggeredBy,
        parentRunId: req.parentRunId ?? null,
        meetingId: scopeNorm.kind === 'meeting' ? scopeNorm.id : undefined,
        expertRoles,
        mode: runMode,
      },
      enqueuedAt: Date.now(),
    });

    // 5. P2 worker-pool：queue.enqueue 已自动 tick 拉走 idle worker，不需手动 drainSoon
    await this.deps.eventBus.publish('mn.run.enqueued', { runId });

    return { ok: true, runId };
  }

  async get(id: string): Promise<RunRecord | null> {
    const r = await this.deps.db.query(
      `SELECT * FROM mn_runs WHERE id = $1`,
      [id],
    );
    return r.rows[0] ? mapRun(r.rows[0]) : null;
  }

  /**
   * F6 · 列出 run payload 对应的 meeting id 列表
   *   - scope=meeting: 单个 meetingId（payload.meetingId 已设）
   *   - scope=project/client/topic: 走 mn_scope_members
   *   - scope=library: 全量 assets type='meeting_note'/'meeting_minutes'
   * 修了 execute() 在 project/library scope 下 silent-zero 的根本原因
   * （之前只把 payload.meetingId 传给 computer，多 meeting scope 下永远 undefined）
   */
  private async collectMeetingIdsForScope(payload: QueuePayload): Promise<string[]> {
    if (payload.scope.kind === 'meeting' && payload.meetingId) {
      return [payload.meetingId];
    }
    if (payload.scope.kind === 'library') {
      const r = await this.deps.db.query(
        `SELECT id FROM assets
          WHERE type = 'meeting_note' OR type = 'meeting_minutes' OR (metadata ? 'meeting_kind')`,
      );
      return r.rows.map((row: any) => String(row.id));
    }
    if (!payload.scope.id) return [];
    const r = await this.deps.db.query(
      `SELECT meeting_id::text AS meeting_id FROM mn_scope_members WHERE scope_id = $1`,
      [payload.scope.id],
    );
    return r.rows.map((row: any) => row.meeting_id);
  }

  /**
   * F4 · 运维诊断快照：把 in-memory queue + DB 状态打包返回
   * 用法：GET /api/v1/meeting-notes/runs/_diagnostics
   */
  async getDiagnostics(): Promise<{
    workerId: string;
    queue: { pending: number; running: number; concurrency: number };
    /** F5 · 内存队列里 pending items 的实际成分（dedupe 后 id → 出现次数）+ db 状态对照 */
    queuePending?: Array<{
      id: string;
      enqueuedAt: number;
      ageMs: number;
      dbState?: string | null;
    }>;
    dbStateBreakdown: Array<{ state: string; n: number }>;
    activeRuns: Array<{
      id: string;
      axis: string;
      worker_id: string | null;
      started_at: string | null;
      heartbeat_age_s: number | null;
      currentStep: string | null;
    }>;
    staleQueued: Array<{
      id: string;
      axis: string;
      created_at: string;
      age_s: number;
    }>;
  }> {
    const queueStats = this.queue.stats();
    const peekItems = this.queue.peek(50);

    const breakdownR = await this.deps.db.query(
      `SELECT state, count(*)::int AS n
         FROM mn_runs
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY state ORDER BY state`,
    );

    const activeR = await this.deps.db.query(
      `SELECT id::text, axis, worker_id,
              started_at::text AS started_at,
              EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at))::int AS heartbeat_age_s,
              metadata->>'currentStep' AS current_step
         FROM mn_runs
        WHERE state = 'running'
        ORDER BY started_at DESC
        LIMIT 20`,
    );

    const staleQR = await this.deps.db.query(
      `SELECT id::text, axis, created_at::text,
              EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_s
         FROM mn_runs
        WHERE state = 'queued'
          AND created_at < NOW() - INTERVAL '5 minutes'
        ORDER BY created_at ASC
        LIMIT 20`,
    );

    // F5 · 把 peek 出的内存 pending items 跟 DB state 对照，让运维一眼看出有多少是 stale
    let queuePending: Array<{ id: string; enqueuedAt: number; ageMs: number; dbState?: string | null }> = peekItems.map((p) => ({
      id: p.id,
      enqueuedAt: p.enqueuedAt,
      ageMs: p.ageMs,
    }));
    if (peekItems.length > 0) {
      const ids = peekItems.map((p) => p.id);
      try {
        const stateR = await this.deps.db.query(
          `SELECT id::text, state FROM mn_runs WHERE id = ANY($1::uuid[])`,
          [ids],
        );
        const stateMap = new Map<string, string>(stateR.rows.map((r: any) => [r.id, r.state]));
        queuePending = peekItems.map((p) => ({
          id: p.id,
          enqueuedAt: p.enqueuedAt,
          ageMs: p.ageMs,
          dbState: stateMap.get(p.id) ?? null,
        }));
      } catch (e) {
        console.warn('[RunEngine] queuePending dbState lookup failed:', (e as Error).message);
      }
    }

    return {
      workerId: this.workerId,
      queue: queueStats,
      queuePending,
      dbStateBreakdown: breakdownR.rows,
      activeRuns: activeR.rows.map((r: any) => ({
        id: r.id,
        axis: r.axis,
        worker_id: r.worker_id,
        started_at: r.started_at,
        heartbeat_age_s: r.heartbeat_age_s,
        currentStep: r.current_step,
      })),
      staleQueued: staleQR.rows.map((r: any) => ({
        id: r.id,
        axis: r.axis,
        created_at: r.created_at,
        age_s: r.age_s,
      })),
    };
  }

  async list(filter: {
    scopeKind?: string;
    scopeId?: string | null;
    axis?: string;
    state?: RunState;
    limit?: number;
    workspaceId?: string;
  }): Promise<RunRecord[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.workspaceId) {
      params.push(filter.workspaceId);
      where.push(`(workspace_id = $${params.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
    }
    if (filter.scopeKind) { params.push(filter.scopeKind); where.push(`scope_kind = $${params.length}`); }
    if (filter.scopeId !== undefined) {
      params.push(filter.scopeId ?? null);
      where.push(`COALESCE(scope_id::text,'') = COALESCE($${params.length}::text,'')`);
    }
    if (filter.axis)  { params.push(filter.axis);  where.push(`axis = $${params.length}`); }
    if (filter.state) { params.push(filter.state); where.push(`state = $${params.length}`); }
    params.push(Math.min(100, Math.max(1, filter.limit ?? 20)));
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.deps.db.query(
      `SELECT * FROM mn_runs ${clause}
       ORDER BY COALESCE(started_at, created_at) DESC
       LIMIT $${params.length}`,
      params,
    );
    return r.rows.map(mapRun);
  }

  async cancel(id: string): Promise<boolean> {
    const r = await this.deps.db.query(
      `UPDATE mn_runs SET state = 'cancelled', finished_at = NOW()
         WHERE id = $1 AND state IN ('queued','running')`,
      [id],
    );
    return (r as any).rowCount > 0;
  }

  /**
   * Opt-9 (O9) 续传：把 failed/cancelled 的 run 置回 queued 重新入队。
   * execute() 会从 metadata.checkpoint.axisIdx 续跑，已完成的 axis 不重做。
   * 返回 false:run 不存在 / 状态不允许续传 / 入队失败。
   */
  async resume(id: string): Promise<{ ok: boolean; reason?: string }> {
    const r = await this.deps.db.query(
      `SELECT id, scope_kind, scope_id, axis, sub_dims, preset, strategy_spec,
              triggered_by, parent_run_id, state, metadata
         FROM mn_runs WHERE id = $1`,
      [id],
    );
    if (r.rows.length === 0) return { ok: false, reason: 'not-found' };
    const row = r.rows[0];
    if (!['failed', 'cancelled'].includes(row.state)) {
      return { ok: false, reason: `state-not-resumable: ${row.state}` };
    }
    // 把 state 置回 queued 但保留 metadata.checkpoint
    await this.deps.db.query(
      `UPDATE mn_runs
          SET state = 'queued', finished_at = NULL, error_message = NULL,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'resumedAt', NOW()::text,
                'resumedFromState', $2::text
              )
        WHERE id = $1`,
      [id, row.state],
    );
    // 重新入队（从 metadata 还原 expertRoles + mode，保证 resume 沿用同一组专家与生成模式）
    const resumedExpertRoles = sanitizeExpertRoles((row.metadata as Record<string, unknown> | null)?.expertRoles);
    const resumedMetaMode = (row.metadata as Record<string, unknown> | null)?.mode;
    const resumedMode: 'multi-axis' | 'claude-cli' | 'api-oneshot' =
      resumedMetaMode === 'claude-cli' ? 'claude-cli'
      : resumedMetaMode === 'api-oneshot' ? 'api-oneshot'
      : 'multi-axis';
    this.queue.enqueue({
      id,
      payload: {
        runId: id,
        scope: { kind: row.scope_kind, id: row.scope_id ?? undefined },
        axis: row.axis,
        subDims: row.sub_dims ?? [],
        preset: row.preset,
        strategySpec: row.strategy_spec,
        triggeredBy: row.triggered_by,
        parentRunId: row.parent_run_id,
        meetingId: row.scope_kind === 'meeting' ? row.scope_id : undefined,
        expertRoles: resumedExpertRoles,
        mode: resumedMode,
      },
      enqueuedAt: Date.now(),
    });
    // P2 worker-pool：queue 自驱
    return { ok: true };
  }

  // ============================================================
  // 内部驱动
  // ============================================================

  private async execute(payload: QueuePayload): Promise<void> {
    const startedAt = Date.now();
    // F3 · 标记 worker_id + 初次 heartbeat（也覆盖 resume 路径上 state='queued' 的回切）
    // F5 · 用 RETURNING 确认 UPDATE 命中：若 0 行说明 run 已不是 queued
    //      （被 reaper cancel / 已 succeeded / 重复入队的 stale 副本），直接 skip 不跑 LLM
    const claim = await this.deps.db.query(
      `UPDATE mn_runs
          SET state = 'running', started_at = NOW(),
              worker_id = $2, last_heartbeat_at = NOW()
        WHERE id = $1 AND state = 'queued'
        RETURNING id`,
      [payload.runId, this.workerId],
    );
    const claimed = ((claim as any).rowCount ?? claim.rows?.length ?? 0) > 0;
    if (!claimed) {
      console.log(`[RunEngine] skip stale enqueue ${payload.runId} (no longer queued)`);
      return;
    }
    await this.deps.eventBus.publish('mn.run.started', { runId: payload.runId });

    // F3 · 每 30s 更新一次 heartbeat；execute 退出时清掉 timer 防泄漏
    const heartbeatTimer = setInterval(() => {
      this.deps.db.query(
        `UPDATE mn_runs SET last_heartbeat_at = NOW() WHERE id = $1 AND state = 'running'`,
        [payload.runId],
      ).catch((e) => console.warn(`[RunEngine] heartbeat update failed for ${payload.runId}:`, (e as Error).message));
    }, RunEngine.HEARTBEAT_MS);
    // 注意：unref 让 heartbeat 不阻止进程退出
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

    // Plan stages so we can report incremental progress.
    // For axis='all' we step through ALL_AXES; otherwise it's a single step.
    const axesToRun: string[] = payload.axis === 'all'
      ? [...ALL_AXES]
      : payload.axis === 'longitudinal'
        ? []
        : [payload.axis];
    // Reserve last 10% for snapshot + finalize.
    const totalStages = Math.max(1, axesToRun.length) + 1;
    const counter: LLMUsageCounter = { input: 0, output: 0, calls: 0 };

    // Step3 6 步的 progress_pct 区间（与前端 stepDefs 顺序一致）：
    //   ingest 0-16, segment 17-33, dispatch 34-50, dec 51-58,
    //   axes 59-83, synth 84-91, render 92-99
    type Step3Key = 'ingest' | 'segment' | 'dispatch' | 'dec' | 'axes' | 'synth' | 'render';
    const STEP_RANGES: Record<Step3Key, [number, number]> = {
      ingest:   [3, 16],
      segment:  [17, 33],
      dispatch: [34, 50],
      dec:      [51, 58],
      axes:     [59, 83],
      synth:    [84, 91],
      render:   [92, 99],
    };

    /** Step-based progress writer：把命名 step 映射到固定区间内的百分比。 */
    const writeStep = async (
      step: Step3Key,
      ratio: number,
      currentStep: string,
    ) => {
      const [lo, hi] = STEP_RANGES[step];
      const pct = Math.max(lo, Math.min(hi, Math.round(lo + ratio * (hi - lo))));
      try {
        await this.deps.db.query(
          `UPDATE mn_runs
              SET progress_pct = $2,
                  cost_tokens  = $3,
                  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'currentStep', $4::text,
                    'currentStepKey', $8::text,
                    'inputTokens', $5::int,
                    'outputTokens', $6::int,
                    'llmCalls', $7::int
                  )
            WHERE id = $1`,
          [payload.runId, pct, counter.input + counter.output, currentStep, counter.input, counter.output, counter.calls, step],
        );
      } catch (e) {
        console.warn('[runEngine] step progress write failed:', (e as Error)?.message);
      }
    };

    /** Persist progress + tokens + currentStep to mn_runs.metadata. */
    const writeProgress = async (stageIdx: number, currentStep: string) => {
      const pct = Math.min(99, Math.round((stageIdx / totalStages) * 100));
      try {
        await this.deps.db.query(
          `UPDATE mn_runs
              SET progress_pct = $2,
                  cost_tokens  = $3,
                  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'currentStep', $4::text,
                    'inputTokens', $5::int,
                    'outputTokens', $6::int,
                    'llmCalls', $7::int
                  )
            WHERE id = $1`,
          [payload.runId, pct, counter.input + counter.output, currentStep, counter.input, counter.output, counter.calls],
        );
      } catch (e) {
        // Progress writes are advisory; never break the run for a write error.
        console.warn('[runEngine] progress write failed:', (e as Error)?.message);
      }
    };

    /** 把 dispatchPlan 落到 mn_runs.metadata（不动 progress）。 */
    const writeDispatchPlan = async (plan: DispatchPlan) => {
      try {
        await this.deps.db.query(
          `UPDATE mn_runs
              SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'dispatchPlan', $2::jsonb
              )
            WHERE id = $1`,
          [payload.runId, JSON.stringify(plan)],
        );
      } catch (e) {
        console.warn('[runEngine] dispatchPlan write failed:', (e as Error)?.message);
      }
    };

    /** 更新某个 expertSlot 的状态。 */
    const updateExpertSlot = async (
      plan: DispatchPlan,
      expertId: string,
      patch: Partial<ExpertSlot>,
    ) => {
      const slot = plan.experts.find((e) => e.expertId === expertId);
      if (!slot) return;
      Object.assign(slot, patch);
      await writeDispatchPlan(plan);
    };

    const allResults: ComputeResult[] = [];

    // 加载用户在 Step 2 选中的真实专家档案 → axis 级 persona block
    // 没指定时返回空对象，callExpertOrLLM 走原通用提示词路径
    let expertPersonaByAxis: Record<string, string> | undefined;
    let expertSnapshotsForDispatch: Awaited<ReturnType<typeof loadExpertSnapshots>> | undefined;
    if (payload.expertRoles) {
      const allIds = [
        ...(payload.expertRoles.people ?? []),
        ...(payload.expertRoles.projects ?? []),
        ...(payload.expertRoles.knowledge ?? []),
      ];
      try {
        expertSnapshotsForDispatch = await loadExpertSnapshots(this.deps.db, allIds);
        expertPersonaByAxis = await buildExpertPersonaByAxis(
          this.deps.db,
          payload.expertRoles,
          expertSnapshotsForDispatch,
        );
      } catch (e) {
        console.warn('[runEngine] expert profile load failed:', (e as Error).message);
      }
    }

    try {
      // ─── Claude CLI 模式分叉 ───────────────────────────────
      // 不进 16 轴循环，spawn 一次 claude -p 完成全部生成，落 metadata.analysis + 17 张 mn_* 表。
      // §F.2 双层 session：spawn #1 = meeting session (assets.metadata.claudeSession)
      //                    spawn #2 = scope session (mn_scopes.metadata.claudeSession，仅 scope=project/client/topic)
      // §F.3 wiki 双写：spawn #1 完成后落 content_facts (persistClaudeFacts) + sources/.md (persistClaudeWiki)
      if (payload.mode === 'claude-cli' && payload.meetingId) {
        const { runClaudeCliMode } = await import('./claudeCliRunner.js');
        const { persistClaudeAxes } = await import('./persistClaudeAxes.js');
        const { persistClaudeFacts } = await import('./persistClaudeFacts.js');
        const { persistClaudeWiki } = await import('./persistClaudeWiki.js');
        const { buildScopePrompt, buildMeetingDigest } = await import('./promptTemplates/claudeCliScope.js');
        const { ensurePersonByName } = await import('../parse/participantExtractor.js');

        // 1) parseMeeting：CLI 模式同样需要先把 transcript 切段、participants 入 mn_people
        await writeStep('ingest', 0.1, '原始素材解析（CLI 模式）');
        const parseResult = await parseMeeting(this.deps, payload.meetingId);
        if (!parseResult.ok) {
          throw new Error(`parseMeeting failed: ${parseResult.reason ?? 'unknown'}`);
        }
        await writeStep('ingest', 1.0, `素材解析完成 · ${parseResult.segmentCount ?? 0} 段`);
        await writeStep('segment', 1.0, `参与者归并完成 · ${parseResult.participantCount} 位`);

        // 2) 收集 strategy 解析后的 decoratorChain
        const decoratorChain = (payload.strategySpec ?? '').split('|').map((s) => s.trim()).filter(Boolean);

        // 3) 拉 meeting title + meetingKind + 已有的 claudeSession（如果之前跑过）
        let meetingTitle = '';
        let meetingKind: string | null = null;
        let meetingSessionId: string | null = null;
        try {
          const r = await this.deps.db.query(
            `SELECT title,
                    metadata->>'meeting_kind' AS meeting_kind,
                    metadata->'claudeSession'->>'sessionId' AS claude_session_id
               FROM assets WHERE id = $1`,
            [payload.meetingId],
          );
          meetingTitle = String(r.rows[0]?.title ?? '');
          meetingKind = (r.rows[0]?.meeting_kind as string | null) ?? null;
          const sid = r.rows[0]?.claude_session_id;
          meetingSessionId = typeof sid === 'string' && sid.length > 0 ? sid : null;
        } catch {/* 缺 title 不阻塞 */}

        // 4) 拉 scope info（仅 scope.kind 是 project/client/topic 时；meeting scope 无意义）
        let scopeRow: { id: string; kind: string; name: string; sessionId: string | null; metadata: any } | null = null;
        if (payload.scope.kind === 'project' || payload.scope.kind === 'client' || payload.scope.kind === 'topic') {
          if (payload.scope.id) {
            try {
              const sr = await this.deps.db.query(
                `SELECT id::text AS id, kind, name, metadata,
                        metadata->'claudeSession'->>'sessionId' AS scope_session_id
                   FROM mn_scopes WHERE id = $1`,
                [payload.scope.id],
              );
              if (sr.rows[0]) {
                const sid = sr.rows[0].scope_session_id;
                scopeRow = {
                  id: sr.rows[0].id,
                  kind: sr.rows[0].kind,
                  name: sr.rows[0].name,
                  sessionId: typeof sid === 'string' && sid.length > 0 ? sid : null,
                  metadata: sr.rows[0].metadata ?? {},
                };
              }
            } catch {/* mn_scopes 不可用时降级 */}
          }
        }

        // 5) cliSessions 快照写到 mn_runs.metadata（便于排错）
        try {
          await this.deps.db.query(
            `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cliSessions', $2::jsonb) WHERE id = $1`,
            [payload.runId, JSON.stringify({
              meetingSessionId,
              scopeSessionId: scopeRow?.sessionId ?? null,
              isMeetingSessionFresh: !meetingSessionId,
              isScopeSessionFresh: scopeRow ? !scopeRow.sessionId : null,
            })],
          );
        } catch {/* swallow */}

        // 6) spawn #1 — meeting session run
        await llmUsageStorage.run(counter, async () => {
          const cliResult = await runClaudeCliMode(
            this.deps,
            { runId: payload.runId, meetingId: payload.meetingId!, assetId: payload.meetingId! },
            {
              expertRoles: payload.expertRoles ?? null,
              expertSnapshots: expertSnapshotsForDispatch ?? new Map(),
              preset: payload.preset,
              decoratorChain,
              scopeConfig: null,
              meetingKind,
              meetingTitle,
              participantsFromParse: (parseResult.participants ?? []).map((p) => ({ id: p.id, name: p.name })),
              resumeSessionId: meetingSessionId,
              promptKind: 'meeting',
              scopeKind: payload.scope.kind,
              scopeId: payload.scope.id ?? payload.meetingId,
            },
            {
              writeStep: async (key, ratio, msg) => {
                const stageMap = { spawn: 'dec', streaming: 'axes', parsing: 'synth', persisting: 'render' } as const;
                await writeStep(stageMap[key] as Step3Key, ratio, msg ?? '');
              },
              bumpUsage: (i, o) => { counter.input += i; counter.output += o; counter.calls += 1; },
              recordCliRaw: async (raw) => {
                try {
                  await this.deps.db.query(
                    `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cliRaw', $2::text) WHERE id = $1`,
                    [payload.runId, raw],
                  );
                } catch {/* swallow */}
              },
            },
          );

          // 7) 持久化：metadata.analysis + 17 张 mn_* 表 + content_facts + wiki .md
          await writeStep('render', 0.35, '写入 metadata.analysis + participants');

          // 7a) 重建 cliPersonMap —— 用 Claude 输出的 participants 当权威，反查 / INSERT mn_people
          //     之前依赖 parseMeeting.participants 在转写没有 speaker label 的会议上抽不到，
          //     导致 cliPersonMap 全空，所有 axis 行被 resolvePersonId 跳过。
          const claudeParticipants = Array.isArray(cliResult.participants) ? cliResult.participants : [];
          const cliPersonMap: Record<string, string> = {};
          for (const p of claudeParticipants) {
            const localId = String(p?.id ?? '').trim();
            const rawName = String(p?.name ?? '').trim();
            if (!localId || !rawName) continue;
            try {
              const uuid = await ensurePersonByName(this.deps, rawName, p?.role, undefined, payload.meetingId);
              if (uuid) cliPersonMap[localId] = uuid;
            } catch (e) {
              console.warn('[runEngine] ensurePersonByName failed for', rawName, ':', (e as Error).message);
            }
          }
          console.info(
            '[runEngine] cliPersonMap mapped',
            Object.keys(cliPersonMap).length,
            '/',
            claudeParticipants.length,
            'participants',
          );

          const stampedAnalysis = {
            ...(cliResult.analysis as any),
            _generated: {
              by: 'claude-cli' as const,
              runId: payload.runId,
              at: new Date().toISOString(),
              phase: 1 as const,
            },
          };
          await persistAnalysisToAsset(this.deps.db, payload.meetingId!, stampedAnalysis);

          // 7b) 写 assets.metadata.participants 让 detail endpoint (engine.getMeetingDetail) 能读到
          //     形态需跟 VariantEditorial / Workbench 期待的 participants[] 对齐：
          //     [{ id: 'p1', name, role, initials, tone, speakingPct }]
          if (claudeParticipants.length > 0) {
            try {
              await this.deps.db.query(
                `UPDATE assets SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('participants', $2::jsonb) WHERE id = $1`,
                [payload.meetingId, JSON.stringify(claudeParticipants)],
              );
            } catch (e) {
              console.warn('[runEngine] write metadata.participants failed:', (e as Error).message);
            }
          }

          await writeStep('render', 0.55, '写入 mn_* 轴表');
          await persistClaudeAxes(this.deps, payload.meetingId!, {
            meeting: cliResult.meeting,
            participants: cliResult.participants,
            analysis: cliResult.analysis as any,
            axes: cliResult.axes as any,
          }, cliPersonMap);

          await writeStep('render', 0.65, '写入 content_facts（wiki SPO）');
          try {
            await persistClaudeFacts(this.deps, payload.meetingId!, cliResult.facts ?? []);
          } catch (e) {
            console.warn('[runEngine] persistClaudeFacts failed:', (e as Error).message);
          }

          await writeStep('render', 0.75, '写入 wiki sources/.md + entities/concepts');
          try {
            await persistClaudeWiki(
              this.deps,
              payload.meetingId!,
              cliResult.wikiMarkdown ?? {},
              undefined,
              (cliResult as any)?.meeting?.title,
            );
          } catch (e) {
            console.warn('[runEngine] persistClaudeWiki failed:', (e as Error).message);
          }

          // 7f) Phase H · 触发 wikiGenerator 全量重生 (基于最新 content_facts 重新聚合
          //      entity 全局画像 + L2 domain page + L1 _index)
          //      · skipSources: true → 不重写 claude-cli 写的 sources/.md
          //      · preserveAppMeetingNotes: true → 保留 app=meeting-notes 整文件 + blocks
          await writeStep('render', 0.85, '触发 wikiGenerator 重生 entities/concepts/domains');
          let wikiResultStats = {
            entities: 0, domains: 0, domainIndexes: 0,
            preservedFiles: 0, durationMs: 0,
            axesFiles: 0, scopesFiles: 0, scopesCount: 0,
          };
          try {
            const { WikiGenerator } = await import('../../content-library/wiki/wikiGenerator.js');
            const { resolveWikiRoot } = await import('./persistClaudeWiki.js');
            const wikiRoot = resolveWikiRoot();
            const wg = new WikiGenerator(this.deps.db as any);
            const result = await wg.generate({
              wikiRoot,
              maxEntities: 500,
              skipSources: true,
              preserveAppMeetingNotes: true,
            });
            wikiResultStats.entities = result.entities;
            wikiResultStats.domains = result.domains;
            wikiResultStats.domainIndexes = result.domainIndexes;
            wikiResultStats.preservedFiles = result.preservedFiles;
            wikiResultStats.durationMs = result.durationMs;
            console.log(`[runEngine] wikiGenerator regen: ${result.entities} entities + ${result.domains} L2 + ${result.domainIndexes} L1 (${result.durationMs}ms, preserved ${result.preservedFiles})`);
          } catch (e) {
            console.warn('[runEngine] wikiGenerator regenerate failed:', (e as Error).message);
          }

          // 7g) Phase H+ · 触发 MeetingAxesGenerator (axes/ 16 deliverables)
          await writeStep('render', 0.90, '触发 MeetingAxesGenerator (axes/ 16 deliverables)');
          try {
            const { MeetingAxesGenerator } = await import('../wiki/meetingAxesGenerator.js');
            const { resolveWikiRoot } = await import('./persistClaudeWiki.js');
            const ag = new MeetingAxesGenerator(this.deps);
            const r = await ag.generate({ wikiRoot: resolveWikiRoot(), limitPerAxis: 200 });
            wikiResultStats.axesFiles = r.filesWritten;
            console.log(`[runEngine] MeetingAxesGenerator: ${r.filesWritten} files (${r.durationMs}ms)`);
          } catch (e) {
            console.warn('[runEngine] MeetingAxesGenerator failed:', (e as Error).message);
          }

          // 7h) Phase H+ · 触发 MeetingScopeGenerator (scopes/<kind>/<slug>/_index.md)
          //     仅重生 该会议绑定的 scopes (从 mn_scope_members 拉)
          await writeStep('render', 0.95, '触发 MeetingScopeGenerator (scopes/)');
          try {
            const { MeetingScopeGenerator } = await import('../wiki/meetingScopeGenerator.js');
            const { resolveWikiRoot } = await import('./persistClaudeWiki.js');
            const sg = new MeetingScopeGenerator(this.deps);

            const scopesR = await this.deps.db.query(
              `SELECT scope_id::text AS scope_id FROM mn_scope_members WHERE meeting_id::text = $1`,
              [payload.meetingId!],
            );
            const wikiRoot = resolveWikiRoot();
            let totalFiles = 0;
            for (const row of scopesR.rows) {
              const r = await sg.generate({ wikiRoot, scopeId: row.scope_id });
              totalFiles += r.filesWritten;
            }
            wikiResultStats.scopesFiles = totalFiles;
            wikiResultStats.scopesCount = scopesR.rows.length;
            console.log(`[runEngine] MeetingScopeGenerator: ${scopesR.rows.length} scopes / ${totalFiles} files`);
          } catch (e) {
            console.warn('[runEngine] MeetingScopeGenerator failed:', (e as Error).message);
          }

          // 7i) 合并写 cliWikiResult 到 mn_runs.metadata
          try {
            await this.deps.db.query(
              `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                 'cliWikiResult', jsonb_build_object(
                   'entitiesGenerated', $2::int,
                   'domainsGenerated',  $3::int,
                   'domainIndexes',     $4::int,
                   'preservedFiles',    $5::int,
                   'wikiGenDurationMs', $6::int,
                   'axesFiles',         $7::int,
                   'scopesCount',       $8::int,
                   'scopesFiles',       $9::int
                 )
               ) WHERE id = $1`,
              [
                payload.runId,
                wikiResultStats.entities,
                wikiResultStats.domains,
                wikiResultStats.domainIndexes,
                wikiResultStats.preservedFiles,
                wikiResultStats.durationMs,
                wikiResultStats.axesFiles,
                wikiResultStats.scopesCount,
                wikiResultStats.scopesFiles,
              ],
            );
          } catch (e) {
            console.warn('[runEngine] write cliWikiResult failed:', (e as Error).message);
          }

          // 8) 写回 meeting session id (assets.metadata.claudeSession) + cliPersonMap
          if (cliResult.sessionId) {
            try {
              await this.deps.db.query(
                `UPDATE assets SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'claudeSession', jsonb_build_object(
                     'sessionId', $2::text,
                     'lastResumedAt', NOW()::text,
                     'runCount', COALESCE((metadata->'claudeSession'->>'runCount')::int, 0) + 1
                   )
                 ) WHERE id = $1`,
                [payload.meetingId, cliResult.sessionId],
              );
            } catch (e) {
              console.warn('[runEngine] write claudeSession to assets failed:', (e as Error).message);
            }
          }
          try {
            await this.deps.db.query(
              `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                 'cliPersonMap', $2::jsonb,
                 'cliMeetingResult', jsonb_build_object(
                   'sessionId', $3::text,
                   'inputTokens', $4::int,
                   'cacheReadTokens', $5::int,
                   'factsWritten', $6::int,
                   'wikiSourceWritten', $7::boolean,
                   'participantsResolved', $8::int
                 )
               ) WHERE id = $1`,
              [
                payload.runId,
                JSON.stringify(cliPersonMap),
                cliResult.sessionId,
                cliResult.inputTokens,
                cliResult.cacheReadTokens,
                Array.isArray(cliResult.facts) ? cliResult.facts.length : 0,
                Boolean((cliResult.wikiMarkdown as any)?.sourceEntry),
                Object.keys(cliPersonMap).length,
              ],
            );
          } catch (e) {
            console.warn('[runEngine] write cliMeetingResult to mn_runs failed:', (e as Error).message);
          }

          // 9) spawn #2 — scope session run（可选，仅 scope=project/client/topic 才跑）
          if (scopeRow) {
            await writeStep('render', 0.85, `启动 scope session · ${scopeRow.name}`);
            const newMeetingDigest = buildMeetingDigest({
              analysis: cliResult.analysis,
              axes: cliResult.axes,
            });
            const scopePrompt = buildScopePrompt({
              scope: {
                kind: scopeRow.kind as 'project' | 'client' | 'topic',
                id: scopeRow.id,
                name: scopeRow.name,
                config: null, // TODO Phase 14 expert-config live 后接入
              },
              newMeeting: {
                meetingId: payload.meetingId!,
                title: meetingTitle,
                date: stampedAnalysis?.summary?.date ?? null,
                digest: newMeetingDigest,
              },
              isFreshSession: !scopeRow.sessionId,
            });

            try {
              const scopeResult = await runClaudeCliMode(
                this.deps,
                { runId: payload.runId, meetingId: payload.meetingId!, assetId: payload.meetingId! },
                {
                  expertRoles: null,
                  expertSnapshots: new Map(),
                  preset: payload.preset,
                  decoratorChain: [],
                  scopeConfig: null,
                  meetingKind: null,
                  meetingTitle,
                  participantsFromParse: [],
                  resumeSessionId: scopeRow.sessionId,
                  promptKind: 'scope',
                  prebuiltPrompt: scopePrompt,
                  scopeKind: scopeRow.kind,
                  scopeId: scopeRow.id,
                },
                {
                  writeStep: async () => {/* scope spawn 不动主进度 */},
                  bumpUsage: (i, o) => { counter.input += i; counter.output += o; counter.calls += 1; },
                  recordCliRaw: async (raw) => {
                    try {
                      await this.deps.db.query(
                        `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cliScopeRaw', $2::text) WHERE id = $1`,
                        [payload.runId, raw],
                      );
                    } catch {/* swallow */}
                  },
                },
              );

              // 9a) 写回 scope session id（如果 input_tokens > 150K 触发 fresh 重置）
              const shouldReset = scopeResult.inputTokens > 150_000;
              try {
                await this.deps.db.query(
                  `UPDATE mn_scopes SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                     'claudeSession', jsonb_build_object(
                       'sessionId', $2::text,
                       'lastResumedAt', NOW()::text,
                       'runCount', COALESCE((metadata->'claudeSession'->>'runCount')::int, 0) + 1
                     )
                   ) WHERE id = $1`,
                  [scopeRow.id, shouldReset ? null : scopeResult.sessionId],
                );
              } catch (e) {
                console.warn('[runEngine] write claudeSession to mn_scopes failed:', (e as Error).message);
              }

              // 9b) 把 scopeUpdates 落到 mn_runs.metadata（前端 / 排错可见）
              try {
                await this.deps.db.query(
                  `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                     'cliScopeResult', jsonb_build_object(
                       'sessionId', $2::text,
                       'inputTokens', $3::int,
                       'scopeUpdates', $4::jsonb,
                       'sessionResetTriggered', $5::boolean
                     )
                   ) WHERE id = $1`,
                  [
                    payload.runId,
                    scopeResult.sessionId,
                    scopeResult.inputTokens,
                    JSON.stringify(scopeResult.scopeUpdates ?? {}),
                    shouldReset,
                  ],
                );
              } catch {/* swallow */}

              // 9c) TODO（v2）: 把 scopeUpdates.judgmentsToReuse / openQuestionsToReopen 落到
              // mn_judgments / mn_open_questions（reuse_count++ / status='chronic'）。
              // 第一版先把 scopeUpdates 摆到 metadata 里供观察，效果可见后再接 DB 写入。
            } catch (e) {
              console.warn('[runEngine] scope session spawn failed:', (e as Error).message);
              try {
                await this.deps.db.query(
                  `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cliScopeError', $2::text) WHERE id = $1`,
                  [payload.runId, (e as Error).message.slice(0, 500)],
                );
              } catch {/* swallow */}
              // scope session 失败不阻塞主流程（meeting 部分已经成功）
            }
          }
        });

        await writeStep('render', 1.0, 'CLI 模式生成完成');
        // 跳过 multi-axis 流程，fall-through 到下面的 success-finalize
      } else if (payload.mode === 'api-oneshot' && payload.meetingId) {
        // ─── api-oneshot 模式 ──────────────────────────────────
        // 与 claude-cli 同拓扑（一次出 16 轴 JSON），通道换成 services/llm.ts 直连 API。
        // 不依赖 claude 二进制 / 没有 session 概念。Wiki frontmatter 复用 'claude-cli' 标签
        // （persistClaudeWiki 写死，不改）—— v2 再加 generator 参数区分。
        const { runOneshotMode } = await import('./oneshotRunner.js');
        const { persistClaudeAxes } = await import('./persistClaudeAxes.js');
        const { persistClaudeFacts } = await import('./persistClaudeFacts.js');
        const { persistClaudeWiki } = await import('./persistClaudeWiki.js');
        const { buildScopePrompt, buildMeetingDigest } = await import('./promptTemplates/claudeCliScope.js');
        const { ensurePersonByName } = await import('../parse/participantExtractor.js');

        // 1) parseMeeting（与 CLI 同）
        await writeStep('ingest', 0.1, '原始素材解析（API Oneshot 模式）');
        const parseResult = await parseMeeting(this.deps, payload.meetingId);
        if (!parseResult.ok) {
          throw new Error(`parseMeeting failed: ${parseResult.reason ?? 'unknown'}`);
        }
        await writeStep('ingest', 1.0, `素材解析完成 · ${parseResult.segmentCount ?? 0} 段`);
        await writeStep('segment', 1.0, `参与者归并完成 · ${parseResult.participantCount} 位`);

        // 2) 装饰器栈
        const decoratorChain = (payload.strategySpec ?? '').split('|').map((s) => s.trim()).filter(Boolean);

        // 3) meeting title + meetingKind
        let meetingTitle = '';
        let meetingKind: string | null = null;
        try {
          const r = await this.deps.db.query(
            `SELECT title, metadata->>'meeting_kind' AS meeting_kind
               FROM assets WHERE id = $1`,
            [payload.meetingId],
          );
          meetingTitle = String(r.rows[0]?.title ?? '');
          meetingKind = (r.rows[0]?.meeting_kind as string | null) ?? null;
        } catch {/* 缺 title 不阻塞 */}

        // 4) scope row（仅 project/client/topic scope；oneshot 没有 session resume，仅取 name）
        let scopeRow: { id: string; kind: string; name: string } | null = null;
        if (payload.scope.kind === 'project' || payload.scope.kind === 'client' || payload.scope.kind === 'topic') {
          if (payload.scope.id) {
            try {
              const sr = await this.deps.db.query(
                `SELECT id::text AS id, kind, name FROM mn_scopes WHERE id = $1`,
                [payload.scope.id],
              );
              if (sr.rows[0]) {
                scopeRow = { id: sr.rows[0].id, kind: sr.rows[0].kind, name: sr.rows[0].name };
              }
            } catch {/* mn_scopes 不可用时降级 */}
          }
        }

        // 5) 调 oneshot
        await llmUsageStorage.run(counter, async () => {
          const oneshotResult = await runOneshotMode(
            this.deps,
            { runId: payload.runId, meetingId: payload.meetingId!, assetId: payload.meetingId! },
            {
              expertRoles: payload.expertRoles ?? null,
              expertSnapshots: expertSnapshotsForDispatch ?? new Map(),
              preset: payload.preset,
              decoratorChain,
              scopeConfig: null,
              meetingKind,
              meetingTitle,
              participantsFromParse: (parseResult.participants ?? []).map((p) => ({ id: p.id, name: p.name })),
              promptKind: 'meeting',
            },
            {
              writeStep: async (key, ratio, msg) => {
                const stageMap = { spawn: 'dec', streaming: 'axes', parsing: 'synth', persisting: 'render' } as const;
                await writeStep(stageMap[key] as Step3Key, ratio, msg ?? '');
              },
              recordOneshotRaw: async (raw) => {
                try {
                  await this.deps.db.query(
                    `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('oneshotRaw', $2::text) WHERE id = $1`,
                    [payload.runId, raw],
                  );
                } catch {/* swallow */}
              },
            },
          );

          // 6) 持久化（与 CLI 同链路）
          await writeStep('render', 0.35, '写入 metadata.analysis + participants');

          // 6a) 重建 cliPersonMap —— 用 LLM 输出的 participants 当权威，反查 / INSERT mn_people
          const oneshotParticipants = Array.isArray(oneshotResult.participants) ? oneshotResult.participants : [];
          const cliPersonMap: Record<string, string> = {};
          for (const p of oneshotParticipants) {
            const localId = String(p?.id ?? '').trim();
            const rawName = String(p?.name ?? '').trim();
            if (!localId || !rawName) continue;
            try {
              const uuid = await ensurePersonByName(this.deps, rawName, p?.role, undefined, payload.meetingId);
              if (uuid) cliPersonMap[localId] = uuid;
            } catch (e) {
              console.warn('[runEngine] ensurePersonByName failed for', rawName, ':', (e as Error).message);
            }
          }
          console.info(
            '[runEngine] oneshotPersonMap mapped',
            Object.keys(cliPersonMap).length,
            '/',
            oneshotParticipants.length,
            'participants',
          );

          const stampedAnalysis = {
            ...(oneshotResult.analysis as any),
            _generated: {
              by: 'api-oneshot' as const,
              runId: payload.runId,
              at: new Date().toISOString(),
              phase: 1 as const,
            },
          };
          await persistAnalysisToAsset(this.deps.db, payload.meetingId!, stampedAnalysis);

          // 6b) 写 assets.metadata.participants
          if (oneshotParticipants.length > 0) {
            try {
              await this.deps.db.query(
                `UPDATE assets SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('participants', $2::jsonb) WHERE id = $1`,
                [payload.meetingId, JSON.stringify(oneshotParticipants)],
              );
            } catch (e) {
              console.warn('[runEngine] write metadata.participants failed:', (e as Error).message);
            }
          }

          await writeStep('render', 0.55, '写入 mn_* 轴表');
          await persistClaudeAxes(this.deps, payload.meetingId!, {
            meeting: oneshotResult.meeting,
            participants: oneshotResult.participants,
            analysis: oneshotResult.analysis as any,
            axes: oneshotResult.axes as any,
          }, cliPersonMap);

          await writeStep('render', 0.65, '写入 content_facts');
          try {
            await persistClaudeFacts(this.deps, payload.meetingId!, oneshotResult.facts ?? []);
          } catch (e) {
            console.warn('[runEngine] persistClaudeFacts failed:', (e as Error).message);
          }

          await writeStep('render', 0.75, '写入 wiki sources/.md + entities/concepts');
          try {
            await persistClaudeWiki(
              this.deps,
              payload.meetingId!,
              oneshotResult.wikiMarkdown ?? {},
              undefined,
              (oneshotResult as any)?.meeting?.title,
            );
          } catch (e) {
            console.warn('[runEngine] persistClaudeWiki failed:', (e as Error).message);
          }

          // 6c) wikiGenerator 重生
          await writeStep('render', 0.85, '触发 wikiGenerator 重生 entities/concepts/domains');
          let wikiResultStats = {
            entities: 0, domains: 0, domainIndexes: 0,
            preservedFiles: 0, durationMs: 0,
            axesFiles: 0, scopesFiles: 0, scopesCount: 0,
          };
          try {
            const { WikiGenerator } = await import('../../content-library/wiki/wikiGenerator.js');
            const { resolveWikiRoot } = await import('./persistClaudeWiki.js');
            const wikiRoot = resolveWikiRoot();
            const wg = new WikiGenerator(this.deps.db as any);
            const result = await wg.generate({
              wikiRoot,
              maxEntities: 500,
              skipSources: true,
              preserveAppMeetingNotes: true,
            });
            wikiResultStats.entities = result.entities;
            wikiResultStats.domains = result.domains;
            wikiResultStats.domainIndexes = result.domainIndexes;
            wikiResultStats.preservedFiles = result.preservedFiles;
            wikiResultStats.durationMs = result.durationMs;
            console.log(`[runEngine] wikiGenerator regen: ${result.entities} entities + ${result.domains} L2 + ${result.domainIndexes} L1 (${result.durationMs}ms)`);
          } catch (e) {
            console.warn('[runEngine] wikiGenerator regenerate failed:', (e as Error).message);
          }

          // 6d) MeetingAxesGenerator
          await writeStep('render', 0.90, '触发 MeetingAxesGenerator');
          try {
            const { MeetingAxesGenerator } = await import('../wiki/meetingAxesGenerator.js');
            const { resolveWikiRoot } = await import('./persistClaudeWiki.js');
            const ag = new MeetingAxesGenerator(this.deps);
            const r = await ag.generate({ wikiRoot: resolveWikiRoot(), limitPerAxis: 200 });
            wikiResultStats.axesFiles = r.filesWritten;
          } catch (e) {
            console.warn('[runEngine] MeetingAxesGenerator failed:', (e as Error).message);
          }

          // 6e) MeetingScopeGenerator
          await writeStep('render', 0.95, '触发 MeetingScopeGenerator');
          try {
            const { MeetingScopeGenerator } = await import('../wiki/meetingScopeGenerator.js');
            const { resolveWikiRoot } = await import('./persistClaudeWiki.js');
            const sg = new MeetingScopeGenerator(this.deps);
            const scopesR = await this.deps.db.query(
              `SELECT scope_id::text AS scope_id FROM mn_scope_members WHERE meeting_id::text = $1`,
              [payload.meetingId!],
            );
            const wikiRoot = resolveWikiRoot();
            let totalFiles = 0;
            for (const row of scopesR.rows) {
              const r = await sg.generate({ wikiRoot, scopeId: row.scope_id });
              totalFiles += r.filesWritten;
            }
            wikiResultStats.scopesFiles = totalFiles;
            wikiResultStats.scopesCount = scopesR.rows.length;
          } catch (e) {
            console.warn('[runEngine] MeetingScopeGenerator failed:', (e as Error).message);
          }

          // 6f) 合并写 oneshotWikiResult 到 mn_runs.metadata
          try {
            await this.deps.db.query(
              `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                 'oneshotWikiResult', jsonb_build_object(
                   'entitiesGenerated', $2::int,
                   'domainsGenerated',  $3::int,
                   'domainIndexes',     $4::int,
                   'preservedFiles',    $5::int,
                   'wikiGenDurationMs', $6::int,
                   'axesFiles',         $7::int,
                   'scopesCount',       $8::int,
                   'scopesFiles',       $9::int
                 )
               ) WHERE id = $1`,
              [
                payload.runId,
                wikiResultStats.entities,
                wikiResultStats.domains,
                wikiResultStats.domainIndexes,
                wikiResultStats.preservedFiles,
                wikiResultStats.durationMs,
                wikiResultStats.axesFiles,
                wikiResultStats.scopesCount,
                wikiResultStats.scopesFiles,
              ],
            );
          } catch (e) {
            console.warn('[runEngine] write oneshotWikiResult failed:', (e as Error).message);
          }

          // 7) 写 oneshotPersonMap + oneshotMeetingResult 到 mn_runs.metadata
          try {
            await this.deps.db.query(
              `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                 'oneshotPersonMap', $2::jsonb,
                 'oneshotMeetingResult', jsonb_build_object(
                   'factsWritten', $3::int,
                   'wikiSourceWritten', $4::boolean,
                   'participantsResolved', $5::int
                 )
               ) WHERE id = $1`,
              [
                payload.runId,
                JSON.stringify(cliPersonMap),
                Array.isArray(oneshotResult.facts) ? oneshotResult.facts.length : 0,
                Boolean((oneshotResult.wikiMarkdown as any)?.sourceEntry),
                Object.keys(cliPersonMap).length,
              ],
            );
          } catch (e) {
            console.warn('[runEngine] write oneshotMeetingResult to mn_runs failed:', (e as Error).message);
          }

          // 8) scope-level oneshot（可选，仅 scope=project/client/topic 才跑）
          // oneshot 没有 session resume，每次 fresh prompt（buildScopePrompt 已支持 isFreshSession=true）
          if (scopeRow) {
            await writeStep('render', 0.97, `scope oneshot · ${scopeRow.name}`);
            const newMeetingDigest = buildMeetingDigest({
              analysis: oneshotResult.analysis,
              axes: oneshotResult.axes,
            });
            const scopePrompt = buildScopePrompt({
              scope: {
                kind: scopeRow.kind as 'project' | 'client' | 'topic',
                id: scopeRow.id,
                name: scopeRow.name,
                config: null,
              },
              newMeeting: {
                meetingId: payload.meetingId!,
                title: meetingTitle,
                date: stampedAnalysis?.summary?.date ?? null,
                digest: newMeetingDigest,
              },
              isFreshSession: true,
            });

            try {
              const scopeResult = await runOneshotMode(
                this.deps,
                { runId: payload.runId, meetingId: payload.meetingId!, assetId: payload.meetingId! },
                {
                  expertRoles: null,
                  expertSnapshots: new Map(),
                  preset: payload.preset,
                  decoratorChain: [],
                  scopeConfig: null,
                  meetingKind: null,
                  meetingTitle,
                  participantsFromParse: [],
                  promptKind: 'scope',
                  prebuiltPrompt: scopePrompt,
                },
                {
                  writeStep: async () => {/* scope 不动主进度 */},
                  recordOneshotRaw: async (raw) => {
                    try {
                      await this.deps.db.query(
                        `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('oneshotScopeRaw', $2::text) WHERE id = $1`,
                        [payload.runId, raw],
                      );
                    } catch {/* swallow */}
                  },
                },
              );
              try {
                await this.deps.db.query(
                  `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                     'oneshotScopeResult', jsonb_build_object('scopeUpdates', $2::jsonb)
                   ) WHERE id = $1`,
                  [payload.runId, JSON.stringify(scopeResult.scopeUpdates ?? {})],
                );
              } catch {/* swallow */}
            } catch (e) {
              console.warn('[runEngine] scope oneshot failed:', (e as Error).message);
              try {
                await this.deps.db.query(
                  `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('oneshotScopeError', $2::text) WHERE id = $1`,
                  [payload.runId, (e as Error).message.slice(0, 500)],
                );
              } catch {/* swallow */}
              // scope oneshot 失败不阻塞主流程
            }
          }
        });

        await writeStep('render', 1.0, 'API Oneshot 模式生成完成');
        // 跳过 multi-axis 流程，fall-through 到下面的 success-finalize
      } else {
      // ─── 默认 multi-axis 模式 ──────────────────────────────
      // Wrap the entire run in two nested AsyncLocalStorage:
      //  · llmUsageStorage —— LLM token 累计
      //  · strategyStorage —— 当前 run 的 strategy/decorator 栈 + 用户指定的 expert persona，
      //     axis computer 的 callExpertOrLLM 会读到 strategy + 当前 axis 对应 persona
      // F5 · B 方案：用户手动重算一条 meeting-scope run 时，绕过
      //   shouldSkipExpertAnalysis(meetingKind) 这层"省钱守门"。
      //   自动批跑（triggeredBy='auto'/'schedule'）保持原行为，仍跳过 internal_ops 等。
      const isManualMeetingRun =
        payload.triggeredBy !== 'auto' && payload.triggeredBy !== 'schedule'
        && payload.scope.kind === 'meeting';
      const strategyCtx = {
        strategySpec: payload.strategySpec,
        preset: payload.preset,
        expertPersonaByAxis,
        bypassKindSkip: isManualMeetingRun,
      };
      await strategyStorage.run(strategyCtx, async () => {
      await llmUsageStorage.run(counter, async () => {
        // Ingest + Segment + Participant-merge：通过 meetingParser 走完整链路
        //   step3 第 1 步「原始素材解析」：assetsAi.parseMeeting 做正则切分
        //   step3 第 2 步「发言切分 + 参与者归并」：parseMeeting() 完成 ensurePersonByName
        // 这两步一起跑（共用 LLM 之外的 IO），但 progress 分两次写以便前端能看到推进。
        if (payload.meetingId) {
          await writeStep('ingest', 0.1, '原始素材解析 · ASR + 文档清洗');
          try {
            // 直接用 deps.assetsAi 拿到 segments/participants（本地解析无 LLM 成本），
            // 然后用 parseMeeting 完成 mn_people 入库 + segment 落库。
            const parseResult = await parseMeeting(this.deps, payload.meetingId);
            if (parseResult.ok) {
              await writeStep(
                'ingest',
                1.0,
                `素材解析完成 · ${parseResult.segmentCount ?? 0} 段` +
                  (parseResult.durationSec ? ` · ≈${Math.round(parseResult.durationSec / 60)} 分钟` : ''),
              );
              await writeStep(
                'segment',
                1.0,
                `发言切分 + 参与者归并完成 · ${parseResult.participantCount} 位参与者已入库 mn_people`,
              );
            } else {
              await writeStep('ingest', 1.0, `素材解析跳过 · ${parseResult.reason ?? 'unknown'}`);
            }
          } catch (e) {
            console.warn('[runEngine] ingest parseMeeting failed:', (e as Error).message);
          }
        }

        // Step3 第 3 步「分派给专家」：把 axes 按角色分组，
        // 落 dispatchPlan 到 mn_runs.metadata。前端可读 metadata.dispatchPlan
        // 渲染真实的"专家×子维度"清单。
        // 当 payload.expertRoles 存在时，用 Step 2 用户选中的真实专家替代虚拟专家。
        const dispatchPlan = buildDispatchPlan(
          axesToRun,
          payload.preset,
          payload.strategySpec,
          payload.expertRoles ?? null,
          expertSnapshotsForDispatch ?? null,
        );
        await writeDispatchPlan(dispatchPlan);
        await writeStep(
          'dispatch',
          1.0,
          `分派完成 · ${dispatchPlan.experts.length} 位专家 · preset=${payload.preset}`,
        );

        // Step3 第 4 步「装饰器 stack 注入」：把当前 strategy 的装饰器栈
        // 写到 mn_runs.metadata.decorators，供前端在 dec 步骤展示真实清单
        const decoratorList = splitDecorators(payload.strategySpec);
        const sample = applyDecoratorStack('（system prompt sample）', payload.strategySpec);
        try {
          await this.deps.db.query(
            `UPDATE mn_runs
                SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'decorators', $2::jsonb
                )
              WHERE id = $1`,
            [payload.runId, JSON.stringify({
              raw: payload.strategySpec,
              parsed: decoratorList,
              applied: sample.applied,
              skipped: sample.skipped,
              promptPreviewLen: sample.prompt.length,
            })],
          );
        } catch (e) {
          console.warn('[runEngine] decorators write failed:', (e as Error).message);
        }
        await writeStep(
          'dec',
          1.0,
          `装饰器栈就绪 · ${sample.applied.length} 项已生效（${sample.applied.join(' → ') || 'base'}）`,
        );

        // Auto scope match：在 dispatch + dec 完成后、axes 之前，按内容关键词
        // 自动绑定该 meeting 到相关的 project / client / topic scope。
        // axes 阶段的 mn_*.scope_id 写入会优先使用这次绑定到的 scope（通过
        // mn_scope_members 关联），避免所有 row 都落到 NULL scope 的孤岛。
        if (payload.meetingId && payload.scope.kind === 'meeting') {
          try {
            const matchResult = await autoMatchAndBindScopes(
              this.deps.db,
              payload.meetingId,
              { runId: payload.runId },
            );
            // 把匹配结果落到 mn_runs.metadata.scopeMatch（前端可显示"自动绑定到 X 个 scope"）
            await this.deps.db.query(
              `UPDATE mn_runs
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'scopeMatch', $2::jsonb
                  )
                WHERE id = $1`,
              [payload.runId, JSON.stringify(matchResult)],
            );
            if (matchResult.matchedCount > 0) {
              const labels = matchResult.matched
                .slice(0, 3)
                .map((m) => `${m.kind}:${m.name}`)
                .join('、');
              console.log(
                `[runEngine] scopeMatcher ${payload.runId.slice(0, 8)}: matched=${matchResult.matchedCount}` +
                  ` newlyBound=${matchResult.newlyBoundCount} → ${labels}`,
              );
            }
          } catch (e) {
            const msg = (e as Error).message ?? String(e);
            const stack = (e as Error).stack?.split('\n').slice(0, 5).join('\n') ?? '';
            console.warn('[runEngine] scopeMatcher failed:', msg);
            try {
              await this.deps.db.query(
                `UPDATE mn_runs
                    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                      'scopeMatch', jsonb_build_object('error', $2::text, 'stack', $3::text)
                    )
                  WHERE id = $1`,
                [payload.runId, msg, stack],
              );
            } catch { /* swallow secondary error */ }
          }
        }

        await writeStep('axes', 0, axesToRun.length > 0 ? `准备开始 · ${axesToRun.length} 个维度` : '准备开始');

        // 把每个 axis 反查它属于哪位专家，跑完后更新该专家的 completedSubDims
        const axisToExpertId = new Map<string, string>();
        for (const slot of dispatchPlan.experts) {
          for (const ax of slot.axes) axisToExpertId.set(ax, slot.expertId);
        }

        // Opt-4 (O5)：累计 per-axis 统计到 mn_runs.metadata.axisStats
        // {axis: {durationMs, llmCallsDelta, inputTokensDelta, outputTokensDelta,
        //         created, updated, skipped, errors, parseFailures}}
        const axisStats: Record<string, any> = {};
        let prevCalls = counter.calls;
        let prevIn = counter.input;
        let prevOut = counter.output;

        // Opt-9 (O9) checkpoint 续传：读 metadata.checkpoint 确定从哪个 axis 续跑
        // 进程重启后被 cleanupZombieRuns 标 failed 的 run 不会续；但用户手动
        // 重试同一 runId 时，从已完成的 axis 后开始（避免 4-axis 跑 23 分钟全重）
        let resumeAxisIdx = 0;
        try {
          const cur = await this.deps.db.query(
            `SELECT metadata->'checkpoint' AS ckpt FROM mn_runs WHERE id = $1`,
            [payload.runId],
          );
          const ckpt = cur.rows[0]?.ckpt;
          if (ckpt && typeof ckpt.axisIdx === 'number' && ckpt.axisIdx > 0
              && ckpt.axisIdx <= axesToRun.length) {
            resumeAxisIdx = ckpt.axisIdx;
            console.log(`[runEngine] resume run ${payload.runId.slice(0,8)} from axis[${resumeAxisIdx}]=${axesToRun[resumeAxisIdx] ?? 'done'}`);
            // 把已经做过的 axisStats 也读回来，避免 stats 从 0 重算
            const existing = cur.rows[0] ? null : null;  // axisStats 不在 ckpt 内但在 metadata.axisStats
            const cur2 = await this.deps.db.query(
              `SELECT metadata->'axisStats' AS stats FROM mn_runs WHERE id = $1`,
              [payload.runId]);
            const prevStats = cur2.rows[0]?.stats;
            if (prevStats && typeof prevStats === 'object') {
              Object.assign(axisStats, prevStats);
            }
          }
        } catch (e) {
          console.warn('[runEngine] checkpoint read failed:', (e as Error).message);
        }

        for (let i = resumeAxisIdx; i < axesToRun.length; i++) {
          const ax = axesToRun[i];
          const expertId = axisToExpertId.get(ax);
          if (expertId) {
            await updateExpertSlot(dispatchPlan, expertId, { state: 'running' });
          }
          await writeStep('axes', i / Math.max(1, axesToRun.length), `分析中 · ${ax}（${i + 1}/${axesToRun.length}）`);
          const axisStartedAt = Date.now();
          // 嵌套一层 strategyStorage 把 currentAxis 推进上下文，
          // 让 callExpertOrLLM 能按 axis 取对应专家 persona 拼到 system prompt。
          // F6 fix · scope=project/client/topic/library 时按 mn_scope_members 展开
          // 到每场会议跑一次 runAxisAll，否则 computer 早 return（!args.meetingId）→ silent-zero
          const meetingIdsForRun: string[] = await this.collectMeetingIdsForScope(payload);
          const r: ComputeResult[] = [];
          for (const mid of meetingIdsForRun) {
            const partial = await strategyStorage.run(
              { ...strategyCtx, currentAxis: ax },
              () => runAxisAll(this.deps, ax, {
                meetingId: mid,
                scopeId: payload.scope.id ?? null,
                scopeKind: payload.scope.kind,
                replaceExisting: true,
              }, payload.axis === 'all' ? undefined : payload.subDims),
            );
            r.push(...partial);
          }
          allResults.push(...r);

          // 聚合 per-axis stats
          const sumField = (k: 'created' | 'updated' | 'skipped' | 'errors' | 'parseFailures') =>
            r.reduce((s, x) => s + (Number((x as any)[k] ?? 0) || 0), 0);
          axisStats[ax] = {
            durationMs: Date.now() - axisStartedAt,
            llmCallsDelta: counter.calls - prevCalls,
            inputTokensDelta: counter.input - prevIn,
            outputTokensDelta: counter.output - prevOut,
            subDimCount: r.length,
            created: sumField('created'),
            updated: sumField('updated'),
            skipped: sumField('skipped'),
            errors: sumField('errors'),
            parseFailures: sumField('parseFailures'),
          };
          prevCalls = counter.calls;
          prevIn = counter.input;
          prevOut = counter.output;
          // 增量写到 metadata.axisStats（前端可看每个 axis 实时进展）
          try {
            await this.deps.db.query(
              `UPDATE mn_runs
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'axisStats', $2::jsonb
                  )
                WHERE id = $1`,
              [payload.runId, JSON.stringify(axisStats)],
            );
          } catch (e) {
            console.warn('[runEngine] axisStats write failed:', (e as Error).message);
          }

          if (expertId) {
            const slot = dispatchPlan.experts.find((e) => e.expertId === expertId);
            const justDone = r.map((x) => x.subDim).filter(Boolean) as string[];
            if (slot) {
              for (const sd of justDone) {
                if (!slot.completedSubDims.includes(sd)) slot.completedSubDims.push(sd);
              }
              const allMyAxesDone = slot.axes.every((a) => axesToRun.indexOf(a) <= i);
              if (allMyAxesDone) slot.state = 'done';
            }
            await writeDispatchPlan(dispatchPlan);
          }
          await writeStep('axes', (i + 1) / Math.max(1, axesToRun.length), `${ax} 完成（${i + 1}/${axesToRun.length}）`);

          // Opt-9 (O9): 每完成一个 axis 写 checkpoint，下次重试可从 i+1 续跑
          try {
            await this.deps.db.query(
              `UPDATE mn_runs
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'checkpoint', jsonb_build_object(
                      'axisIdx', $2::int,
                      'axisName', $3::text,
                      'finishedAt', NOW()::text
                    )
                  )
                WHERE id = $1`,
              [payload.runId, i + 1, ax],
            );
          } catch (e) {
            console.warn('[runEngine] checkpoint write failed:', (e as Error).message);
          }
        }

        // 所有 axis 跑完，清掉 checkpoint（避免成功 run 也带 stale checkpoint）
        try {
          await this.deps.db.query(
            `UPDATE mn_runs SET metadata = metadata - 'checkpoint' WHERE id = $1`,
            [payload.runId],
          );
        } catch (e) {
          console.warn('[runEngine] checkpoint clear failed:', (e as Error).message);
        }

        // Step3 第 5 步「跨专家综合 · 7 条 deliverable 映射」
        if (payload.meetingId) {
          await writeStep('synth', 0.1, '跨专家综合 · 生成 7 条 deliverable');
          try {
            const synth = await synthesizeDeliverables(this.deps, payload.meetingId);
            await this.deps.db.query(
              `UPDATE mn_runs
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'synthesis', $2::jsonb
                  )
                WHERE id = $1`,
              [payload.runId, JSON.stringify(synth)],
            );
            await writeStep(
              'synth',
              1.0,
              `综合完成 · ${synth.generatedCount}/${synth.deliverables.length} 条 deliverable 已就绪`,
            );
          } catch (e) {
            console.warn('[runEngine] synthesis failed:', (e as Error).message);
          }
        }

        // Step3 第 6 步「多维度组装 · 张力 / 新认知 / 共识 / 观点对位」
        if (payload.meetingId) {
          await writeStep('render', 0.1, '多维度组装中…');
          try {
            const render = await renderMultiDim(this.deps, payload.meetingId);
            await this.deps.db.query(
              `UPDATE mn_runs
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'render', $2::jsonb
                  )
                WHERE id = $1`,
              [payload.runId, JSON.stringify(render)],
            );
            await writeStep(
              'render',
              0.7,
              `多维度组装完成 · ${render.ready}/${render.dims.length} 维度就绪`,
            );
          } catch (e) {
            console.warn('[runEngine] renderMultiDim failed:', (e as Error).message);
          }

          // 把 axes 数据 schema-map 成参考 ANALYSIS object 写到 assets.metadata.analysis。
          // 此后 view A 自动走 storedAnalysis fast-path，schema 与手工分析对齐
          // （tension.between / newCognition.before/after / consensus.kind 等字段命名一致）。
          // 已有手工版本（无 _generated 字段或 manualOverride=true）会被守护跳过。
          try {
            await writeStep('render', 0.85, '合成 view-A 分析对象（compose-analysis）…');
            const analysis = await composeAnalysisFromAxes(this.deps.db, payload.meetingId, payload.runId);
            const wrote = await persistAnalysisToAsset(this.deps.db, payload.meetingId, analysis);
            console.log(`[runEngine] composeAnalysis ${payload.runId.slice(0,8)}: ${wrote}` +
              ` · tension=${analysis.tension.length} newCog=${analysis.newCognition.length}` +
              ` consensus=${analysis.consensus.length} focusMap=${analysis.focusMap.length}`);
          } catch (e) {
            console.warn('[runEngine] composeAnalysis failed:', (e as Error).message);
          }

          // Snapshot：把 getMeetingAxes 的完整数据落版本号 vN
          await writeStep('render', 0.95, '生成快照…');
          const snapshot = await this.getMeetingAxes(payload.meetingId);
          await this.versionStore.snapshot({
            runId: payload.runId,
            scopeKind: payload.scope.kind,
            scopeId: payload.scope.id ?? null,
            axis: payload.axis,
            data: snapshot,
          });
        }
      });
      });
      } // end of multi-axis else branch

      // Finalize: state=succeeded, progress=100, persist final tokens
      await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'succeeded', finished_at = NOW(),
                cost_ms = $2, progress_pct = 100,
                cost_tokens = $3,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'currentStep', '已完成'::text,
                  'inputTokens', $4::int,
                  'outputTokens', $5::int,
                  'llmCalls', $6::int
                )
          WHERE id = $1`,
        [payload.runId, Date.now() - startedAt, counter.input + counter.output, counter.input, counter.output, counter.calls],
      );
      // Opt-1 (O1+O2)：把 axis-level errorSamples / parseFailures 聚合到
       // metadata.axisIssues 让前端 / 运维能看到 silent-zero 的原因
      try {
        const issues = allResults
          .filter((r) => (r.errors ?? 0) > 0 || (r.parseFailures ?? 0) > 0
                       || (r.errorSamples?.length ?? 0) > 0)
          .map((r) => ({
            subDim: r.subDim,
            errors: r.errors ?? 0,
            parseFailures: r.parseFailures ?? 0,
            errorSamples: (r.errorSamples ?? []).slice(0, 3),
          }));
        if (issues.length > 0) {
          await this.deps.db.query(
            `UPDATE mn_runs
                SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'axisIssues', $2::jsonb
                )
              WHERE id = $1`,
            [payload.runId, JSON.stringify(issues)],
          );
        }
      } catch (e) {
        console.warn('[runEngine] axisIssues write failed:', (e as Error).message);
      }

      await this.deps.eventBus.publish('mn.run.completed', {
        runId: payload.runId,
        results: allResults,
      });
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'failed', finished_at = NOW(),
                cost_ms = $2, error_message = $3,
                cost_tokens = $4,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'currentStep', '失败'::text,
                  'inputTokens', $5::int,
                  'outputTokens', $6::int,
                  'llmCalls', $7::int
                )
          WHERE id = $1`,
        [payload.runId, Date.now() - startedAt, msg, counter.input + counter.output, counter.input, counter.output, counter.calls],
      );
      await this.deps.eventBus.publish('mn.run.failed', { runId: payload.runId, error: msg });
    } finally {
      // F3 · 清掉 heartbeat timer，无论成功失败 / cancel
      clearInterval(heartbeatTimer);
    }
  }

  private async lookupMeetingKind(req: EnqueueRunRequest): Promise<string | null> {
    if (req.scope.kind !== 'meeting' || !req.scope.id) return null;
    const r = await this.deps.db.query(
      `SELECT metadata->>'meeting_kind' AS kind FROM assets WHERE id = $1`,
      [req.scope.id],
    );
    return r.rows[0]?.kind ?? null;
  }

  // 给 versionStore 使用
  get versions(): VersionStore { return this.versionStore; }
  get stats() { return this.queue.stats(); }
}
