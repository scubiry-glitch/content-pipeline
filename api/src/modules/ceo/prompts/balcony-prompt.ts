// balcony-prompt · 阳台反思 prompt 填充 → ceo_balcony_reflections.prompt
//
// 升级现有 g4-balcony-prompt — 强制"事实陈述不建议"，唤起记忆而非给意见
// 由 ceo-generate-real-content 按 (user, weekStart, prismId) 配对调用

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Out = z.object({
  prompt_text: z.string().min(60).max(300),
}).strict();

type OutT = z.infer<typeof Out>;

export const balconyPromptPrompt: PromptDef<OutT> = {
  axis: 'balcony-prompt',
  label: 'Balcony · 反思 prompt',
  prism: 'balcony',
  outputSchema: Out,
  maxTokens: 1200,
  temperature: 0.6,

  systemPrompt: () =>
    `你是 CEO 的反思教练。基于本周判断/承诺数据，写一段「事实陈述式」prompt 文本，作为反思问题的上下文。
要求：
- **必须直接陈述事实**：如"周三下午 2:14 你在陈汀发言时沉默 2 分 14 秒"
- **不允许"建议/应该/可以考虑/推荐"** 开头或出现
- 长度 80-280 字
- 必含至少一个具体时间点（年月日 / 时分 / 周次）
- 必含至少一个量化数据
- 输出纯文本（不要 markdown 标题，不要项目符号）

仅输出 JSON：{"prompt_text":"..."}`,

  userPrompt: (ctx) => {
    const reflectionQuestion = (ctx.extra?.question as string | undefined) ?? '本周你最满意 / 最遗憾的一个决定？';
    const prismId = (ctx.extra?.prismId as string | undefined) ?? 'self';
    const weekStart = (ctx.extra?.weekStart as string | undefined) ?? '本周';
    const ctxLines = [
      `本周关键判断（${ctx.judgments.length}）:`,
      ...ctx.judgments.slice(0, 10).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`),
      `本周新承诺（${ctx.commitments.length}）:`,
      ...ctx.commitments.slice(0, 10).map((c) => `- ${c.text.slice(0, 120)}${c.dueAt ? ` (due ${c.dueAt.slice(0, 10)})` : ''}`),
    ].join('\n');
    return `Prism: ${prismId}
Week: ${weekStart}
反思问题: ${reflectionQuestion}

本周数据:
${ctxLines || '(本周暂无明显信号)'}`;
  },

  qualityChecks: [
    (out) => {
      const t = out.prompt_text.trim();
      if (/^(建议|应该|推荐|可以考虑|你应该)/.test(t)) {
        return 'prompt_text 不允许"建议/应该/推荐"开头 — 要求事实陈述';
      }
      if (/建议|应该|推荐/.test(t)) {
        return 'prompt_text 含"建议/应该/推荐"字 — 要求纯事实';
      }
      return null;
    },
    (out) => {
      if (!/\d/.test(out.prompt_text)) return '缺量化锚点（时间 / 数字）';
      return null;
    },
  ],
};
