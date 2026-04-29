// parse/participantExtractor.ts — 参会人 → mn_people 合并
//
// 去重规则：canonical_name + org 联合唯一（migration 002）
// 若同名不同 org：视为不同人
// 若同名无 org：按 canonical_name 合并（参会人记录通常不带 org）

import type { MeetingNotesDeps } from '../types.js';

function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[（(].*?[)）]/g, '') // 去掉括号注释
    .trim();
}

/**
 * 幂等：若已存在（canonical_name, org [, workspace]）则返回；否则新建。
 * 返回 mn_people.id。
 *
 * meetingId 透传作用:
 *   1) 写入时落 first_seen_meeting_id, 让 040 trigger 派生 workspace_id (选项 B 语义:
 *      同一姓名在两个 ws 是两条记录)
 *   2) 查重时按 (canonical, org, workspace_id) 三元组锁定到当前 ws, 避免跨 ws 错误合并
 *   未传 meetingId 时退回到旧行为 (没 ws scope, INSERT 不带 first_seen_meeting_id —
 *   会因 mn_people.workspace_id NOT NULL 失败, 暴露漏传 bug, 比静默落 default 安全)
 */
export async function ensurePersonByName(
  deps: MeetingNotesDeps,
  rawName: string,
  role?: string,
  org?: string,
  meetingId?: string,
): Promise<string | null> {
  const canonical = normalizeName(rawName);
  if (!canonical) return null;

  // F11 · alias-aware lookup：除了 canonical_name 还查 aliases[]
  // 040 起: 若给了 meetingId, 通过 assets.workspace_id 把查重限定到当前 ws,
  // 避免 ws=A 的 "John" 错误合并到 ws=B 已有的 "John"
  const existing = meetingId
    ? await deps.db.query(
        `SELECT id FROM mn_people
          WHERE (canonical_name = $1 OR $1 = ANY(aliases))
            AND COALESCE(org, '') = COALESCE($2, '')
            AND workspace_id = (SELECT workspace_id FROM assets WHERE id::text = $3::text LIMIT 1)
          LIMIT 1`,
        [canonical, org ?? null, meetingId],
      )
    : await deps.db.query(
        `SELECT id FROM mn_people
          WHERE (canonical_name = $1 OR $1 = ANY(aliases))
            AND COALESCE(org, '') = COALESCE($2, '')
          LIMIT 1`,
        [canonical, org ?? null],
      );
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id as string;
    // 若 role 变了可选 append 到 metadata
    if (role) {
      await deps.db.query(
        `UPDATE mn_people SET role = COALESCE(role, $2) WHERE id = $1`,
        [id, role],
      );
    }
    return id;
  }

  // INSERT: meetingId → first_seen_meeting_id; trigger inherit_ws_from_first_seen_meeting()
  // 自动从 assets.workspace_id 派生 workspace_id
  const inserted = meetingId
    ? await deps.db.query(
        `INSERT INTO mn_people (canonical_name, role, org, first_seen_meeting_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [canonical, role ?? null, org ?? null, meetingId],
      )
    : await deps.db.query(
        `INSERT INTO mn_people (canonical_name, role, org)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [canonical, role ?? null, org ?? null],
      );
  return inserted.rows[0]?.id ?? null;
}
