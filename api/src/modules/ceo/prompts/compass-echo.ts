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
  maxTokens: 3000,
  temperature: 0.6,

  systemPrompt: () =>
    `你是跨会综合官，从战略线 + 会议中拼"原假设 ↔ 现实回响"的三元组（confirm/refute/pending）。

【硬约束 — 违反任何一条都会被判失败重新生成】
H1. 每条 echo 的 line_id 必须 verbatim 从下方 strategicLines 列表中 [id] 字段拷贝
    格式: 36 位 UUID, 形如 "af0bdfa8-00aa-487a-9374-cf7d1bb1464d"
    禁止: 改字 / 自创 / 用 line_name 当 id / 缩短 / 拼接
H2. 每条 echo 的 line_name 必须与 line_id 对应的 strategicLines 那条 name 字段一致
H3. fate 必须包含 confirm 或 refute 至少 1 条（不要全 pending）
H4. fact_text 至少 1 个数字（百分比 / 计数 / 时间窗口）
H5. 当输入提供"待回看反事实"列表时, 至少 1 条 echo 的 hypothesis_text 必须 verbatim
    包含某条反事实 rejected_path 的开头 8 个字符 (取连续片段, 不需要全文).
    例: rejected_path="继续使用传统的惩罚式管理" → hypothesis_text 含"继续使用传统的惩"
    建议把这条 echo 作为第一条, fate 根据 currentValidity 选 confirm/refute/pending

要求：
- 必须挂在我给的 strategicLines 之一（不可编 line_id）
- hypothesis_text = 假设当初是什么（30-150 字）
- fact_text = 现实表现是什么（30-250 字）+ 至少一个量化锚点
- fate: confirm（事实印证）/ refute（事实反驳）/ pending（数据不足）
- 至少 1 条 confirm + 1 条 refute（不要全 pending）
- source_meeting_id 必须从我提供的列表中取（无来源 → null）
- **优先使用我提供的"待回看反事实"作为 hypothesis_text 的原料**：
  当某条反事实的 rejected_path 与某战略线相关，把"当初拒绝走 X"作为 hypothesis，
  用近 30 天 judgments / commitments 作为 fact 来判 fate（valid 走 confirm；invalid 走 refute；信号不足 pending）
- 不要重复正在 fate=pending 的旧反事实（next_check 未到的就跳过，避免每次都生成同样的回声）
仅输出 JSON：{"echos":[{line_id,line_name,hypothesis_text,fact_text,fate,source_meeting_id},...]}`,

  userPrompt: (ctx) => {
    const cfBlock = ctx.counterfactuals.length > 0
      ? `\n\n待回看反事实（${ctx.counterfactuals.length}，next_check 临近优先）：\n${
          ctx.counterfactuals.slice(0, 10).map((c) => {
            const due = c.nextCheckAt ? new Date(c.nextCheckAt).toISOString().slice(0, 10) : '未设回看日';
            const note = c.trackingNote ? ` ｜ 跟踪: ${c.trackingNote.slice(0, 80)}` : '';
            const mid = c.meetingId ? c.meetingId : '?';
            return `- [${c.currentValidity} | due=${due} | meeting=${mid}] ${c.rejectedPath.slice(0, 140)}${note}`;
          }).join('\n')
        }\n（优先把这些作为 hypothesis 候选，匹配到对应战略线后写 echo；source_meeting_id 用 meeting= 那段）`
      : '';
    return `Scope: ${ctx.scopeName ?? '(未命名)'}
战略线：
${ctx.strategicLines.map((l) => `- [${l.id}] ${l.name} (${l.kind}): ${l.description ?? ''}`).join('\n')}

会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 30).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}${cfBlock}

请输出 4-6 条 echo。`;
  },

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
    // ctx 提供反事实时，至少 1 条 echo 的 hypothesis_text 必须命中某条 rejected_path 前 8 字
    (out, ctx) => {
      if (!ctx.counterfactuals || ctx.counterfactuals.length === 0) return null;
      const fragments = ctx.counterfactuals
        .slice(0, 10)
        .map((c) => c.rejectedPath.trim().slice(0, 8))
        .filter((f) => f.length >= 4);
      if (fragments.length === 0) return null;
      const hit = out.echos.some((e) => fragments.some((f) => e.hypothesis_text.includes(f)));
      if (!hit) {
        return `ctx 提供了 ${ctx.counterfactuals.length} 条待回看反事实，至少 1 条 echo 的 hypothesis_text 须命中其中一条（关键词：${fragments.slice(0, 3).join(' / ')}）`;
      }
      return null;
    },
  ],
};
