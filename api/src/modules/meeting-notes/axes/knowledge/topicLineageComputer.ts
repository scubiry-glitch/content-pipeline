// axes/knowledge/topicLineageComputer.ts — 议题谱系（出生 / 健康 / 濒危）
//
// 派生：从 mn_open_questions + mn_decisions 聚合每个 topic 的生命线。
// health_state：
//   - 30 天内被提及 → alive
//   - 30-90 天 → endangered
//   - >90 天且未 resolved/superseded → dead

import { emptyResult, type ComputeArgs, type ComputeResult, normalizeScopeIdForPersist } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

export async function computeTopicLineage(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('topic_lineage');
  const scopeId = normalizeScopeIdForPersist(args);

  // 拉所有 open_questions 当作 topic 候选
  const sql = scopeId
    ? `SELECT text AS topic, first_raised_meeting_id AS birth, last_raised_meeting_id, times_raised, status
         FROM mn_open_questions
        WHERE scope_id = $1::uuid
        LIMIT 200`
    : `SELECT text AS topic, first_raised_meeting_id AS birth, last_raised_meeting_id, times_raised, status
         FROM mn_open_questions
        LIMIT 200`;
  const params = scopeId ? [scopeId] : [];
  const r = await deps.db.query(sql, params);

  for (const row of r.rows) {
    const topic: string = String(row.topic || '').trim().slice(0, 200);
    if (!topic) continue;

    // 取最后活跃时间
    const lastR = await deps.db.query(
      `SELECT created_at FROM assets WHERE id = $1`,
      [row.last_raised_meeting_id || row.birth],
    );
    const lastActive = lastR.rows[0]?.created_at
      ? new Date(lastR.rows[0].created_at)
      : new Date();

    const ageDays = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
    let healthState: 'alive' | 'endangered' | 'dead' = 'alive';
    if (row.status === 'resolved') healthState = 'dead';  // 已解决的也归为 lifecycle 终结
    else if (ageDays > 90) healthState = 'dead';
    else if (ageDays > 30) healthState = 'endangered';

    const lineageChain = [
      { meeting_id: row.birth, role: 'birth', at: lastActive.toISOString() },
    ];

    await deps.db.query(
      `INSERT INTO mn_topic_lineage
         (scope_id, topic, birth_meeting_id, health_state, last_active_at, lineage_chain, mention_count)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5::timestamptz, $6::jsonb, $7)
       ON CONFLICT (COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), topic)
       DO UPDATE SET
         health_state = EXCLUDED.health_state,
         last_active_at = EXCLUDED.last_active_at,
         lineage_chain = EXCLUDED.lineage_chain,
         mention_count = EXCLUDED.mention_count`,
      [
        scopeId,
        topic,
        row.birth,
        healthState,
        lastActive.toISOString(),
        JSON.stringify(lineageChain),
        Number(row.times_raised) || 1,
      ],
    );
    out.created++;
  }

  return out;
}
