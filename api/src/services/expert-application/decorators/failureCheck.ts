// Decorator C: failure_check — 失效域自检
// 包另一个策略：跑完后追加一轮"输入是否落在失效条件里"自检
// 命中则给输出贴 out_of_competence_zone=true 标签 + confidence × 0.5

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

export function makeFailureCheckDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'failure_check',
    name: '失效域自检',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const innerResult = await inner.apply(ctx);

      const expert = ctx.experts[0];
      const failureConditions = (expert?.persona?.cognition?.mentalModels || [])
        .map((m) => m.failureCondition)
        .filter((fc): fc is string => !!fc && fc.length > 0);

      if (failureConditions.length === 0) {
        // 无失效条件可检 — pass-through
        return innerResult;
      }

      const checkInput = [
        '你刚刚的分析如下:',
        '',
        innerResult.output.sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n'),
        '',
        '你的已知失效条件是:',
        ...failureConditions.map((fc, i) => `  ${i + 1}. ${fc}`),
        '',
        '请严格自检:',
        '1. 本次输入/你的分析是否落在上述任一失效条件范围内？',
        '2. 若命中，列出命中的条件编号及理由；若未命中，明确说"未命中"。',
        '',
        '输出 JSON:',
        '{ "out_of_competence_zone": true|false, "hitConditions": [1,3], "rationale": "..." }',
      ].join('\n');

      const started = Date.now();
      const resp = await ctx.expertEngine.invoke({
        expert_id: expert.expert_id,
        task_type: 'evaluation',
        input_type: 'text',
        input_data: checkInput,
        context: '你在做失效域自检：判断自己当前分析是否落在已知不擅长的场景里。',
        params: { depth: 'quick' },
      });

      const parsed = tryParseJson(resp.output.sections.map((s: any) => s.content).join('\n'));
      const outOfZone = parsed?.out_of_competence_zone === true;

      // 追加一个 section
      const augmentedSections = [...innerResult.output.sections];
      if (outOfZone) {
        augmentedSections.push({
          title: '⚠️ 失效域自检: 命中',
          content: [
            `hit_conditions: ${JSON.stringify(parsed?.hitConditions || [])}`,
            `rationale: ${parsed?.rationale || '(LLM 未给 rationale)'}`,
            `→ 本次分析 confidence 已按 0.5 倍下调，下游请谨慎使用。`,
          ].join('\n'),
        });
      } else {
        augmentedSections.push({
          title: '✅ 失效域自检: 未命中',
          content: parsed?.rationale || '已确认输入落在专家擅长范围内。',
        });
      }

      // 调整最后一条 trace 的 confidence（整体校准）
      const adjustedTraces = innerResult.traces.map((t, i, arr) => {
        if (i === arr.length - 1 && outOfZone) {
          return { ...t, confidence: t.confidence * 0.5 };
        }
        return t;
      });

      adjustedTraces.push({
        deliverable: ctx.deliverable,
        expertId: expert.expert_id,
        invokeId: resp.metadata.invoke_id,
        strategy: 'failure_check',
        stage: 'self-check',
        emmPass: resp.metadata.emm_result?.passed ?? true,
        confidence: resp.metadata.confidence ?? 0,
        durationMs: Date.now() - started,
      });

      return {
        output: { sections: augmentedSections },
        traces: adjustedTraces,
        meta: {
          ...innerResult.meta,
          failureCheck: {
            outOfCompetenceZone: outOfZone,
            hitConditions: parsed?.hitConditions || [],
          },
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
