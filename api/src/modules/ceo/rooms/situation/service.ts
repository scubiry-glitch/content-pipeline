// Situation · 各方房间 service
// 利益相关方 / 外部信号 / Rubric 矩阵

import type { CeoEngineDeps } from '../../types.js';
import { computeCoverage, computeHorizon, computeBlindspots, REQUIRED_KINDS } from './aggregator.js';

const STAKEHOLDER_KINDS = ['customer', 'regulator', 'investor', 'press', 'partner', 'employee'] as const;

export async function listStakeholders(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; kind?: string },
): Promise<{ items: any[] }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.scopeId) {
    params.push(filter.scopeId);
    where.push(`h.scope_id = $${params.length}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    where.push(`h.kind = $${params.length}`);
  }
  const r = await deps.db.query(
    `SELECT h.id::text, h.scope_id::text, h.name, h.kind, h.heat,
            h.last_signal_at, h.description, h.escalation_path,
            COUNT(s.id) FILTER (WHERE s.captured_at > NOW() - INTERVAL '30 days')::int AS signals_30d_count,
            (
              SELECT signal_text FROM ceo_external_signals
               WHERE stakeholder_id = h.id
               ORDER BY captured_at DESC LIMIT 1
            ) AS last_signal_summary
       FROM ceo_stakeholders h
       LEFT JOIN ceo_external_signals s ON s.stakeholder_id = h.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY h.id
      ORDER BY h.heat DESC, h.last_signal_at DESC NULLS LAST`,
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
  coverage: { covered: number; total: number; missing: string[]; $kind_required: string[] };
  coveredKinds: string[];
  missingKinds: string[];
  topHeat: Array<{ name: string; kind: string; heat: number }>;
  signalCount: number;
  horizon: { near_7d: number; mid_30d: number; far_90d: number };
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

  // signalCount (近 7 天) + horizon
  let signalCount = 0;
  try {
    const r = await deps.db.query(
      `SELECT COUNT(*)::int AS n FROM ceo_external_signals s
         LEFT JOIN ceo_stakeholders h ON h.id = s.stakeholder_id
        WHERE s.captured_at > NOW() - INTERVAL '7 days'
          AND ($1::uuid IS NULL OR h.scope_id = $1::uuid)`,
      [scopeId ?? null],
    );
    signalCount = Number(r.rows[0]?.n ?? 0);
  } catch { /* ignore */ }
  const horizon = await computeHorizon(deps, scopeId);

  const missing = missingKinds[0] ?? '';
  return {
    question: '外部世界怎么看我?',
    metric: {
      label: '覆盖度',
      value: `${coveredKinds.length}/${STAKEHOLDER_KINDS.length}`,
      delta: missing ? `缺${missingKindLabel(missing)}` : '齐',
    },
    coverage: {
      ...coverage,
      $kind_required: [...REQUIRED_KINDS],
    },
    coveredKinds,
    missingKinds,
    topHeat: top.rows.map((r) => ({
      name: String(r.name),
      kind: String(r.kind),
      heat: Number(r.heat),
    })),
    signalCount,
    horizon,
  };
}

// ─── samples-s 对齐：blindspots / observers / horizon endpoints ─────

export async function listBlindspots(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{ items: any[] }> {
  return computeBlindspots(deps, scopeId);
}

/**
 * GET /situation/observers — 反方观察者
 * 从 ceo_director_concerns (status='pending', raised_count>=2) 抽取，加一条假想 LP 视角
 */
export async function listObservers(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{ items: any[] }> {
  const items: any[] = [];
  try {
    const r = await deps.db.query(
      `SELECT c.id::text, c.topic, c.raised_at,
              d.id::text AS director_id, d.name AS director_name, d.role
         FROM ceo_director_concerns c
         LEFT JOIN ceo_directors d ON d.id = c.director_id
        WHERE c.status = 'pending'
          AND c.raised_count >= 2
          AND ($1::uuid IS NULL OR d.scope_id = $1::uuid)
        ORDER BY c.raised_count DESC, c.raised_at DESC
        LIMIT 4`,
      [scopeId ?? null],
    );
    for (const row of r.rows) {
      items.push({
        id: `obs-${row.director_id ?? row.id}`,
        observer: row.director_name ?? '匿名董事',
        role: row.role ?? '董事',
        rubric_score_given: null,
        captured_at: row.raised_at,
        quote: row.topic,
        reference_assets: [],
        tone: 'warm-critical',
      });
    }
  } catch { /* ignore */ }

  // 假想 LP 视角 (LLM 角色扮演) — 始终添加，不依赖 LLM 可用
  items.push({
    id: 'obs-lp-imagined',
    observer: '假想 LP 视角',
    role: '外脑视角',
    rubric_score_given: null,
    captured_at: new Date().toISOString(),
    quote: '如果我是 LP, 我会问: 你们的尽调 SOP 是什么？对市场判断错过几次，怎么补的？下次见你时能给我一个比这次更安心的故事吗？',
    reference_assets: [],
    tone: 'neutral-investigative',
  });

  return { items };
}

/**
 * GET /situation/horizon?range=near|mid|far — 信号 + concern + brief 时间轴切片
 */
export async function getHorizon(
  deps: CeoEngineDeps,
  range: 'near' | 'mid' | 'far',
  scopeId?: string,
): Promise<{
  $range: string;
  events: Array<{ date: string; kind: string; title: string }>;
}> {
  const days = range === 'near' ? 7 : range === 'mid' ? 30 : 90;
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + days);
  const events: Array<{ date: string; kind: string; title: string }> = [];

  try {
    const r = await deps.db.query(
      `SELECT s.captured_at AS at, s.signal_text AS title, s.sentiment, h.kind AS k
         FROM ceo_external_signals s
         LEFT JOIN ceo_stakeholders h ON h.id = s.stakeholder_id
        WHERE s.captured_at >= NOW() - INTERVAL '${days} days'
          AND ($1::uuid IS NULL OR h.scope_id = $1::uuid)
        ORDER BY s.captured_at
        LIMIT 30`,
      [scopeId ?? null],
    );
    for (const row of r.rows) {
      const sent = Number(row.sentiment ?? 0);
      events.push({
        date: row.at ? String(row.at).slice(0, 10) : '',
        kind: sent < -0.3 ? 'neg' : sent > 0.3 ? 'pos' : 'info',
        title: String(row.title ?? '').slice(0, 200),
      });
    }
  } catch { /* ignore */ }

  return {
    $range: `${now.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)}`,
    events,
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
