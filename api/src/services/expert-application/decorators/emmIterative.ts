// Decorator D: emm_iterative — EMM 迭代修正
// 跑完后看 emm_result.passed；失败则把 veto/violations 喂回去最多 2 次重试
// 返回最佳 attempt + emm 历史

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

const MAX_RETRIES = 2;

export function makeEmmIterativeDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'emm_iterative',
    name: 'EMM 迭代',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const attempts: StrategyResult[] = [];
      let currentCtx: StrategyContext = { ...ctx };
      const history: Array<{ attempt: number; passed: boolean; violations: string[] }> = [];

      for (let i = 0; i <= MAX_RETRIES; i++) {
        const result = await inner.apply(currentCtx);
        attempts.push(result);

        // 找最后一次 invoke 的 emm 状态（从 traces 的最后一条 emmPass 读）
        const lastTrace = result.traces[result.traces.length - 1];
        const passed = lastTrace?.emmPass ?? true;
        const violations = extractViolations(result);

        history.push({ attempt: i, passed, violations });

        if (passed) break;
        if (i === MAX_RETRIES) break;

        // 下一轮把违规反馈加到 contextHint
        const feedback = [
          currentCtx.contextHint || '',
          '',
          '【上一次输出未通过 EMM 门控，请修正】',
          `触发的 veto 规则/违规:`,
          ...violations.map((v) => `  - ${v}`),
          '',
          '要求: 重新输出，避开上述违规，同时保持结论完整。不要道歉，直接重写。',
        ].filter(Boolean).join('\n');

        currentCtx = { ...currentCtx, contextHint: feedback };
      }

      // 挑选"最佳"尝试：优先 passed=true 的最晚一次；都没 passed 则返回最晚一次
      const bestIdx = findBestAttempt(history);
      const best = attempts[bestIdx];

      return {
        output: best.output,
        traces: attempts.flatMap((a, i) =>
          a.traces.map((t) => ({ ...t, strategy: `${t.strategy}|emm_iter_${i}` })),
        ),
        meta: {
          ...best.meta,
          emmIterative: {
            attempts: attempts.length,
            finalPass: history[bestIdx]?.passed ?? false,
            history,
          },
        },
      };
    },
  };
}

function extractViolations(result: StrategyResult): string[] {
  // 从 sections 里 / meta 里抽 violation 信息；退化简化
  const violations: string[] = [];
  const emmMeta = result.meta?.emm_result;
  if (emmMeta && Array.isArray(emmMeta.veto_triggered)) {
    violations.push(...emmMeta.veto_triggered);
  }
  if (violations.length === 0) {
    violations.push('EMM 门控未通过（未提供具体 violation 详情）');
  }
  return violations;
}

function findBestAttempt(
  history: Array<{ attempt: number; passed: boolean; violations: string[] }>,
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].passed) return i;
  }
  return history.length - 1;
}
