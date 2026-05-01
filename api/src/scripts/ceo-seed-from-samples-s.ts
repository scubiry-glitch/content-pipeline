/**
 * 导入 docs/ceo-app-samples-s（由 npm run ceo:generate-samples-s 生成）。
 *
 * 用法: cd api && npm run ceo:seed-from-samples-s
 *       cd api && npm run ceo:seed-from-samples-s -- --dry-run
 */
import { runCeoSamplesSeed } from './ceo-seed-from-samples.js';

await runCeoSamplesSeed({
  docsFolder: 'docs/ceo-app-samples-s',
  sourceTag: 'ceo-app-samples-s',
  logPrefix: '[ceo-seed-from-samples-s]',
}).catch((err) => {
  console.error('[ceo-seed-from-samples-s] failed:', err);
  process.exit(1);
});
