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

type StateBucket = { queued: number; running: number; succeeded: number; failed: number };
type AxisBreakdown = StateBucket & {
  $sub_kinds?: Record<string, Partial<StateBucket>>;
};
type ModuleBucket = StateBucket & { $axis_breakdown: Record<string, AxisBreakdown> };

interface CostWindow {
  tokens_14d: number;
  ms_14d: number;
  usd_estimate_14d: number;
}

/** 简化定价：tokens 不分输入输出，按混合均价估算 (~Claude 3.5 Sonnet) */
const USD_PER_TOKEN = 0.000005;

function ensureModule(map: Record<string, ModuleBucket>, m: string): ModuleBucket {
  if (!map[m]) {
    map[m] = { queued: 0, running: 0, succeeded: 0, failed: 0, $axis_breakdown: {} };
  }
  return map[m];
}

function ensureAxis(mod: ModuleBucket, axis: string): AxisBreakdown {
  if (!mod.$axis_breakdown[axis]) {
    mod.$axis_breakdown[axis] = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  }
  return mod.$axis_breakdown[axis];
}

function bumpBucket(b: StateBucket, state: string, n: number): void {
  if (state === 'queued' || state === 'running' || state === 'succeeded' || state === 'failed') {
    b[state] += n;
  }
}

export async function getBrainOverview(deps: CeoEngineDeps): Promise<{
  byModule: Record<string, ModuleBucket>;
  recentLlmCalls: number;
  $cost_window: CostWindow;
}> {
  const byModule: Record<string, ModuleBucket> = {};

  // (module, axis, state) 三维分组
  try {
    const r = await deps.db.query(
      `SELECT module, axis, state, COUNT(*)::int AS n
         FROM mn_runs
        WHERE created_at > NOW() - INTERVAL '14 days'
        GROUP BY module, axis, state`,
    );
    for (const row of r.rows) {
      const m = row.module ?? 'mn';
      const axis = row.axis ?? 'unknown';
      const state = String(row.state);
      const n = Number(row.n);
      const mod = ensureModule(byModule, m);
      bumpBucket(mod, state, n);
      const ax = ensureAxis(mod, axis);
      bumpBucket(ax, state, n);
    }
  } catch {
    // 表不存在 — fallback 空
  }

  // ceo · g3 子类 (g3-rebuttal / g3-sandbox) — 从 metadata.kind 取
  try {
    const r = await deps.db.query(
      `SELECT state, metadata->>'kind' AS kind, COUNT(*)::int AS n
         FROM mn_runs
        WHERE module = 'ceo' AND axis = 'g3'
          AND created_at > NOW() - INTERVAL '14 days'
          AND metadata ? 'kind'
        GROUP BY state, metadata->>'kind'`,
    );
    if (r.rows.length > 0) {
      const ceoMod = ensureModule(byModule, 'ceo');
      const g3 = ensureAxis(ceoMod, 'g3');
      g3.$sub_kinds = g3.$sub_kinds ?? {};
      for (const row of r.rows) {
        const kind = String(row.kind ?? 'unknown');
        const state = String(row.state);
        if (!g3.$sub_kinds[kind]) g3.$sub_kinds[kind] = {};
        const cur = g3.$sub_kinds[kind] as Record<string, number>;
        cur[state] = (cur[state] ?? 0) + Number(row.n);
      }
    }
  } catch {
    /* ignore */
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

  // 14 天 cost window
  let cost_window: CostWindow = { tokens_14d: 0, ms_14d: 0, usd_estimate_14d: 0 };
  try {
    const r = await deps.db.query(
      `SELECT COALESCE(SUM(cost_tokens), 0)::bigint AS tokens,
              COALESCE(SUM(cost_ms), 0)::bigint AS ms
         FROM mn_runs
        WHERE created_at > NOW() - INTERVAL '14 days'`,
    );
    const tokens = Number(r.rows[0]?.tokens ?? 0);
    const ms = Number(r.rows[0]?.ms ?? 0);
    cost_window = {
      tokens_14d: tokens,
      ms_14d: ms,
      usd_estimate_14d: Number((tokens * USD_PER_TOKEN).toFixed(2)),
    };
  } catch {
    /* ignore */
  }

  return { byModule, recentLlmCalls, $cost_window: cost_window };
}
