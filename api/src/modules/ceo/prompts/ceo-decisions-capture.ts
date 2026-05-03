// ceo-decisions-capture · CEO 决策日志 → ceo_decisions
//
// 输入：近 90 天 mn_judgments + rebuttal_rehearsals + commitments
// 输出：3-6 条 CEO 已经做或正在做的关键决策（含 options / rationale / reversibility）

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Decision = z.object({
  title: z.string().min(8).max(80),
  context: z.string().min(20).max(280),
  options: z.array(z.string().min(5).max(180)).min(2).max(5),
  chosen_option: z.string().min(5).max(180),
  rationale: z.string().min(40).max(600),
  reversibility: z.enum(['reversible', 'one_way']),
  confidence: z.number().int().min(1).max(5),
  decided_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'decided_on 必须 YYYY-MM-DD'),
}).strict();

const Out = z.object({
  decisions: z.array(Decision).min(3).max(8),
}).strict();

type OutT = z.infer<typeof Out>;

export const ceoDecisionsCapturePrompt: PromptDef<OutT> = {
  axis: 'ceo-decisions-capture',
  label: 'Decisions · 决策日志',
  prism: 'compass',  // 叙事上属于战略，挂 compass
  outputSchema: Out,
  maxTokens: 3000,
  temperature: 0.55,

  systemPrompt: () =>
    `你是 CEO 决策日志官。从近 90 天会议判断/承诺/反方演练中，抽 3-6 条 CEO 实际已做或正在做的关键决策。
要求：
- title ≤80 字，必须具体（"美租续约采用三方案 B 路径"，不要"业务推进"）
- context ≥40 字，写做决策时面对的问题 + 数据
- options 至少 2 条候选（包含 CEO 选了的 + 至少 1 条没选的）
- chosen_option 是 options 中的一条原文
- rationale ≥80 字，必须包含至少一个量化数据点 + 一个具体反方意见的处理
- reversibility = reversible / one_way（看决策回退成本）
- confidence ∈ [1..5]（1=高度不确定，5=非常笃定）
- decided_on YYYY-MM-DD 必须在过去 90 天内
- 至少 1 条 reversibility=one_way（不可逆决策必须显式标记）
- 不允许"建议/应该/推荐"开头
仅输出 JSON：{"decisions":[{title, context, options:[...], chosen_option, rationale, reversibility, confidence, decided_on}, ...]}`,

  userPrompt: (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    return `Scope: ${ctx.scopeName ?? '(综合)'}
今天: ${today}

近 90 天会议样本：
${ctx.meetings.slice(0, 10).map((m) => `- [${m.id.slice(0, 8)}/${m.createdAt?.slice(0, 10) ?? '?'}] ${m.title}`).join('\n')}

近 90 天 judgments（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 30).map((j) => `- [${j.kind}/${j.createdAt?.slice(0, 10)}] ${j.text.slice(0, 130)}`).join('\n')}

近 90 天 commitments（${ctx.commitments.length}）：
${ctx.commitments.slice(0, 12).map((c) => `- [${c.status}] ${c.text.slice(0, 100)}${c.dueAt ? ` (due ${c.dueAt.slice(0, 10)})` : ''}`).join('\n')}

请输出 3-5 条 CEO 决策。`;
  },

  qualityChecks: [
    (out) => {
      const today = Date.now();
      const ninety = 90 * 86400 * 1000;
      for (const d of out.decisions) {
        const dt = new Date(d.decided_on).getTime();
        if (Number.isNaN(dt)) return `decided_on 不可解析: ${d.decided_on}`;
        if (today - dt > ninety) return `decided_on 早于 90 天前: ${d.decided_on}`;
      }
      return null;
    },
    (out) => {
      // 至少 1 条 one_way
      const hasOneWay = out.decisions.some((d) => d.reversibility === 'one_way');
      if (!hasOneWay) return '至少 1 条 reversibility=one_way';
      return null;
    },
    (out) => {
      for (const d of out.decisions) {
        if (!/\d/.test(d.rationale)) return `rationale 缺量化锚点: ${d.title}`;
        // chosen_option 必须在 options 列表中（精确或子串匹配）
        const found = d.options.some((o) => o === d.chosen_option || o.includes(d.chosen_option) || d.chosen_option.includes(o));
        if (!found) return `chosen_option 不在 options 列表: ${d.title}`;
      }
      return null;
    },
  ],
};
