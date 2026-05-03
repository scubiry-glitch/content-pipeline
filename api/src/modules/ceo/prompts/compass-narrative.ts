// compass-narrative · 战略叙事一页纸 → ceo_briefs.body_md
//
// 输入：scope strategicLines + 近期 attention 分配 + alignment_score
// 输出：200-450 字 markdown 一页纸 + 3 件该决定的事 + 1 句警告

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Out = z.object({
  body_md: z.string().min(200).max(1200),
  onepager_text: z.string().min(20).max(160),
  decisions_needed: z.array(z.string().min(10).max(120)).min(2).max(5),
  warning_line: z.string().min(15).max(160),
}).strict();

type OutT = z.infer<typeof Out>;

export const compassNarrativePrompt: PromptDef<OutT> = {
  axis: 'compass-narrative',
  label: 'Compass · 战略叙事一页纸',
  prism: 'compass',
  outputSchema: Out,
  maxTokens: 2000,
  temperature: 0.5,

  systemPrompt: () =>
    `你是 CEO 的战略秘书。基于战略主线 + 时间分配 + 现有判断，写一页纸 markdown 战略叙事，作为本周/本季 brief 的开篇。
要求：
- body_md 200-1000 字 markdown，含三段：① 当前主线诊断 ② 偏离与漂移 ③ 本周 3 件决定
- 每段必含至少一个量化锚点（百分比 / 计数 / 时间窗）
- 必须引用至少 1 个具体战略线名（来自 strategicLines）
- onepager_text 单句标题（≤80 字），写得能直接当 brief 封面 hook
- decisions_needed 3-4 条本周 CEO 必须给出答复的具体决策（不是务虚 KPI）
- warning_line 一句话警示（"X 已经从 9% 升到 17%" 这种事实陈述）
- 不允许"应该 / 推荐 / 可以考虑"开头`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
战略主线（${ctx.strategicLines.length} 条）：
${ctx.strategicLines.map((l) => `- [${l.kind}/${l.id.slice(0, 8)}] ${l.name}: ${(l.description ?? '').slice(0, 120)}`).join('\n')}

会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id.slice(0, 8)}] ${m.title}`).join('\n')}

近 90 天 judgments（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 25).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

请输出一页纸战略叙事。`,

  qualityChecks: [
    (out) => {
      if (!/\d/.test(out.body_md)) return 'body_md 缺量化锚点';
      return null;
    },
    (out) => {
      if (/^(建议|应该|推荐|可以考虑)/.test(out.body_md.trim())) {
        return 'body_md 不允许"建议/应该/推荐"开头';
      }
      return null;
    },
    (out, ctx) => {
      // body_md 应该至少提到一个战略线名
      const lineNames = ctx.strategicLines.map((l) => l.name);
      if (lineNames.length > 0 && !lineNames.some((n) => out.body_md.includes(n))) {
        return `body_md 未引用任何战略线名（应至少含 1 个: ${lineNames.slice(0, 3).join(' / ')}）`;
      }
      return null;
    },
  ],
};
