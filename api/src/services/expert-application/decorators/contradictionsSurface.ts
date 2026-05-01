// Decorator J: contradictions_surface — 已知矛盾显式激活
// 强制专家回答"本次输入激活了你哪些已知矛盾？选哪侧？为什么"

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

export function makeContradictionsSurfaceDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'contradictions_surface',
    name: '矛盾显式化',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const innerResult = await inner.apply(ctx);
      const expert = ctx.experts[0];
      const contradictions = expert?.persona?.contradictions || [];

      if (contradictions.length === 0) {
        return {
          ...innerResult,
          meta: {
            ...innerResult.meta,
            contradictionsSurface: { applied: false, reason: 'no_contradictions' },
          },
        };
      }

      const prompt = [
        '你刚才的分析是:',
        '',
        innerResult.output.sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n'),
        '',
        '你公开声明持有以下内部矛盾:',
        ...contradictions.map((c, i) =>
          `  ${i + 1}. ${c.tension}（出现在: ${c.context}；共存方式: ${c.resolution}）`,
        ),
        '',
        '请强制回答:',
        '1. 本次输入激活了你上述哪些矛盾？（列出编号，若无列空数组）',
        '2. 对每一个激活的矛盾，你在本次分析里选择了哪一侧？为什么这次倾向这侧？',
        '3. 有没有可能另一侧更对？用一两句反驳自己。',
        '',
        '输出 JSON:',
        '{ "activated": [1,3], "positions": [{ "idx": 1, "chose": "...", "rationale": "...", "devils_advocate": "..." }] }',
      ].join('\n');

      const started = Date.now();
      const resp = await ctx.expertEngine.invoke({
        expert_id: expert.expert_id,
        task_type: 'evaluation',
        input_type: 'text',
        input_data: prompt,
        context: '你在对本次分析做"已知矛盾显式化"自省。',
        params: { depth: 'quick' },
      });

      const parsed = tryParseJson(resp.output.sections.map((s: any) => s.content).join('\n'));
      const activated = Array.isArray(parsed?.activated) ? parsed.activated : [];
      const positions = Array.isArray(parsed?.positions) ? parsed.positions : [];

      const surfaceSection = activated.length > 0
        ? {
            title: '矛盾显式化',
            content: [
              `本次分析激活的已知矛盾: ${activated.join(', ')}`,
              '',
              ...positions.map((p: any) =>
                [
                  `矛盾 #${p.idx}:`,
                  `  本次选择: ${p.chose || '(未说明)'}`,
                  `  理由: ${p.rationale || '(未说明)'}`,
                  `  反驳自己: ${p.devils_advocate || '(未说明)'}`,
                ].join('\n'),
              ),
            ].join('\n'),
          }
        : {
            title: '矛盾显式化',
            content: '本次输入未激活任何已知矛盾。',
          };

      return {
        output: {
          sections: [...innerResult.output.sections, surfaceSection],
        },
        traces: [
          ...innerResult.traces.map((t) => ({
            ...t,
            strategy: `contradictions_surface|${t.strategy}`,
          })),
          {
            deliverable: ctx.deliverable,
            expertId: expert.expert_id,
            invokeId: resp.metadata.invoke_id,
            strategy: 'contradictions_surface',
            stage: 'surface',
            emmPass: resp.metadata.emm_result?.passed ?? true,
            confidence: resp.metadata.confidence ?? 0,
            durationMs: Date.now() - started,
          },
        ],
        meta: {
          ...innerResult.meta,
          contradictionsSurface: { applied: true, activatedCount: activated.length, activated },
        },
      };
    },
  };
}

function tryParseJson(text: string): any {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
