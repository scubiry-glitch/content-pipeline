// axes/knowledge/evidenceGradingComputer.ts — 证据分级聚合 (evidence_grading)
//
// 汇总本 meeting 所有 assumptions 的 evidence_grade 分布 + 加权平均
// 这是"派生 axis"：不调用 LLM，直接从 mn_assumptions 聚合
// 因此依赖 assumptionsComputer 先跑（PR4 runEngine 会保证顺序）

import { emptyResult, type ComputeArgs, type ComputeResult } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

const WEIGHT: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };

export async function computeEvidenceGrading(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('evidence_grading');
  if (!args.meetingId) return out;

  const r = await deps.db.query(
    `SELECT evidence_grade, COUNT(*)::int AS n
       FROM mn_assumptions
      WHERE meeting_id = $1
      GROUP BY evidence_grade`,
    [args.meetingId],
  );

  const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  let total = 0;
  let weighted = 0;
  for (const row of r.rows) {
    const g = row.evidence_grade as string;
    const n = Number(row.n) || 0;
    if (dist[g] !== undefined) dist[g] = n;
    total += n;
    weighted += n * (WEIGHT[g] || 0);
  }

  const weightedScore = total === 0 ? 0 : Number((weighted / total).toFixed(2));

  await deps.db.query(
    `INSERT INTO mn_evidence_grades
       (meeting_id, dist_a, dist_b, dist_c, dist_d, weighted_score, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (meeting_id) DO UPDATE SET
       dist_a = EXCLUDED.dist_a,
       dist_b = EXCLUDED.dist_b,
       dist_c = EXCLUDED.dist_c,
       dist_d = EXCLUDED.dist_d,
       weighted_score = EXCLUDED.weighted_score,
       computed_at = NOW()`,
    [args.meetingId, dist.A, dist.B, dist.C, dist.D, weightedScore],
  );
  out.created = 1;  // 视为一行聚合写入
  return out;
}
