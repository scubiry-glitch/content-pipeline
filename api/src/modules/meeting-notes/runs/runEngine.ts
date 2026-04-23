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

function mapRun(row: Record<string, any>): RunRecord {
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
    metadata: row.metadata ?? {},
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
    // 1. 解析 strategy / preset
    const meetingKind = await this.lookupMeetingKind(req);
    const strategyFromApp = this.deps.expertApplication.resolveForMeetingKind(meetingKind);
    const preset: Preset = req.preset ?? strategyFromApp?.preset ?? 'standard';
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
        req.scope.kind,
        req.scope.id ?? null,
        req.axis,
        subDims,
        preset,
        strategySpec,
        req.triggeredBy ?? 'manual',
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
        scope: req.scope,
        axis: req.axis,
        subDims,
        preset,
        strategySpec,
        triggeredBy: req.triggeredBy ?? 'manual',
        parentRunId: req.parentRunId ?? null,
        meetingId: req.scope.kind === 'meeting' ? req.scope.id : undefined,
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

    const allResults: ComputeResult[] = [];
    try {
      const compute = async (ax: string) => {
        const r = await runAxisAll(this.deps, ax, {
          meetingId: payload.meetingId,
          scopeId: payload.scope.id ?? null,
          scopeKind: payload.scope.kind,
          replaceExisting: true,
        }, payload.axis === 'all' ? undefined : payload.subDims);
        allResults.push(...r);
      };

      if (payload.axis === 'all') {
        for (const ax of ALL_AXES) await compute(ax);
      } else if (payload.axis === 'longitudinal') {
        // PR5 实现；此处跳过
      } else {
        await compute(payload.axis);
      }

      // Snapshot （按单轴或 all 统一出一份 meeting 级视图）
      if (payload.meetingId) {
        const snapshot = await this.getMeetingAxes(payload.meetingId);
        await this.versionStore.snapshot({
          runId: payload.runId,
          scopeKind: payload.scope.kind,
          scopeId: payload.scope.id ?? null,
          axis: payload.axis,
          data: snapshot,
        });
      }

      // 标 succeeded
      await this.deps.db.query(
        `UPDATE mn_runs
            SET state = 'succeeded', finished_at = NOW(),
                cost_ms = $2, progress_pct = 100
          WHERE id = $1`,
        [payload.runId, Date.now() - startedAt],
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
                cost_ms = $2, error_message = $3
          WHERE id = $1`,
        [payload.runId, Date.now() - startedAt, msg],
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
