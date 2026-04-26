// axes/knowledge/counterfactualsComputer.ts — 反事实 (counterfactuals)
//
// 抽取"被否决的路径"，以便 PR5 Longitudinal 去对比其 6 个月后实际走势

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_COUNTERFACTUALS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedCounterfactual {
  rejected_path: string;
  rejected_by?: string;
  tracking_note?: string;
  months_later_check?: number;
}

const SYSTEM = `你是反事实抽取器。找出"被明确否决的候选方案/路径"，以便后续跟踪其若被采纳会如何。
返回 JSON 数组：
[{"rejected_path":"被否决的方案（≤100字）", "rejected_by":"否决者姓名", "tracking_note":"值得关注的点", "months_later_check":3/6/12}]
- 仅列真正被否决的候选；纯理论假设不算
- rejected_path 必须保留原文中的具体数字/对象（如"单笔上限抬高到 8000 万"）
- tracking_note 必须给出"6/12 个月后用什么具体事实判断这条路径会被证实/证伪"

${FEW_SHOT_HEADER}
${EX_COUNTERFACTUALS}`;

export async function computeCounterfactuals(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('counterfactuals');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(
      `DELETE FROM mn_counterfactuals WHERE meeting_id = $1`,
      [bundle.meetingId],
    );
  }

  const items = await extractListOverChunks<ExtractedCounterfactual>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => (x.rejected_path ?? '').toLowerCase().slice(0, 60), statsSink: out },
  );

  for (const item of items) {
    try {
      const rejectedById = item.rejected_by ? await ensurePersonByName(deps, item.rejected_by) : null;
      const months = Math.max(1, Math.min(24, Number(item.months_later_check) || 6));
      const checkAt = new Date();
      checkAt.setMonth(checkAt.getMonth() + months);
      await deps.db.query(
        `INSERT INTO mn_counterfactuals
           (meeting_id, rejected_path, rejected_by_person_id, tracking_note,
            next_validity_check_at, current_validity)
         VALUES ($1, $2, $3, $4, $5, 'unclear')`,
        [bundle.meetingId, item.rejected_path, rejectedById, item.tracking_note ?? null, checkAt],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `path=${(item.rejected_path ?? '').slice(0, 60)}`);
    }
  }
  return out;
}
