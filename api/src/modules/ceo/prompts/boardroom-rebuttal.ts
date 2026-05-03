// boardroom-rebuttal · 反方演练（5 维 rubric + IF/THEN bonus）→ ceo_rebuttal_rehearsals
//
// 升级现有 g3 rebuttal — 一次生成 3 条最尖锐的攻击 + CEO 回防 + strength_score 拆解
// 5 维 rubric: 承认 / 补救 / 方法论 / 时间窗 / 触发条件 (IF-THEN)

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Rebuttal = z.object({
  attacker_name: z.string().min(2).max(40),
  attacker_role: z.string().min(2).max(30),
  attack_text: z.string().min(20).max(250),
  defense_text: z.string().min(60).max(500),
  strength_score: z.number().min(0).max(1),
  score_breakdown: z.object({
    rubric_dims_covered: z.string(),
    if_then_bonus: z.boolean(),
    rationale: z.string().min(20).max(300),
  }).strict(),
  source_meeting_id: z.string().nullable(),
}).strict();

const Out = z.object({
  rebuttals: z.array(Rebuttal).min(2).max(5),
}).strict();

type OutT = z.infer<typeof Out>;

export const boardroomRebuttalPrompt: PromptDef<OutT> = {
  axis: 'boardroom-rebuttal',
  label: 'Boardroom · 反方演练',
  prism: 'boardroom',
  outputSchema: Out,
  maxTokens: 4000,
  temperature: 0.7,

  systemPrompt: () =>
    `你是 CEO 的反方教练。基于董事画像 + 近 90 天关切 + scope 数据，演练 3 条最尖锐攻击 + CEO 回防草稿。
评分 rubric (5 维)：
  ① 承认（CEO 承认问题/前提）
  ② 补救（具体补救动作 + 量化指标）
  ③ 方法论（说明如何避免重蹈）
  ④ 时间窗（明确的 deadline / 季度精度）
  ⑤ 触发条件（IF/THEN trigger，如"若 PE 跌穿 X 则恢复…"）
  bonus: if_then_bonus = true → +0.05
  strength_score = (covered_dims/5) × 0.9 + bonus + 量化承诺加分（最多 0.05）

输出要求：
- attacker_name 必须来自我给的 directors 列表（取 name 字段，不可编人）
- attack_text 30-200 字，必含一个具体数据/事件锚点
- defense_text 100-450 字，必须含数字
- score_breakdown.rationale 需说清楚每一维是否覆盖
- 至少 1 条 strength_score < 0.6（演练弱处） + 1 条 ≥ 0.7（演练强处）
仅输出 JSON：{"rebuttals":[...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
董事画像（${ctx.directors.length} 位）：
${ctx.directors.map((d) => `- ${d.name} (${d.role ?? '?'}, weight=${d.weight})`).join('\n')}

会议样本：
${ctx.meetings.slice(0, 10).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 25).map((j) => `- [${j.kind}] ${j.text.slice(0, 110)}`).join('\n')}

请生成 3 条 rebuttal。`,

  qualityChecks: [
    (out, ctx) => {
      const names = new Set(ctx.directors.map((d) => d.name));
      for (const r of out.rebuttals) {
        if (!names.has(r.attacker_name)) {
          return `attacker_name "${r.attacker_name}" 不在 directors 列表`;
        }
      }
      return null;
    },
    (out) => {
      for (const r of out.rebuttals) {
        if (!/\d/.test(r.defense_text)) return `defense_text 缺量化锚点 (attacker=${r.attacker_name})`;
      }
      return null;
    },
    (out) => {
      const scores = out.rebuttals.map((r) => r.strength_score);
      const hasWeak = scores.some((s) => s < 0.6);
      const hasStrong = scores.some((s) => s >= 0.7);
      if (!hasWeak || !hasStrong) {
        return '至少需要 1 条 strength<0.6 + 1 条 strength≥0.7（演练梯度）';
      }
      return null;
    },
  ],
};
