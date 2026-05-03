// war-room-formation · 阵型快照 + gaps → ceo_formation_snapshots.formation_data
//
// 输入：scope 下的 mn_silence_signals + mn_judgments + 决策密度
// 输出：nodes / links / conflict_kinds / gaps + conflict_temp

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const Node = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(2).max(40),
  role: z.string().min(2).max(30).optional().default('team-member'),
  weight: z.number().min(0).max(1).optional().default(0.5),
}).strict();

const Link = z.object({
  source: z.string().min(1).max(40),
  target: z.string().min(1).max(40),
  kind: z.enum(['supports', 'conflicts', 'silent', 'reports']),
  temp: z.number().min(0).max(1),
}).strict();

const Gap = z.object({
  text: z.string().min(15).max(200),
  action: z.string().min(8).max(100),
  severity: z.enum(['warn', 'critical', 'info']),
}).strict();

const Out = z.object({
  nodes: z.array(Node).min(2).max(12),
  links: z.array(Link).min(1).max(20),
  conflict_kinds: z.record(z.string(), z.number().int().min(0)),
  gaps: z.array(Gap).min(2).max(6),
  conflict_temp: z.number().min(0).max(1),
}).strict();

type OutT = z.infer<typeof Out>;

export const warRoomFormationPrompt: PromptDef<OutT> = {
  axis: 'war-room-formation',
  label: 'War-Room · 阵型快照',
  prism: 'war-room',
  outputSchema: Out,
  maxTokens: 2500,
  temperature: 0.5,

  systemPrompt: () =>
    `你是 CEO 的团队动力学观察员。从近 90 天会议中抽出团队阵型：谁支持谁、谁冲突谁、谁沉默、谁汇报谁。
要求：
- nodes：参与者（CEO + 团队成员 + 关键 stakeholder），label 用真实姓名（来自 directors 列表 + judgments 中识别的人名），weight ∈ [0..1]
- links：节点间关系，kind 仅可选 supports / conflicts / silent / reports；temp ∈ [0..1] 是冲突温度
- conflict_kinds：{ "估值分歧": 3, "节奏冲突": 2 } 形式 — 关键冲突主题计数
- gaps：阵型缺口/反直觉模式，severity = warn / critical / info
  - text 必须带数据锚点（"团队连续 4 周缺少建设性反对" / "67% 决策由单人主导"）
  - action 是具体可执行动作（"安排一次反方推演"）
- conflict_temp ∈ [0..1] = links 平均 temp + 加权惩罚
- 没冲突信号时也要有 nodes（≥2）和至少 1 条 link
仅输出 JSON：{"nodes":[...], "links":[...], "conflict_kinds":{...}, "gaps":[...], "conflict_temp":0.x}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(综合)'}
团队/董事（${ctx.directors.length}）：
${ctx.directors.map((d) => `- ${d.name} (${d.role ?? '?'}, weight=${d.weight})`).join('\n')}

近 90 天 judgments（${ctx.judgments.length}）：
${ctx.judgments.slice(0, 30).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

近 90 天 commitments：
${ctx.commitments.slice(0, 10).map((c) => `- [${c.status}] ${c.text.slice(0, 100)} (owner=${c.ownerName ?? '?'})`).join('\n')}

请输出阵型快照。`,

  qualityChecks: [
    (out) => {
      // gaps 中至少 1 条 severity=warn 或 critical（不能全 info）
      const hasNonInfo = out.gaps.some((g) => g.severity !== 'info');
      if (!hasNonInfo) return 'gaps 至少 1 条 severity=warn 或 critical';
      return null;
    },
    (out) => {
      for (const g of out.gaps) {
        if (!/\d|连续|每\s*[周月]|[一二三四五六七八九十百]/.test(g.text)) {
          return `gap.text 缺数据锚点: ${g.text.slice(0, 60)}`;
        }
      }
      return null;
    },
    (out) => {
      // links 中 source / target 必须存在于 nodes
      const nodeIds = new Set(out.nodes.map((n) => n.id));
      for (const l of out.links) {
        if (!nodeIds.has(l.source)) return `link.source ${l.source} 不在 nodes 中`;
        if (!nodeIds.has(l.target)) return `link.target ${l.target} 不在 nodes 中`;
      }
      return null;
    },
  ],
};
