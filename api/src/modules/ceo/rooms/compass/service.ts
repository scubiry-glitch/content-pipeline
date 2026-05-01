// Compass · 方向房间 service
// 三表 CRUD 读取 + 聚合 dashboard + alignment_score 重算

import type { CeoEngineDeps } from '../../types.js';
import { computeAlignmentScore } from './aggregator.js';

interface StrategicLineRow {
  id: string;
  scope_id: string | null;
  name: string;
  kind: 'main' | 'branch' | 'drift';
  alignment_score: number | null;
  status: string;
  description: string | null;
}

export async function listStrategicLines(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; kind?: string },
): Promise<{ items: StrategicLineRow[] }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.scopeId) {
    params.push(filter.scopeId);
    where.push(`scope_id = $${params.length}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    where.push(`kind = $${params.length}`);
  }
  const sql = `SELECT id::text, scope_id::text, name, kind, alignment_score, status, description
                 FROM ceo_strategic_lines
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY kind, name`;
  const r = await deps.db.query(sql, params);
  return { items: r.rows };
}

export async function listStrategicEchos(
  deps: CeoEngineDeps,
  filter: { lineId?: string },
): Promise<{ items: any[] }> {
  if (!filter.lineId) {
    return { items: [] };
  }
  const r = await deps.db.query(
    `SELECT id::text, line_id::text, hypothesis_text, fact_text, fate,
            evidence_run_ids, source_meeting_id::text, updated_at
       FROM ceo_strategic_echos
      WHERE line_id = $1
      ORDER BY updated_at DESC`,
    [filter.lineId],
  );
  return { items: r.rows };
}

export async function getAttentionAlloc(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; weekStart?: string },
): Promise<{ weekStart: string | null; items: any[]; total: number }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.scopeId) {
    params.push(filter.scopeId);
    where.push(`scope_id = $${params.length}`);
  }
  if (filter.weekStart) {
    params.push(filter.weekStart);
    where.push(`week_start = $${params.length}`);
  } else {
    // 默认本周一
    where.push(`week_start = (DATE_TRUNC('week', NOW())::date)`);
  }
  const sql = `SELECT id::text, week_start, project_id::text, hours, kind
                 FROM ceo_attention_alloc
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY hours DESC`;
  const r = await deps.db.query(sql, params);
  const total = r.rows.reduce((acc, row) => acc + Number(row.hours), 0);
  return {
    weekStart: filter.weekStart ?? (r.rows[0]?.week_start ?? null),
    items: r.rows,
    total,
  };
}

/** Compass dashboard: 聚合战略线 + 漂移 + 时间分配 + alignment_score */
export async function getCompassDashboard(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  lines: { main: number; branch: number; drift: number };
  attention: { main: number; branch: number; firefighting: number; total: number };
  driftAlerts: Array<{ name: string; delta: string; text: string }>;
  alignmentScore: number;
}> {
  const lineCounts = await deps.db.query(
    `SELECT kind, COUNT(*)::int AS n
       FROM ceo_strategic_lines
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
      GROUP BY kind`,
    [scopeId ?? null],
  );
  const counts: Record<string, number> = { main: 0, branch: 0, drift: 0 };
  for (const r of lineCounts.rows) counts[r.kind] = r.n;

  const att = await deps.db.query(
    `SELECT kind, COALESCE(SUM(hours), 0)::numeric AS h
       FROM ceo_attention_alloc
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND week_start = (DATE_TRUNC('week', NOW())::date)
      GROUP BY kind`,
    [scopeId ?? null],
  );
  const attention = { main: 0, branch: 0, firefighting: 0, total: 0 };
  for (const r of att.rows) {
    const k = r.kind as keyof typeof attention;
    if (k in attention) attention[k] = Number(r.h);
  }
  attention.total = attention.main + attention.branch + attention.firefighting;

  const driftRows = await deps.db.query(
    `SELECT name, alignment_score
       FROM ceo_strategic_lines
      WHERE kind = 'drift'
        AND ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND status = 'active'
      ORDER BY alignment_score ASC NULLS FIRST
      LIMIT 5`,
    [scopeId ?? null],
  );
  const driftAlerts = driftRows.rows.map((r) => ({
    name: r.name,
    delta: r.alignment_score == null ? '⊘' : `${(r.alignment_score * 100).toFixed(0)}%`,
    text: '偏离主线',
  }));

  const alignmentScore = await computeAlignmentScore(deps, scopeId);

  return {
    question: '我把时间花在战略主线上了吗?',
    metric: {
      label: '战略对齐度',
      value: alignmentScore.toFixed(2),
      delta: '本周',
    },
    lines: counts as { main: number; branch: number; drift: number },
    attention,
    driftAlerts,
    alignmentScore,
  };
}

export async function recomputeAlignment(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{ scopeId: string | null; alignmentScore: number }> {
  const score = await computeAlignmentScore(deps, scopeId);
  return { scopeId: scopeId ?? null, alignmentScore: score };
}
