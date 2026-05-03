// compass-drift-alert · 检测 scope 下战略漂移告警 → ceo_strategic_echos (fate=refute)
//
// 已先有 compass-stars 跑过 → ctx.strategicLines 不为空时才有 line_id 可挂
// 输出：每条 alert 含 hypothesis（原计划）/ fact（实际偏离）/ fate=refute

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Alert = z.object({
  line_id: z.string().uuid(),
  line_name: z.string(),
  hypothesis_text: z.string().min(15).max(200),
  fact_text: z.string().min(15).max(300),
  severity: z.enum(['high', 'medium', 'low']),
  source_meeting_id: z.string().nullable(),
}).strict();

const Out = z.object({
  alerts: z.array(Alert).min(0).max(6),
}).strict();

type OutT = z.infer<typeof Out>;

export const compassDriftAlertPrompt: PromptDef<OutT> = {
  axis: 'compass-drift-alert',
  label: 'Compass · 战略漂移告警',
  prism: 'compass',
  outputSchema: Out,
  maxTokens: 2500,
  temperature: 0.5,

  systemPrompt: () =>
    `你是 CEO 的偏差侦察员。从一组战略线和近 90 天会议中找出"假设 vs 现实"出现明显偏离的条目。
要求：
- 每条 alert 必绑一个 line_id（仅从我给的 strategicLines 列表中选）
- hypothesis_text 写当时的"应该" / "计划要"（30-150 字）
- fact_text 写"实际却" / "事实是"（30-200 字），必须含至少一个量化数据
- severity = high (撼动核心假设) / medium (节奏失控) / low (枝节偏)
- source_meeting_id 来自我给的 meetings 列表（不要编造），无明确来源则 null
- 没找到偏离则返回 alerts: []
仅输出 JSON：{"alerts":[{line_id,line_name,hypothesis_text,fact_text,severity,source_meeting_id},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(未命名)'}
当前战略线（${ctx.strategicLines.length} 条）：
${ctx.strategicLines.map((l) => `- [${l.id}] ${l.name} (${l.kind}): ${l.description ?? ''}`).join('\n')}

近期会议（${ctx.meetings.length} 条）：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 25).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

请输出 2-4 条最值得 CEO 当晚关注的漂移。`,

  qualityChecks: [
    (out, ctx) => {
      const lineIds = new Set(ctx.strategicLines.map((l) => l.id));
      for (const a of out.alerts) {
        if (!lineIds.has(a.line_id)) return `alert.line_id ${a.line_id} 不在战略线列表内（LLM 编造）`;
      }
      return null;
    },
    (out) => {
      for (const a of out.alerts) {
        if (!/\d/.test(a.fact_text)) return `alert "${a.line_name}" fact_text 缺量化锚点`;
      }
      return null;
    },
  ],
};
