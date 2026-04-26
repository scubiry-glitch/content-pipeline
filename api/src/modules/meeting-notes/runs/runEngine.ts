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
import { strategyStorage, splitDecorators, applyDecoratorStack } from '../axes/decoratorStack.js';
import { synthesizeDeliverables } from './synthesis.js';

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
    llmCalls: Number(meta.llmCalls ?? 0),
  };
}

export class RunEngine {
  private readonly queue: RunQueue<QueuePayload>;
  private readonly versionStore: VersionStore;
  private draining = false;

  constructor(
    private readonly deps: MeetingNotesDeps,
    private readonly getMeetingAxes: (meetingId: string) => Promise<any>,
    opts: { concurrency?: number } = {},
  ) {
    this.queue = new RunQueue<QueuePayload>(opts.concurrency ?? 2);
    this.versionStore = new VersionStore(deps);
  }

  /** 入队一条 run 并立即触发 drain（异步） */
  async enqueue(req: EnqueueRunRequest): Promise<{ ok: boolean; runId?: string; reason?: string }> {
    const scopeNorm = normalizeScopeForDb(req.scope as ScopeRef & { ref?: unknown });
    const reqNorm: EnqueueRunRequest = { ...req, scope: scopeNorm };
    const triggeredBy = coerceRunTrigger(req.triggeredBy);

    // 1. 解析 strategy / preset
    const meetingKind = await this.lookupMeetingKind(reqNorm);
    const strategyFromApp = this.deps.expertApplication.resolveForMeetingKind(meetingKind);
    const preset: Preset =
      coercePreset(req.preset)
      ?? coercePreset(strategyFromApp?.preset as unknown)
      ?? 'standard';
    const strategySpec = req.strategy ?? strategyFromApp?.default ?? null;

    // 2. 拉直 subDims：若未指定，使用 axis 全量子维度
    const subDims = req.subDims && req.subDims.length > 0
      ? req.subDims
      : (req.axis === 'all' ? [] : (AXIS_SUBDIMS[req.axis] ?? []));

    // 3. 落 mn_runs(queued)
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
        JSON.stringify({ meetingKind }),
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
    try {
      // Wrap the entire run in two nested AsyncLocalStorage:
      //  · llmUsageStorage —— LLM token 累计
      //  · strategyStorage —— 当前 run 的 strategy/decorator 栈，axis computer
      //     的 callExpertOrLLM 会读到，自动把装饰器追加到 system prompt
      const strategyCtx = {
        strategySpec: payload.strategySpec,
        preset: payload.preset,
      };
      await strategyStorage.run(strategyCtx, async () => {
      await llmUsageStorage.run(counter, async () => {
        // Ingest + Segment + Participant-merge：通过 meetingParser 走完整链路
        //   step3 第 1 步「原始素材解析」：assetsAi.parseMeeting 做正则切分
        //   step3 第 2 步「发言切分 + 参与者归并」：parseMeeting() 完成 ensurePersonByName
        // 这两步一起跑（共用 LLM 之外的 IO），但 progress 分两次写以便前端能看到推进。
        if (payload.meetingId) {
          await writeProgress(0, '原始素材解析 · ASR + 文档清洗');
          try {
            // 直接用 deps.assetsAi 拿到 segments/participants（本地解析无 LLM 成本），
            // 然后用 parseMeeting 完成 mn_people 入库 + segment 落库。
            const { parseMeeting } = await import('../parse/meetingParser.js');
            const parseResult = await parseMeeting(this.deps, payload.meetingId);
            if (parseResult.ok) {
              await writeProgress(
                0,
                `素材解析完成 · ${parseResult.segmentCount ?? 0} 段` +
                  (parseResult.durationSec ? ` · ≈${Math.round(parseResult.durationSec / 60)} 分钟` : ''),
              );
              await writeProgress(
                0,
                `发言切分 + 参与者归并完成 · ${parseResult.participantCount} 位参与者已入库 mn_people`,
              );
            } else {
              await writeProgress(0, `素材解析跳过 · ${parseResult.reason ?? 'unknown'}`);
            }
          } catch (e) {
            // ingest/segment 失败不致命；记录但继续往下走
            console.warn('[runEngine] ingest parseMeeting failed:', (e as Error).message);
          }
        }

        // Step3 第 3 步「分派给 3 位专家」：把 axes 按 AXIS_TO_EXPERT 分组，
        // 落 dispatchPlan 到 mn_runs.metadata。前端可读 metadata.dispatchPlan
        // 渲染真实的"专家×子维度"清单，而不是空文案。
        const dispatchPlan = buildDispatchPlan(axesToRun, payload.preset, payload.strategySpec);
        await writeDispatchPlan(dispatchPlan);
        await writeProgress(
          0,
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
        await writeProgress(
          0,
          `装饰器栈就绪 · ${sample.applied.length} 项已生效（${sample.applied.join(' → ') || 'base'}）`,
        );

        await writeProgress(0, axesToRun.length > 0 ? `准备开始 · ${axesToRun.length} 个维度` : '准备开始');

        // 把每个 axis 反查它属于哪位专家，跑完后更新该专家的 completedSubDims
        const axisToExpertId = new Map<string, string>();
        for (const slot of dispatchPlan.experts) {
          for (const ax of slot.axes) axisToExpertId.set(ax, slot.expertId);
        }

        for (let i = 0; i < axesToRun.length; i++) {
          const ax = axesToRun[i];
          const expertId = axisToExpertId.get(ax);
          if (expertId) {
            await updateExpertSlot(dispatchPlan, expertId, { state: 'running' });
          }
          await writeProgress(i, `分析中 · ${ax}（${i + 1}/${axesToRun.length}）`);
          const r = await runAxisAll(this.deps, ax, {
            meetingId: payload.meetingId,
            scopeId: payload.scope.id ?? null,
            scopeKind: payload.scope.kind,
            replaceExisting: true,
          }, payload.axis === 'all' ? undefined : payload.subDims);
          allResults.push(...r);

          if (expertId) {
            const slot = dispatchPlan.experts.find((e) => e.expertId === expertId);
            // 把刚跑完的 subDims 累加到 completedSubDims
            const justDone = r.map((x) => x.subDim).filter(Boolean) as string[];
            if (slot) {
              for (const sd of justDone) {
                if (!slot.completedSubDims.includes(sd)) slot.completedSubDims.push(sd);
              }
              // 该专家所有 axis 都跑完才标 done
              const allMyAxesDone = slot.axes.every((a) =>
                axesToRun.indexOf(a) <= i,
              );
              if (allMyAxesDone) slot.state = 'done';
            }
            await writeDispatchPlan(dispatchPlan);
          }
          await writeProgress(i + 1, `${ax} 完成（${i + 1}/${axesToRun.length}）`);
        }

        // Step3 第 5 步「跨专家综合 · 7 条 deliverable 映射」
        if (payload.meetingId) {
          await writeProgress(axesToRun.length, '跨专家综合 · 生成 7 条 deliverable');
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
            await writeProgress(
              axesToRun.length,
              `综合完成 · ${synth.generatedCount}/${synth.deliverables.length} 条 deliverable 已就绪`,
            );
          } catch (e) {
            console.warn('[runEngine] synthesis failed:', (e as Error).message);
          }
        }

        // Snapshot stage（step3 第 6 步「多维度组装」）
        if (payload.meetingId) {
          await writeProgress(axesToRun.length, '生成快照…');
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
