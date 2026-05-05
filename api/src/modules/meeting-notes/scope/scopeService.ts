// scope/scopeService.ts — mn_scopes + mn_scope_members CRUD
//
// Scope = project / client / topic 三种聚合容器（参见 migration 001）
// library 是隐式全库 scope，不落 mn_scopes 表

import type { MeetingNotesDeps } from '../types.js';

export type ScopeKind = 'project' | 'client' | 'topic';
export type ScopeStatus = 'active' | 'archived';

export interface ScopeRow {
  id: string;
  kind: ScopeKind;
  slug: string;
  name: string;
  status: ScopeStatus;
  stewardPersonIds: string[];
  description: string | null;
  metadata: Record<string, any>;
  /** 二级项目支持：父 scope 的 id；NULL 表示顶层 scope */
  parentScopeId: string | null;
  /** 028: dirty 标记 — 绑/解绑会议后非空，runEngine 成功 g4/g5/all 后清 */
  dirtyAt: string | null;
  dirtyReason: string | null;
  lastRunId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 绑定到该 scope 的会议数（LEFT JOIN mn_scope_members；只在 list() 路径返回） */
  meetingsCount?: number;
}

export interface CreateScopeInput {
  kind: ScopeKind;
  slug: string;
  name: string;
  status?: ScopeStatus;
  stewardPersonIds?: string[];
  description?: string;
  metadata?: Record<string, any>;
  workspaceId?: string;
  /** 父 scope id；必须与本 scope 同 kind；不指定则为顶层 */
  parentScopeId?: string | null;
}

export interface UpdateScopeInput {
  name?: string;
  status?: ScopeStatus;
  stewardPersonIds?: string[];
  description?: string;
  metadata?: Record<string, any>;
}

function mapScope(row: Record<string, any>): ScopeRow {
  const out: ScopeRow = {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    status: row.status,
    stewardPersonIds: row.steward_person_ids ?? [],
    description: row.description,
    metadata: row.metadata ?? {},
    parentScopeId: row.parent_scope_id ?? null,
    dirtyAt: row.dirty_at ?? null,
    dirtyReason: row.dirty_reason ?? null,
    lastRunId: row.last_run_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.meetings_count != null) out.meetingsCount = Number(row.meetings_count);
  return out;
}

export class ScopeService {
  constructor(private readonly deps: MeetingNotesDeps) {}

  async list(filter: { kind?: ScopeKind; status?: ScopeStatus; workspaceId?: string; dirty?: boolean } = {}): Promise<ScopeRow[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.workspaceId) {
      params.push(filter.workspaceId);
      where.push(`(workspace_id = $${params.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
    }
    if (filter.kind)        { params.push(filter.kind);        where.push(`kind = $${params.length}`); }
    if (filter.status)      { params.push(filter.status);      where.push(`status = $${params.length}`); }
    if (filter.dirty === true)  { where.push(`dirty_at IS NOT NULL`); }
    if (filter.dirty === false) { where.push(`dirty_at IS NULL`); }
    // 列加 s. 前缀，避免和 LEFT JOIN 子查询里的同名列歧义
    const safeWhere = where
      .map((w) => w.replace(/\b(workspace_id|kind|status|dirty_at)\b/g, 's.$1'))
      .join(' AND ');
    const safeClause = safeWhere ? `WHERE ${safeWhere}` : '';
    const orderBy = filter.dirty === true
      ? 'ORDER BY s.dirty_at DESC'
      : 'ORDER BY s.created_at DESC';
    // 附带 meetings_count（绑定到该 scope 的会议数）— ScopePill instance row 用
    const r = await this.deps.db.query(
      `SELECT s.*,
              COALESCE(m.cnt, 0) AS meetings_count
         FROM mn_scopes s
         LEFT JOIN (
           SELECT scope_id, COUNT(*)::int AS cnt
             FROM mn_scope_members
            GROUP BY scope_id
         ) m ON m.scope_id = s.id
         ${safeClause}
         ${orderBy}`,
      params,
    );
    return r.rows.map(mapScope);
  }

  async getById(id: string): Promise<ScopeRow | null> {
    const r = await this.deps.db.query(`SELECT * FROM mn_scopes WHERE id = $1`, [id]);
    return r.rows[0] ? mapScope(r.rows[0]) : null;
  }

  async getBySlug(kind: ScopeKind, slug: string): Promise<ScopeRow | null> {
    const r = await this.deps.db.query(
      `SELECT * FROM mn_scopes WHERE kind = $1 AND slug = $2`,
      [kind, slug],
    );
    return r.rows[0] ? mapScope(r.rows[0]) : null;
  }

  async create(input: CreateScopeInput): Promise<ScopeRow> {
    // 父 scope 校验：必须存在 + 同 kind + （工作区一致由数据库行级安全或上层保证）
    if (input.parentScopeId) {
      const parent = await this.getById(input.parentScopeId);
      if (!parent) {
        throw new Error(`parent scope not found: ${input.parentScopeId}`);
      }
      if (parent.kind !== input.kind) {
        throw new Error(`parent scope kind mismatch: parent=${parent.kind} child=${input.kind}`);
      }
    }
    const r = input.workspaceId
      ? await this.deps.db.query(
          `INSERT INTO mn_scopes (kind, slug, name, status, steward_person_ids, description, metadata, workspace_id, parent_scope_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
           RETURNING *`,
          [
            input.kind,
            input.slug,
            input.name,
            input.status ?? 'active',
            input.stewardPersonIds ?? [],
            input.description ?? null,
            JSON.stringify(input.metadata ?? {}),
            input.workspaceId,
            input.parentScopeId ?? null,
          ],
        )
      : await this.deps.db.query(
          `INSERT INTO mn_scopes (kind, slug, name, status, steward_person_ids, description, metadata, parent_scope_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
           RETURNING *`,
          [
            input.kind,
            input.slug,
            input.name,
            input.status ?? 'active',
            input.stewardPersonIds ?? [],
            input.description ?? null,
            JSON.stringify(input.metadata ?? {}),
            input.parentScopeId ?? null,
          ],
        );
    return mapScope(r.rows[0]);
  }

  async update(id: string, patch: UpdateScopeInput): Promise<ScopeRow | null> {
    const sets: string[] = [];
    const params: any[] = [];
    if (patch.name !== undefined)              { params.push(patch.name);              sets.push(`name = $${params.length}`); }
    if (patch.status !== undefined)            { params.push(patch.status);            sets.push(`status = $${params.length}`); }
    if (patch.stewardPersonIds !== undefined)  { params.push(patch.stewardPersonIds);  sets.push(`steward_person_ids = $${params.length}`); }
    if (patch.description !== undefined)       { params.push(patch.description);       sets.push(`description = $${params.length}`); }
    if (patch.metadata !== undefined)          { params.push(JSON.stringify(patch.metadata)); sets.push(`metadata = $${params.length}::jsonb`); }

    if (sets.length === 0) return this.getById(id);
    params.push(id);
    const r = await this.deps.db.query(
      `UPDATE mn_scopes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return r.rows[0] ? mapScope(r.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const r = await this.deps.db.query(`DELETE FROM mn_scopes WHERE id = $1`, [id]);
    return (r as any).rowCount > 0;
  }

  // ============================================================
  // Membership (scope × meeting)
  // ============================================================

  async bindMeeting(
    scopeId: string,
    meetingId: string,
    opts?: { boundBy?: string; reason?: string },
  ): Promise<void> {
    // 先删除同 meeting 在同 kind 下的旧 binding（一会议一 kind 只保留一条）
    // 同时标记被替换的旧 scope 为 dirty（若有），避免遗漏。
    const replaced = await this.deps.db.query(
      `DELETE FROM mn_scope_members sm
       USING mn_scopes s
       WHERE sm.meeting_id = $1
         AND sm.scope_id   = s.id
         AND s.kind = (SELECT kind FROM mn_scopes WHERE id = $2)
         AND sm.scope_id  != $2
       RETURNING sm.scope_id::text AS scope_id`,
      [meetingId, scopeId],
    );
    for (const row of (replaced.rows ?? []) as { scope_id: string }[]) {
      await this.markDirty(row.scope_id, `-1 meeting unbound (replaced): ${meetingId}`);
    }
    await this.deps.db.query(
      `INSERT INTO mn_scope_members (scope_id, meeting_id, bound_by, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scope_id, meeting_id) DO NOTHING`,
      [scopeId, meetingId, opts?.boundBy ?? null, opts?.reason ?? null],
    );
    await this.markDirty(scopeId, `+1 meeting bound: ${meetingId}`);
  }

  async unbindMeeting(scopeId: string, meetingId: string): Promise<boolean> {
    const r = await this.deps.db.query(
      `DELETE FROM mn_scope_members WHERE scope_id = $1 AND meeting_id = $2`,
      [scopeId, meetingId],
    );
    const removed = (r as any).rowCount > 0;
    if (removed) {
      await this.markDirty(scopeId, `-1 meeting unbound: ${meetingId}`);
    }
    return removed;
  }

  /** 028: 标记 scope 为 dirty（绑/解绑会议时）；runEngine 成功 g4/g5/all 后清。 */
  async markDirty(scopeId: string, reason: string): Promise<void> {
    await this.deps.db.query(
      `UPDATE mn_scopes SET dirty_at = NOW(), dirty_reason = $2 WHERE id = $1`,
      [scopeId, reason],
    );
  }

  /** 028: 清 dirty 标记 — 由 runEngine 成功完成 project g4/g5/all 时调用 */
  async clearDirty(scopeId: string, runId: string): Promise<void> {
    await this.deps.db.query(
      `UPDATE mn_scopes SET dirty_at = NULL, last_run_id = $1::uuid WHERE id = $2::uuid`,
      [runId, scopeId],
    );
  }

  /** 列出此 scope 绑定的所有 meeting_id（= assets.id） */
  async listMeetings(scopeId: string): Promise<string[]> {
    const r = await this.deps.db.query(
      `SELECT meeting_id FROM mn_scope_members
         WHERE scope_id = $1 ORDER BY bound_at DESC`,
      [scopeId],
    );
    return r.rows.map((row) => row.meeting_id as string);
  }

  /** 反查：某 meeting 绑的所有 scopes */
  async listScopesForMeeting(meetingId: string): Promise<ScopeRow[]> {
    const r = await this.deps.db.query(
      `SELECT s.* FROM mn_scopes s
         JOIN mn_scope_members m ON m.scope_id = s.id
         WHERE m.meeting_id = $1`,
      [meetingId],
    );
    return r.rows.map(mapScope);
  }
}
