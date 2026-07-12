/**
 * prune-person-aliases.ts — 从某人物删掉指定的合并别名(不动本命、不动事实)。
 * 用法: npx tsx src/scripts/prune-person-aliases.ts <personId> <别名1> [别名2 ...] [--apply]
 * 默认 dry-run。别名精确匹配(区分大小写)。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [pid, ...rest] = args.filter((a) => a !== '--apply');
  const toRemove = rest.filter(Boolean);
  if (!pid || toRemove.length === 0) {
    console.error('用法: <personId> <别名1> [别名2 ...] [--apply]');
    process.exit(1);
  }
  const cur = await query(`SELECT canonical_name, aliases FROM mn_people WHERE id = $1`, [pid]);
  if (cur.rows.length === 0) { console.error('人物不存在'); process.exit(1); }
  const before: string[] = Array.isArray(cur.rows[0].aliases) ? cur.rows[0].aliases : [];
  const after = before.filter((a) => !toRemove.includes(a));
  const removed = before.filter((a) => toRemove.includes(a));
  const missing = toRemove.filter((a) => !before.includes(a));

  console.log(`人物: ${cur.rows[0].canonical_name} (${pid})  模式=${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  现有别名: ${JSON.stringify(before)}`);
  console.log(`  将删除:   ${JSON.stringify(removed)}`);
  if (missing.length) console.log(`  ⚠ 未找到(跳过): ${JSON.stringify(missing)}`);
  console.log(`  删后别名: ${JSON.stringify(after)}`);

  if (!apply) { console.log('\n[dry-run] 加 --apply 执行。'); process.exit(0); }
  if (removed.length === 0) { console.log('\n无可删别名,未改动。'); process.exit(0); }
  await query(`UPDATE mn_people SET aliases = $2::text[], updated_at = NOW() WHERE id = $1`, [pid, after]);
  console.log('\n✓ 完成。');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
