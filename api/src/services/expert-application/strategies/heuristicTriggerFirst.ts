// Strategy L: heuristic_trigger_first — 按 trigger 关键词扫描输入，只激活命中的启发式
// 替代 Phase 3 "top-3 启发式" 的仪式化选法

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';
import type { DecisionHeuristic } from '../../../modules/expert-library/types.js';

export const heuristicTriggerFirstStrategy: ExpertApplicationStrategy = {
  id: 'heuristic_trigger_first',
  name: '启发式触发优先',
  requiresMultipleExperts: false,
  supportedTaskTypes: ['analysis', 'evaluation', 'generation'],

  async apply(ctx: StrategyContext): Promise<StrategyResult> {
    const expert = ctx.experts[0];
    if (!expert) throw new Error('[heuristicTriggerFirst] no expert in ctx.experts');

    const heuristics = expert.persona?.cognition?.heuristics || [];
    const matched = matchHeuristicsByTrigger(heuristics, ctx.inputData);

    const ctxHint = matched.length > 0
      ? [
          ctx.contextHint || '',
          '【触发的决策启发式】本次输入命中你以下启发式，请严格应用:',
          ...matched.map((h, i) => `  ${i + 1}. [触发: ${h.trigger}] ${h.rule}${h.example ? ` (例: ${h.example})` : ''}`),
          '',
          '要求: 分析中必须显式标注用了哪条启发式得出哪个结论。',
        ].filter(Boolean).join('\n')
      : [
          ctx.contextHint || '',
          '【启发式】本次输入未命中你任何预设启发式的 trigger，请按常规方法分析。',
        ].filter(Boolean).join('\n');

    const started = Date.now();
    const resp = await ctx.expertEngine.invoke({
      expert_id: expert.expert_id,
      task_type: ctx.taskType,
      input_type: 'text',
      input_data: ctx.inputData,
      context: ctxHint,
      params: ctx.params,
    });

    return {
      output: resp.output,
      traces: [{
        deliverable: ctx.deliverable,
        expertId: expert.expert_id,
        invokeId: resp.metadata.invoke_id,
        strategy: 'heuristic_trigger_first',
        emmPass: resp.metadata.emm_result?.passed ?? true,
        confidence: resp.metadata.confidence ?? 0,
        durationMs: Date.now() - started,
        stage: matched.length > 0 ? `triggered:${matched.length}` : 'no-trigger',
      }],
      meta: {
        heuristicsTriggered: matched.map((h) => h.rule.slice(0, 60)),
      },
    };
  },
};

/** 简单的 trigger 匹配：把 trigger 按非中英字切分成关键词，任何 keyword 出现在 inputData 即命中 */
function matchHeuristicsByTrigger(
  heuristics: DecisionHeuristic[],
  inputData: string,
): DecisionHeuristic[] {
  if (!inputData) return [];
  const text = inputData.toLowerCase();
  const matched: DecisionHeuristic[] = [];

  for (const h of heuristics) {
    if (!h.trigger) continue;
    const keywords = h.trigger
      .toLowerCase()
      .split(/[\s,，、;/|]+/)
      .filter((kw) => kw.length >= 2);
    if (keywords.length === 0) continue;
    if (keywords.some((kw) => text.includes(kw))) {
      matched.push(h);
    }
  }
  return matched;
}
