// 本场重指：把某会议里 fromId 的引用改指到 toId,只作用于该 meeting,不动其他场次、不删源。
// 用于泛指参会人(说话人N)——单场识别成某人,不代表其他场次也是同一人。
type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

// 有 (person, meeting[, key]) 复合 UNIQUE 的表：同一会议里 target 已有行会撞唯一键 → 先删源的对撞行
const UNIQUE_TABLES: Array<{ t: string; extra?: string }> = [
  { t: 'mn_role_trajectory_points', extra: 'scope_id' },
  { t: 'mn_speech_quality' },
  { t: 'mn_silence_signals', extra: 'topic_id' },
  { t: 'mn_focus_map' },
];
// 无 per-meeting 唯一键：直接 UPDATE
// 注:mn_judgments 无 meeting_id 列(用 linked_meeting_ids 数组),无法按会议重指,故不含在内
const PLAIN: Array<{ t: string; c: string }> = [
  { t: 'mn_commitments', c: 'person_id' },
  { t: 'mn_decisions', c: 'proposer_person_id' },
  { t: 'mn_assumptions', c: 'verifier_person_id' },
  { t: 'mn_mental_model_invocations', c: 'invoked_by_person_id' },
  { t: 'mn_cognitive_biases', c: 'by_person_id' },
  { t: 'mn_counterfactuals', c: 'rejected_by_person_id' },
];

export interface ReassignResult { table: string; reassigned: number; dropped: number }

export async function reassignMeetingPerson(
  db: Db, meetingId: string, fromId: string, toId: string,
): Promise<ReassignResult[]> {
  if (fromId === toId) throw Object.assign(new Error('不能重指到自己'), { code: 'SAME_ID' });
  const out: ReassignResult[] = [];

  for (const { t, extra } of UNIQUE_TABLES) {
    // 删源在本会议里与 target 撞唯一键的行(person_id 恒 NOT NULL 的 CASCADE 表)
    const keyCols = extra ? `meeting_id, COALESCE(${extra}::text,'')` : `meeting_id`;
    const del = await db.query(
      `DELETE FROM ${t} WHERE person_id=$1 AND meeting_id=$3
         AND (${keyCols}) IN (SELECT ${keyCols} FROM ${t} WHERE person_id=$2 AND meeting_id=$3)`,
      [fromId, toId, meetingId],
    );
    const upd = await db.query(
      `UPDATE ${t} SET person_id=$2 WHERE person_id=$1 AND meeting_id=$3`,
      [fromId, toId, meetingId],
    );
    out.push({ table: t, reassigned: (upd as any).rowCount ?? 0, dropped: (del as any).rowCount ?? 0 });
  }

  for (const { t, c } of PLAIN) {
    const upd = await db.query(`UPDATE ${t} SET ${c}=$2 WHERE ${c}=$1 AND meeting_id=$3`, [fromId, toId, meetingId]);
    out.push({ table: t, reassigned: (upd as any).rowCount ?? 0, dropped: 0 });
  }

  // 注:本场重指**不**把源名字并入目标 aliases。
  // 源可能是泛指(说话人N),加成全局别名会让名字解析在所有场次都错映射到目标(串场污染)。
  // 本场绑定由 metadata.participantOverrides 承载,不需要全局别名。
  return out;
}
