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
  private draining = false;

  constructor(
    private readonly deps: MeetingNotesDeps,
    private readonly getMeetingAxes: (meetingId: string) => Promise<any>,
    opts: { concurrency?: number; zombieTimeoutMin?: number } = {},
  ) {
    this.queue = new RunQueue<QueuePayload>(opts.concurrency ?? 2);
    this.versionStore = new VersionStore(deps);

    // Opt-3 (O4): 启动时清扫僵尸 running run
    // RunQueue 是 in-memory，进程重启 / 崩溃后 mn_runs.state='running' 永久卡住
    // 这里把 started_at < NOW() - zombieTimeoutMin 的 running 标 failed
    // zombieTimeoutMin 默认 30 分钟（远大于正常 run 时长 ~5-25 分钟）
    const zombieMin = opts.zombieTimeoutMin ?? 30;
    setImmediate(() => {
      this.cleanupZombieRuns(zombieMin).catch((e) =>
        console.warn('[RunEngine] zombie cleanup failed:', (e as Error).message),
      );
    });
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
      const r1 = await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'failed', finished_at = NOW(),
                error_message = COALESCE(error_message, 'heartbeat-timeout: process restart or crash'),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'currentStep', '失败 · 心跳超时',
                  'currentStepKey', 'zombie',
                  'zombieDetectedAt', NOW()::text
                )
          WHERE state = 'running'
            AND started_at IS NOT NULL
            AND started_at < NOW() - ($1::int * INTERVAL '1 minute')
          RETURNING id`,
        [zombieMin],
      );
      failedRuns = (r1 as any).rowCount ?? r1.rows?.length ?? 0;
    } catch (e) {
      console.warn('[RunEngine] cleanup running zombies failed:', (e as Error).message);
    }
    try {
      // queued 超过 1 小时无人处理 → 标 cancelled（队列已丢）
      const r2 = await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'cancelled', finished_at = NOW(),
                error_message = COALESCE(error_message, 'queued-orphan: in-memory queue lost on restart')
          WHERE state = 'queued'
            AND created_at < NOW() - INTERVAL '1 hour'
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
    const ins = await this.deps.db.query(
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
      },
      enqueuedAt: Date.now(),
    });

    // 5. 立即异步驱动一次（不 await）
    this.drainSoon();
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

  async list(filter: {
    scopeKind?: string;
    scopeId?: string | null;
    axis?: string;
    state?: RunState;
    limit?: number;
  }): Promise<RunRecord[]> {
    const where: string[] = [];
    const params: any[] = [];
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
    // 重新入队（从 metadata 还原 expertRoles，保证 resume 沿用同一组专家）
    const resumedExpertRoles = sanitizeExpertRoles((row.metadata as Record<string, unknown> | null)?.expertRoles);
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
      },
      enqueuedAt: Date.now(),
    });
    this.drainSoon();
    return { ok: true };
  }

  // ============================================================
  // 内部驱动
  // ============================================================

  private drainSoon(): void {
    if (this.draining) return;
    this.draining = true;
    setImmediate(() => {
      this.queue
        .drain((item) => this.execute(item.payload))
        .catch((e) => console.error('[RunEngine] drain error:', e))
        .finally(() => {
          this.draining = false;
          // 有剩余则再踩一脚
          if (this.queue.stats().pending > 0) this.drainSoon();
        });
    });
  }

  private async execute(payload: QueuePayload): Promise<void> {
    const startedAt = Date.now();
    await this.deps.db.query(
      `UPDATE mn_runs SET state = 'running', started_at = NOW() WHERE id = $1 AND state = 'queued'`,
      [payload.runId],
    );
    await this.deps.eventBus.publish('mn.run.started', { runId: payload.runId });

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
      // Wrap the entire run in two nested AsyncLocalStorage:
      //  · llmUsageStorage —— LLM token 累计
      //  · strategyStorage —— 当前 run 的 strategy/decorator 栈 + 用户指定的 expert persona，
      //     axis computer 的 callExpertOrLLM 会读到 strategy + 当前 axis 对应 persona
      const strategyCtx = {
        strategySpec: payload.strategySpec,
        preset: payload.preset,
        expertPersonaByAxis,
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
          const r = await strategyStorage.run(
            { ...strategyCtx, currentAxis: ax },
            () => runAxisAll(this.deps, ax, {
              meetingId: payload.meetingId,
              scopeId: payload.scope.id ?? null,
              scopeKind: payload.scope.kind,
              replaceExisting: true,
            }, payload.axis === 'all' ? undefined : payload.subDims),
          );
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
