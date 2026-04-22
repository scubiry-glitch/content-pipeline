// Decorator I: knowledge_grounded — 严格引证模式
// 每条结论必须带 [M#index] 引用到 MATERIALS 条目；无引证的被剥离

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

const MAX_MATERIALS = 5;

export function makeKnowledgeGroundedDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'knowledge_grounded',
    name: '严格引证',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const expert = ctx.experts[0];
      const materials = await fetchMaterials(ctx, expert?.expert_id, MAX_MATERIALS);

      if (materials.length === 0) {
        // 无 materials → 退化为普通调用，但在 section 末尾贴提示
        const result = await inner.apply(ctx);
        return {
          ...result,
          output: {
            sections: [
              ...result.output.sections,
              {
                title: '⚠️ 引证',
                content: '（无该专家 MATERIALS 可引证；本次输出未做严格引证检查）',
              },
            ],
          },
          meta: {
            ...result.meta,
            knowledgeGrounded: { applied: false, reason: 'no_materials' },
          },
        };
      }

      const materialBlock = [
        '【可引证的 MATERIALS】你的每个结论都必须引用至少一条，格式: [M#n]',
        ...materials.map((m, i) => `  [M#${i + 1}] ${truncate(m, 260)}`),
        '',
        '硬性要求: 输出中每个独立判断后必须跟 [M#n]。无 MATERIALS 支撑的判断请不要输出。',
      ].join('\n');

      const enrichedCtx: StrategyContext = {
        ...ctx,
        contextHint: [ctx.contextHint || '', '', materialBlock].filter(Boolean).join('\n'),
      };

      const innerResult = await inner.apply(enrichedCtx);

      // 后处理: 剥离没有 [M#n] 的段落
      const filteredSections = innerResult.output.sections.map((sec) => ({
        title: sec.title,
        content: stripUnsupportedSentences(sec.content),
      }));

      const citationCount = countCitations(filteredSections.map((s) => s.content).join('\n'));

      return {
        output: { sections: filteredSections },
        traces: innerResult.traces.map((t) => ({
          ...t,
          strategy: `knowledge_grounded|${t.strategy}`,
        })),
        meta: {
          ...innerResult.meta,
          knowledgeGrounded: {
            applied: true,
            materialsProvided: materials.length,
            citationsInOutput: citationCount,
          },
        },
      };
    },
  };
}

async function fetchMaterials(
  ctx: StrategyContext,
  expertId: string | undefined,
  limit: number,
): Promise<string[]> {
  if (!expertId) return [];
  try {
    const result = await ctx.deps.db.query(
      `SELECT title, summary FROM expert_knowledge_sources
       WHERE expert_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [expertId, limit],
    );
    return (result.rows || [])
      .map((row: any) => [row.title, row.summary].filter(Boolean).join(' — '))
      .filter((s: string) => s.length > 10);
  } catch {
    return [];
  }
}

function stripUnsupportedSentences(text: string): string {
  // 按段落切；保留含 [M#n] 的段，或 title-like 段落（长度 < 30 且无句号）
  const paragraphs = text.split(/\n\n+/);
  const kept: string[] = [];
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const hasCitation = /\[M#\d+\]/.test(trimmed);
    const isShortHeading = trimmed.length < 30 && !/[。.!?]/.test(trimmed);
    if (hasCitation || isShortHeading) kept.push(trimmed);
  }
  if (kept.length === 0) {
    // 全被剥完兜底：保留原文 + 警告
    return `${text}\n\n⚠️ [引证检查] 本段输出未发现 [M#n] 引用，信任度降级。`;
  }
  return kept.join('\n\n');
}

function countCitations(text: string): number {
  const matches = text.match(/\[M#\d+\]/g);
  return matches ? matches.length : 0;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
