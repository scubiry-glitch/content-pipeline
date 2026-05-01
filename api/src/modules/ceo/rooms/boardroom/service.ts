// Boardroom · 董事会房间 service
// 关切雷达 / 预读包 / 承诺追踪 / 反方演练 读取 + 聚合
//
// scope 多选: 所有 list 函数接受 scopeIds: string[] (可选)
//   undefined / [] → 不过滤
//   非空 → SQL `WHERE scope_id = ANY($1::uuid[])`
//
// 承诺源 union (R2-1 B):
//   listPromises 同时拉 ceo_board_promises (CEO 自填) + mn_commitments (来自人物轴)
//   返回 source 字段区分

import type { CeoEngineDeps } from '../../types.js';
import { computeForwardPct } from './aggregator.js';

interface ScopeFilter {
  scopeIds?: string[];
}

function scopeIdsParam(ids?: string[]): string[] | null {
  return ids && ids.length > 0 ? ids : null;
}

export async function listDirectors(
  deps: CeoEngineDeps,
  filter: ScopeFilter,
): Promise<{ items: any[] }> {
  const ids = scopeIdsParam(filter.scopeIds);
  // 编辑入口在 meeting-notes 人轴 → 人物管理 (写 ceo_person_agent_links)
  // 这里只是只读 LEFT JOIN，无绑定时 expert_binding=null
  let rows: any[] = [];
  try {
    const r = await deps.db.query(
      `SELECT d.id::text, d.name, d.role, d.weight, d.scope_id::text,
              l.expert_id, ep.name AS expert_name
         FROM ceo_directors d
         LEFT JOIN ceo_person_agent_links l ON l.person_id = d.id
         LEFT JOIN expert_profiles ep ON ep.expert_id = l.expert_id
        WHERE ($1::uuid[] IS NULL OR d.scope_id = ANY($1::uuid[]))
        ORDER BY d.weight DESC, d.name`,
      [ids],
    );
    rows = r.rows;
  } catch {
    // expert_profiles 可能不存在 (expert-library 未启用) — 退化为不带 expert_binding
    const r = await deps.db.query(
      `SELECT d.id::text, d.name, d.role, d.weight, d.scope_id::text,
              l.expert_id, NULL::text AS expert_name
         FROM ceo_directors d
         LEFT JOIN ceo_person_agent_links l ON l.person_id = d.id
        WHERE ($1::uuid[] IS NULL OR d.scope_id = ANY($1::uuid[]))
        ORDER BY d.weight DESC, d.name`,
      [ids],
    ).catch(() => ({ rows: [] as any[] }));
    rows = r.rows;
  }
  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    weight: row.weight,
    scope_id: row.scope_id,
    personId: row.id,
    expert_binding: row.expert_id ? { expert_id: row.expert_id, name: row.expert_name ?? row.expert_id } : null,
  }));
  return { items };
}

export async function listConcerns(
  deps: CeoEngineDeps,
  filter: { directorId?: string; status?: string; scopeIds?: string[] },
): Promise<{ items: any[] }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.directorId) {
    params.push(filter.directorId);
    where.push(`c.director_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`c.status = $${params.length}`);
  }
  const ids = scopeIdsParam(filter.scopeIds);
  if (ids) {
    params.push(ids);
    where.push(`d.scope_id = ANY($${params.length}::uuid[])`);
  }
  const r = await deps.db.query(
    `SELECT c.id::text, c.director_id::text, c.topic, c.status,
            c.raised_count, c.raised_at, c.source_meeting_id::text,
            c.resolution, c.resolved_at,
            d.name AS director_name, d.role AS director_role
       FROM ceo_director_concerns c
       LEFT JOIN ceo_directors d ON d.id = c.director_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY c.raised_at DESC
       LIMIT 50`,
    params,
  );
  return { items: r.rows };
}

export async function listBriefs(
  deps: CeoEngineDeps,
  filter: { scopeIds?: string[]; session?: string },
): Promise<{ items: any[] }> {
  const where: string[] = [];
  const params: any[] = [];
  const ids = scopeIdsParam(filter.scopeIds);
  if (ids) {
    params.push(ids);
    where.push(`scope_id = ANY($${params.length}::uuid[])`);
  }
  if (filter.session) {
    params.push(filter.session);
    where.push(`board_session = $${params.length}`);
  }
  const r = await deps.db.query(
    `SELECT id::text, scope_id::text, board_session, version, toc, page_count,
            status, generated_run_id, generated_at, read_at, updated_at
       FROM ceo_briefs
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY updated_at DESC
      LIMIT 30`,
    params,
  );
  return { items: r.rows };
}

/**
 * 承诺 union: ceo_board_promises (CEO 自填) + mn_commitments (人物轴抽取)
 * - briefId 给定 → 优先 ceo 源
 * - briefId 不给 → 默认拉 mn_commitments union ceo_board_promises (按 scope/scopeIds 过滤)
 * 每行加 source: 'mn' | 'ceo'，前端区分配色
 */
export async function listPromises(
  deps: CeoEngineDeps,
  filter: { briefId?: string; scopeIds?: string[] },
): Promise<{ items: any[] }> {
  const ids = scopeIdsParam(filter.scopeIds);

  if (filter.briefId) {
    // 单 brief 模式：只看 ceo 源
    const r = await deps.db.query(
      `SELECT id::text, brief_id::text, what, owner, due_at, status,
              source_decision_id, 'ceo' AS source, NULL::text AS person_id, NULL::text AS person_role
         FROM ceo_board_promises
        WHERE brief_id = $1::uuid
        ORDER BY status, due_at NULLS LAST`,
      [filter.briefId],
    );
    return { items: r.rows };
  }

  // 全局模式: union mn_commitments + ceo_board_promises
  const items: any[] = [];

  // mn 源
  try {
    const mn = await deps.db.query(
      `SELECT c.id::text, c.text AS what, p.canonical_name AS owner,
              c.due_at, c.state AS status, c.progress,
              c.meeting_id::text AS source_decision_id,
              'mn' AS source,
              p.id::text AS person_id, p.role AS person_role
         FROM mn_commitments c
         JOIN mn_people p ON c.person_id = p.id
        WHERE ($1::uuid[] IS NULL OR c.scope_id = ANY($1::uuid[]))
        ORDER BY c.due_at NULLS LAST
        LIMIT 50`,
      [ids],
    );
    items.push(...mn.rows);
  } catch {
    /* mn schema 不可用时跳过 */
  }

  // ceo 源
  try {
    const ceo = await deps.db.query(
      `SELECT p.id::text, p.brief_id::text, p.what, p.owner, p.due_at, p.status,
              p.source_decision_id, 'ceo' AS source,
              NULL::text AS person_id, NULL::text AS person_role
         FROM ceo_board_promises p
         LEFT JOIN ceo_briefs b ON b.id = p.brief_id
        WHERE ($1::uuid[] IS NULL OR b.scope_id = ANY($1::uuid[]))
        ORDER BY p.status, p.due_at NULLS LAST
        LIMIT 30`,
      [ids],
    );
    items.push(...ceo.rows);
  } catch {
    /* ignore */
  }

  return { items };
}

export async function listRebuttals(
  deps: CeoEngineDeps,
  filter: { briefId?: string; scopeIds?: string[] },
): Promise<{ items: any[] }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.briefId) {
    params.push(filter.briefId);
    where.push(`brief_id = $${params.length}::uuid`);
  } else {
    const ids = scopeIdsParam(filter.scopeIds);
    if (ids) {
      params.push(ids);
      where.push(`scope_id = ANY($${params.length}::uuid[])`);
    }
  }
  const r = await deps.db.query(
    `SELECT id::text, brief_id::text, scope_id::text, attacker, attack_text,
            defense_text, strength_score, generated_run_id, created_at
       FROM ceo_rebuttal_rehearsals
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY strength_score DESC NULLS LAST, created_at DESC
      LIMIT 20`,
    params,
  );
  return { items: r.rows };
}

/** Boardroom dashboard: 关切雷达 + 最新预读包 + 承诺状态 + forward_pct */
export async function getBoardroomDashboard(
  deps: CeoEngineDeps,
  scopeIds?: string[],
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  concernsByStatus: { pending: number; answered: number; superseded: number };
  topConcerns: Array<{
    name: string;
    personId: string | null;
    personRole: string | null;
    meta: string;
    text: string;
    warn: boolean;
  }>;
  forwardPct: number;
  promiseStats: { total: number; done: number; in_progress: number; late: number };
  appliedScopes?: Array<{ id: string; name: string; kind: string }>;
}> {
  const ids = scopeIdsParam(scopeIds);

  const cs = await deps.db.query(
    `SELECT c.status, COUNT(*)::int AS n
       FROM ceo_director_concerns c
       LEFT JOIN ceo_directors d ON d.id = c.director_id
      WHERE ($1::uuid[] IS NULL OR d.scope_id = ANY($1::uuid[]))
      GROUP BY c.status`,
    [ids],
  );
  const concernsByStatus = { pending: 0, answered: 0, superseded: 0 };
  for (const r of cs.rows) {
    if (r.status in concernsByStatus) (concernsByStatus as any)[r.status] = r.n;
  }

  const top = await deps.db.query(
    `SELECT d.id::text AS director_id, d.name AS name, d.role AS role,
            COUNT(*)::int AS cnt, MAX(c.raised_at) AS last_raised
       FROM ceo_director_concerns c
       LEFT JOIN ceo_directors d ON d.id = c.director_id
      WHERE c.status = 'pending'
        AND ($1::uuid[] IS NULL OR d.scope_id = ANY($1::uuid[]))
      GROUP BY d.id, d.name, d.role
      ORDER BY cnt DESC, last_raised DESC NULLS LAST
      LIMIT 5`,
    [ids],
  );
  const topConcerns = top.rows.map((r) => ({
    name: r.name ?? '匿名董事',
    personId: r.director_id ?? null,
    personRole: r.role ?? null,
    meta: `${r.cnt} 次 · ${r.role ?? ''}`.trim(),
    text: '待回应',
    warn: r.cnt >= 3,
  }));

  // forwardPct 当前用 brief.toc 算，scope 多选时取并集 (单 scope 兼容: 用 ids[0])
  const forwardPct = await computeForwardPct(deps, ids?.[0]);

  // promiseStats: union mn + ceo (映射 mn.state → in_progress/done/late/proposed)
  const mnPs = await deps.db.query(
    `SELECT c.state AS status, COUNT(*)::int AS n
       FROM mn_commitments c
      WHERE ($1::uuid[] IS NULL OR c.scope_id = ANY($1::uuid[]))
      GROUP BY c.state`,
    [ids],
  ).catch(() => ({ rows: [] as any[] }));
  const ceoPs = await deps.db.query(
    `SELECT p.status, COUNT(*)::int AS n
       FROM ceo_board_promises p
       LEFT JOIN ceo_briefs b ON b.id = p.brief_id
      WHERE ($1::uuid[] IS NULL OR b.scope_id = ANY($1::uuid[]))
      GROUP BY p.status`,
    [ids],
  ).catch(() => ({ rows: [] as any[] }));

  const promiseStats = { total: 0, done: 0, in_progress: 0, late: 0 };
  for (const r of [...mnPs.rows, ...ceoPs.rows]) {
    const status = String(r.status);
    const n = Number(r.n);
    promiseStats.total += n;
    // mn.state: 'on_track'|'at_risk'|'done'|'slipped'
    if (status === 'done' || status === 'completed') promiseStats.done += n;
    else if (status === 'late' || status === 'slipped') promiseStats.late += n;
    else if (status === 'in_progress' || status === 'on_track' || status === 'at_risk') promiseStats.in_progress += n;
  }

  // appliedScopes 回显（多 scope 模式）
  let appliedScopes: Array<{ id: string; name: string; kind: string }> | undefined;
  if (ids && ids.length > 0) {
    try {
      const sc = await deps.db.query(
        `SELECT id::text, name, kind FROM mn_scopes WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      appliedScopes = sc.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        kind: String(row.kind),
      }));
    } catch {
      appliedScopes = ids.map((id) => ({ id, name: id, kind: 'unknown' }));
    }
  }

  return {
    question: '下次董事会我要带什么?',
    metric: {
      label: '前瞻占比',
      value: `${(forwardPct * 100).toFixed(0)}%`,
      delta: '本季',
    },
    concernsByStatus,
    topConcerns,
    forwardPct,
    promiseStats,
    ...(appliedScopes ? { appliedScopes } : {}),
  };
}

// ─── 写入端点 (Phase 1 输入接入层) ──────────────────────────

export async function createDirector(
  deps: CeoEngineDeps,
  body: { name?: string; role?: string | null; weight?: number; scopeId?: string | null; metadata?: Record<string, any> },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!body.name) return { ok: false, error: 'name required' };
  const r = await deps.db.query(
    `INSERT INTO ceo_directors (scope_id, name, role, weight, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text`,
    [body.scopeId ?? null, body.name, body.role ?? null, body.weight ?? 1.0, body.metadata ?? {}],
  );
  return { ok: true, id: r.rows[0].id };
}

export async function updateDirector(
  deps: CeoEngineDeps,
  id: string,
  body: { name?: string; role?: string | null; weight?: number; metadata?: Record<string, any> },
): Promise<{ ok: boolean; error?: string }> {
  const sets: string[] = [];
  const params: any[] = [];
  if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${params.length}`); }
  if (body.role !== undefined) { params.push(body.role); sets.push(`role = $${params.length}`); }
  if (body.weight !== undefined) { params.push(body.weight); sets.push(`weight = $${params.length}`); }
  if (body.metadata !== undefined) { params.push(body.metadata); sets.push(`metadata = $${params.length}`); }
  if (sets.length === 0) return { ok: false, error: 'no fields to update' };
  params.push(id);
  const r = await deps.db.query(
    `UPDATE ceo_directors SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id::text`,
    params,
  );
  if (r.rows.length === 0) return { ok: false, error: 'not found' };
  return { ok: true };
}

export async function deleteDirector(
  deps: CeoEngineDeps,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await deps.db.query(`DELETE FROM ceo_directors WHERE id = $1 RETURNING id::text`, [id]);
  if (r.rows.length === 0) return { ok: false, error: 'not found' };
  return { ok: true };
}

export async function createConcern(
  deps: CeoEngineDeps,
  body: { directorId?: string; topic?: string; sourceMeetingId?: string | null },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!body.directorId || !body.topic) return { ok: false, error: 'directorId and topic required' };
  const r = await deps.db.query(
    `INSERT INTO ceo_director_concerns (director_id, topic, source_meeting_id)
     VALUES ($1, $2, $3)
     RETURNING id::text`,
    [body.directorId, body.topic, body.sourceMeetingId ?? null],
  );
  return { ok: true, id: r.rows[0].id };
}

export async function updateConcernStatus(
  deps: CeoEngineDeps,
  id: string,
  body: { status?: string; resolution?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!body.status) return { ok: false, error: 'status required' };
  if (!['pending', 'answered', 'superseded'].includes(body.status)) {
    return { ok: false, error: 'invalid status' };
  }
  const resolvedAt = body.status === 'answered' ? 'NOW()' : 'NULL';
  const r = await deps.db.query(
    `UPDATE ceo_director_concerns
        SET status = $1,
            resolution = $2,
            resolved_at = ${resolvedAt}
      WHERE id = $3
      RETURNING id::text`,
    [body.status, body.resolution ?? null, id],
  );
  if (r.rows.length === 0) return { ok: false, error: 'not found' };
  return { ok: true };
}
