// Strategy B: mental_model_rotation — 心智模型逐个应用 + 汇总
// 对 expert.persona.cognition.mentalModels 每个跑一次"用 [model i] 看这件事"
// 最后一轮让专家汇总："哪些模型给出同结论？哪些冲突？"

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
  ExpertInvocationTrace,
} from '../types.js';

const MAX_MODELS_PER_ROUND = 4;

export const mentalModelRotationStrategy: ExpertApplicationStrategy = {
  id: 'mental_model_rotation',
  name: '心智模型轮询',
  requiresMultipleExperts: false,
  supportedTaskTypes: ['analysis', 'generation'],

  async apply(ctx: StrategyContext): Promise<StrategyResult> {
    const expert = ctx.experts[0];
    if (!expert) throw new Error('[mentalModelRotation] no expert in ctx.experts');

    const models = expert.persona?.cognition?.mentalModels || [];

    // 无心智模型可轮询 → 降级为 single
    if (models.length === 0) {
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
          strategy: 'mental_rotation-fallback(no-models)',
          emmPass: resp.metadata.emm_result?.passed ?? true,
          confidence: resp.metadata.confidence ?? 0,
          durationMs: Date.now() - started,
        }],
      };
    }

    const rotation = models.slice(0, MAX_MODELS_PER_ROUND);
    const traces: ExpertInvocationTrace[] = [];
    const modelOutputs: Array<{ modelName: string; content: string }> = [];

    // 逐 model 应用
    for (const model of rotation) {
      const tStart = Date.now();
      const ctxHint = [
        ctx.contextHint || '',
        `【心智模型视角】请严格用"${model.name}"这一心智模型分析本次输入。`,
        `模型描述: ${model.summary || ''}`,
        model.applicationContext ? `适用情境: ${model.applicationContext}` : '',
        `要求: 输出明确说明本模型的关键判断，不要串用其他模型。`,
      ].filter(Boolean).join('\n');

      const resp = await ctx.expertEngine.invoke({
        expert_id: expert.expert_id,
        task_type: ctx.taskType,
        input_type: 'text',
        input_data: ctx.inputData,
        context: ctxHint,
        params: ctx.params,
      });

      traces.push({
        deliverable: ctx.deliverable,
        expertId: expert.expert_id,
        invokeId: resp.metadata.invoke_id,
        strategy: 'mental_model_rotation',
        stage: `model:${model.name}`,
        emmPass: resp.metadata.emm_result?.passed ?? true,
        confidence: resp.metadata.confidence ?? 0,
        durationMs: Date.now() - tStart,
      });

      modelOutputs.push({
        modelName: model.name,
        content: resp.output.sections.map((s: any) => `### ${s.title}\n${s.content}`).join('\n\n'),
      });
    }

    // 汇总
    const synthInput = [
      '以下是你用不同心智模型对同一问题的独立分析，现在请综合：',
      '',
      ...modelOutputs.map((m) => `## 用「${m.modelName}」分析:\n${m.content}`),
      '',
      '请输出:',
      '1. 哪些心智模型给出**相同结论**（convergence）',
      '2. 哪些心智模型给出**冲突结论**（divergence）及冲突根源',
      '3. 综合判断（synthesis）：最终你的结论是什么？',
      '4. 哪个心智模型在本次场景下最适用，为什么？',
    ].join('\n');

    const tSynth = Date.now();
    const synth = await ctx.expertEngine.invoke({
      expert_id: expert.expert_id,
      task_type: 'analysis',
      input_type: 'text',
      input_data: synthInput,
      context: '你正在用自己的多种心智模型做跨模型综合。',
      params: ctx.params,
    });

    traces.push({
      deliverable: ctx.deliverable,
      expertId: expert.expert_id,
      invokeId: synth.metadata.invoke_id,
      strategy: 'mental_model_rotation',
      stage: 'synthesis',
      emmPass: synth.metadata.emm_result?.passed ?? true,
      confidence: synth.metadata.confidence ?? 0,
      durationMs: Date.now() - tSynth,
    });

    return {
      output: {
        sections: [
          ...modelOutputs.map((m) => ({
            title: `模型应用: ${m.modelName}`,
            content: m.content,
          })),
          ...synth.output.sections.map((s: any) => ({
            title: `跨模型综合 · ${s.title}`,
            content: s.content,
          })),
        ],
      },
      traces,
      meta: {
        mentalModelRotation: {
          modelsUsed: rotation.map((m) => m.name),
          synthesisInvokeId: synth.metadata.invoke_id,
        },
      },
    };
  },
};
