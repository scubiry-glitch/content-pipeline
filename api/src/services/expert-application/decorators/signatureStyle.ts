// Decorator H: signature_style — 用 expressionDNA + 真实文字片段作 few-shot 风格锚
// 让输出读起来"像是这位专家亲手写的"

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

const MAX_STYLE_SAMPLES = 3;
const SAMPLE_MAX_LEN = 280;

export function makeSignatureStyleDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'signature_style',
    name: '签名化表达',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const expert = ctx.experts[0];
      const dna = expert?.persona?.expressionDNA;
      const signaturePhrases = expert?.signature_phrases || [];

      const samples = await fetchStyleSamples(ctx, expert?.expert_id, MAX_STYLE_SAMPLES);

      const dnaLines = dna
        ? [
            `【表达 DNA】`,
            dna.sentencePattern ? `  句式偏好: ${dna.sentencePattern}` : '',
            dna.vocabularyPreference ? `  用词偏好: ${dna.vocabularyPreference}` : '',
            dna.certaintyCali ? `  确定性校准: ${dna.certaintyCali}` : '',
            dna.citationHabit ? `  引用习惯: ${dna.citationHabit}` : '',
          ].filter(Boolean).join('\n')
        : '';

      const signatureLine = signaturePhrases.length > 0
        ? `【你的标志性短语】${signaturePhrases.slice(0, 5).join(' / ')}`
        : '';

      const sampleBlock = samples.length > 0
        ? [
            '【你过往的文字片段（风格参考，不是内容复制）】',
            ...samples.map((s, i) => `  样本 ${i + 1}: "${truncate(s, SAMPLE_MAX_LEN)}"`),
          ].join('\n')
        : '';

      const styleBlock = [dnaLines, signatureLine, sampleBlock].filter(Boolean).join('\n\n');

      const enrichedCtx = styleBlock
        ? {
            ...ctx,
            contextHint: [
              ctx.contextHint || '',
              '',
              styleBlock,
              '',
              '要求: 输出须严格采用上述表达 DNA 与样本风格；避免使用 AI 常见的套话（如"综上所述""值得注意的是"）。',
            ].filter(Boolean).join('\n'),
          }
        : ctx;

      const innerResult = await inner.apply(enrichedCtx);

      return {
        ...innerResult,
        traces: innerResult.traces.map((t) => ({ ...t, strategy: `signature_style|${t.strategy}` })),
        meta: {
          ...innerResult.meta,
          signatureStyle: {
            dnaApplied: !!dnaLines,
            samplesUsed: samples.length,
            signaturePhraseCount: signaturePhrases.length,
          },
        },
      };
    },
  };
}

async function fetchStyleSamples(
  ctx: StrategyContext,
  expertId: string | undefined,
  limit: number,
): Promise<string[]> {
  if (!expertId) return [];
  try {
    const result = await ctx.deps.db.query(
      `SELECT summary, key_insights FROM expert_knowledge_sources
       WHERE expert_id = $1 AND (summary IS NOT NULL OR key_insights IS NOT NULL)
       LIMIT $2`,
      [expertId, limit * 2],
    );
    const samples: string[] = [];
    for (const row of result.rows || []) {
      if (row.summary) samples.push(String(row.summary));
      if (row.key_insights) {
        const parsed = typeof row.key_insights === 'string'
          ? safeJsonParse(row.key_insights)
          : row.key_insights;
        if (Array.isArray(parsed)) samples.push(...parsed.map(String));
      }
    }
    return samples.filter((s) => s.length > 30).slice(0, limit);
  } catch {
    return [];
  }
}

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
