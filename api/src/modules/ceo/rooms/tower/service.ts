// Tower · 协调房间 service
// 主要复用 mn_commitments，CEO 视角聚合：谁欠谁/卡点/节奏脉搏/精力透支

import type { CeoEngineDeps } from '../../types.js';
import { computeResponsibilityClarity } from './aggregator.js';

/**
 * 列承诺 — 优先 mn_commitments + JOIN mn_people / assets；表不存在则空
 *
 * mn_commitments schema (002-people-axis.sql):
 *   id, meeting_id, person_id (owner), text, due_at, state, progress, ...
 * 没有 beneficiary 字段；样例的 beneficiary_* 退化为 null。
 * meeting title 从 assets (asset_type='meeting_minutes') 取。
 */
export async function listCommitmentsByStatus(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; status?: string },
): Promise<{ items: any[]; source: 'mn' | 'empty' }> {
  try {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.status) {
      // 样例 status="in_progress" → mn 用 ('on_track','at_risk')
      const stateMap: Record<string, string[]> = {
        in_progress: ['on_track', 'at_risk'],
        done: ['done'],
        overdue: ['slipped'],
      };
      const states = stateMap[filter.status] ?? [filter.status];
      params.push(states);
      where.push(`c.state = ANY($${params.length}::text[])`);
    }
    const r = await deps.db.query(
      `SELECT c.id::text, c.meeting_id::text AS source_meeting_id,
              c.text AS what, c.due_at, c.state, c.created_at,
              p.id::text AS owner_personId,
              p.canonical_name AS owner_name,
              p.role AS owner_personRole,
              a.title AS source_meeting_title,
              EXTRACT(DAY FROM (NOW() - c.due_at))::int AS days_overdue_raw
         FROM mn_commitments c
         LEFT JOIN mn_people p ON p.id = c.person_id
         LEFT JOIN assets a ON a.id = c.meeting_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY c.due_at NULLS LAST, c.created_at DESC
        LIMIT 100`,
      params,
    );
    const items = r.rows.map((row) => ({
      id: row.id,
      owner_name: row.owner_name,
      owner_personId: row.owner_personid ?? row.owner_personId ?? null,
      owner_personRole: row.owner_personrole ?? row.owner_personRole ?? null,
      beneficiary_name: null,
      beneficiary_personId: null,
      beneficiary_personRole: null,
      what: row.what,
      due_at: row.due_at,
      days_overdue: Math.max(0, Number(row.days_overdue_raw ?? 0)),
      status: row.state,
      source_meeting_id: row.source_meeting_id,
      source_meeting_title: row.source_meeting_title ?? null,
    }));
    return { items, source: 'mn' };
  } catch {
    return { items: [], source: 'empty' };
  }
}

export async function listBlockers(
  deps: CeoEngineDeps,
  _scopeId?: string,
): Promise<{
  items: Array<{ name: string; days: number; text: string; warn: boolean; ownerPersonId: string | null }>;
}> {
  // 卡点定义：超过 14 天未更新的 in_progress (mn 用 state='on_track'/'at_risk') 承诺
  try {
    const r = await deps.db.query(
      `SELECT c.text AS what, c.person_id::text AS owner_person_id,
              p.canonical_name AS owner_name,
              c.due_at, c.created_at,
              EXTRACT(DAY FROM (NOW() - COALESCE(c.due_at, c.created_at)))::int AS days_late
         FROM mn_commitments c
         LEFT JOIN mn_people p ON p.id = c.person_id
        WHERE c.state IN ('on_track','at_risk')
          AND COALESCE(c.due_at, c.created_at) < NOW() - INTERVAL '14 days'
        ORDER BY days_late DESC NULLS LAST
        LIMIT 8`,
    );
    return {
      items: r.rows.map((row) => ({
        name: row.what,
        days: Number(row.days_late ?? 0),
        text: `${row.owner_name ?? '?'} → ?`,
        warn: Number(row.days_late ?? 0) >= 28,
        ownerPersonId: row.owner_person_id ?? null,
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
  topBlockers: Array<{ name: string; days: number; text: string; warn: boolean; ownerPersonId: string | null }>;
}> {
  const responsibilityClarity = await computeResponsibilityClarity(deps, scopeId);
  const blockers = await listBlockers(deps, scopeId);

  let stats = { proposed: 0, in_progress: 0, overdue: 0, done: 0, total: 0 };
  try {
    const r = await deps.db.query(
      `SELECT state, COUNT(*)::int AS n,
              SUM(CASE WHEN state IN ('on_track','at_risk') AND due_at < NOW() THEN 1 ELSE 0 END)::int AS overdue_n
         FROM mn_commitments
        GROUP BY state`,
    );
    for (const row of r.rows) {
      const s = row.state as string;
      const n = Number(row.n);
      // mn_commitments.state ∈ {on_track, at_risk, done, slipped}
      // 映射到样例 5 类: proposed (新提) / in_progress / overdue / done
      if (s === 'on_track' || s === 'at_risk') stats.in_progress += n;
      else if (s === 'done') stats.done += n;
      else if (s === 'slipped') stats.overdue += n;
      stats.total += n;
      // overdue_n 是 due 已过但仍 in_progress 的数量
      if (s === 'on_track' || s === 'at_risk') stats.overdue += Number(row.overdue_n ?? 0);
    }
    // proposed: 没有 due_at 的承诺视为新提
    try {
      const p = await deps.db.query(
        `SELECT COUNT(*)::int AS n FROM mn_commitments
          WHERE state IN ('on_track','at_risk') AND due_at IS NULL`,
      );
      stats.proposed = Number(p.rows[0]?.n ?? 0);
    } catch { /* ignore */ }
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

// ─── samples-s 对齐：post-meeting + deficit ──────────────────────

/**
 * GET /tower/post-meeting — 上次会议未关闭的判断 (mn_judgments) 列表
 */
export async function getPostMeeting(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  last_meeting: { id: string; title: string; date: string; duration_min: number | null } | null;
  unresolved_items: Array<{
    id: string;
    what: string;
    raised_by: string | null;
    owner_name: string | null;
    owner_personId: string | null;
    since_days: number;
  }>;
}> {
  let last: any = null;
  try {
    const m = await deps.db.query(
      `SELECT m.id::text, m.title, m.meeting_at::text AS date, m.duration_minutes
         FROM mn_meetings m
        WHERE ($1::uuid IS NULL OR m.scope_id = $1::uuid)
        ORDER BY m.meeting_at DESC
        LIMIT 1`,
      [scopeId ?? null],
    );
    if (m.rows[0]) {
      last = {
        id: String(m.rows[0].id),
        title: String(m.rows[0].title ?? '未命名'),
        date: m.rows[0].date ? String(m.rows[0].date).slice(0, 10) : '',
        duration_min: m.rows[0].duration_minutes != null ? Number(m.rows[0].duration_minutes) : null,
      };
    }
  } catch { /* ignore */ }

  const unresolved: Array<any> = [];
  if (last) {
    try {
      // 取该会议未解决的 mn_open_questions / mn_judgments 作 unresolved
      const r = await deps.db.query(
        `SELECT j.id::text, j.text AS what, j.kind,
                p.canonical_name AS raised_by_name,
                EXTRACT(DAY FROM (NOW() - j.created_at))::int AS days
           FROM mn_judgments j
           LEFT JOIN mn_people p ON p.id = j.person_id
          WHERE j.meeting_id = $1::uuid
          ORDER BY j.created_at DESC
          LIMIT 5`,
        [last.id],
      );
      for (const row of r.rows) {
        unresolved.push({
          id: String(row.id),
          what: String(row.what ?? ''),
          raised_by: row.raised_by_name ?? null,
          owner_name: null,
          owner_personId: null,
          since_days: Number(row.days ?? 0),
        });
      }
    } catch { /* ignore */ }
  }

  return { last_meeting: last, unresolved_items: unresolved };
}

/**
 * GET /tower/deficit?userId=system — 个人精力 gauge
 */
export async function getDeficit(
  deps: CeoEngineDeps,
  filter: { userId?: string },
): Promise<{
  weekStart: string;
  energyGauge: { value: number; label: string; color: string };
  metrics: Array<{ key: string; actual: number; budget: number; unit: string; status: string; delta: string }>;
}> {
  const userId = filter.userId ?? 'system';
  const r = await deps.db.query(
    `SELECT week_start, total_hours, deep_focus_hours, meeting_hours, target_focus_hours
       FROM ceo_time_roi
      WHERE user_id = $1
      ORDER BY week_start DESC
      LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  const weekStart = row?.week_start ? String(row.week_start).slice(0, 10) : new Date().toISOString().slice(0, 10);

  const total = Number(row?.total_hours ?? 0);
  const deep = Number(row?.deep_focus_hours ?? 0);
  const target = Number(row?.target_focus_hours ?? 18);
  const meetings = Number(row?.meeting_hours ?? 0);
  const budget_total = 50;

  // 综合精力 0..1: 深度专注达成度 0.5 + (1 - 工时超支比) 0.3 + (1 - 会议占比) 0.2
  const focusRatio = target > 0 ? Math.min(1, deep / target) : 0;
  const overworkPenalty = total > 0 ? Math.max(0, 1 - Math.max(0, total - budget_total) / budget_total) : 1;
  const meetingPenalty = total > 0 ? Math.max(0, 1 - meetings / total) : 1;
  const energy = Number((focusRatio * 0.5 + overworkPenalty * 0.3 + meetingPenalty * 0.2).toFixed(2));

  let label = '精力健康';
  let color = '#7FD6A0';
  if (energy < 0.45) { label = '精力赤字'; color = '#C46A50'; }
  else if (energy < 0.65) { label = '需要恢复'; color = '#C8A15C'; }

  const status = (actual: number, budget: number, higherBetter: boolean): string => {
    if (higherBetter) return actual >= budget ? 'ok' : 'under_budget';
    return actual <= budget ? 'ok' : 'over_budget';
  };
  const fmtDelta = (a: number, b: number, unit: string) => {
    const d = a - b;
    return `${d > 0 ? '+' : ''}${d.toFixed(d % 1 === 0 ? 0 : 1)}${unit}`;
  };

  return {
    weekStart,
    energyGauge: { value: energy, label, color },
    metrics: [
      {
        key: '本周工时',
        actual: total,
        budget: budget_total,
        unit: 'h',
        status: status(total, budget_total, false),
        delta: fmtDelta(total, budget_total, 'h'),
      },
      {
        key: '深度专注',
        actual: deep,
        budget: target,
        unit: 'h',
        status: status(deep, target, true),
        delta: fmtDelta(deep, target, 'h'),
      },
      {
        key: '会议消耗',
        actual: meetings,
        budget: 24,
        unit: 'h',
        status: status(meetings, 24, false),
        delta: fmtDelta(meetings, 24, 'h'),
      },
    ],
  };
}

// ─── 写入端点 (Phase 1 输入接入层) ──────────────────────────

const ATTENTION_KINDS = ['main', 'branch', 'firefighting'];

function isoWeekStart(input?: string): string {
  const d = input ? new Date(input) : new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Mon
  const m = new Date(d);
  m.setDate(d.getDate() - dow);
  return m.toISOString().slice(0, 10);
}

export async function upsertAttentionAlloc(
  deps: CeoEngineDeps,
  body: {
    weekStart?: string;
    kind?: string;
    hours?: number;
    userId?: string | null;
    scopeId?: string | null;
    projectId?: string | null;
    source?: string;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!body.kind || !ATTENTION_KINDS.includes(body.kind)) {
    return { ok: false, error: 'kind must be main|branch|firefighting' };
  }
  if (typeof body.hours !== 'number' || body.hours < 0) {
    return { ok: false, error: 'hours must be a non-negative number' };
  }
  const weekStart = isoWeekStart(body.weekStart);
  // 同一 (week, scope|user|project, kind) 视为同一行 → 先删后插实现 upsert
  // (表无 UNIQUE 约束，避免误判 NULL，因此手动按业务键去重)
  await deps.db.query(
    `DELETE FROM ceo_attention_alloc
      WHERE week_start = $1
        AND kind = $2
        AND COALESCE(scope_id::text,'') = COALESCE($3::text,'')
        AND COALESCE(user_id,'') = COALESCE($4,'')
        AND COALESCE(project_id::text,'') = COALESCE($5::text,'')`,
    [weekStart, body.kind, body.scopeId ?? null, body.userId ?? null, body.projectId ?? null],
  );
  const r = await deps.db.query(
    `INSERT INTO ceo_attention_alloc (week_start, kind, hours, scope_id, user_id, project_id, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text`,
    [
      weekStart,
      body.kind,
      body.hours,
      body.scopeId ?? null,
      body.userId ?? null,
      body.projectId ?? null,
      body.source ?? 'manual',
    ],
  );
  return { ok: true, id: r.rows[0].id };
}
