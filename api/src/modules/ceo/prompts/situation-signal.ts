// situation-signal · 外部信号 + 情感分 → ceo_external_signals
//
// 输入: ceo_stakeholders + 会议中提到的外部主体
// 输出: 每个 stakeholder 1-2 条 signal_text + sentiment ∈ [-1..1]

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Signal = z.object({
  stakeholder_id: z.string().uuid(),
  stakeholder_name: z.string(),
  signal_text: z.string().min(20).max(280),
  sentiment: z.number().min(-1).max(1),
  source_url: z.string().nullable(),
  ref_asset_id: z.string().nullable(),
  source_meeting_id: z.string().nullable(),
}).strict();

const Out = z.object({
  signals: z.array(Signal).min(0).max(15),
}).strict();

type OutT = z.infer<typeof Out>;

export const situationSignalPrompt: PromptDef<OutT> = {
  axis: 'situation-signal',
  label: 'Situation · 外部信号',
  prism: 'situation',
  outputSchema: Out,
  maxTokens: 1800,
  temperature: 0.6,

  systemPrompt: () =>
    `你是 CEO 的外部雷达。从一组 stakeholders + 近期会议中找出每方的代表性信号 + 情感倾向。
要求：
- stakeholder_id 必须来自我给的 stakeholders 列表
- signal_text 必须是事实陈述：30-260 字，必含至少一个具体数字 / 引语 / 时间
- sentiment ∈ [-1..1]：-1 = 极负面 / 0 = 中性 / 1 = 极正面
- source_meeting_id 必须来自 meetings 列表，无来源 → null
- 不允许"我们应该" / "需要关注"这种 CEO 视角动作 — 只描述外部主体的态度
- 没找到该方信号则跳过该方
仅输出 JSON：{"signals":[{stakeholder_id,stakeholder_name,signal_text,sentiment,source_url,ref_asset_id,source_meeting_id},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
利益相关方（${ctx.stakeholders.length} 位）：
${ctx.stakeholders.map((s) => `- [${s.id}] ${s.name} (${s.kind}, heat=${s.heat})`).join('\n')}

会议（${ctx.meetings.length}）：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 25).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

请输出每位有信号的 stakeholder 1-2 条 signal（最多 12 条）。`,

  qualityChecks: [
    (out, ctx) => {
      const ids = new Set(ctx.stakeholders.map((s) => s.id));
      for (const s of out.signals) {
        if (!ids.has(s.stakeholder_id)) return `stakeholder_id ${s.stakeholder_id} 不在列表`;
      }
      return null;
    },
    (out) => {
      for (const s of out.signals) {
        // 接受：数字、引号（中英文）、冒号、或长度 ≥ 30 中文字符（事实陈述够实在）
        const hasAnchor = /\d|["'"":：「」『』]/.test(s.signal_text);
        const cnLen = (s.signal_text.match(/[一-鿿]/g) ?? []).length;
        if (!hasAnchor && cnLen < 30) {
          return `signal "${s.stakeholder_name}" 既无数据/引语锚点也无足够内容 (${cnLen} 中文字)`;
        }
      }
      return null;
    },
  ],
};
