/**
 * dissociate-person-meetings.ts — 剔除某人物与所有会议的关联(清理被泛指全局合并污染的脏数据)。
 *
 * 用法: npx tsx src/scripts/dissociate-person-meetings.ts <personId> [--apply] [--drop-aliases 黄卉,X]
 * 行为(保留 mn_people 本行):
 *   - 事实表:person 列可空 → SET NULL(保留事实、去归属);非空(CASCADE 类) → DELETE 这些行。
 *   - 去掉泛指别名(说话人N/发言人/参会人/speaker) + --drop-aliases 指定的别名。
 * 默认 dry-run。⚠ 全局合并已删源行,无法还原谁是谁;本脚本只做"解除关联"，不恢复。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';

const REFS: Array<[string, string]> = [
  ['mn_commitments', 'person_id'],
  ['mn_role_trajectory_points', 'person_id'],
  ['mn_speech_quality', 'person_id'],
  ['mn_silence_signals', 'person_id'],
  ['mn_focus_map', 'person_id'],
  ['mn_decisions', 'proposer_person_id'],
  ['mn_assumptions', 'verifier_person_id'],
  ['mn_open_questions', 'owner_person_id'],
  ['mn_judgments', 'author_person_id'],
  ['mn_mental_model_invocations', 'invoked_by_person_id'],
  ['mn_cognitive_biases', 'by_person_id'],
  ['mn_counterfactuals', 'rejected_by_person_id'],
];

(async () => {
  const pid = process.argv[2];
  const apply = process.argv.includes('--apply');
  const dropArg = process.argv.find((a) => a.startsWith('--drop-aliases='));
  const dropList = dropArg ? dropArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (!pid || pid.startsWith('--')) { console.error('用法: <personId> [--apply] [--drop-aliases=黄卉,X]'); process.exit(1); }

  const who = await query(`SELECT canonical_name, aliases FROM mn_people WHERE id=$1`, [pid]);
  if (who.rows.length === 0) { console.error('人物不存在'); process.exit(1); }
  console.log(`人物: ${who.rows[0].canonical_name} (${pid})  aliases=${JSON.stringify(who.rows[0].aliases)}  模式=${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  for (const [tbl, col] of REFS) {
    const cnt = await query(`SELECT count(*)::int n FROM ${tbl} WHERE ${col}=$1`, [pid]);
    if (cnt.rows[0].n === 0) continue;
    const nul = await query(`SELECT is_nullable FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [tbl, col]);
    const canNull = nul.rows[0]?.is_nullable === 'YES';
    console.log(`  ${tbl}.${col}: ${cnt.rows[0].n} 行 → ${canNull ? 'SET NULL' : 'DELETE'}`);
    if (apply) {
      if (canNull) await query(`UPDATE ${tbl} SET ${col}=NULL WHERE ${col}=$1`, [pid]);
      else await query(`DELETE FROM ${tbl} WHERE ${col}=$1`, [pid]);
    }
  }

  console.log(`\n去别名: 泛指(说话人*/发言人/参会人/speaker)${dropList.length ? ' + 指定 ' + JSON.stringify(dropList) : ''}`);
  if (apply) {
    await query(
      `UPDATE mn_people SET aliases = (
         SELECT COALESCE(array_agg(a), '{}') FROM unnest(aliases) a
          WHERE a !~ '^(说话人|发言人|参会人|speaker)' AND a <> ALL($2::text[])
       ), updated_at = NOW() WHERE id = $1`,
      [pid, dropList],
    );
    const after = await query(`SELECT aliases FROM mn_people WHERE id=$1`, [pid]);
    console.log(`✓ 完成。剩余 aliases=${JSON.stringify(after.rows[0].aliases)}`);
  } else {
    console.log('\n[dry-run] 加 --apply 执行。');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
