// CLI：补算 content_entities 空向量。用法：cd api && npx tsx src/scripts/backfill-entity-embeddings.ts
//
// 独立进程直接运行，无需 server.ts / singleton 预初始化。
// 参照 backfill-people-content-entity.ts 模式；embedding 换用语义门控适配器：
//   provider==='local' → embed 返回 [] → 跳过写库（安全兜底）
//   provider!=='local' → coerceVec768(service.embed(text)) → 写入 content_entities.embedding
import 'dotenv/config';
import { query } from '../db/connection.js';
import {
  createPipelineDBAdapter,
  createPipelineDeps,
  createSemanticEmbeddingAdapter,
} from '../modules/meeting-notes/adapters/pipeline.js';
import { backfillEntityEmbeddings } from '../modules/content-library/scripts/backfillEntityEmbeddings.js';

async function main() {
  const db = createPipelineDBAdapter(query);
  const deps = createPipelineDeps({
    db,
    embedding: createSemanticEmbeddingAdapter(),
    experts: { invoke: async () => ({ success: false, error: 'backfill-stub' }) } as any,
    expertApplication: {
      resolveForMeetingKind: () => null,
      shouldSkipExpertAnalysis: () => false,
    } as any,
  });
  const r = await backfillEntityEmbeddings({ db: deps.db, embedding: deps.embedding });
  console.log(`[backfill-entity-embeddings] scanned=${r.scanned} embedded=${r.embedded}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
