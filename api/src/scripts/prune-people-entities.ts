/**
 * prune-people-entities.ts — ③剪枝:按分类结果给 mn_people 打软标记(可逆,不删行)
 *
 * 读 /tmp/people-classification.json(classify-people-entities 产出),按 category 写:
 *   mn_people.metadata.person_kind = person|role|topic|section|metadata|placeholder|unclear
 *   mn_people.metadata.is_person   = false   (仅 role/topic/section/metadata 这 4 类硬 junk)
 *   mn_people.metadata.classified_at / classified_confidence 留档
 * person(272)/placeholder(270)/unclear(74) 不置 is_person=false(placeholder 单列、unclear 待人工)。
 *
 * 默认 dry-run;--apply 才写库。
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { query } from '../db/connection.js';

const IN = '/tmp/people-classification.json';
const HARD_JUNK = new Set(['role', 'topic', 'section', 'metadata']);
const STAMP = '2026-07-12';

(async () => {
  const apply = process.argv.includes('--apply');
  const data = JSON.parse(readFileSync(IN, 'utf8'));
  const labeled: Array<{ id: string; name: string; category: string; confidence: number }> = data.labeled;
  console.log(`读入 ${labeled.length} 条分类;模式=${apply ? 'APPLY(写库)' : 'DRY-RUN'}`);

  const byCat: Record<string, number> = {};
  for (const l of labeled) byCat[l.category] = (byCat[l.category] || 0) + 1;
  console.log('分类分布:', Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join('  '));
  const junk = labeled.filter((l) => HARD_JUNK.has(l.category));
  console.log(`将置 is_person=false 的硬 junk: ${junk.length}(role/topic/section/metadata)`);
  console.log(`person_kind 全量打标: ${labeled.length}`);

  if (!apply) {
    console.log('\n[dry-run] 不写库。抽样将标记的 junk:');
    console.log('  ' + junk.slice(0, 15).map((l) => `${l.name}=${l.category}`).join(' / '));
    console.log('\n加 --apply 执行写库。');
    process.exit(0);
  }

  let n = 0;
  for (const l of labeled) {
    const patch: any = { person_kind: l.category, classified_at: STAMP, classified_confidence: l.confidence };
    if (HARD_JUNK.has(l.category)) patch.is_person = false;
    await query(`UPDATE mn_people SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [l.id, JSON.stringify(patch)]);
    if (++n % 100 === 0) process.stdout.write(`  ${n}/${labeled.length}\r`);
  }
  console.log(`\n✓ 已写 ${n} 行 metadata。硬 junk 置 is_person=false: ${junk.length}`);

  // 校验
  const chk = await query(`SELECT metadata->>'person_kind' AS kind, count(*)::int n,
    count(*) FILTER (WHERE metadata->>'is_person'='false')::int junk FROM mn_people
    WHERE metadata ? 'person_kind' GROUP BY 1 ORDER BY 2 DESC`);
  console.log('库内校验(person_kind → 行数 / 其中 is_person=false):');
  for (const r of chk.rows) console.log(`  ${String(r.kind).padEnd(12)} ${r.n}  (junk ${r.junk})`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
