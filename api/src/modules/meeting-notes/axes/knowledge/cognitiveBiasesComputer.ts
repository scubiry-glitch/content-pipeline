// axes/knowledge/cognitiveBiasesComputer.ts — 认知偏误 (cognitive_biases)

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_COGNITIVE_BIASES } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedBias {
  bias_type: string;  // anchoring / overconfidence / confirmation / survivorship / sunk_cost / availability / hindsight ...
  where_excerpt?: string;
  by?: string;
  severity?: 'low' | 'med' | 'high';
  mitigated?: boolean;
  mitigation_strategy?: string;
}

const SYSTEM = `你是认知偏误识别器。从正文里找出典型偏误发生点。返回 JSON 数组：
[{"bias_type":"偏误英文蛇形", "where_excerpt":"≤60字片段原文", "by":"施动者", "severity":"low|med|high", "mitigated":true/false, "mitigation_strategy":"若有"}]
- 只标明显例子，不过度推断
- where_excerpt 必须是原文真实片段（≤60 字），不是概述
- mitigated=true 仅当本场会议中有人明确缓解；mitigation_strategy 写出"谁如何缓解"
- bias_type 范围：anchoring, overconfidence, confirmation, survivorship, sunk_cost, availability, hindsight, groupthink, base_rate_neglect

${FEW_SHOT_HEADER}
${EX_COGNITIVE_BIASES}`;

export async function computeCognitiveBiases(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('cognitive_biases');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(
      `DELETE FROM mn_cognitive_biases WHERE meeting_id = $1`,
      [bundle.meetingId],
    );
  }

  const items = await extractListOverChunks<ExtractedBias>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => `${(x.bias_type ?? '').toLowerCase()}|${(x.where_excerpt ?? '').slice(0, 30)}`, statsSink: out },
  );

  for (const item of items) {
    try {
      const byId = item.by ? await ensurePersonByName(deps, item.by) : null;
      const severity = ['low', 'med', 'high'].includes(item.severity || '') ? item.severity! : 'med';
      await deps.db.query(
        `INSERT INTO mn_cognitive_biases
           (meeting_id, bias_type, where_excerpt, by_person_id, severity,
            mitigated, mitigation_strategy)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          bundle.meetingId,
          item.bias_type,
          item.where_excerpt ?? null,
          byId,
          severity,
          item.mitigated ?? false,
          item.mitigation_strategy ?? null,
        ],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `bias=${item.bias_type} severity=${item.severity}`);
    }
  }
  return out;
}
