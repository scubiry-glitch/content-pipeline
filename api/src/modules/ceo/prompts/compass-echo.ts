// compass-echo · 战略回响（hypothesis ↔ fact ↔ fate）→ ceo_strategic_echos
//
// 升级现有 g4 echo（runHandlers.ts:498）— 一次生成 4-6 条 echo（confirm/refute/pending）

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Echo = z.object({
  line_id: z.string().uuid(),
  line_name: z.string(),
  hypothesis_text: z.string().min(15).max(200),
  fact_text: z.string().min(15).max(300),
  fate: z.enum(['confirm', 'refute', 'pending']),
  source_meeting_id: z.string().nullable(),
}).strict();

const Out = z.object({
  echos: z.array(Echo).min(2).max(8),
}).strict();

type OutT = z.infer<typeof Out>;

export const compassEchoPrompt: PromptDef<OutT> = {
  axis: 'compass-echo',
  label: 'Compass · 战略回响',
  prism: 'compass',
  outputSchema: Out,
  maxTokens: 1500,
  temperature: 0.6,

  systemPrompt: () =>
    `你是跨会综合官，从战略线 + 会议中拼"原假设 ↔ 现实回响"的三元组（confirm/refute/pending）。
要求：
- 必须挂在我给的 strategicLines 之一（不可编 line_id）
- hypothesis_text = 假设当初是什么（30-150 字）
- fact_text = 现实表现是什么（30-250 字）+ 至少一个量化锚点
- fate: confirm（事实印证）/ refute（事实反驳）/ pending（数据不足）
- 至少 1 条 confirm + 1 条 refute（不要全 pending）
- source_meeting_id 必须从我提供的列表中取（无来源 → null）
仅输出 JSON：{"echos":[{line_id,line_name,hypothesis_text,fact_text,fate,source_meeting_id},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
战略线：
${ctx.strategicLines.map((l) => `- [${l.id}] ${l.name} (${l.kind}): ${l.description ?? ''}`).join('\n')}

会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 30).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

请输出 4-6 条 echo。`,

  qualityChecks: [
    (out, ctx) => {
      const lineIds = new Set(ctx.strategicLines.map((l) => l.id));
      for (const e of out.echos) {
        if (!lineIds.has(e.line_id)) return `echo line_id ${e.line_id} 不在战略线列表`;
      }
      return null;
    },
    (out) => {
      const fates = new Set(out.echos.map((e) => e.fate));
      if (!fates.has('confirm') && !fates.has('refute')) {
        return '至少需要 1 条 confirm 或 refute（避免全 pending）';
      }
      return null;
    },
    (out) => {
      for (const e of out.echos) {
        if (!/\d/.test(e.fact_text)) return `echo "${e.line_name}" fact_text 缺量化`;
      }
      return null;
    },
  ],
};
