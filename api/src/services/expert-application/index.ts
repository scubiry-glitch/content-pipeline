// Expert Application — public entry
// 调用点通过这里拿 strategyResolver；无须直接依赖 registry / presets 内部实现

export type {
  ExpertApplicationStrategy,
  StrategyContext,
  StrategyResult,
  StrategyId,
  BaseStrategyId,
  DecoratorId,
  ExpertInvocationTrace,
  ExpertStrategySpec,
  StrategyMapping,
} from './types.js';

export { composeStrategies, ALL_BASE_STRATEGIES, ALL_DECORATORS } from './registry.js';
export { PRESET_COMBOS, DEFAULT_PRESET, FALLBACK_SPEC } from './presets.js';
export type { PresetId, PresetCombo } from './presets.js';

import type { ExpertApplicationStrategy, ExpertStrategySpec } from './types.js';
import { composeStrategies } from './registry.js';
import { PRESET_COMBOS, DEFAULT_PRESET, FALLBACK_SPEC } from './presets.js';

/**
 * 根据客户端 spec 构造 resolver(deliverable) → Strategy
 *
 * 优先级:
 *   1. spec.perDeliverable[deliverable] (用户细粒度覆盖)
 *   2. spec.default (用户全局默认 spec 串)
 *   3. PRESET_COMBOS[spec.preset].mapping[deliverable]
 *   4. PRESET_COMBOS[DEFAULT_PRESET].mapping[deliverable]
 *   5. FALLBACK_SPEC ("single")
 */
export function createStrategyResolver(
  spec?: ExpertStrategySpec,
): (deliverable: string) => ExpertApplicationStrategy {
  const safeSpec = spec || {};
  const presetId = safeSpec.preset && safeSpec.preset !== 'custom' ? safeSpec.preset : DEFAULT_PRESET;
  const presetMapping = PRESET_COMBOS[presetId as keyof typeof PRESET_COMBOS]?.mapping || {};
  const defaultPresetMapping = PRESET_COMBOS[DEFAULT_PRESET].mapping;

  const cache = new Map<string, ExpertApplicationStrategy>();

  return (deliverable: string): ExpertApplicationStrategy => {
    if (cache.has(deliverable)) return cache.get(deliverable)!;

    const specStr =
      safeSpec.perDeliverable?.[deliverable] ||
      safeSpec.default ||
      presetMapping[deliverable] ||
      defaultPresetMapping[deliverable] ||
      FALLBACK_SPEC;

    const strategy = composeStrategies(specStr);
    cache.set(deliverable, strategy);
    return strategy;
  };
}

/**
 * 返回给定 spec 在给定 deliverable 下最终解析出的 spec 字符串 —
 * 用于持久化到 expert_invocations.strategy 字段。
 */
export function resolveSpecString(
  spec: ExpertStrategySpec | undefined,
  deliverable: string,
): string {
  const safeSpec = spec || {};
  const presetId = safeSpec.preset && safeSpec.preset !== 'custom' ? safeSpec.preset : DEFAULT_PRESET;
  const presetMapping = PRESET_COMBOS[presetId as keyof typeof PRESET_COMBOS]?.mapping || {};
  const defaultPresetMapping = PRESET_COMBOS[DEFAULT_PRESET].mapping;
  return (
    safeSpec.perDeliverable?.[deliverable] ||
    safeSpec.default ||
    presetMapping[deliverable] ||
    defaultPresetMapping[deliverable] ||
    FALLBACK_SPEC
  );
}
