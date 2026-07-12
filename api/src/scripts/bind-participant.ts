/**
 * bind-participant.ts — 本场把某参会人标签(泛指如"说话人N")绑定到某花名册人物。
 * 等同 POST /meetings/:id/participants/bind:写 assets.metadata.participantOverrides[name]=personId,
 * 若该标签本场有事实则顺带重指到目标(不删源、不串场)。
 * 用法: npx tsx src/scripts/bind-participant.ts <meetingId> <参会人标签> <targetPersonId> [--apply]
 * 默认 dry-run。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';
import { reassignMeetingPerson } from '../modules/meeting-notes/review/reassignMeetingPerson.js';

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [meetingId, name, targetId] = args.filter((a) => a !== '--apply');
  if (!meetingId || !name || !targetId) {
    console.error('用法: <meetingId> <参会人标签> <targetPersonId> [--apply]');
    process.exit(1);
  }
  const tgt = await query(`SELECT canonical_name FROM mn_people WHERE id=$1`, [targetId]);
  if (tgt.rows.length === 0) { console.error('目标人物不存在'); process.exit(1); }
  const asset = await query(`SELECT title, metadata->'participantOverrides' AS ov FROM assets WHERE id::text=$1`, [meetingId]);
  if (asset.rows.length === 0) { console.error('会议(asset)不存在'); process.exit(1); }

  console.log(`会议: ${asset.rows[0].title}`);
  console.log(`绑定: 「${name}」 → 「${tgt.rows[0].canonical_name}」(${targetId})`);
  console.log(`现有 participantOverrides: ${JSON.stringify(asset.rows[0].ov)}`);
  console.log(`模式: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  if (!apply) { console.log('\n[dry-run] 加 --apply 执行。'); process.exit(0); }

  // 注:不能用 jsonb_set(m, ['participantOverrides', name], …) —— 当 participantOverrides 父键
  // 不存在时 jsonb_set 无法建两级路径会静默 no-op。改为整体重建该对象(COALESCE 空对象 || 新键)。
  await query(
    `UPDATE assets SET metadata = jsonb_set(
        COALESCE(metadata,'{}'::jsonb),
        ARRAY['participantOverrides'],
        COALESCE(metadata->'participantOverrides','{}'::jsonb) || jsonb_build_object($2::text, $3::text),
        true
      ) WHERE id::text = $1`,
    [meetingId, name, targetId]);
  const norm = name.replace(/[（(][^）)]*[)）]/g, '').trim();
  const src = await query(
    `SELECT id FROM mn_people WHERE (canonical_name=$1 OR $1=ANY(aliases) OR canonical_name=$2 OR $2=ANY(aliases)) AND id<>$3 LIMIT 1`,
    [name, norm, targetId]);
  let reassigned: any = null;
  if (src.rows.length > 0) {
    try { reassigned = await reassignMeetingPerson({ query } as any, meetingId, src.rows[0].id, targetId); }
    catch (e: any) { console.log('本场重指(非致命)跳过:', e.message); }
  }
  const v = await query(`SELECT metadata->'participantOverrides' AS ov FROM assets WHERE id::text=$1`, [meetingId]);
  console.log(`\n✓ 完成。participantOverrides = ${JSON.stringify(v.rows[0].ov)}`);
  console.log(`本场事实重指: ${JSON.stringify(reassigned)}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
