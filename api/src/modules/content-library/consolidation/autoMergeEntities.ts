// P4a: content_entities embedding 自动合并——找相似对 + 双档路由。
import type { DatabaseAdapter } from '../types.js';

export interface MergeCandidatePair {
  targetId: string;
  sourceId: string;
  entityType: string;
  similarity: number;
}

/**
 * 找同 entity_type、双方均有向量、余弦相似 ≥ minSimilarity 的实体对。
 * target = created_at 较早者（tie-break 较小 id）；source = 另一个。a.id<b.id 去反向重复。
 */
export async function findMergeCandidatePairs(
  deps: { db: DatabaseAdapter },
  minSimilarity: number,
  limit = 500,
): Promise<MergeCandidatePair[]> {
  const res = await deps.db.query(
    `SELECT
       CASE WHEN a.created_at < b.created_at
              OR (a.created_at = b.created_at AND a.id < b.id)
            THEN a.id ELSE b.id END AS target_id,
       CASE WHEN a.created_at < b.created_at
              OR (a.created_at = b.created_at AND a.id < b.id)
            THEN b.id ELSE a.id END AS source_id,
       a.entity_type AS entity_type,
       1 - (a.embedding <=> b.embedding) AS similarity
     FROM content_entities a
     JOIN content_entities b
       ON a.entity_type = b.entity_type
      AND a.id < b.id
      AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
     WHERE 1 - (a.embedding <=> b.embedding) >= $1
     ORDER BY similarity DESC
     LIMIT $2`,
    [minSimilarity, limit],
  );
  return (res.rows ?? []).map((r: any) => ({
    targetId: String(r.target_id),
    sourceId: String(r.source_id),
    entityType: String(r.entity_type),
    similarity: Number(r.similarity),
  }));
}
