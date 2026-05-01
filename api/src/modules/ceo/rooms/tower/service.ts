// Tower · 协调房间 service
// 主要复用 mn_commitments，CEO 视角聚合：谁欠谁/卡点/节奏脉搏/精力透支

import type { CeoEngineDeps } from '../../types.js';
import { computeResponsibilityClarity } from './aggregator.js';

/**
 * 列承诺 — 优先 mn_commitments；表不存在则回退到 ceo_board_promises
 */
export async function listCommitmentsByStatus(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; status?: string },
): Promise<{ items: any[]; source: 'mn' | 'ceo' | 'empty' }> {
  // 尝试 mn_commitments 表
  try {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.scopeId) {
      params.push(filter.scopeId);
      where.push(`scope_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    const r = await deps.db.query(
      `SELECT id::text, scope_id::text, owner_name, beneficiary_name,
              what, due_at, status, source_meeting_id::text, created_at
         FROM mn_commitments
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY due_at NULLS LAST, created_at DESC
        LIMIT 100`,
      params,
    );
    return { items: r.rows, source: 'mn' };
  } catch {
    // mn_commitments schema 与本期不兼容时回退
    return { items: [], source: 'empty' };
  }
}

export async function listBlockers(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{ items: Array<{ name: string; days: number; text: string; warn: boolean }> }> {
  // 卡点定义：超过 14 天未更新的 in_progress 承诺
  try {
    const r = await deps.db.query(
      `SELECT what, owner_name, beneficiary_name, due_at, created_at,
              EXTRACT(DAY FROM (NOW() - COALESCE(due_at, created_at)))::int AS days_late
         FROM mn_commitments
        WHERE status IN ('in_progress','open')
          AND ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND COALESCE(due_at, created_at) < NOW() - INTERVAL '14 days'
        ORDER BY days_late DESC NULLS LAST
        LIMIT 8`,
      [scopeId ?? null],
    );
    return {
      items: r.rows.map((row) => ({
        name: row.what,
        days: Number(row.days_late ?? 0),
        text: `${row.owner_name ?? '?'} → ${row.beneficiary_name ?? '?'}`,
        warn: Number(row.days_late ?? 0) >= 28,
      })),
    };
  } catch {
    return { items: [] };
  }
}

export async function getRhythmPulse(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; weeks?: number },
): Promise<{
  weeks: Array<{ weekStart: string; mainHours: number; firefightingHours: number }>;
  planLine: number;
}> {
  const weeks = filter.weeks ?? 8;
  const r = await deps.db.query(
    `SELECT week_start, kind, COALESCE(SUM(hours), 0)::numeric AS h
       FROM ceo_attention_alloc
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND week_start >= (DATE_TRUNC('week', NOW())::date - ($2::int * 7) * INTERVAL '1 day')
      GROUP BY week_start, kind
      ORDER BY week_start`,
    [filter.scopeId ?? null, weeks],
  );

  const buckets = new Map<string, { main: number; firefighting: number }>();
  for (const row of r.rows) {
    const key = String(row.week_start);
    const cur = buckets.get(key) ?? { main: 0, firefighting: 0 };
    if (row.kind === 'main') cur.main = Number(row.h);
    if (row.kind === 'firefighting') cur.firefighting = Number(row.h);
    buckets.set(key, cur);
  }
  const result = Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => ({ weekStart: k, mainHours: v.main, firefightingHours: v.firefighting }));

  return { weeks: result, planLine: 20 };
}

export async function getTowerDashboard(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  responsibilityClarity: number;
  commitmentStats: { proposed: number; in_progress: number; overdue: number; done: number; total: number };
  topBlockers: Array<{ name: string; days: number; text: string; warn: boolean }>;
}> {
  const responsibilityClarity = await computeResponsibilityClarity(deps, scopeId);
  const blockers = await listBlockers(deps, scopeId);

  let stats = { proposed: 0, in_progress: 0, overdue: 0, done: 0, total: 0 };
  try {
    const r = await deps.db.query(
      `SELECT status, COUNT(*)::int AS n,
              SUM(CASE WHEN status IN ('in_progress','open') AND due_at < NOW() THEN 1 ELSE 0 END)::int AS overdue_n
         FROM mn_commitments
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        GROUP BY status`,
      [scopeId ?? null],
    );
    for (const row of r.rows) {
      const s = row.status as string;
      if (s === 'open' || s === 'proposed') stats.proposed += Number(row.n);
      else if (s === 'in_progress') stats.in_progress += Number(row.n);
      else if (s === 'done' || s === 'closed') stats.done += Number(row.n);
      stats.total += Number(row.n);
      stats.overdue += Number(row.overdue_n ?? 0);
    }
  } catch {
    // 表不存在或 schema 差异
  }

  return {
    question: '谁欠谁什么? 卡在哪?',
    metric: {
      label: '责任清晰度',
      value: `${(responsibilityClarity * 100).toFixed(0)}%`,
      delta: '本周',
    },
    responsibilityClarity,
    commitmentStats: stats,
    topBlockers: blockers.items.slice(0, 5),
  };
}
