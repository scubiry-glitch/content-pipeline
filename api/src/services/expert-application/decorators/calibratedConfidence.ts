// Decorator F: calibrated_confidence — 按专家历史校准调整 confidence
// 读 calibration 数据（若有），按领域 Brier 分机械调整 confidence
// 缺校准数据则 pass-through（不是降级，而是无损）

import type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
} from '../types.js';

export function makeCalibratedConfidenceDecorator(
  inner: ExpertApplicationStrategy,
): ExpertApplicationStrategy {
  return {
    id: 'calibrated_confidence',
    name: '置信度校准',
    requiresMultipleExperts: inner.requiresMultipleExperts,
    supportedTaskTypes: inner.supportedTaskTypes,
    wraps: inner,

    async apply(ctx: StrategyContext): Promise<StrategyResult> {
      const innerResult = await inner.apply(ctx);
      const expert = ctx.experts[0];

      const factor = await resolveCalibrationFactor(ctx, expert?.expert_id);

      if (factor === 1.0) {
        // 无校准数据或恰好为 1.0 — 原封不动
        return {
          ...innerResult,
          meta: {
            ...innerResult.meta,
            calibratedConfidence: { applied: false, factor: 1.0 },
          },
        };
      }

      const adjustedTraces = innerResult.traces.map((t) => ({
        ...t,
        confidence: clamp(t.confidence * factor, 0, 1),
        strategy: `calibrated_confidence|${t.strategy}`,
      }));

      return {
        output: innerResult.output,
        traces: adjustedTraces,
        meta: {
          ...innerResult.meta,
          calibratedConfidence: { applied: true, factor },
        },
      };
    },
  };
}

/**
 * 查询专家 Brier 分或 overconfidence_bias，算出乘子 ∈ [0.5, 1.2]
 * 无数据时返回 1.0（不生效）
 */
async function resolveCalibrationFactor(
  ctx: StrategyContext,
  expertId: string | undefined,
): Promise<number> {
  if (!expertId) return 1.0;

  try {
    const result = await ctx.deps.db.query(
      `SELECT brier_score, overconfidence_bias
       FROM expert_calibration
       WHERE expert_id = $1
       LIMIT 1`,
      [expertId],
    );
    const row = result.rows?.[0];
    if (!row) return 1.0;

    // 简单规则:
    //   brier_score 0=perfect, 1=worst → 因子 = 1 - brier * 0.5 (范围 0.5-1.0)
    //   overconfidence_bias 正数 → 因子再乘 (1 - bias)
    const brier = Number(row.brier_score ?? NaN);
    const overbias = Number(row.overconfidence_bias ?? 0);
    let factor = 1.0;
    if (Number.isFinite(brier)) factor *= clamp(1 - brier * 0.5, 0.5, 1.0);
    if (Number.isFinite(overbias) && overbias > 0) factor *= clamp(1 - overbias, 0.5, 1.0);
    return clamp(factor, 0.3, 1.2);
  } catch {
    // 表不存在或查询失败 — 无校准数据
    return 1.0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
