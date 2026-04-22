// Strategy: single — 现行 Round 1 行为，`expertEngine.invoke` 一次

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

export const singleStrategy: ExpertApplicationStrategy = {
  id: 'single',
  name: '单专家',
  requiresMultipleExperts: false,
  supportedTaskTypes: ['analysis', 'evaluation', 'generation'],

  async apply(ctx: StrategyContext): Promise<StrategyResult> {
    const expert = ctx.experts[0];
    if (!expert) {
      throw new Error('[singleStrategy] no expert in ctx.experts');
    }

    const started = Date.now();
    const resp = await ctx.expertEngine.invoke({
      expert_id: expert.expert_id,
      task_type: ctx.taskType,
      input_type: 'text',
      input_data: ctx.inputData,
      context: ctx.contextHint,
      params: ctx.params,
    });

    return {
      output: resp.output,
      traces: [{
        deliverable: ctx.deliverable,
        expertId: expert.expert_id,
        invokeId: resp.metadata.invoke_id,
        strategy: 'single',
        emmPass: resp.metadata.emm_result?.passed ?? true,
        confidence: resp.metadata.confidence ?? 0,
        durationMs: Date.now() - started,
      }],
      meta: {
        modelApplications: resp.metadata.model_applications,
        rubricScores: resp.metadata.rubric_scores,
      },
    };
  },
};
