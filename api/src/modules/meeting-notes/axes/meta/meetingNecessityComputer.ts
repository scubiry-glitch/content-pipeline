// axes/meta/meetingNecessityComputer.ts — 必要性审计 (meeting_necessity)
//
// "本场会议能不能异步？哪段可以省？" 建议缩短时长 + 提示理由

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedNecessity {
  verdict: 'async_ok' | 'partial' | 'needed';
  suggested_duration_min?: number;
  reasons: Array<{ k: string; t: string; ratio?: number }>;
}

const SYSTEM = `你是会议必要性审计器。判断本场会议是否应该以同步会议形式进行。
返回 JSON：
{
  "verdict":"async_ok|partial|needed",
  "suggested_duration_min": 建议保留的分钟数,
  "reasons": [{"k":"async_ok_section|repeated_consensus|info_asymmetry|irreplaceable_debate", "t":"简述","ratio":0-1}]
}
- async_ok=整场可异步 / partial=部分可异步 / needed=必须同步
- ratio 是该理由占会议时长的估计`;

export async function computeMeetingNecessity(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('meeting_necessity');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const parsed = safeJsonParse<ExtractedNecessity>(raw, {
    verdict: 'needed', reasons: [],
  });

  const verdict = ['async_ok', 'partial', 'needed'].includes(parsed.verdict as any)
    ? parsed.verdict : 'needed';

  try {
    await deps.db.query(
      `INSERT INTO mn_meeting_necessity
         (meeting_id, verdict, suggested_duration_min, reasons, computed_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (meeting_id) DO UPDATE SET
         verdict = EXCLUDED.verdict,
         suggested_duration_min = EXCLUDED.suggested_duration_min,
         reasons = EXCLUDED.reasons,
         computed_at = NOW()`,
      [
        bundle.meetingId,
        verdict,
        parsed.suggested_duration_min ?? null,
        JSON.stringify(parsed.reasons ?? []),
      ],
    );
    out.created = 1;
  } catch {
    out.errors += 1;
  }
  return out;
}
