// 用法：cd api && npx tsx src/scripts/backfill-people-content-entity.ts
//
// 前提：调用方须先调用 initMeetingNotesEngineSingleton() 完成单例初始化，
// 或通过 server.ts 入口启动后再单独运行（engine 由 server.ts 注入）。
// 若在独立进程运行，可参照 recover-mn-run-from-session.ts 使用
// createPipelineDeps / createPipelineDBAdapter 直接组装 deps。
import 'dotenv/config';
import { getMeetingNotesEngine } from '../modules/meeting-notes/singleton.js';
import { backfillPeopleContentEntity } from '../modules/meeting-notes/scripts/backfillPeopleContentEntity.js';

async function main() {
  const engine = getMeetingNotesEngine();
  const res = await backfillPeopleContentEntity(engine.deps);
  console.log(`[backfill] scanned=${res.scanned} linked=${res.linked}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
