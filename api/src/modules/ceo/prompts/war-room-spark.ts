// war-room-spark · 灵光火花卡 → ceo_war_room_sparks
//
// 输入: 跨 scope 的 judgments + commitments，找"反直觉" / "二阶联结"
// 输出: 4-8 张 spark 卡（前后双面：headline + 3 条 why_evidence + 1 条 risk）

import { z } from 'zod';
import type { PromptDef, PromptCtx } from './types.js';

const WhyEvidence = z.object({
  text: z.string().min(8).max(200),
  source: z.string().nullable(),
}).strict();

const Spark = z.object({
  tag: z.string().min(2).max(40),
  headline: z.string().min(8).max(180),
  evidence_short: z.string().min(8).max(220),
  why_evidence: z.array(WhyEvidence).min(2).max(4),
  risk_text: z.string().min(12).max(240),
  seed_group: z.number().int().min(0).max(2),
}).strict();

const Out = z.object({
  sparks: z.array(Spark).min(3).max(10),
}).strict();

type OutT = z.infer<typeof Out>;

export const warRoomSparkPrompt: PromptDef<OutT> = {
  axis: 'war-room-spark',
  label: 'War-Room · 灵光火花',
  prism: 'war-room',
  outputSchema: Out,
  maxTokens: 4000,
  temperature: 0.8,

  systemPrompt: () =>
    `你是 CEO 的灵感点子手。从近 90 天数据里找"非显而易见"的 spark — 反直觉关联 / 跨项目嫁接 / 二阶机会。
每张 spark 卡是双面的：
  正面: tag (emoji + 8-15 字标签) + headline (一句话观点 + 主体) + evidence_short
  背面: why_evidence (2-4 条 evidence，每条带 source) + risk_text (一句话风险/反方提示)

要求：
- headline 不能是"X 应该 Y"，必须是"已经在发生的事 / 可触发动作的洞察"
- evidence_short 必含至少一个具体数据 / 项目名
- why_evidence 必含至少一条带 source（可以是会议名 / 数字 / 人名 / 项目名）
- risk_text 不能是空话（"需要关注" / "值得思考"）— 必须给出具体反方意见或量化条件
- 至少 3 张，最多 8 张；按 seed_group 分配（0/1/2 平均分）
- tag 格式建议: "🔮 跨项目人才嫁接" / "⚡ 节奏窗口" / "🧩 隐藏 KPI"
- 输入会提供"概念漂移术语"（每条带 usage/misuse 计数 + ✓/✗ 真实使用案例 + scope 标记）：
    * **scope 绑定的漂移术语**（ctx 标 scope=non-null）：至少 1 张 spark 必须以其为根，headline 含术语本身，
      evidence_short 直接引用至少 1 条 outcome 案例的具体内容（项目名/数字/事件）
    * **跨 scope 全局漂移**（scope=NULL）：实际使用在其他业务，仅在你判断对本 scope 真有威胁/启发时才用，
      不要为凑数硬扯
    * 优先选 misuse>0 的术语（✗ 标记的具体错用案例最有说服力）
    * 禁止编造"团队 A vs 团队 B"这种无具体来源的对照
    tag 建议用 "🧩 语义裂缝"

仅输出 JSON：{"sparks":[{tag,headline,evidence_short,why_evidence:[{text,source}],risk_text,seed_group},...]}`,

  userPrompt: (ctx) => {
    const driftBlock = ctx.conceptDrifts.length > 0
      ? `\n\n概念漂移术语（${ctx.conceptDrifts.length}；usage=总用法数, misuse=用错数；✓/✗ 是真实使用案例）：\n${
          ctx.conceptDrifts.slice(0, 8).map((d) => {
            const lines = [`- [${d.severity}] ${d.term} (usage=${d.usageCount}, misuse=${d.misuseCount})`];
            for (const u of d.usages.slice(0, 3)) {
              const tag = u.correctlyUsed ? '✓' : '✗';
              const mid = u.meetingId ? u.meetingId.slice(0, 8) : '?';
              lines.push(`    ${tag} [meeting=${mid}] ${u.outcome.slice(0, 160)}`);
            }
            return lines.join('\n');
          }).join('\n')
        }`
      : '';
    return `Scope: ${ctx.scopeName ?? '(综合)'}
会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 35).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

近 90 天 commitments：
${ctx.commitments.slice(0, 12).map((c) => `- [${c.status}] ${c.text.slice(0, 120)}`).join('\n')}${driftBlock}

请输出 5-7 张 spark 卡。`;
  },

  qualityChecks: [
    (out) => {
      for (const s of out.sparks) {
        if (/^[^A-Za-z一-鿿]*(建议|应该|推荐)/.test(s.headline.trim())) {
          return `headline 不允许"建议/应该/推荐"开头: ${s.headline}`;
        }
        // 接受：数字 / 英文字母 / 中文专名（≥3 个连续中文，含具体名词的可能性高）
        if (!/\d|[A-Za-z]|[一-鿿]{3,}/.test(s.evidence_short)) {
          return `evidence_short 缺具体锚点: ${s.headline}`;
        }
        if (s.risk_text.length < 12) return `risk_text 过短: ${s.headline}`;
      }
      return null;
    },
    (out) => {
      const groups = new Set(out.sparks.map((s) => s.seed_group));
      if (groups.size < 2) return 'seed_group 应至少分布在 2 组（0/1/2）';
      return null;
    },
    // ctx 提供了 *本 scope 绑定* 的概念漂移时，至少 1 张 spark headline 命中其 term
    // NULL-scope 全局漂移不强制 — 它们的使用案例在其他业务，强行牵入会编造
    (out, ctx) => {
      if (!ctx.conceptDrifts || ctx.conceptDrifts.length === 0) return null;
      const terms = ctx.conceptDrifts
        .filter((d) => d.scopeId !== null)
        .slice(0, 8)
        .map((d) => d.term)
        .filter((t) => t && t.length >= 2);
      if (terms.length === 0) return null;
      const hit = out.sparks.some((s) => terms.some((t) => s.headline.includes(t)));
      if (!hit) {
        return `ctx 提供了 ${terms.length} 个 scope 内概念漂移术语（${terms.slice(0, 3).join(' / ')}），至少 1 张 spark 的 headline 必须命中其中一个`;
      }
      return null;
    },
  ],
};
