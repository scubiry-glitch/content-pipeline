// axes/meta/decisionQualityComputer.ts — 决策质量 5 维打分 (decision_quality)

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_DECISION_QUALITY } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedQuality {
  clarity: number;       // 0-1 ，决策目标是否清晰
  actionable: number;    // 是否有可落地的下一步
  traceable: number;     // 能否溯源到证据/假设
  falsifiable: number;   // 后续能否证伪
  aligned: number;       // 是否与项目/战略 aligned
  notes?: Record<string, string>;  // 每维短说明
}

const SYSTEM = `你是决策质量评估器。对本场会议整体做出 5 维打分（0-1）：
- clarity: 决策目标是否清晰、有限
- actionable: 是否有明确下一步与负责人
- traceable: 是否能溯源到证据/前置决策
- falsifiable: 是否能在未来用事实证伪
- aligned: 是否与项目/战略 aligned
返回 JSON 对象：
{"clarity":0.7, "actionable":0.6, "traceable":0.5, "falsifiable":0.4, "aligned":0.8, "notes":{"clarity":"短评", ...}}
- 每维必须有非空 notes，引用本会议中真实出现的依据，不要"评估通过"套话
- 分数必须能被 notes 反向解释（高分必有具体证据，低分必指出缺什么）

${FEW_SHOT_HEADER}
${EX_DECISION_QUALITY}`;

export async function computeDecisionQuality(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('decision_quality');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const parsed = safeJsonParse<ExtractedQuality>(raw, {
    clarity: 0, actionable: 0, traceable: 0, falsifiable: 0, aligned: 0,
  });

  const clamp = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
  const c = clamp(parsed.clarity);
  const a = clamp(parsed.actionable);
  const t = clamp(parsed.traceable);
  const f = clamp(parsed.falsifiable);
  const al = clamp(parsed.aligned);
  const overall = Number(((c + a + t + f + al) / 5).toFixed(2));

  try {
    await deps.db.query(
      `INSERT INTO mn_decision_quality
         (meeting_id, overall, clarity, actionable, traceable, falsifiable, aligned, notes, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
       ON CONFLICT (meeting_id) DO UPDATE SET
         overall = EXCLUDED.overall,
         clarity = EXCLUDED.clarity,
         actionable = EXCLUDED.actionable,
         traceable = EXCLUDED.traceable,
         falsifiable = EXCLUDED.falsifiable,
         aligned = EXCLUDED.aligned,
         notes = EXCLUDED.notes,
         computed_at = NOW()
       WHERE mn_decision_quality.source NOT IN ('manual_import','human_edit')`,
      [bundle.meetingId, overall, c, a, t, f, al, JSON.stringify(parsed.notes ?? {})],
    );
    out.created = 1;
  } catch {
    out.errors += 1;
  }
  return out;
}
