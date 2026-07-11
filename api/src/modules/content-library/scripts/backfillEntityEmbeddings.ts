// content_entities 空向量补算：仅当活跃 embedding 适配器产出非空向量时写库
// （语义门控：local provider → embed 返回 []，本脚本自然跳过，不写垃圾向量）
import type { DatabaseAdapter, EmbeddingAdapter } from '../types.js';

export async function backfillEntityEmbeddings(
  deps: { db: DatabaseAdapter; embedding: EmbeddingAdapter },
): Promise<{ scanned: number; embedded: number }> {
  const res = await deps.db.query(
    `SELECT id, canonical_name FROM content_entities WHERE embedding IS NULL`,
  );
  let embedded = 0;
  for (const row of res.rows) {
    const name = String(row.canonical_name ?? '').trim();
    if (!name) continue;
    let vec: number[] = [];
    try {
      vec = await deps.embedding.embed(name);
    } catch {
      vec = [];
    }
    if (Array.isArray(vec) && vec.length > 0) {
      await deps.db.query(
        `UPDATE content_entities SET embedding = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, JSON.stringify(vec)],
      );
      embedded += 1;
    }
  }
  return { scanned: res.rows.length, embedded };
}
