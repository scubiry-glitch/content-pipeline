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
  createdAt: string;
  updatedAt: string;
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
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    status: row.status,
    stewardPersonIds: row.steward_person_ids ?? [],
    description: row.description,
    metadata: row.metadata ?? {},
    parentScopeId: row.parent_scope_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ScopeService {
  constructor(private readonly deps: MeetingNotesDeps) {}

  async list(filter: { kind?: ScopeKind; status?: ScopeStatus; workspaceId?: string } = {}): Promise<ScopeRow[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.workspaceId) {
      params.push(filter.workspaceId);
      where.push(`(workspace_id = $${params.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
    }
    if (filter.kind)        { params.push(filter.kind);        where.push(`kind = $${params.length}`); }
    if (filter.status)      { params.push(filter.status);      where.push(`status = $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.deps.db.query(
      `SELECT * FROM mn_scopes ${clause} ORDER BY created_at DESC`,
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
    await this.deps.db.query(
      `DELETE FROM mn_scope_members sm
       USING mn_scopes s
       WHERE sm.meeting_id = $1
         AND sm.scope_id   = s.id
         AND s.kind = (SELECT kind FROM mn_scopes WHERE id = $2)
         AND sm.scope_id  != $2`,
      [meetingId, scopeId],
    );
    await this.deps.db.query(
      `INSERT INTO mn_scope_members (scope_id, meeting_id, bound_by, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scope_id, meeting_id) DO NOTHING`,
      [scopeId, meetingId, opts?.boundBy ?? null, opts?.reason ?? null],
    );
  }

  async unbindMeeting(scopeId: string, meetingId: string): Promise<boolean> {
    const r = await this.deps.db.query(
      `DELETE FROM mn_scope_members WHERE scope_id = $1 AND meeting_id = $2`,
      [scopeId, meetingId],
    );
    return (r as any).rowCount > 0;
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
