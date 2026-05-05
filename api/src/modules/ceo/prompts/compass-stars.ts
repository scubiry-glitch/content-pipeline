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
  maxTokens: 3500,
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

战略线候选必须基于以下脊柱（按优先级）：
1. **议题谱系**（mn_topic_lineage）— 跨多次会议反复出现且 health=alive 的 topic，
   说明这是组织还在主动思考的重要议题。每条 alive 谱系都必须被某条战略线覆盖
   （任何 kind 都行）：
   * 正向语义的 topic（"X 增长"/"Y 提升"）→ 适合做 main / branch
   * 问题语义的 topic（"X 难做"/"Y 不清晰"）→ 适合做 branch（如已有方案）或
     drift（如方案分散/资源错配）
   关键: **每条 alive topic 在最终 stars 列表里至少出现 1 次**，否则就是漏掉了
   组织真正在意的事情。
2. **共识轨迹**（mn_consensus_tracks）— consensus_score ≥ 0.7 的 topic 适合做
   main / branch；consensus_score ≤ 0.35 的"分裂主题"是 drift 的硬证据，
   生成 drift 时必须引用其中至少一条 + dominant_view 反面。
3. judgments + meetings 作为补充上下文；不要凭这两条单独发明主线。
4. 所有战略线（含 drift）的 description 必须含至少 1 个量化数据点（百分比/数量/
   时间窗），如"延迟 6 周" / "占用 47% 资源"。drift 没有数字 = 偷懒。

仅输出 JSON：{"stars":[{name,kind,description,alignment_score,evidence_meetings:[{meeting_id,title}]},...]}`,

  userPrompt: (ctx) => {
    const aliveLineages = ctx.topicLineages.filter((t) => t.healthState === 'alive');
    const lineageBlock = aliveLineages.length > 0
      ? `\n\n议题谱系（${aliveLineages.length} 条 alive，按 mention_count 降序）：\n${
          aliveLineages.slice(0, 10).map((t) => {
            const last = t.lastActiveAt ? t.lastActiveAt.slice(0, 10) : '?';
            return `- [mention=${t.mentionCount} | last=${last}] ${t.topic}`;
          }).join('\n')
        }`
      : '';
    const endangered = ctx.topicLineages.filter((t) => t.healthState === 'endangered');
    const endBlock = endangered.length > 0
      ? `\n\n濒危谱系（${endangered.length} 条 endangered，可能是 drift 的早期信号）：\n${
          endangered.slice(0, 5).map((t) => `- [mention=${t.mentionCount}] ${t.topic}`).join('\n')
        }`
      : '';
    const consensusHigh = ctx.consensusTracks.filter((c) => c.consensusScore >= 0.7);
    const consensusLow = ctx.consensusTracks.filter((c) => c.consensusScore <= 0.35);
    const consHighBlock = consensusHigh.length > 0
      ? `\n\n已高度共识主题（${consensusHigh.length}，consensus≥0.7，main/branch 候选）：\n${
          consensusHigh.slice(0, 6).map((c) => {
            const view = c.dominantView ? ` ｜ 主流观点: ${c.dominantView.slice(0, 80)}` : '';
            return `- [score=${c.consensusScore.toFixed(2)}] ${c.topic}${view}`;
          }).join('\n')
        }`
      : '';
    const consLowBlock = consensusLow.length > 0
      ? `\n\n分裂主题（${consensusLow.length}，consensus≤0.35，drift 候选 — 优先生成）：\n${
          consensusLow.slice(0, 6).map((c) => {
            const view = c.dominantView ? ` ｜ 一种说法: ${c.dominantView.slice(0, 80)}` : '';
            return `- [score=${c.consensusScore.toFixed(2)}] ${c.topic}${view}`;
          }).join('\n')
        }`
      : '';
    return `Scope: ${ctx.scopeName ?? '(未命名)'} (id: ${ctx.scopeId ?? 'null'})
本 scope 绑定会议（${ctx.meetings.length} 条）：
${meetingsBlock(ctx)}

近 90 天 judgments 摘录（${ctx.judgments.length} 条）：
${ctx.judgments.slice(0, 30).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}${lineageBlock}${endBlock}${consHighBlock}${consLowBlock}

请生成 5-6 条战略线（至少 1 条 main + 至少 1 条 drift）。`;
  },

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
    // 有 alive 谱系时，至少 1 条战略线 (任何 kind) 必须引用其 topic 关键词
    // 用 topic 的前 4-6 个有意义字符 (跳过括号注释) 做模糊匹配 — LLM 很少
    // 完整复制长 topic 文本，但应该用关键词。
    (out, ctx) => {
      const alive = (ctx.topicLineages ?? []).filter((t) => t.healthState === 'alive');
      if (alive.length === 0) return null;
      const fragments = alive
        .map((t) => {
          // 截掉首个括号内容 (中英双语标注), 取前 4-5 字主关键词
          const stripped = t.topic.replace(/[（(].*?[)）]/g, '').trim();
          return stripped.slice(0, 4);
        })
        .filter((f) => f.length >= 2);
      if (fragments.length === 0) return null;
      const hit = out.stars.some((s) =>
        fragments.some((f) => s.name.includes(f) || s.description.includes(f)),
      );
      if (!hit) {
        return `存在 ${alive.length} 条 alive 议题谱系 (关键词样例: ${fragments.slice(0, 4).join(' / ')})，但没有任何战略线 name/description 命中 — 漏掉了组织当下在意的事`;
      }
      return null;
    },
    // 有低共识主题（drift 候选）时，至少 1 条 drift 必须命中其 topic 关键词 (前 4 字模糊)
    (out, ctx) => {
      const low = (ctx.consensusTracks ?? []).filter((c) => c.consensusScore <= 0.35);
      if (low.length === 0) return null;
      const fragments = low
        .map((c) => c.topic.replace(/[（(].*?[)）]/g, '').trim().slice(0, 4))
        .filter((f) => f.length >= 2);
      if (fragments.length === 0) return null;
      const driftStars = out.stars.filter((s) => s.kind === 'drift');
      if (driftStars.length === 0) return null;
      const hit = driftStars.some((s) =>
        fragments.some((f) => s.name.includes(f) || s.description.includes(f)),
      );
      if (!hit) {
        return `存在 ${low.length} 条分裂主题 (关键词样例: ${fragments.slice(0, 3).join(' / ')})，但没有任何 drift 战略线引用`;
      }
      return null;
    },
  ],
};
