// Decorator K: rubric_anchored_output — 按 rubric 维度强制结构化输出
// 把 rubrics 从 evaluation-only 推广到所有任务

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

export function makeRubricAnchoredOutputDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'rubric_anchored_output',
    name: 'Rubric 锚定',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const expert = ctx.experts[0];
      const rubrics = expert?.output_schema?.rubrics || [];

      if (rubrics.length === 0) {
        // 无 rubric → pass-through
        return {
          ...(await inner.apply(ctx)),
          meta: { rubricAnchored: { applied: false, reason: 'no_rubrics' } },
        };
      }

      const rubricBlock = [
        '【Rubric 评分维度】输出须逐维度给分和理由',
        ...rubrics.map((r: any, i: number) => {
          const lines = [`  ${i + 1}. ${r.dimension}`];
          if (Array.isArray(r.levels)) {
            for (const lvl of r.levels) {
              lines.push(`     [${lvl.score}分] ${lvl.description}`);
            }
          }
          return lines.join('\n');
        }),
        '',
        '要求: 输出末尾追加一段 JSON:',
        '{ "rubric_scores": [{ "dimension": "...", "score": N, "rationale": "..." }] }',
      ].join('\n');

      const enrichedCtx: StrategyContext = {
        ...ctx,
        contextHint: [ctx.contextHint || '', '', rubricBlock].filter(Boolean).join('\n'),
      };

      const innerResult = await inner.apply(enrichedCtx);

      // 抓 rubric_scores
      const joinedText = innerResult.output.sections.map((s) => s.content).join('\n');
      const parsedScores = extractRubricScores(joinedText);

      const rubricSection = parsedScores.length > 0
        ? {
            title: 'Rubric 评分',
            content: parsedScores
              .map((rs) => `• ${rs.dimension}: ${rs.score}/5 — ${rs.rationale}`)
              .join('\n'),
          }
        : {
            title: 'Rubric 评分',
            content: '(LLM 未按要求输出 rubric_scores JSON，请检查)',
          };

      return {
        output: {
          sections: [...innerResult.output.sections, rubricSection],
        },
        traces: innerResult.traces.map((t) => ({
          ...t,
          strategy: `rubric_anchored_output|${t.strategy}`,
        })),
        meta: {
          ...innerResult.meta,
          rubricAnchored: {
            applied: true,
            dimensionCount: rubrics.length,
            parsedScores,
          },
        },
      };
    },
  };
}

function extractRubricScores(
  text: string,
): Array<{ dimension: string; score: number; rationale: string }> {
  try {
    // 找包含 "rubric_scores" 的 JSON 片段
    const match = text.match(/\{[\s\S]*"rubric_scores"[\s\S]*?\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed?.rubric_scores)) return [];
    return parsed.rubric_scores
      .map((rs: any) => ({
        dimension: String(rs?.dimension || ''),
        score: Number(rs?.score) || 0,
        rationale: String(rs?.rationale || ''),
      }))
      .filter((rs: any) => rs.dimension && rs.rationale);
  } catch {
    return [];
  }
}
