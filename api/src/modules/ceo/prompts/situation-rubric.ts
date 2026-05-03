// situation-rubric · 5 维 rubric 评分 → ceo_rubric_scores
//
// 升级现有 g2 — evidence_text 必填且必含数据锚点
// 5 维: 战略清晰 / 节奏匹配 / 沟通透明 / 流程严谨 / 回应速度

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const RUBRIC_DIMENSIONS = ['战略清晰', '节奏匹配', '沟通透明', '流程严谨', '回应速度'] as const;

const DimScore = z.object({
  dimension: z.enum(RUBRIC_DIMENSIONS),
  score: z.number().min(0).max(1),
  evidence_text: z.string().min(30).max(300),
}).strict();

const Out = z.object({
  scores: z.array(DimScore).length(5),
}).strict();

type OutT = z.infer<typeof Out>;

export const situationRubricPrompt: PromptDef<OutT> = {
  axis: 'situation-rubric',
  label: 'Situation · Rubric 5 维评分',
  prism: 'situation',
  outputSchema: Out,
  maxTokens: 1500,
  temperature: 0.4,

  systemPrompt: () =>
    `你是 CEO 视角的评分员。基于近 90 天 judgments + 会议样本，给 5 维 rubric 各打一个 0..1 分。
维度：战略清晰 / 节奏匹配 / 沟通透明 / 流程严谨 / 回应速度
要求：
- 每维 evidence_text 必含至少一个量化锚点（数字 / 时间 / 百分比 / 计数）
- evidence_text 必须直接陈述事实，不允许"建议"开头
- 不要 5 维全 0.6（避免兜底分）—— 至少 1 维 > 0.7 + 1 维 < 0.5（如果数据支持）
- 5 维必须全部输出，按上面顺序

仅输出 JSON：{"scores":[{"dimension":"...","score":0.x,"evidence_text":"..."},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
近 90 天 judgments（${ctx.judgments.length} 条）：
${ctx.judgments.slice(0, 40).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

近期会议：
${ctx.meetings.slice(0, 8).map((m) => `- ${m.title}`).join('\n')}

请打 5 维分。`,

  qualityChecks: [
    (out) => {
      if (out.scores.length !== 5) return '必须输出 5 维';
      const dims = new Set(out.scores.map((s) => s.dimension));
      if (dims.size !== 5) return '5 维不能重复';
      return null;
    },
    (out) => {
      for (const s of out.scores) {
        if (!/\d/.test(s.evidence_text)) return `${s.dimension} evidence_text 缺量化`;
      }
      return null;
    },
    (out) => {
      const all06 = out.scores.every((s) => Math.abs(s.score - 0.6) < 0.05);
      if (all06) return '5 维全 0.6 = 兜底分，需要差异化';
      return null;
    },
  ],
};
