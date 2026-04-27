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
 * 幂等：若已存在（canonical_name, org）则返回；否则新建。
 * 返回 mn_people.id。
 */
export async function ensurePersonByName(
  deps: MeetingNotesDeps,
  rawName: string,
  role?: string,
  org?: string,
): Promise<string | null> {
  const canonical = normalizeName(rawName);
  if (!canonical) return null;

  // F11 · alias-aware lookup：除了 canonical_name 还查 aliases[]，
  // 这样用户改名后历史 transcript 里出现的旧名仍能映射到同一个 mn_people 行
  const existing = await deps.db.query(
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

  const inserted = await deps.db.query(
    `INSERT INTO mn_people (canonical_name, role, org)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [canonical, role ?? null, org ?? null],
  );
  return inserted.rows[0]?.id ?? null;
}
