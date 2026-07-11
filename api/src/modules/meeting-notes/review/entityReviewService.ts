// P4b-1: content_entity_merge_candidates 复核服务（列表/审批/拒绝）。
// person 候选本期不审批（须经 mn_merge_people 人工，规避 I1）。
import { mergeContentEntities } from '../../content-library/consolidation/mergeEntities.js';

type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

export interface MergeCandidateRow {
  id: string;
  targetEntityId: string;
  sourceEntityId: string;
  entityType: string;
  similarity: number;
  status: string;
  createdAt: string;
  targetName: string | null;
  sourceName: string | null;
}

export async function listMergeCandidates(
  db: Db,
  opts?: { status?: string; limit?: number },
): Promise<MergeCandidateRow[]> {
  const status = opts?.status ?? 'pending';
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  const res = await db.query(
    `SELECT c.id, c.target_entity_id, c.source_entity_id, c.entity_type,
            c.similarity, c.status, c.created_at,
            t.canonical_name AS target_canonical_name,
            s.canonical_name AS source_canonical_name
       FROM content_entity_merge_candidates c
       LEFT JOIN content_entities t ON t.id = c.target_entity_id
       LEFT JOIN content_entities s ON s.id = c.source_entity_id
      WHERE ($1 = 'all' OR c.status = $1)
      ORDER BY c.similarity DESC, c.created_at ASC
      LIMIT $2`,
    [status, limit],
  );
  return (res.rows ?? []).map((r: any) => ({
    id: String(r.id),
    targetEntityId: String(r.target_entity_id),
    sourceEntityId: String(r.source_entity_id),
    entityType: String(r.entity_type),
    similarity: Number(r.similarity),
    status: String(r.status),
    createdAt: String(r.created_at),
    targetName: r.target_canonical_name ?? null,
    sourceName: r.source_canonical_name ?? null,
  }));
}

export async function approveMergeCandidate(
  db: Db,
  id: string,
): Promise<{ approved: boolean; entityType: string; affected: any[] }> {
  const cand = await db.query(
    `SELECT id, target_entity_id, source_entity_id, entity_type FROM content_entity_merge_candidates WHERE id = $1`,
    [id],
  );
  if ((cand.rows?.length ?? 0) === 0) {
    throw Object.assign(new Error('候选不存在'), { code: 'NOT_FOUND' });
  }
  const c = cand.rows[0];
  if (c.entity_type === 'person') {
    throw Object.assign(new Error('person 候选需人工经 people merge 处理'), { code: 'PERSON_MERGE_MANUAL' });
  }
  const affected = await mergeContentEntities({ db }, c.target_entity_id, c.source_entity_id);
  await db.query(
    `UPDATE content_entity_merge_candidates SET status = 'approved' WHERE id = $1`,
    [id],
  );
  return { approved: true, entityType: String(c.entity_type), affected };
}

export async function rejectMergeCandidate(db: Db, id: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE content_entity_merge_candidates SET status = 'rejected' WHERE id = $1 RETURNING id`,
    [id],
  );
  return (r.rows?.length ?? 0) > 0;
}
