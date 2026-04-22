// Expert Application Strategy — registry + composer
// 管理 4 个基础策略 + 8 个装饰器；把 spec 字符串解析成可调用的策略链

import type {
  ExpertApplicationStrategy,
  StrategyId,
  BaseStrategyId,
  DecoratorId,
} from './types.js';
import { singleStrategy } from './strategies/single.js';
import { debateStrategy } from './strategies/debate.js';
import { mentalModelRotationStrategy } from './strategies/mentalModelRotation.js';
import { heuristicTriggerFirstStrategy } from './strategies/heuristicTriggerFirst.js';
import { makeFailureCheckDecorator } from './decorators/failureCheck.js';
import { makeEmmIterativeDecorator } from './decorators/emmIterative.js';
import { makeEvidenceAnchoredDecorator } from './decorators/evidenceAnchored.js';
import { makeCalibratedConfidenceDecorator } from './decorators/calibratedConfidence.js';
import { makeTrackRecordVerifyDecorator } from './decorators/trackRecordVerify.js';
import { makeSignatureStyleDecorator } from './decorators/signatureStyle.js';
import { makeKnowledgeGroundedDecorator } from './decorators/knowledgeGrounded.js';
import { makeContradictionsSurfaceDecorator } from './decorators/contradictionsSurface.js';
import { makeRubricAnchoredOutputDecorator } from './decorators/rubricAnchoredOutput.js';

const BASE_REGISTRY: Record<BaseStrategyId, ExpertApplicationStrategy> = {
  single: singleStrategy,
  debate: debateStrategy,
  mental_model_rotation: mentalModelRotationStrategy,
  heuristic_trigger_first: heuristicTriggerFirstStrategy,
};

type DecoratorFactory = (inner: ExpertApplicationStrategy) => ExpertApplicationStrategy;

const DECORATOR_REGISTRY: Record<DecoratorId, DecoratorFactory> = {
  failure_check: makeFailureCheckDecorator,
  emm_iterative: makeEmmIterativeDecorator,
  evidence_anchored: makeEvidenceAnchoredDecorator,
  calibrated_confidence: makeCalibratedConfidenceDecorator,
  track_record_verify: makeTrackRecordVerifyDecorator,
  signature_style: makeSignatureStyleDecorator,
  knowledge_grounded: makeKnowledgeGroundedDecorator,
  contradictions_surface: makeContradictionsSurfaceDecorator,
  rubric_anchored_output: makeRubricAnchoredOutputDecorator,
};

const BASE_IDS = new Set<string>(Object.keys(BASE_REGISTRY));
const DECORATOR_IDS = new Set<string>(Object.keys(DECORATOR_REGISTRY));

/** 返回 base 策略实例；未知 id → single */
export function getBaseStrategy(id: StrategyId | string): ExpertApplicationStrategy {
  return BASE_REGISTRY[id as BaseStrategyId] || BASE_REGISTRY.single;
}

/**
 * 把 "decoratorA|decoratorB|baseStrategy" spec 解析为组合策略
 * 顺序由外向内：第 1 个是最外层装饰器，最后一个必须是基础策略
 * 未识别/缺省时降级为 single
 */
export function composeStrategies(spec: string | undefined | null): ExpertApplicationStrategy {
  if (!spec || typeof spec !== 'string') return singleStrategy;
  const parts = spec
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return singleStrategy;

  // 最后一个 part 必须是 base；若不是，追加 single 做兜底
  const lastId = parts[parts.length - 1];
  const base: ExpertApplicationStrategy = BASE_IDS.has(lastId)
    ? BASE_REGISTRY[lastId as BaseStrategyId]
    : singleStrategy;

  const decoratorPartsInnerToOuter = (
    BASE_IDS.has(lastId) ? parts.slice(0, -1) : parts
  )
    .filter((id) => DECORATOR_IDS.has(id))
    .reverse();

  return decoratorPartsInnerToOuter.reduce<ExpertApplicationStrategy>((inner, decoratorId) => {
    const factory = DECORATOR_REGISTRY[decoratorId as DecoratorId];
    return factory ? factory(inner) : inner;
  }, base);
}

export const ALL_BASE_STRATEGIES = Object.keys(BASE_REGISTRY) as BaseStrategyId[];
export const ALL_DECORATORS = Object.keys(DECORATOR_REGISTRY) as DecoratorId[];
