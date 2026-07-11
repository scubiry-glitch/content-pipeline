// P4b-1: mn_unresolved_mentions 复核服务（列表/解决）。
type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

export interface UnresolvedMentionRow {
  id: string;
  meetingId: string | null;
  rawName: string;
  normalizedName: string;
  occurrences: number;
  status: string;
  createdAt: string;
}

export async function listUnresolvedMentions(
  db: Db,
  opts?: { status?: string; limit?: number },
): Promise<UnresolvedMentionRow[]> {
  const status = opts?.status ?? 'pending';
  const n = Number(opts?.limit);
  const limit = Math.min(500, Math.max(1, Number.isFinite(n) ? n : 100));
  const res = await db.query(
    `SELECT id, meeting_id, raw_name, normalized_name, occurrences, status, created_at
       FROM mn_unresolved_mentions
      WHERE ($1 = 'all' OR status = $1)
      ORDER BY occurrences DESC, created_at ASC
      LIMIT $2`,
    [status, limit],
  );
  return (res.rows ?? []).map((r: any) => ({
    id: String(r.id),
    meetingId: r.meeting_id ?? null,
    rawName: String(r.raw_name),
    normalizedName: String(r.normalized_name),
    occurrences: Number(r.occurrences),
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
}

export async function resolveUnresolvedMention(db: Db, id: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE mn_unresolved_mentions SET status = 'resolved' WHERE id = $1 RETURNING id`,
    [id],
  );
  return (r.rows?.length ?? 0) > 0;
}
