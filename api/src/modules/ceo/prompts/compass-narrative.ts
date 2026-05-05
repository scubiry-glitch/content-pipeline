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
    `你是 CEO 的战略秘书。基于战略主线 + 时间分配 + 现有判断 + 历史反事实（pre-mortem），写一页纸 markdown 战略叙事，作为本周/本季 brief 的开篇。
要求：
- body_md 200-1000 字 markdown，含三段：① 当前主线诊断 ② 偏离与漂移 ③ 本周 3 件决定
- 每段必含至少一个量化锚点（百分比 / 计数 / 时间窗）
- 必须引用至少 1 个具体战略线名（来自 strategicLines）
- 若输入提供了"待回看反事实"（rejectedPath，过去某次决定中拒绝的路径，跟踪期内未明确证伪/证实），② 段必须引用至少 1 条具体反事实，结构形如：
    "X 个月前我们拒绝了 [rejected_path]，跟踪至今 [发生 / 未发生 / 信号转向]，[一句事实]"
  这是为了让叙事有"对照组"，避免事后合理化
- onepager_text 单句标题（≤80 字），写得能直接当 brief 封面 hook
- decisions_needed 3-4 条本周 CEO 必须给出答复的具体决策（不是务虚 KPI）
- warning_line 一句话警示（"X 已经从 9% 升到 17%" 这种事实陈述）
- 不允许"应该 / 推荐 / 可以考虑"开头`,

  userPrompt: (ctx) => {
    const cfBlock = ctx.counterfactuals.length > 0
      ? `\n\n待回看反事实（${ctx.counterfactuals.length}，按 next_check 临近度排序）：\n${
          ctx.counterfactuals.slice(0, 8).map((c) => {
            const due = c.nextCheckAt ? new Date(c.nextCheckAt).toISOString().slice(0, 10) : '未设回看日';
            const note = c.trackingNote ? `（跟踪: ${c.trackingNote.slice(0, 80)}）` : '';
            return `- [${c.currentValidity} | next_check: ${due}] ${c.rejectedPath.slice(0, 140)}${note}`;
          }).join('\n')
        }`
      : '';
    return `Scope: ${ctx.scopeName ?? '(未命名)'}
战略主线（${ctx.strategicLines.length} 条）：
${ctx.strategicLines.map((l) => `- [${l.kind}/${l.id.slice(0, 8)}] ${l.name}: ${(l.description ?? '').slice(0, 120)}`).join('\n')}

会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id.slice(0, 8)}] ${m.title}`).join('\n')}

近 90 天 judgments（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 25).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}${cfBlock}

请输出一页纸战略叙事。`;
  },

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
    // ctx 提供了反事实时，body_md 必须命中至少 1 条 rejected_path 的关键词或 id 段
    (out, ctx) => {
      if (!ctx.counterfactuals || ctx.counterfactuals.length === 0) return null;
      // 取每条 rejected_path 的前 8 字作为可识别片段
      const fragments = ctx.counterfactuals
        .slice(0, 8)
        .map((c) => c.rejectedPath.trim().slice(0, 8))
        .filter((f) => f.length >= 4);
      if (fragments.length === 0) return null;
      const hit = fragments.some((f) => out.body_md.includes(f));
      if (!hit) {
        return `ctx 提供了 ${ctx.counterfactuals.length} 条待回看反事实，body_md 必须在"偏离与漂移"段引用其中至少 1 条（关键词命中：${fragments.slice(0, 3).join(' / ')}）`;
      }
      return null;
    },
  ],
};
