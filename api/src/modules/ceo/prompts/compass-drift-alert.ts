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

漂移的硬证据（按优先级使用）：
1. **已被推翻的反事实**（current_validity='invalid'）— 这是"决策被事实证伪"的硬信号，severity 默认 high；
   fact_text 必须引用 rejected_path 关键词
2. **概念漂移术语**（critical/high）— 这是"语义层漂移"，意味着团队对核心概念已有分歧；
   通常对应 medium severity；fact_text 须含术语本身 + 至少两种用法之一的描述
3. judgments 中的 disagreement / build 类，作为补充

仅输出 JSON：{"alerts":[{line_id,line_name,hypothesis_text,fact_text,severity,source_meeting_id},...]}`,

  userPrompt: (ctx) => {
    const invalidCFs = ctx.counterfactuals.filter((c) => c.currentValidity === 'invalid');
    const cfBlock = invalidCFs.length > 0
      ? `\n\n已推翻的反事实（${invalidCFs.length}，强烈优先生成 alert）：\n${
          invalidCFs.slice(0, 6).map((c) => {
            const mid = c.meetingId ? c.meetingId : '?';
            return `- [meeting=${mid}] 当初拒绝了: ${c.rejectedPath.slice(0, 140)}`;
          }).join('\n')
        }`
      : '';
    const driftBlock = ctx.conceptDrifts.length > 0
      ? `\n\n概念漂移术语（${ctx.conceptDrifts.length}，high/critical 优先）：\n${
          ctx.conceptDrifts.slice(0, 8).map((d) => {
            const defs = d.definitions.length > 0
              ? d.definitions.slice(0, 2).map((x) => `"${x.defText.slice(0, 70)}"`).join(' VS ')
              : '(无定义片段)';
            return `- [${d.severity}] ${d.term} ｜ ${defs}`;
          }).join('\n')
        }`
      : '';
    return `Scope: ${ctx.scopeName ?? '(未命名)'}
当前战略线（${ctx.strategicLines.length} 条）：
${ctx.strategicLines.map((l) => `- [${l.id}] ${l.name} (${l.kind}): ${l.description ?? ''}`).join('\n')}

近期会议（${ctx.meetings.length} 条）：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 25).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}${cfBlock}${driftBlock}

请输出 2-4 条最值得 CEO 当晚关注的漂移。`;
  },

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
    // 有 invalid CF 或 high/critical drift 时，alerts 不能为空（这是硬证据，不该忽略）
    (out, ctx) => {
      const invalidCount = ctx.counterfactuals?.filter((c) => c.currentValidity === 'invalid').length ?? 0;
      const highDriftCount = ctx.conceptDrifts?.filter((d) => d.severity === 'high' || d.severity === 'critical').length ?? 0;
      if ((invalidCount > 0 || highDriftCount > 0) && out.alerts.length === 0) {
        return `ctx 含 ${invalidCount} 条已推翻反事实 + ${highDriftCount} 条 high/critical 概念漂移，alerts 不能为空`;
      }
      return null;
    },
    // 当存在 high/critical drift 或 invalid CF 时，至少 1 条 alert 必须命中其中一条 evidence
    (out, ctx) => {
      const fragments: string[] = [];
      for (const c of (ctx.counterfactuals ?? [])) {
        if (c.currentValidity === 'invalid') {
          const f = c.rejectedPath.trim().slice(0, 8);
          if (f.length >= 4) fragments.push(f);
        }
      }
      for (const d of (ctx.conceptDrifts ?? [])) {
        if (d.severity === 'high' || d.severity === 'critical') {
          if (d.term && d.term.length >= 2) fragments.push(d.term);
        }
      }
      if (fragments.length === 0) return null;
      const hit = out.alerts.some((a) =>
        fragments.some((f) => a.fact_text.includes(f) || a.hypothesis_text.includes(f)),
      );
      if (!hit) {
        return `存在硬证据（${fragments.slice(0, 3).join(' / ')}），但 alerts 全部未引用 — fact_text 或 hypothesis_text 必须命中至少 1 条`;
      }
      return null;
    },
  ],
};
