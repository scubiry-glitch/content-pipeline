// v7.6 会议纪要分类 — 将 (title, content) 映射到 meetingKind
//
// 设计原则：
// - 纯启发式 regex + 关键词计分，不依赖 LLM（避免在采集层引入外部调用）。
// - 5 种候选，每种有自己的"强信号"和"弱信号"。
// - Q/A 结构识别（inputProcessor.ts:135 已有同款判定，此处保持同样的正则）
//   优先级最高 —— 带明显问答块几乎肯定是访谈。
// - tie-break: 有强信号者胜；同强度取第一个声明。

import type { MeetingKind } from './expert-application/meetingKindStrategyMap.js';

export interface ClassificationResult {
  kind: MeetingKind;
  confidence: number;      // 0-1
  reason: string;          // 触发的关键词/规则（调试用）
}

const ROADSHOW_KEYWORDS = [
  '路演', '战略', '融资', 'IPO', '投资人', 'Term Sheet',
  '商业模式', '市场机会', 'pre-ipo',
];

const TECH_REVIEW_KEYWORDS = [
  '评审', '架构', '算法', '模型架构', '验收', '技术选型',
  'code review', 'design review', '压力测试', '推理延迟',
];

const INDUSTRY_RESEARCH_KEYWORDS = [
  '行业调研', '调研记录', '走访', '行业走访', '产业链',
  '产能', '市场格局', '行业分析',
];

const INTERNAL_OPS_KEYWORDS = [
  '周会', '站会', 'okr', 'OKR', '复盘', '季度回顾',
  'weekly', 'standup', 'retro', '回顾',
];

function countMatches(text: string, keywords: string[]): { hits: number; matched: string[] } {
  const matched: string[] = [];
  const lower = text.toLowerCase();
  for (const k of keywords) {
    const pat = k.toLowerCase();
    if (lower.includes(pat)) matched.push(k);
  }
  return { hits: matched.length, matched };
}

/** inputProcessor.ts:135 使用的相同判据 —— 问答块 */
function hasQAStructure(content: string): boolean {
  // Chinese 问：/答： 模式，至少两对
  const cjkPairs = (content.match(/问[：:]/g) || []).length;
  // ASCII Q: / A: 模式
  const asciiPairs = (content.match(/\bQ[：:]/gi) || []).length;
  return cjkPairs >= 2 || asciiPairs >= 2;
}

export function classifyMeeting(title: string, content: string): ClassificationResult {
  const haystack = `${title}\n${content}`;

  // Q/A 结构 —— 最高优先级
  if (hasQAStructure(content)) {
    return {
      kind: 'expert_interview',
      confidence: 0.9,
      reason: 'Q/A structure detected in body (2+ pairs)',
    };
  }

  const scores: Array<{ kind: MeetingKind; score: number; matched: string[] }> = [
    {
      kind: 'strategy_roadshow',
      ...(() => {
        const r = countMatches(haystack, ROADSHOW_KEYWORDS);
        return { score: r.hits * 2, matched: r.matched };
      })(),
    },
    {
      kind: 'tech_review',
      ...(() => {
        const r = countMatches(haystack, TECH_REVIEW_KEYWORDS);
        return { score: r.hits * 2, matched: r.matched };
      })(),
    },
    {
      kind: 'industry_research',
      ...(() => {
        const r = countMatches(haystack, INDUSTRY_RESEARCH_KEYWORDS);
        return { score: r.hits * 2, matched: r.matched };
      })(),
    },
    {
      kind: 'internal_ops',
      ...(() => {
        const r = countMatches(haystack, INTERNAL_OPS_KEYWORDS);
        // internal_ops 权重低（弱信号），避免盖过 tech_review 之类
        return { score: r.hits * 1, matched: r.matched };
      })(),
    },
  ];

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];

  if (winner.score === 0) {
    return {
      kind: 'internal_ops',
      confidence: 0.2,
      reason: 'no keyword match; defaulting to internal_ops',
    };
  }

  // 置信度：winner / (winner + runner-up) capped at 0.95
  const runnerUp = scores[1]?.score ?? 0;
  const confidence = Math.min(0.95, winner.score / (winner.score + runnerUp + 1));

  return {
    kind: winner.kind,
    confidence,
    reason: `matched keywords: ${winner.matched.join(', ')}`,
  };
}
