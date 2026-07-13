/**
 * prune-dangling-person-refs.ts — 清理 axis 数组列里指向已不存在 mn_people 的悬空 person UUID。
 * 波及：mn_tensions.between_ids / mn_consensus_items.supported_by / mn_consensus_sides.by_ids。
 * 来源：花名册 ①分类→⑤合并 重建 mn_people 时换了 UUID，旧 axis 行留了旧 id（前端已兜底成
 *      「参会人」，此脚本把数据本身也清干净）。剔除用 array_remove，保留张力/共识本体。
 * 用法: npx tsx src/scripts/prune-dangling-person-refs.ts [--apply]   默认 dry-run。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';

const ARRAY_REFS: Array<[string, string]> = [
  ['mn_tensions', 'between_ids'],
  ['mn_consensus_items', 'supported_by'],
  ['mn_consensus_sides', 'by_ids'],
];

(async () => {
  const apply = process.argv.includes('--apply');
  console.log(`模式: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // 全库悬空 id（在任一数组列出现、但 mn_people 无此行）
  const dangling = await query(
    `WITH refs AS (
       SELECT DISTINCT unnest(between_ids)::text pid FROM mn_tensions
       UNION SELECT DISTINCT unnest(supported_by)::text FROM mn_consensus_items
       UNION SELECT DISTINCT unnest(by_ids)::text FROM mn_consensus_sides
     )
     SELECT r.pid FROM refs r LEFT JOIN mn_people p ON p.id::text = r.pid
      WHERE p.id IS NULL AND r.pid IS NOT NULL`);
  const ids = dangling.rows.map((r: any) => String(r.pid));
  console.log(`悬空 person id: ${ids.length}`);
  ids.forEach((x) => console.log('  ', x));
  if (ids.length === 0) { console.log('\n无需清理。'); process.exit(0); }

  for (const [tbl, col] of ARRAY_REFS) {
    const cnt = await query(
      `SELECT count(*)::int c FROM ${tbl}
        WHERE EXISTS (SELECT 1 FROM unnest(${col}) u WHERE u::text = ANY($1::text[]))`,
      [ids]);
    const rows = cnt.rows[0].c as number;
    // 剔除后会变空数组的行数（信息量提示，不删行）
    const emptied = await query(
      `SELECT count(*)::int c FROM ${tbl}
        WHERE cardinality(
          (SELECT array_agg(u) FROM unnest(${col}) u WHERE NOT (u::text = ANY($1::text[])))
        ) IS NULL
          AND EXISTS (SELECT 1 FROM unnest(${col}) u WHERE u::text = ANY($1::text[]))`,
      [ids]).catch(() => ({ rows: [{ c: 0 }] }));
    console.log(`\n${tbl}.${col}: ${rows} 行含悬空 id（其中 ${emptied.rows[0].c} 行剔除后将变空数组）`);

    if (apply && rows > 0) {
      for (const id of ids) {
        await query(`UPDATE ${tbl} SET ${col} = array_remove(${col}, $1::uuid) WHERE $1::uuid = ANY(${col})`, [id]);
      }
      console.log(`  ✓ 已 array_remove ${ids.length} 个 id`);
    }
  }
  if (!apply) console.log('\n[dry-run] 加 --apply 执行。');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
