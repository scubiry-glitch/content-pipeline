// Brain · 跨模块任务队列 + 总览
// 聚合 mn_runs WHERE module IN ('mn','ceo') — meeting-notes 和 ceo 的 LLM 任务都展示

import type { CeoEngineDeps } from '../types.js';

export async function listCrossModuleTasks(
  deps: CeoEngineDeps,
  filter: { state?: string; module?: string; limit?: number; ids?: string[] },
): Promise<{ items: any[] }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.state) {
    params.push(filter.state);
    where.push(`state = $${params.length}`);
  }
  if (filter.module) {
    params.push(filter.module);
    where.push(`module = $${params.length}`);
  }
  if (filter.ids && filter.ids.length > 0) {
    params.push(filter.ids);
    where.push(`id = ANY($${params.length}::uuid[])`);
  }
  const limitN = Math.max(1, Math.min(filter.limit ?? 30, 100));

  try {
    const r = await deps.db.query(
      `SELECT id::text, module, scope_kind, scope_id::text, axis,
              state, triggered_by, preset, progress_pct, cost_tokens,
              cost_ms, error_message, started_at, finished_at, created_at,
              metadata
         FROM mn_runs
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC
        LIMIT ${limitN}`,
      params,
    );
    return { items: r.rows };
  } catch {
    return { items: [] };
  }
}

export async function getBrainOverview(deps: CeoEngineDeps): Promise<{
  byModule: Record<string, { queued: number; running: number; succeeded: number; failed: number }>;
  recentLlmCalls: number;
}> {
  const byModule: Record<string, { queued: number; running: number; succeeded: number; failed: number }> = {};
  try {
    const r = await deps.db.query(
      `SELECT module, state, COUNT(*)::int AS n
         FROM mn_runs
        WHERE created_at > NOW() - INTERVAL '14 days'
        GROUP BY module, state`,
    );
    for (const row of r.rows) {
      const m = row.module ?? 'mn';
      if (!byModule[m]) byModule[m] = { queued: 0, running: 0, succeeded: 0, failed: 0 };
      const state = row.state as keyof (typeof byModule)[string];
      if (state in byModule[m]) byModule[m][state] = Number(row.n);
    }
  } catch {
    // 表不存在 — fallback 空
  }

  let recentLlmCalls = 0;
  try {
    const r = await deps.db.query(
      `SELECT COALESCE(SUM((metadata->>'llmCalls')::int), 0)::int AS n
         FROM mn_runs
        WHERE created_at > NOW() - INTERVAL '7 days'`,
    );
    recentLlmCalls = Number(r.rows[0]?.n ?? 0);
  } catch {
    /* ignore */
  }

  return { byModule, recentLlmCalls };
}
