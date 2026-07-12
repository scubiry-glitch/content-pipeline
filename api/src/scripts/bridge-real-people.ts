/**
 * bridge-real-people.ts — ④桥接:把分类为真人(metadata.person_kind='person')且未桥接的
 *   mn_people 注册进 content_entities(经 EntityResolver,拿真语义 1024 向量),回填 content_entity_id。
 *
 * 只处理 person_kind='person' 且 content_entity_id IS NULL —— junk/placeholder/unclear 全排除。
 * 用真 semantic adapter(非 noop),否则向量是空的、⑤ 合并无法工作。
 * 默认 dry-run;--apply 才写。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';
import {
  createPipelineDeps,
  createPipelineDBAdapter,
  createSemanticEmbeddingAdapter,
} from '../modules/meeting-notes/adapters/pipeline.js';
import { EntityResolver } from '../modules/content-library/consolidation/entityResolver.js';

(async () => {
  const apply = process.argv.includes('--apply');
  const db = createPipelineDBAdapter(query);
  const embedding = createSemanticEmbeddingAdapter();
  const deps = createPipelineDeps({
    db, embedding,
    experts: { invoke: async () => ({ success: false, error: 'bridge-stub' }) } as any,
    expertApplication: { resolveForMeetingKind: () => null, shouldSkipExpertAnalysis: () => false } as any,
  });

  const { rows } = await query(
    `SELECT id, canonical_name, aliases FROM mn_people
      WHERE content_entity_id IS NULL AND metadata->>'person_kind' = 'person'
      ORDER BY canonical_name`,
  );
  console.log(`待桥接真人(person_kind='person' 且未桥接): ${rows.length};模式=${apply ? 'APPLY' : 'DRY-RUN'}`);
  if (!apply) {
    console.log('抽样:', rows.slice(0, 15).map((r: any) => r.canonical_name).join(' / '));
    console.log('\n加 --apply 执行。');
    process.exit(0);
  }

  const resolver = new EntityResolver(deps.db, deps.embedding);
  let linked = 0, failed = 0;
  for (const r of rows as Array<{ id: string; canonical_name: string; aliases: string[] }>) {
    try {
      const entity = await resolver.resolveAndRegister({
        canonicalName: r.canonical_name, aliases: r.aliases ?? [], entityType: 'person', metadata: {},
      });
      await query(`UPDATE mn_people SET content_entity_id = $2 WHERE id = $1`, [r.id, entity.id]);
      if (++linked % 50 === 0) process.stdout.write(`  ${linked}/${rows.length}\r`);
    } catch (e: any) { failed++; console.error(`\n桥接失败 ${r.canonical_name}: ${e.message}`); }
  }
  console.log(`\n✓ 桥接 ${linked} / 失败 ${failed}`);

  // 校验:真人桥接率 + 向量非空
  const chk = await query(`SELECT
    count(*) FILTER (WHERE metadata->>'person_kind'='person')::int persons,
    count(*) FILTER (WHERE metadata->>'person_kind'='person' AND content_entity_id IS NOT NULL)::int bridged
    FROM mn_people`);
  const vec = await query(`SELECT count(*)::int n FROM content_entities
    WHERE entity_type='person' AND embedding IS NOT NULL`);
  console.log(`真人 ${chk.rows[0].persons} / 已桥接 ${chk.rows[0].bridged};content_entities person 有向量 ${vec.rows[0].n}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
