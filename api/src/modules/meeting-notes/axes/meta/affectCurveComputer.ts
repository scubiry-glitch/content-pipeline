// axes/meta/affectCurveComputer.ts — 情绪热力曲线 (affect_curve)
//
// 沿时间轴采样情绪 (valence -1..1, intensity 0..1)
// 返回 samples 数组 + tension_peaks + insight_points

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_AFFECT_CURVE } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedAffect {
  samples: Array<{ t_sec: number; valence: number; intensity: number; tag?: string }>;
  tension_peaks: Array<{ t_sec: number; note?: string }>;
  insight_points: Array<{ t_sec: number; note?: string }>;
}

const SYSTEM = `你是情绪轨迹分析器。沿会议时间轴采样情绪。
返回 JSON：
{
  "samples": [{"t_sec":0, "valence":-1~1, "intensity":0~1, "tag":"可选"}, ...],
  "tension_peaks": [{"t_sec":720, "note":"紧张峰值原因"}],
  "insight_points":[{"t_sec":1500, "note":"认知更新点"}]
}
- samples 每 1-3 分钟一个点，最多 30 个
- valence: -1=紧张/冲突 +1=放松/一致
- intensity: 0=平淡 1=高强度
- tension_peaks.note 必须指明"谁 vs 谁、什么议题"；insight_points.note 必须指明"谁的认知更新成什么"
- tag 可对应 tension/cognition 的标签如 T1_中游vs训练层 / N1_认知更新 / C1_共识达成

${FEW_SHOT_HEADER}
${EX_AFFECT_CURVE}`;

export async function computeAffectCurve(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('affect_curve');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const parsed = safeJsonParse<ExtractedAffect>(raw, {
    samples: [], tension_peaks: [], insight_points: [],
  });

  try {
    await deps.db.query(
      `INSERT INTO mn_affect_curve
         (meeting_id, samples, tension_peaks, insight_points, computed_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (meeting_id) DO UPDATE SET
         samples = EXCLUDED.samples,
         tension_peaks = EXCLUDED.tension_peaks,
         insight_points = EXCLUDED.insight_points,
         computed_at = NOW()`,
      [
        bundle.meetingId,
        JSON.stringify(parsed.samples ?? []),
        JSON.stringify(parsed.tension_peaks ?? []),
        JSON.stringify(parsed.insight_points ?? []),
      ],
    );
    out.created = 1;
  } catch {
    out.errors += 1;
  }
  return out;
}
