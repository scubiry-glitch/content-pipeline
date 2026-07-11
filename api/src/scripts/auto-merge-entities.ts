// CLI：content_entities embedding 双档自动合并。用法：cd api && npx tsx src/scripts/auto-merge-entities.ts
// 阈值可选环境变量覆盖：ENTITY_AUTO_MERGE_THRESHOLD(默认0.97) / ENTITY_PROPOSE_THRESHOLD(默认0.90)
import 'dotenv/config';
import { query } from '../db/connection.js';
import { createPipelineDBAdapter } from '../modules/meeting-notes/adapters/pipeline.js';
import { autoMergeContentEntities } from '../modules/content-library/consolidation/autoMergeEntities.js';

function envNum(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

async function main() {
  const db = createPipelineDBAdapter(query);
  const r = await autoMergeContentEntities({ db }, {
    autoThreshold: envNum('ENTITY_AUTO_MERGE_THRESHOLD', 0.97),
    proposeThreshold: envNum('ENTITY_PROPOSE_THRESHOLD', 0.90),
  });
  console.log(`[auto-merge-entities] scanned=${r.scanned} autoMerged=${r.autoMerged} proposed=${r.proposed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
