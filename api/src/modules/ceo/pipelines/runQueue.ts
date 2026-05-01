// CEO · 任务队列轮询 + 入队
//
// 由于 mn 的 runEngine.recoverQueuedRuns 已过滤 module='mn'，CEO 需要自己的轮询拉取
// module='ceo' 的 queued 任务，跑完写回 succeeded/failed。
//
// 设计：每 15 秒扫一次 mn_runs WHERE module='ceo' AND state='queued'，单进程串行执行。
// 简化版 — 不做并发、不做心跳、不做 zombie 恢复（CEO 任务都是几秒级规则计算或 stub LLM）。

import type { CeoEngineDeps } from '../types.js';
import { handleCeoRun, type CeoRunRow } from './runHandlers.js';

const POLL_INTERVAL_MS = Number(process.env.CEO_RUN_POLL_MS ?? 15000);

export class CeoRunQueue {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private executing = false;

  constructor(private readonly deps: CeoEngineDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      this.drain().catch((e) => console.warn('[CeoRunQueue] drain error:', (e as Error).message));
    };
    // 首次 5s 后跑
    setTimeout(tick, 5000);
    this.timer = setInterval(tick, POLL_INTERVAL_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    console.log(`[CeoRunQueue] started (poll=${POLL_INTERVAL_MS}ms)`);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 拉一条 queued run，跑完返回；并发由 executing 标记保护 */
  async drain(): Promise<{ picked: number }> {
    if (this.executing) return { picked: 0 };
    this.executing = true;
    let picked = 0;
    try {
      while (this.running) {
        const r = await this.deps.db.query(
          `SELECT id::text, axis, scope_kind, scope_id::text, metadata
             FROM mn_runs
            WHERE module = 'ceo' AND state = 'queued'
            ORDER BY created_at ASC
            LIMIT 1`,
        );
        if (r.rows.length === 0) break;
        const run = r.rows[0] as CeoRunRow;

        // 标 running
        await this.deps.db.query(
          `UPDATE mn_runs
              SET state = 'running', started_at = NOW(),
                  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ceoRunStartedAt', NOW()::text)
            WHERE id = $1::uuid`,
          [run.id],
        );

        const result = await handleCeoRun(this.deps, run);

        if (result.ok) {
          await this.deps.db.query(
            `UPDATE mn_runs
                SET state = 'succeeded', finished_at = NOW(),
                    progress_pct = 100,
                    metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
              WHERE id = $1::uuid`,
            [run.id, JSON.stringify({ ceoResult: result.result })],
          );
        } else {
          await this.deps.db.query(
            `UPDATE mn_runs
                SET state = 'failed', finished_at = NOW(),
                    error_message = COALESCE(error_message, $2)
              WHERE id = $1::uuid`,
            [run.id, result.error ?? '[CEO] run failed'],
          );
        }
        picked++;
      }
    } finally {
      this.executing = false;
    }
    return { picked };
  }
}

/**
 * 入队一个 CEO LLM/规则任务到 mn_runs (module='ceo')
 *
 * 命名规范 (2026-05-01 重构):
 *   优先使用 `<room>-<action>` 语义化 axis (如 'warroom-sandbox', 'boardroom-rebuttal',
 *   'boardroom-annotations', 'compass-echo', 'balcony-prompt', 'panorama-aggregate').
 *
 *   也接受历史 'g1'..'g5' (legacy, 仍由 dispatcher 路由到对应 handler).
 *
 * @param axis 语义化 axis 或 g1..g5
 * @param scopeId 可选 scope 范围
 * @param metadata 任务上下文 (briefId / sandboxId / 等)
 */
export type CeoAxis =
  | 'g1' | 'g2' | 'g3' | 'g4' | 'g5'
  | `${'compass' | 'boardroom' | 'tower' | 'warroom' | 'situation' | 'balcony' | 'panorama'}-${string}`;

export async function enqueueCeoRun(
  deps: CeoEngineDeps,
  input: {
    axis: CeoAxis | string;
    scopeKind?: string;
    scopeId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; runId?: string }> {
  try {
    const r = await deps.db.query(
      `INSERT INTO mn_runs
        (module, scope_kind, scope_id, axis, state, triggered_by, preset, sub_dims, metadata)
       VALUES ('ceo', $1, $2, $3, 'queued', 'manual', 'lite', '{}', $4::jsonb)
       RETURNING id::text`,
      [
        input.scopeKind ?? 'project',
        input.scopeId ?? null,
        input.axis,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return { ok: true, runId: r.rows[0]?.id };
  } catch (e) {
    console.warn('[enqueueCeoRun] failed:', (e as Error).message);
    return { ok: false };
  }
}
