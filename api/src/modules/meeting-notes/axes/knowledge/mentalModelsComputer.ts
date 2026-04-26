// axes/knowledge/mentalModelsComputer.ts — 心智模型激活 (mental_models)
//
// 识别会议中被激活的心智模型 + 是否正确使用

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_MENTAL_MODELS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedModel {
  model_name: string;
  by?: string;
  correctly_used?: boolean;
  outcome?: string;
  confidence?: number;
}

const SYSTEM = `你是心智模型识别器。识别会议中被使用的经典心智模型（如：二阶思维、SWOT、定价金字塔、反脆弱、路径依赖、ROI 折现、成本曲线、价格歧视、规模效应、基础利率、反身性、瓶颈分析…）。
返回 JSON 数组：
[{"model_name":"模型名", "by":"使用者姓名", "correctly_used":true/false, "outcome":"应用结果摘要", "confidence":0-1}]
- 仅列被显式或强隐式调用的模型
- model_name 用常见叫法，中文或英文均可
- outcome 必须给出"模型用来论证什么具体结论"（含原文数字/对象），不要"用 X 模型分析了 Y"
- correctly_used=false 表示模型被引用但应用不到位，需要在 outcome 中说明缺什么

${FEW_SHOT_HEADER}
${EX_MENTAL_MODELS}`;

export async function computeMentalModels(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('mental_models');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(
      `DELETE FROM mn_mental_model_invocations WHERE meeting_id = $1`,
      [bundle.meetingId],
    );
  }

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const items = safeJsonParse<ExtractedModel[]>(raw, []);

  for (const item of items) {
    try {
      const byId = item.by ? await ensurePersonByName(deps, item.by) : null;
      await deps.db.query(
        `INSERT INTO mn_mental_model_invocations
           (meeting_id, model_name, invoked_by_person_id, correctly_used, outcome, confidence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [bundle.meetingId, item.model_name, byId, item.correctly_used ?? null,
         item.outcome ?? null, item.confidence ?? 0.5],
      );
      out.created += 1;
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
