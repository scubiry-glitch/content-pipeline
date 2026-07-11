// P4a: content_entities embedding 自动合并——找相似对 + 双档路由。
import type { DatabaseAdapter } from '../types.js';
import { mergeContentEntities } from './mergeEntities.js';

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

export interface AutoMergeSummary {
  scanned: number;
  autoMerged: number;
  proposed: number;
}

async function upsertCandidate(
  deps: { db: DatabaseAdapter },
  p: MergeCandidatePair,
): Promise<void> {
  await deps.db.query(
    `INSERT INTO content_entity_merge_candidates
       (target_entity_id, source_entity_id, entity_type, similarity)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (target_entity_id, source_entity_id)
     DO UPDATE SET similarity = EXCLUDED.similarity, status = 'pending'`,
    [p.targetId, p.sourceId, p.entityType, p.similarity],
  );
}

/**
 * 双档自动合并：
 *   非 person 且 sim ≥ autoThreshold → mergeContentEntities 立即合并；
 *   其余（中档相似 + 所有 person 对）→ upsert 候选表交人工。
 * person 对恒不自动合并（规避 I1 跨 workspace 同名塌缩）。
 */
export async function autoMergeContentEntities(
  deps: { db: DatabaseAdapter },
  opts?: { autoThreshold?: number; proposeThreshold?: number; limit?: number },
): Promise<AutoMergeSummary> {
  const auto = opts?.autoThreshold ?? 0.97;
  const propose = opts?.proposeThreshold ?? 0.90;
  const pairs = await findMergeCandidatePairs(deps, propose, opts?.limit ?? 500);

  const consumed = new Set<string>();
  let autoMerged = 0;
  let proposed = 0;

  for (const p of pairs) {
    if (consumed.has(p.targetId) || consumed.has(p.sourceId)) continue;

    const canAuto = p.entityType !== 'person' && p.similarity >= auto;
    if (canAuto) {
      try {
        await mergeContentEntities(deps, p.targetId, p.sourceId);
        consumed.add(p.sourceId); // source 已删除；target 存活
        autoMerged += 1;
        continue;
      } catch (err) {
        console.warn(`[autoMerge] 合并失败，降级为候选: ${p.targetId}<-${p.sourceId}`, err);
        // 落到候选
      }
    }
    try {
      await upsertCandidate(deps, p);
      proposed += 1;
    } catch (err) {
      console.warn(`[autoMerge] 写候选失败: ${p.targetId}<-${p.sourceId}`, err);
    }
  }

  return { scanned: pairs.length, autoMerged, proposed };
}
