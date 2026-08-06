/**
 * merge-duplicate-people.ts — 合并 person 分类里"同名重复行"(如 王林×3)。
 *
 * 只处理 metadata.person_kind='person' 且 canonical_name 完全相同的多行(高置信重复)。
 * 每簇选"引用最多(承诺/角色/发言/决策)、别名最多"的作本命(target),其余用
 *   mn_merge_people(target, source) 并入(11 张表 reassign + aliases 合并 + 删源),
 *   并顺带 merge_content_entities 收干净桥接实体(与 /people/:id/merge 端点一致)。
 *
 * 默认 dry-run;--apply 才写库。与花名册 UI 完全同一套底层函数。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';

const REF = (idp: string) =>
  `(SELECT count(*) FROM mn_commitments c WHERE c.person_id=${idp})
 + (SELECT count(*) FROM mn_role_trajectory_points r WHERE r.person_id=${idp})
 + (SELECT count(*) FROM mn_speech_quality s WHERE s.person_id=${idp})
 + (SELECT count(*) FROM mn_decisions d WHERE d.proposer_person_id=${idp})`;

(async () => {
  const apply = process.argv.includes('--apply');
  const clusters = await query(
    `SELECT canonical_name, count(*)::int n, array_agg(id::text ORDER BY id) ids,
            array_agg(DISTINCT COALESCE(org,'∅')) orgs
       FROM mn_people WHERE metadata->>'person_kind'='person'
      GROUP BY canonical_name HAVING count(*)>1
      ORDER BY n DESC, canonical_name`,
  );
  console.log(`同名重复簇: ${clusters.rows.length} 个;模式=${apply ? 'APPLY(写库)' : 'DRY-RUN'}\n`);

  let mergedRows = 0;
  for (const c of clusters.rows) {
    const ids: string[] = c.ids;
    // 每个成员的 refs / aliases 数 / content_entity_id
    const meta = await query(
      `SELECT id::text, aliases, content_entity_id::text ce, (${REF('mn_people.id')})::int refs
         FROM mn_people WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const rows = meta.rows.map((r: any) => ({ id: r.id, refs: r.refs ?? 0, aliases: (r.aliases ?? []).length, ce: r.ce ?? null }));
    rows.sort((a, b) => b.refs - a.refs || b.aliases - a.aliases || a.id.localeCompare(b.id));
    const target = rows[0];
    const sources = rows.slice(1);
    console.log(`「${c.canonical_name}」×${c.n}  org=${JSON.stringify(c.orgs)}  → 本命 ${target.id.slice(0, 8)}(refs=${target.refs},别名=${target.aliases}) ← 并入 ${sources.map((s) => s.id.slice(0, 8) + `(refs=${s.refs})`).join(', ')}`);

    if (apply) {
      for (const s of sources) {
        await query(`SELECT * FROM mn_merge_people($1::uuid, $2::uuid)`, [target.id, s.id]);
        if (target.ce && s.ce && target.ce !== s.ce) {
          try { await query(`SELECT * FROM merge_content_entities($1::uuid, $2::uuid)`, [target.ce, s.ce]); }
          catch (e: any) { console.warn(`   content_entities 收尾失败(非致命): ${e.message}`); }
        }
        mergedRows++;
      }
    }
  }

  if (!apply) {
    const totalSrc = clusters.rows.reduce((n: number, c: any) => n + (c.n - 1), 0);
    console.log(`\n[dry-run] 将合并 ${totalSrc} 行 → 消灭 ${clusters.rows.length} 簇。加 --apply 执行。`);
  } else {
    console.log(`\n✓ 已合并 ${mergedRows} 行,${clusters.rows.length} 簇收敛完毕。`);
    const left = await query(`SELECT count(*)::int n FROM (SELECT canonical_name FROM mn_people WHERE metadata->>'person_kind'='person' GROUP BY canonical_name HAVING count(*)>1) t`);
    console.log(`剩余同名重复簇: ${left.rows[0].n}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
