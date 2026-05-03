// compass-stars · 生成 5-6 条 scope 内的战略线（main/branch/drift）→ ceo_strategic_lines
//
// 数据锚点：scope 下 ≥5 条 meeting + 近 30 天 judgments
// 输出：每条 line 必有量化描述（数字 / 百分比 / 时间窗）与 1+ 会议引用

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';
import { requireCitations, requireLength } from './types.js';

const Star = z.object({
  name: z.string().min(2).max(40),
  kind: z.enum(['main', 'branch', 'drift']),
  description: z.string().min(20).max(220),
  alignment_score: z.number().min(0).max(1),
  evidence_meetings: z.array(z.object({
    meeting_id: z.string(),
    title: z.string(),
  })).min(1).max(5),
}).strict();

const Out = z.object({
  stars: z.array(Star).min(3).max(8),
}).strict();

type OutT = z.infer<typeof Out>;

function meetingsBlock(ctx: PromptCtx): string {
  return ctx.meetings.slice(0, 14).map((m, i) =>
    `${i + 1}. [${m.id}] ${m.title}${m.createdAt ? ` (${m.createdAt.slice(0, 10)})` : ''}`
  ).join('\n');
}

export const compassStarsPrompt: PromptDef<OutT> = {
  axis: 'compass-stars',
  label: 'Compass · 战略主线生成',
  prism: 'compass',
  outputSchema: Out,
  maxTokens: 1500,
  temperature: 0.6,
  citationDomains: ['meeting'],

  systemPrompt: () =>
    `你是 CEO 的方向参谋，负责把一堆会议拆解成 5-6 条可读、可对齐的战略线。
要求：
- 每条 line 有 name (≤20 字)、kind (main/branch/drift)、description (40-200 字)
- 必须引用 1-3 条 meeting_id 作为 evidence（仅用我提供的列表中的 ID）
- alignment_score ∈ [0..1]，main 通常 0.7-0.95，branch 0.5-0.8，drift < 0.5
- description 必须含至少一个量化数据点（百分比/数量/时间窗）
- name 要具体（"美租续约 · 三方案对齐"，不要"业务推进"）
- drift 类必含"应该…但实际…"句式
仅输出 JSON：{"stars":[{name,kind,description,alignment_score,evidence_meetings:[{meeting_id,title}]},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'} (id: ${ctx.scopeId ?? 'null'})
本 scope 绑定会议（${ctx.meetings.length} 条）：
${meetingsBlock(ctx)}

近 90 天 judgments 摘录（${ctx.judgments.length} 条）：
${ctx.judgments.slice(0, 30).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

请生成 5-6 条战略线（至少 1 条 main + 至少 1 条 drift）。`,

  qualityChecks: [
    (out) => {
      if (!out.stars.some((s) => s.kind === 'main')) return '至少需要 1 条 main 战略线';
      return null;
    },
    (out) => {
      for (const s of out.stars) {
        if (!/\d/.test(s.description)) return `战略线"${s.name}"缺少量化锚点`;
      }
      return null;
    },
    requireLength<OutT>((o) => o.stars.map((s) => s.description).join('\n'), 100, 1500),
  ],
};
