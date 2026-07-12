// 全局人物花名册：列 mn_people（跨 workspace），供花名册页。只读。
type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

export interface PeopleRosterRow {
  id: string;
  canonicalName: string;
  aliases: string[];
  role: string | null;
  org: string | null;
  contentEntityId: string | null;
  bridged: boolean;           // 是否已桥接到 content_entities
  workspaceId: string | null;
  createdAt: string;
}

export async function listPeopleRoster(
  db: Db,
  opts?: { limit?: number; q?: string },
): Promise<PeopleRosterRow[]> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const q = opts?.q && opts.q.trim() ? opts.q.trim() : null;
  const res = await db.query(
    `SELECT id, canonical_name, aliases, role, org, content_entity_id, workspace_id, created_at
       FROM mn_people
      WHERE ($2::text IS NULL
             OR canonical_name ILIKE '%' || $2 || '%'
             OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE '%' || $2 || '%'))
      ORDER BY canonical_name ASC
      LIMIT $1`,
    [limit, q],
  );
  return (res.rows ?? []).map((r: any) => ({
    id: String(r.id),
    canonicalName: String(r.canonical_name),
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
    role: r.role ?? null,
    org: r.org ?? null,
    contentEntityId: r.content_entity_id ?? null,
    bridged: r.content_entity_id != null,
    workspaceId: r.workspace_id ?? null,
    createdAt: String(r.created_at),
  }));
}
