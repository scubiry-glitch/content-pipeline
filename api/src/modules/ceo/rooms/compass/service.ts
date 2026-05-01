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
  driftAlerts: Array<{ name: string; delta: string; text: string; severity: 'danger' | 'warn' | 'info' }>;
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
  const driftAlerts = driftRows.rows.map((r) => {
    const score = r.alignment_score == null ? null : Number(r.alignment_score);
    let severity: 'danger' | 'warn' | 'info' = 'info';
    if (score == null) severity = 'info';
    else if (score < 0.35) severity = 'danger';
    else if (score < 0.55) severity = 'warn';
    return {
      name: r.name,
      delta: score == null ? '⊘' : `${(score * 100).toFixed(0)}%`,
      text: '偏离主线',
      severity,
    };
  });

  const alignmentScore = await computeAlignmentScore(deps, scopeId);

  // 上周 alignment 对比 — 用于 metric.delta
  let deltaLabel = '本周';
  try {
    const r = await deps.db.query(
      `SELECT alignment FROM ceo_prisms
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND week_start = (DATE_TRUNC('week', NOW())::date - INTERVAL '7 days')::date
        ORDER BY computed_at DESC LIMIT 1`,
      [scopeId ?? null],
    );
    const prev = r.rows[0]?.alignment;
    if (prev != null) {
      const d = alignmentScore - Number(prev);
      if (Math.abs(d) >= 0.005) deltaLabel = `${d > 0 ? '+' : ''}${d.toFixed(2)}`;
      else deltaLabel = '→';
    }
  } catch {
    /* 无历史 — 保持 '本周' */
  }

  return {
    question: '我把时间花在战略主线上了吗?',
    metric: {
      label: '战略对齐度',
      value: alignmentScore.toFixed(2),
      delta: deltaLabel,
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

// ─── 新增 5 个 endpoint (R3 / samples-s 对齐) ───────────────────────

/**
 * GET /compass/astrolabe — 战略星盘
 * 北极星居中 (alignment 当前) + 6 颗轨道恒星 (战略线)。
 * 同 kind 星均分扇区，按建立时间排序确定角度位置。
 */
export async function getAstrolabe(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  polaris: { label: string; alignment: number; cx: number; cy: number; r: number };
  stars: Array<{
    id: string;
    name: string;
    kind: 'main' | 'branch' | 'drift';
    alignment_score: number | null;
    cx: number;
    cy: number;
    r: number;
    orbit: string;
    fate_summary: string;
    scope_id: string | null;
  }>;
}> {
  const alignment = await computeAlignmentScore(deps, scopeId);
  const r = await deps.db.query(
    `SELECT id::text, name, kind, alignment_score, scope_id::text, status, established_at
       FROM ceo_strategic_lines
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND status = 'active'
      ORDER BY kind, established_at`,
    [scopeId ?? null],
  );

  const CENTER = { cx: 300, cy: 200 };
  const ORBIT_RADIUS: Record<string, number> = { main: 90, branch: 165, drift: 230 };
  const ORBIT_LABEL: Record<string, string> = { main: '中环', branch: '中外环', drift: '外环' };
  const STAR_R: Record<string, number> = { main: 22, branch: 18, drift: 14 };

  // 按 kind 分组、组内按 established_at 顺序均分 90° 扇区
  const grouped = new Map<string, Array<{ row: any; idx: number; total: number }>>();
  for (const kind of ['main', 'branch', 'drift']) {
    const sub = r.rows.filter((x) => x.kind === kind);
    grouped.set(
      kind,
      sub.map((row, idx) => ({ row, idx, total: sub.length })),
    );
  }

  const stars: Array<any> = [];
  for (const kind of ['main', 'branch', 'drift'] as const) {
    const group = grouped.get(kind) ?? [];
    const radius = ORBIT_RADIUS[kind];
    for (const { row, idx, total } of group) {
      // 同 kind 内均分 [-π/2, +π/2] 扇区，main 偏上、branch 偏下、drift 顶部
      const range = Math.PI * 0.5;
      const offset =
        kind === 'main' ? -range / 2 : kind === 'branch' ? Math.PI - range / 2 : -Math.PI / 2 - range / 2;
      const theta = total > 1 ? offset + (idx / (total - 1)) * range : offset;
      const cx = Number((CENTER.cx + radius * Math.cos(theta)).toFixed(0));
      const cy = Number((CENTER.cy + radius * Math.sin(theta)).toFixed(0));
      const score = row.alignment_score == null ? null : Number(row.alignment_score);
      let fateIcon = '✅';
      if (kind === 'drift') fateIcon = '🔴';
      else if (score != null && score < 0.65) fateIcon = '⚠';
      stars.push({
        id: String(row.id),
        name: String(row.name),
        kind,
        alignment_score: score,
        cx,
        cy,
        r: STAR_R[kind],
        orbit: ORBIT_LABEL[kind],
        fate_summary: `${fateIcon} ${kind === 'main' ? '主线在轨' : kind === 'branch' ? '支线观察' : '漂移'}`,
        scope_id: row.scope_id ?? null,
      });
    }
  }

  return {
    polaris: {
      label: '北极星',
      alignment: Number(alignment.toFixed(2)),
      cx: CENTER.cx,
      cy: CENTER.cy,
      r: 32,
    },
    stars,
  };
}

/**
 * GET /compass/time-pie — 时间饼
 * 三段 (main/branch/firefighting) + 上周对比。
 */
export async function getTimePie(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  weekStart: string;
  totalHours: number;
  segments: Array<{ kind: string; label: string; hours: number; pct: number; color: string }>;
  verdict: string;
  trend: { mainPct_lastWeek: number | null; firefightPct_lastWeek: number | null };
}> {
  const weekStart = new Date();
  const dow = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dow);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const cur = await deps.db.query(
    `SELECT kind, COALESCE(SUM(hours), 0)::numeric AS h
       FROM ceo_attention_alloc
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND week_start = (DATE_TRUNC('week', NOW())::date)
      GROUP BY kind`,
    [scopeId ?? null],
  );
  const buckets = { main: 0, branch: 0, firefighting: 0 };
  for (const row of cur.rows) {
    if (row.kind in buckets) (buckets as any)[row.kind] = Number(row.h);
  }
  const totalHours = buckets.main + buckets.branch + buckets.firefighting;
  const pct = (h: number) => (totalHours > 0 ? Number((h / totalHours).toFixed(2)) : 0);

  const segments = [
    { kind: 'main', label: '战略主线', hours: buckets.main, pct: pct(buckets.main), color: '#7BA7C4' },
    { kind: 'branch', label: '支线', hours: buckets.branch, pct: pct(buckets.branch), color: '#C8A15C' },
    { kind: 'firefighting', label: '救火', hours: buckets.firefighting, pct: pct(buckets.firefighting), color: '#D85A5A' },
  ];

  // 上周对比
  let mainPct_lastWeek: number | null = null;
  let firefightPct_lastWeek: number | null = null;
  try {
    const prev = await deps.db.query(
      `SELECT kind, COALESCE(SUM(hours), 0)::numeric AS h
         FROM ceo_attention_alloc
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND week_start = (DATE_TRUNC('week', NOW())::date - INTERVAL '7 days')::date
        GROUP BY kind`,
      [scopeId ?? null],
    );
    const pb = { main: 0, branch: 0, firefighting: 0 };
    for (const row of prev.rows) if (row.kind in pb) (pb as any)[row.kind] = Number(row.h);
    const ptotal = pb.main + pb.branch + pb.firefighting;
    if (ptotal > 0) {
      mainPct_lastWeek = Number((pb.main / ptotal).toFixed(2));
      firefightPct_lastWeek = Number((pb.firefighting / ptotal).toFixed(2));
    }
  } catch {
    /* ignore */
  }

  const mainPct = pct(buckets.main);
  const firePct = pct(buckets.firefighting);
  let verdict = `${Math.round(mainPct * 100)}% 主线 (目标 50–60%) · ${Math.round(firePct * 100)}% 救火`;
  if (firePct >= 0.2) verdict += ' · 警告突破 20%';
  else if (firefightPct_lastWeek != null && firePct - firefightPct_lastWeek >= 0.05) verdict += ' · 救火占比上升';

  return {
    weekStart: weekStartStr,
    totalHours,
    segments,
    verdict,
    trend: { mainPct_lastWeek, firefightPct_lastWeek },
  };
}

/**
 * GET /compass/drift-radar — 漂移雷达
 * 列出 kind='drift' 的战略线 + 注意力被瓜分明细。
 */
export async function getDriftRadar(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  items: Array<{
    name: string;
    drift_pct: number;
    weeks_off_ic: number;
    text: string;
    severity: 'danger' | 'warn' | 'info';
    trend: 'up' | 'flat' | 'down';
    delta: string;
  }>;
  attention_eaten: Record<string, number>;
}> {
  const r = await deps.db.query(
    `SELECT name, alignment_score, description,
            EXTRACT(WEEK FROM (NOW() - established_at))::int AS weeks
       FROM ceo_strategic_lines
      WHERE kind = 'drift'
        AND status = 'active'
        AND ($1::uuid IS NULL OR scope_id = $1::uuid)
      ORDER BY alignment_score ASC NULLS FIRST
      LIMIT 8`,
    [scopeId ?? null],
  );
  const items = r.rows.map((row) => {
    const score = row.alignment_score == null ? 0 : Number(row.alignment_score);
    let severity: 'danger' | 'warn' | 'info' = 'info';
    if (score < 0.35) severity = 'danger';
    else if (score < 0.55) severity = 'warn';
    return {
      name: String(row.name),
      drift_pct: Number(score.toFixed(2)),
      weeks_off_ic: Number(row.weeks ?? 0),
      text: row.description ?? '偏离主线',
      severity,
      trend: 'up' as const,
      delta: '—',
    };
  });

  // attention_eaten = 救火条目按战略线归因 (从 metadata 取，兜底空)
  const attention_eaten: Record<string, number> = {};
  try {
    const a = await deps.db.query(
      `SELECT s.name, COALESCE(SUM(aa.hours), 0)::numeric AS h
         FROM ceo_attention_alloc aa
         LEFT JOIN ceo_strategic_lines s ON s.scope_id = aa.scope_id
        WHERE aa.kind = 'firefighting'
          AND s.kind = 'drift'
          AND aa.week_start = (DATE_TRUNC('week', NOW())::date)
        GROUP BY s.name`,
    );
    for (const row of a.rows) if (row.name) attention_eaten[String(row.name)] = Number(row.h);
  } catch {
    /* ignore */
  }

  return { items, attention_eaten };
}

/**
 * GET /compass/one-pager — 拉 ceo_briefs 最新一份 + 字段重整
 */
export async function getOnePager(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  id: string;
  scope_id: string | null;
  weekStart: string | null;
  title: string;
  subtitle: string;
  metrics: {
    alignmentScore: number;
    alignmentDelta: string | null;
    mainSharePct: number;
    firefightSharePct: number;
    firefightDeltaPct: string | null;
    warningThresholdPct: number;
  };
  body_md: string | null;
  sources_footer: string;
  exportable: boolean;
  generated_at: string | null;
  version: number;
} | null> {
  const r = await deps.db.query(
    `SELECT id::text, scope_id::text, board_session, version, toc, body_md,
            page_count, status, generated_at, updated_at
       FROM ceo_briefs
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND status IN ('sent','draft')
      ORDER BY status = 'sent' DESC, version DESC, updated_at DESC
      LIMIT 1`,
    [scopeId ?? null],
  );
  const row = r.rows[0];
  if (!row) return null;

  const alignmentScore = await computeAlignmentScore(deps, scopeId);
  const pie = await getTimePie(deps, scopeId);
  const mainSeg = pie.segments.find((s) => s.kind === 'main');
  const fireSeg = pie.segments.find((s) => s.kind === 'firefighting');
  const mainSharePct = mainSeg?.pct ?? 0;
  const firefightSharePct = fireSeg?.pct ?? 0;

  let alignmentDelta: string | null = null;
  let firefightDeltaPct: string | null = null;
  try {
    const prev = await deps.db.query(
      `SELECT alignment FROM ceo_prisms
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND week_start = (DATE_TRUNC('week', NOW())::date - INTERVAL '7 days')::date
        ORDER BY computed_at DESC LIMIT 1`,
      [scopeId ?? null],
    );
    const p = prev.rows[0]?.alignment;
    if (p != null) {
      const d = alignmentScore - Number(p);
      alignmentDelta = `${d > 0 ? '+' : ''}${d.toFixed(2)}`;
    }
  } catch { /* ignore */ }
  if (pie.trend.firefightPct_lastWeek != null) {
    const d = firefightSharePct - pie.trend.firefightPct_lastWeek;
    firefightDeltaPct = `${d > 0 ? '+' : ''}${(d * 100).toFixed(0)}%`;
  }

  // 数据源 footer
  let meetingCount = 0;
  try {
    const m = await deps.db.query(
      `SELECT COUNT(*)::int AS n FROM mn_meetings WHERE meeting_at > NOW() - INTERVAL '7 days'`,
    );
    meetingCount = Number(m.rows[0]?.n ?? 0);
  } catch { /* ignore */ }

  return {
    id: row.id,
    scope_id: row.scope_id,
    weekStart: row.generated_at ? String(row.generated_at).slice(0, 10) : null,
    title: `${row.board_session ?? '本周战略快照'} · 一页纸 · v${row.version}`,
    subtitle: `${(row.generated_at ?? row.updated_at)?.toString().slice(0, 10) ?? ''} · 自动汇编自 ${meetingCount} 场会议`,
    metrics: {
      alignmentScore: Number(alignmentScore.toFixed(2)),
      alignmentDelta,
      mainSharePct,
      firefightSharePct,
      firefightDeltaPct,
      warningThresholdPct: 0.2,
    },
    body_md: row.body_md ?? null,
    sources_footer: `SOURCES · ${meetingCount} meetings · ${Number(row.page_count ?? 0)} readings`,
    exportable: true,
    generated_at: row.generated_at ? String(row.generated_at) : null,
    version: Number(row.version ?? 1),
  };
}

/**
 * GET /compass/archives?tab=main|drift
 * Tab1 = 全部 strategic_lines + related_count；Tab2 = 漂移事件时间线 (来源 ceo_strategic_echos refute)
 */
export async function getArchives(
  deps: CeoEngineDeps,
  tab: 'main' | 'drift',
  scopeId?: string,
): Promise<{ items: any[] }> {
  if (tab === 'drift') {
    const r = await deps.db.query(
      `SELECT e.id::text, e.fact_text AS name, e.fate, e.updated_at,
              l.name AS line_name, l.kind, l.alignment_score
         FROM ceo_strategic_echos e
         LEFT JOIN ceo_strategic_lines l ON l.id = e.line_id
        WHERE e.fate = 'refute'
          AND ($1::uuid IS NULL OR l.scope_id = $1::uuid)
        ORDER BY e.updated_at DESC
        LIMIT 30`,
      [scopeId ?? null],
    );
    return {
      items: r.rows.map((row) => ({
        date: row.updated_at ? String(row.updated_at).slice(0, 10) : null,
        name: row.name,
        line_name: row.line_name,
        status: '已记录 · 反方回响',
        severity: row.alignment_score != null && Number(row.alignment_score) < 0.35 ? 'crimson' : 'gold',
      })),
    };
  }

  const r = await deps.db.query(
    `SELECT id::text, name, kind, alignment_score, status, description,
            established_at::text AS established_at
       FROM ceo_strategic_lines
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
      ORDER BY kind, established_at`,
    [scopeId ?? null],
  );
  return {
    items: r.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: String(row.kind),
      established_at: row.established_at ? row.established_at.slice(0, 10) : null,
      alignment_score: row.alignment_score == null ? null : Number(row.alignment_score),
      status: String(row.status),
      brief: row.description ?? '',
      related_count: 0,
    })),
  };
}

// ─── 写入端点 (Phase 1 输入接入层) ──────────────────────────

const STRATEGIC_KINDS = ['main', 'branch', 'drift'];
const STRATEGIC_STATUSES = ['active', 'paused', 'retired'];

export async function createStrategicLine(
  deps: CeoEngineDeps,
  body: {
    name?: string;
    kind?: string;
    description?: string | null;
    scopeId?: string | null;
    alignmentScore?: number | null;
    status?: string;
    metadata?: Record<string, any>;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!body.name) return { ok: false, error: 'name required' };
  if (!body.kind || !STRATEGIC_KINDS.includes(body.kind)) {
    return { ok: false, error: 'kind must be main|branch|drift' };
  }
  if (body.status && !STRATEGIC_STATUSES.includes(body.status)) {
    return { ok: false, error: 'status must be active|paused|retired' };
  }
  const score = body.alignmentScore != null ? Math.max(0, Math.min(1, body.alignmentScore)) : null;
  const r = await deps.db.query(
    `INSERT INTO ceo_strategic_lines
       (scope_id, name, kind, alignment_score, status, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text`,
    [
      body.scopeId ?? null,
      body.name,
      body.kind,
      score,
      body.status ?? 'active',
      body.description ?? null,
      body.metadata ?? {},
    ],
  );
  return { ok: true, id: r.rows[0].id };
}

export async function updateStrategicLine(
  deps: CeoEngineDeps,
  id: string,
  body: {
    name?: string;
    kind?: string;
    description?: string | null;
    alignmentScore?: number | null;
    status?: string;
    metadata?: Record<string, any>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const sets: string[] = [];
  const params: any[] = [];
  if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${params.length}`); }
  if (body.kind !== undefined) {
    if (!STRATEGIC_KINDS.includes(body.kind)) return { ok: false, error: 'invalid kind' };
    params.push(body.kind); sets.push(`kind = $${params.length}`);
  }
  if (body.description !== undefined) { params.push(body.description); sets.push(`description = $${params.length}`); }
  if (body.alignmentScore !== undefined) {
    const score = body.alignmentScore != null ? Math.max(0, Math.min(1, body.alignmentScore)) : null;
    params.push(score); sets.push(`alignment_score = $${params.length}`);
  }
  if (body.status !== undefined) {
    if (!STRATEGIC_STATUSES.includes(body.status)) return { ok: false, error: 'invalid status' };
    params.push(body.status); sets.push(`status = $${params.length}`);
  }
  if (body.metadata !== undefined) { params.push(body.metadata); sets.push(`metadata = $${params.length}`); }
  if (sets.length === 0) return { ok: false, error: 'no fields to update' };
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const r = await deps.db.query(
    `UPDATE ceo_strategic_lines SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id::text`,
    params,
  );
  if (r.rows.length === 0) return { ok: false, error: 'not found' };
  return { ok: true };
}

export async function deleteStrategicLine(
  deps: CeoEngineDeps,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await deps.db.query(
    `DELETE FROM ceo_strategic_lines WHERE id = $1 RETURNING id::text`,
    [id],
  );
  if (r.rows.length === 0) return { ok: false, error: 'not found' };
  return { ok: true };
}
