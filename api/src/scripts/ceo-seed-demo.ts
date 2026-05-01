/**
 * CEO 模块 demo 种子数据加载脚本
 *
 * 用法:
 *   cd api && npm run ceo:seed-demo
 *   或:
 *   tsx api/src/scripts/ceo-seed-demo.ts
 *
 * 幂等: SQL 内全部 WHERE NOT EXISTS，重复跑只补缺失行。
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';

const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'api', '.env'),
  resolve(process.cwd(), '..', '.env'),
];
for (const p of envPaths) {
  try {
    dotenv.config({ path: p });
  } catch {
    /* ignore */
  }
}

async function main() {
  // 延迟 import 让 dotenv 先加载
  const { query, ensureDbPoolConnected } = await import('../db/connection.js');
  const { ensureCeoModuleSchema } = await import('../db/ensureCeoSchema.js');

  await ensureDbPoolConnected();
  await ensureCeoModuleSchema(query);

  const candidates = [
    join(process.cwd(), 'src/modules/ceo/seeds/demo.sql'),
    join(process.cwd(), 'api/src/modules/ceo/seeds/demo.sql'),
  ];
  const path = candidates.find((p) => {
    try {
      readFileSync(p, 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  if (!path) {
    console.error('[ceo-seed-demo] cannot locate demo.sql under any of:', candidates);
    process.exit(1);
  }

  console.log(`[ceo-seed-demo] loading ${path}`);
  const sql = readFileSync(path, 'utf8');
  await query(sql);
  console.log('[ceo-seed-demo] done — see NOTICE log above for row counts');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ceo-seed-demo] failed:', err);
    process.exit(1);
  });
