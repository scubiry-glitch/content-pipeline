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

/**
 * content_entities 全量覆盖重嵌入（不只补 NULL）：
 * 用真语义适配器给每个 canonical_name 重算向量并 UPDATE，替换 local-hash 时期的垃圾向量。
 * 批量（embedBatch）避免逐行串行超时；适配器产出空向量（如 local provider）时跳过该行、不覆盖。
 */
export async function reembedAllEntities(
  deps: { db: DatabaseAdapter; embedding: EmbeddingAdapter },
  opts?: { batchSize?: number },
): Promise<{ scanned: number; embedded: number }> {
  const batchSize = Math.max(1, Math.min(64, opts?.batchSize ?? 20));
  const res = await deps.db.query(
    `SELECT id, canonical_name FROM content_entities ORDER BY id`,
  );
  const rows = res.rows;
  let embedded = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const names = chunk.map((r: any) => String(r.canonical_name ?? '').trim());
    let vecs: number[][] = [];
    try {
      vecs = await deps.embedding.embedBatch(names);
    } catch {
      vecs = names.map(() => []);
    }
    for (let j = 0; j < chunk.length; j++) {
      const vec = vecs[j];
      if (names[j] && Array.isArray(vec) && vec.length > 0) {
        await deps.db.query(
          `UPDATE content_entities SET embedding = $2, updated_at = NOW() WHERE id = $1`,
          [chunk[j].id, JSON.stringify(vec)],
        );
        embedded += 1;
      }
    }
  }
  return { scanned: rows.length, embedded };
}
