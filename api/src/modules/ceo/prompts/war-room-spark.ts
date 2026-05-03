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

仅输出 JSON：{"sparks":[{tag,headline,evidence_short,why_evidence:[{text,source}],risk_text,seed_group},...]}`,

  userPrompt: (ctx) =>
    `Scope: ${ctx.scopeName ?? '(综合)'}
会议样本：
${ctx.meetings.slice(0, 12).map((m) => `- [${m.id}] ${m.title}`).join('\n')}

近 90 天 judgments：
${ctx.judgments.slice(0, 35).map((j) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}

近 90 天 commitments：
${ctx.commitments.slice(0, 12).map((c) => `- [${c.status}] ${c.text.slice(0, 120)}`).join('\n')}

请输出 5-7 张 spark 卡。`,

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
  ],
};
