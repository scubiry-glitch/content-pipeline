// 用法：cd api && npx tsx src/scripts/backfill-people-content-entity.ts
//
// 独立进程直接运行，无需 server.ts / singleton 预初始化。
// 参照 recover-mn-run-from-session.ts 使用
// createPipelineDeps / createPipelineDBAdapter 直接组装 deps。
import 'dotenv/config';
import { query } from '../db/connection.js';
import {
  createPipelineDeps,
  createPipelineDBAdapter,
} from '../modules/meeting-notes/adapters/pipeline.js';
import { backfillPeopleContentEntity } from '../modules/meeting-notes/scripts/backfillPeopleContentEntity.js';

async function main() {
  const db = createPipelineDBAdapter(query);
  const deps = createPipelineDeps({
    db,
    // embedding: createPipelineDeps 默认注入 createNoopEmbeddingAdapter()
    experts: { invoke: async () => ({ success: false, error: 'backfill-stub' }) } as any,
    expertApplication: {
      resolveForMeetingKind: () => null,
      shouldSkipExpertAnalysis: () => false,
    } as any,
  });
  const res = await backfillPeopleContentEntity(deps);
  console.log(`[backfill] scanned=${res.scanned} linked=${res.linked}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
