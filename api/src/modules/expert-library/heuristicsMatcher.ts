// Heuristics Matcher — 根据输入内容激活相关的决策启发式
// 从"所有 heuristics 无差别喂 LLM"升级为"按 trigger 匹配激活最相关 1-3 条"

import type { DecisionHeuristic } from './types.js';

/**
 * 根据输入文本匹配最相关的 heuristics
 * 使用轻量关键词 + 子串评分，无需 LLM 调用，纯本地 O(n) 复杂度
 *
 * @param inputText 输入文本（task input_data）
 * @param heuristics 专家的全部决策启发式
 * @param limit 最多返回几条（默认 3）
 * @returns 按相关度降序的 heuristics 子集
 */
export function matchHeuristics(
  inputText: string,
  heuristics: DecisionHeuristic[] | undefined,
  limit: number = 3
): DecisionHeuristic[] {
  if (!heuristics || heuristics.length === 0) return [];
  if (!inputText || inputText.length === 0) return heuristics.slice(0, limit);

  const normInput = normalize(inputText);
  const inputTokens = tokenize(normInput);
  if (inputTokens.size === 0) return heuristics.slice(0, limit);

  // 为每条 heuristic 计算匹配分数
  const scored: Array<{ h: DecisionHeuristic; score: number }> = heuristics.map(h => {
    const triggerTokens = tokenize(normalize(h.trigger));
    const ruleTokens = tokenize(normalize(h.rule));

    // 核心评分：trigger 与 input 的 token 交集比例 + rule 作为次要信号
    let score = 0;

    // Trigger 直接子串匹配（整体短语优先）
    if (h.trigger && normInput.includes(normalize(h.trigger).slice(0, 10))) {
      score += 50;
    }

    // Trigger token overlap
    for (const t of triggerTokens) {
      if (t.length >= 2 && inputTokens.has(t)) score += 8;
    }

    // Rule token overlap（权重低于 trigger）
    for (const t of ruleTokens) {
      if (t.length >= 2 && inputTokens.has(t)) score += 2;
    }

    return { h, score };
  });

  // 取 score > 0 且排名前 limit 的
  const matched = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.h);

  // 如果一条都没匹配上，返回前 limit 条原始顺序（保证 prompt 总有东西）
  if (matched.length === 0) {
    return heuristics.slice(0, limit);
  }
  return matched;
}

/**
 * 文本归一化：小写、去标点、压缩空白
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 分词：中文按字符（>=2 连续字），英文按空白切分
 * 返回 token 集合（去重）
 */
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  // 英文/数字 token
  const words = text.match(/[a-z0-9]+/gi) ?? [];
  words.forEach(w => {
    if (w.length >= 2) tokens.add(w.toLowerCase());
  });
  // 中文连续 2 字 gram
  const chineseOnly = text.replace(/[^\u4e00-\u9fff]/g, '');
  for (let i = 0; i < chineseOnly.length - 1; i++) {
    tokens.add(chineseOnly.substring(i, i + 2));
  }
  // 中文单字（长度 >=1 也加入，便于关键字匹配）
  for (const ch of chineseOnly) {
    if (ch.length === 1) tokens.add(ch);
  }
  return tokens;
}
