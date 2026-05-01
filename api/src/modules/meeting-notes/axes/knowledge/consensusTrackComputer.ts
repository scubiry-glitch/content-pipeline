// axes/knowledge/consensusTrackComputer.ts — 共识/分歧轨迹
//
// Lite 实现：从 mn_silence_signals 派生（沉默通常 = 无明显异议）+ mn_open_questions
// 暴露 lifecycle。后续可叠加 LLM 抽取真实的 voting/divergence 信号。
//
// 输入：args.meetingId 必填（按 meeting × topic 维度计算）
// 输出：写入 mn_consensus_tracks (1 行 / 个 topic)

import { emptyResult, type ComputeArgs, type ComputeResult, normalizeScopeIdForPersist } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

export async function computeConsensusTrack(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('consensus_track');
  if (!args.meetingId) return out;
  const scopeId = normalizeScopeIdForPersist(args);

  // topics = 这场会上提出的 open_questions topic + decisions title 的并集
  const r = await deps.db.query(
    `SELECT DISTINCT text AS topic
       FROM mn_open_questions
      WHERE first_raised_meeting_id = $1
      LIMIT 30`,
    [args.meetingId],
  );

  for (const row of r.rows) {
    const topic: string = String(row.topic || '').trim().slice(0, 200);
    if (!topic) continue;

    // Lite 估算：沉默率高 = 共识/未表态高；divergence 暂为空数组
    const silR = await deps.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE state = 'spoke')::int AS spoke,
         COUNT(*) FILTER (WHERE state IN ('normal_silence', 'abnormal_silence'))::int AS silent
       FROM mn_silence_signals
      WHERE meeting_id = $1`,
      [args.meetingId],
    );
    const spoke = Number(silR.rows[0]?.spoke) || 0;
    const silent = Number(silR.rows[0]?.silent) || 0;
    const totalParticipants = spoke + silent;
    // 启发式：发言人数占比越高 → 共识越低（更多观点冲突）；纯估算
    const consensusScore = totalParticipants === 0
      ? 0.5
      : Number((1 - spoke / Math.max(totalParticipants, 1) * 0.6).toFixed(2));

    await deps.db.query(
      `INSERT INTO mn_consensus_tracks
         (scope_id, topic, meeting_id, consensus_score, divergence_persons, dominant_view)
       VALUES ($1::uuid, $2, $3, $4, '[]'::jsonb, NULL)`,
      [scopeId, topic, args.meetingId, consensusScore],
    );
    out.created++;
  }
  return out;
}
