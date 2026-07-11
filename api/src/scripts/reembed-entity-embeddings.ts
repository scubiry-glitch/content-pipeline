// CLI：全量覆盖重嵌入 content_entities（替换 local-hash 时期的垃圾向量）。
// 用法：cd api && npx tsx src/scripts/reembed-entity-embeddings.ts
//
// 与 backfill-entity-embeddings.ts 的区别：覆盖 ALL 行（不只 embedding IS NULL），批量。
// 语义门控：provider==='local' → embedBatch 返回 [] → 跳过该行不覆盖（安全）；
//           provider!=='local'（siliconflow bge-m3）→ 真向量 coerceVec768 → 写入。
import 'dotenv/config';
import { query } from '../db/connection.js';
import {
  createPipelineDBAdapter,
  createPipelineDeps,
  createSemanticEmbeddingAdapter,
} from '../modules/meeting-notes/adapters/pipeline.js';
import { reembedAllEntities } from '../modules/content-library/scripts/backfillEntityEmbeddings.js';

function envNum(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

async function main() {
  const db = createPipelineDBAdapter(query);
  const deps = createPipelineDeps({
    db,
    embedding: createSemanticEmbeddingAdapter(),
    experts: { invoke: async () => ({ success: false, error: 'reembed-stub' }) } as any,
    expertApplication: {
      resolveForMeetingKind: () => null,
      shouldSkipExpertAnalysis: () => false,
    } as any,
  });
  const t0 = Date.now();
  const r = await reembedAllEntities(
    { db: deps.db, embedding: deps.embedding },
    { batchSize: envNum('REEMBED_BATCH_SIZE', 20) },
  );
  console.log(`[reembed-entity-embeddings] scanned=${r.scanned} embedded=${r.embedded} in ${Math.round((Date.now() - t0) / 1000)}s`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
