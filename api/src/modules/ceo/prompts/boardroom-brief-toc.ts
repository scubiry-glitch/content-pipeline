// boardroom-brief-toc · 预读包目录 → ceo_briefs.toc + page_count
//
// 输入：scope concerns + 战略线 + brief metadata
// 输出：5-7 章 toc，每章 future_tagged 标志

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const TocItem = z.object({
  num: z.string().min(1).max(4),                // '01', '02', ...
  title: z.string().min(5).max(80),
  page_range: z.string().min(3).max(20),         // 'p.2-4'
  future_tagged: z.boolean(),
  source_concern_id: z.string().nullable(),
}).strict();

const Out = z.object({
  toc: z.array(TocItem).min(4).max(8),
  page_count: z.number().int().min(8).max(40),
  forward_pct: z.number().min(0).max(1),
  generated_summary: z.string().min(40).max(280),
}).strict();

type OutT = z.infer<typeof Out>;

export const boardroomBriefTocPrompt: PromptDef<OutT> = {
  axis: 'boardroom-brief-toc',
  label: 'Boardroom · 预读包目录',
  prism: 'boardroom',
  outputSchema: Out,
  maxTokens: 1800,
  temperature: 0.5,

  systemPrompt: () =>
    `你是 CEO 的董事会预读包编辑。基于本季董事关切 + 战略线 + 决策草稿，编出 5-7 章 toc。
要求：
- 每章 num 用 '01'/'02'... 两位数
- title 必须具体（"美租 Q2 进展 + 团队补员"，不要"业务情况汇报"），≤40 字
- page_range 格式 "p.2-4"，连续覆盖 page_count
- future_tagged=true 表示该章是"未来动作 / 预先打底"型，否则是回顾型
- 整本预读包 forward_pct = future_tagged 章节页数 / 总页数 ∈ [0..1]
- toc 中至少 1 章必须挂在某条 director_concern.id 上（source_concern_id 必须从我给的列表中选 UUID 字符串）
- 至少 1 章 future_tagged=true（前瞻章）
- generated_summary 一句话目录概要（≤280 字）`,

  userPrompt: (ctx) => {
    const briefStr = ctx.brief
      ? `当前 brief: ${ctx.brief.boardSession ?? '?'} v${ctx.brief.version}, 既定 ${ctx.brief.pageCount ?? '?'} 页`
      : '当前无 draft brief';
    return `Scope: ${ctx.scopeName ?? '(未命名)'}
${briefStr}

战略主线（${ctx.strategicLines.length} 条）：
${ctx.strategicLines.map((l) => `- ${l.name} (${l.kind})`).join('\n')}

近 90 天 judgments 摘录（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 18).map((j) => `- [${j.kind}] ${j.text.slice(0, 110)}`).join('\n')}

请编 5-7 章 toc。注：source_concern_id 字段我未提供具体 director_concerns 列表，可设为 null。`;
  },

  qualityChecks: [
    (out) => {
      const futureCount = out.toc.filter((t) => t.future_tagged).length;
      if (futureCount === 0) return '至少需要 1 章 future_tagged=true（前瞻章）';
      return null;
    },
    (out) => {
      // 确保 page_range 连续 / 覆盖 page_count
      const lastChapter = out.toc[out.toc.length - 1];
      const m = lastChapter.page_range.match(/p\.(\d+)-(\d+)/);
      if (m) {
        const lastPage = Number(m[2]);
        if (lastPage > out.page_count) return `page_range 最后页 ${lastPage} 超过 page_count ${out.page_count}`;
      }
      return null;
    },
    (out) => {
      // forward_pct 应该粗略匹配 future_tagged 章占比
      const futurePct = out.toc.filter((t) => t.future_tagged).length / out.toc.length;
      if (Math.abs(out.forward_pct - futurePct) > 0.5) {
        return `forward_pct ${out.forward_pct} 与 future_tagged 章占比 ${futurePct.toFixed(2)} 偏差过大`;
      }
      return null;
    },
  ],
};
