// Situation · 各方房间 service
// 利益相关方 / 外部信号 / Rubric 矩阵

import type { CeoEngineDeps } from '../../types.js';
import { computeCoverage } from './aggregator.js';

const STAKEHOLDER_KINDS = ['customer', 'regulator', 'investor', 'press', 'partner', 'employee'] as const;

export async function listStakeholders(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; kind?: string },
): Promise<{ items: any[] }> {
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
  const r = await deps.db.query(
    `SELECT id::text, scope_id::text, name, kind, heat, last_signal_at, description
       FROM ceo_stakeholders
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY heat DESC, last_signal_at DESC NULLS LAST`,
    params,
  );
  return { items: r.rows };
}

export async function listSignals(
  deps: CeoEngineDeps,
  filter: { stakeholderId?: string },
): Promise<{ items: any[] }> {
  if (!filter.stakeholderId) {
    // 默认返回最近 7 天所有信号
    const r = await deps.db.query(
      `SELECT s.id::text, s.stakeholder_id::text, s.signal_text, s.source_url,
              s.sentiment, s.captured_at, h.name AS stakeholder_name, h.kind
         FROM ceo_external_signals s
         LEFT JOIN ceo_stakeholders h ON h.id = s.stakeholder_id
        WHERE s.captured_at > NOW() - INTERVAL '7 days'
        ORDER BY s.captured_at DESC
        LIMIT 30`,
    );
    return { items: r.rows };
  }
  const r = await deps.db.query(
    `SELECT id::text, signal_text, source_url, sentiment, captured_at, ref_asset_id
       FROM ceo_external_signals
      WHERE stakeholder_id = $1::uuid
      ORDER BY captured_at DESC
      LIMIT 30`,
    [filter.stakeholderId],
  );
  return { items: r.rows };
}

export async function getRubricMatrix(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  dimensions: string[];
  rows: Array<{ stakeholderName: string; kind: string; scores: Record<string, number>; avg: number }>;
}> {
  const r = await deps.db.query(
    `SELECT h.name AS stakeholder_name, h.kind, rs.dimension, AVG(rs.score)::float AS score
       FROM ceo_rubric_scores rs
       LEFT JOIN ceo_stakeholders h ON h.id = rs.stakeholder_id
      WHERE ($1::uuid IS NULL OR rs.scope_id = $1::uuid)
      GROUP BY h.name, h.kind, rs.dimension
      ORDER BY h.name`,
    [scopeId ?? null],
  );
  const dimSet = new Set<string>();
  const grouped = new Map<string, { kind: string; scores: Record<string, number> }>();
  for (const row of r.rows) {
    const key = String(row.stakeholder_name ?? '匿名');
    dimSet.add(String(row.dimension));
    const cur = grouped.get(key) ?? { kind: String(row.kind ?? 'other'), scores: {} };
    cur.scores[String(row.dimension)] = Number(row.score);
    grouped.set(key, cur);
  }
  const dimensions = Array.from(dimSet);
  const rows = Array.from(grouped.entries()).map(([stakeholderName, v]) => {
    const ss = Object.values(v.scores);
    const avg = ss.length > 0 ? ss.reduce((a, b) => a + b, 0) / ss.length : 0;
    return { stakeholderName, kind: v.kind, scores: v.scores, avg: Number(avg.toFixed(1)) };
  });
  return { dimensions, rows };
}

export async function getSituationDashboard(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  coverage: number;
  coveredKinds: string[];
  missingKinds: string[];
  topHeat: Array<{ name: string; kind: string; heat: number }>;
}> {
  const coverage = await computeCoverage(deps, scopeId);

  const present = await deps.db.query(
    `SELECT DISTINCT kind FROM ceo_stakeholders
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)`,
    [scopeId ?? null],
  );
  const coveredKinds = present.rows.map((r) => String(r.kind));
  const missingKinds = STAKEHOLDER_KINDS.filter((k) => !coveredKinds.includes(k));

  const top = await deps.db.query(
    `SELECT name, kind, heat
       FROM ceo_stakeholders
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
      ORDER BY heat DESC
      LIMIT 5`,
    [scopeId ?? null],
  );

  const missing = missingKinds[0] ?? '';
  return {
    question: '外部世界怎么看我?',
    metric: {
      label: '覆盖度',
      value: `${coveredKinds.length}/${STAKEHOLDER_KINDS.length}`,
      delta: missing ? `缺${missingKindLabel(missing)}` : '齐',
    },
    coverage,
    coveredKinds,
    missingKinds,
    topHeat: top.rows.map((r) => ({
      name: String(r.name),
      kind: String(r.kind),
      heat: Number(r.heat),
    })),
  };
}

function missingKindLabel(k: string): string {
  switch (k) {
    case 'customer': return '客户';
    case 'regulator': return '监管';
    case 'investor': return '投资人';
    case 'press': return '媒体';
    case 'partner': return '合作方';
    case 'employee': return '员工';
    default: return k;
  }
}
