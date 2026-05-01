// Strategy A: debate — 多专家辩论
// experts[0]/[1] 各独立分析 → experts[2] 或 senior 充当 judge 合成
// 输出 3 个 section：{ positionA, positionB, judgement }

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
  ExpertInvocationTrace,
} from '../types.js';

export const debateStrategy: ExpertApplicationStrategy = {
  id: 'debate',
  name: '多专家辩论',
  requiresMultipleExperts: true,
  supportedTaskTypes: ['analysis', 'evaluation'],

  async apply(ctx: StrategyContext): Promise<StrategyResult> {
    const expertsList = ctx.experts.filter(Boolean);
    if (expertsList.length === 0) {
      throw new Error('[debateStrategy] no experts in ctx.experts');
    }

    // 如果只有 1 个专家，降级为 single（仍记录 strategy=debate-fallback）
    if (expertsList.length === 1) {
      const started = Date.now();
      const resp = await ctx.expertEngine.invoke({
        expert_id: expertsList[0].expert_id,
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
          expertId: expertsList[0].expert_id,
          invokeId: resp.metadata.invoke_id,
          strategy: 'debate-fallback(single)',
          emmPass: resp.metadata.emm_result?.passed ?? true,
          confidence: resp.metadata.confidence ?? 0,
          durationMs: Date.now() - started,
          stage: 'solo',
        }],
      };
    }

    const traces: ExpertInvocationTrace[] = [];
    const expertA = expertsList[0];
    const expertB = expertsList[1];
    const expertJudge = expertsList[2] || expertsList[0]; // 没第 3 位就让 A 做 judge

    // Position A
    const tA = Date.now();
    const respA = await ctx.expertEngine.invoke({
      expert_id: expertA.expert_id,
      task_type: ctx.taskType,
      input_type: 'text',
      input_data: ctx.inputData,
      context: `${ctx.contextHint || ''}\n\n【辩论角色】你是正方 (Position A)，独立给出你的分析，不要揣测另一位专家会怎么说。`,
      params: ctx.params,
    });
    traces.push({
      deliverable: ctx.deliverable,
      expertId: expertA.expert_id,
      invokeId: respA.metadata.invoke_id,
      strategy: 'debate',
      stage: 'positionA',
      emmPass: respA.metadata.emm_result?.passed ?? true,
      confidence: respA.metadata.confidence ?? 0,
      durationMs: Date.now() - tA,
    });

    // Position B
    const tB = Date.now();
    const respB = await ctx.expertEngine.invoke({
      expert_id: expertB.expert_id,
      task_type: ctx.taskType,
      input_type: 'text',
      input_data: ctx.inputData,
      context: `${ctx.contextHint || ''}\n\n【辩论角色】你是反方/互补视角 (Position B)，独立给出你的分析。`,
      params: ctx.params,
    });
    traces.push({
      deliverable: ctx.deliverable,
      expertId: expertB.expert_id,
      invokeId: respB.metadata.invoke_id,
      strategy: 'debate',
      stage: 'positionB',
      emmPass: respB.metadata.emm_result?.passed ?? true,
      confidence: respB.metadata.confidence ?? 0,
      durationMs: Date.now() - tB,
    });

    // Judge
    const sectionsA = sectionsToText(respA.output.sections);
    const sectionsB = sectionsToText(respB.output.sections);
    const judgeInput = [
      '以下是两位专家对同一问题的独立分析，请作为裁判：',
      '',
      `## 正方 (${expertA.name}) 的分析:`,
      sectionsA,
      '',
      `## 反方/互补 (${expertB.name}) 的分析:`,
      sectionsB,
      '',
      '请输出你的裁判结论，明确:',
      '1. 两方**共识**（agreement）',
      '2. 两方**分歧**（disagreement）及每条分歧的性质（真分歧/定义差异/信息不对称）',
      '3. 哪一方更可信以及理由',
      '4. 仍存在的**未解难题**（residual_uncertainty）',
    ].join('\n');

    const tJ = Date.now();
    const respJudge = await ctx.expertEngine.invoke({
      expert_id: expertJudge.expert_id,
      task_type: 'analysis',
      input_type: 'text',
      input_data: judgeInput,
      context: '你现在是辩论裁判。请客观点评两位专家的分析。',
      params: ctx.params,
    });
    traces.push({
      deliverable: ctx.deliverable,
      expertId: expertJudge.expert_id,
      invokeId: respJudge.metadata.invoke_id,
      strategy: 'debate',
      stage: 'judge',
      emmPass: respJudge.metadata.emm_result?.passed ?? true,
      confidence: respJudge.metadata.confidence ?? 0,
      durationMs: Date.now() - tJ,
    });

    return {
      output: {
        sections: [
          { title: `正方 (${expertA.name})`, content: sectionsA },
          { title: `反方/互补 (${expertB.name})`, content: sectionsB },
          ...respJudge.output.sections.map((s: any) => ({
            title: `裁判 (${expertJudge.name}) · ${s.title}`,
            content: s.content,
          })),
        ],
      },
      traces,
      meta: {
        debate: {
          expertAId: expertA.expert_id,
          expertBId: expertB.expert_id,
          judgeId: expertJudge.expert_id,
        },
      },
    };
  },
};

function sectionsToText(sections: Array<{ title: string; content: string }>): string {
  return sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n');
}
