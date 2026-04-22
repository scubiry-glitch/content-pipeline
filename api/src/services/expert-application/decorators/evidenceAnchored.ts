// Decorator E: evidence_anchored — 案例锚定
// 调用 inner 前，用 knowledgeService.retrieveKnowledge 抓 3 条相似过往案例
// 注入 prompt 作 few-shot，要求"类比 + 对比"陈述

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

const TOP_K_CASES = 3;

export function makeEvidenceAnchoredDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'evidence_anchored',
    name: '案例锚定',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const expert = ctx.experts[0];
      const cases = await retrieveSimilarCases(ctx, expert?.expert_id, TOP_K_CASES);

      let enrichedCtx = ctx;
      if (cases.length > 0) {
        const anchorBlock = [
          '【你过往的相关案例】（作为分析锚点，不是必须套用，但请做类比/对比）:',
          ...cases.map((c, i) => `  案例 ${i + 1}: ${truncate(c, 300)}`),
          '',
          '要求: 分析中请明确说明"与案例 N 相似/不同在 X"，避免脱离你的过往经验空谈。',
        ].join('\n');

        enrichedCtx = {
          ...ctx,
          contextHint: [ctx.contextHint || '', anchorBlock].filter(Boolean).join('\n\n'),
        };
      }

      const innerResult = await inner.apply(enrichedCtx);

      return {
        output: innerResult.output,
        traces: innerResult.traces.map((t) => ({
          ...t,
          strategy: `evidence_anchored|${t.strategy}`,
        })),
        meta: {
          ...innerResult.meta,
          evidenceAnchored: {
            casesRetrieved: cases.length,
            expertId: expert?.expert_id,
          },
        },
      };
    },
  };
}

async function retrieveSimilarCases(
  ctx: StrategyContext,
  expertId: string | undefined,
  topK: number,
): Promise<string[]> {
  if (!expertId) return [];
  try {
    const { retrieveKnowledge } = await import('../../../modules/expert-library/knowledgeService.js');
    const knowledgeText = await retrieveKnowledge(expertId, ctx.inputData, ctx.deps, topK);
    if (!knowledgeText) return [];
    // knowledgeService 返回拼接字符串；这里粗切成 N 段
    return knowledgeText
      .split(/\n\n+|\n-{3,}\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40)
      .slice(0, topK);
  } catch {
    return [];
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
