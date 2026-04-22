// Expert Application Strategy — interface definitions
// Round 2: 把"如何把专家用到分析里"从 Round 1 的硬编码 `expertEngine.invoke()`
// 抽成可组合策略。调用点声明 strategy spec，实现细节由策略决定。

import type {
  ExpertEngine,
  ExpertProfile,
  TaskType,
  OutputSection,
  ExpertRequestParams,
  ExpertLibraryDeps,
} from '../../modules/expert-library/types.js';

export type BaseStrategyId =
  | 'single'
  | 'debate'
  | 'mental_model_rotation'
  | 'heuristic_trigger_first';

export type DecoratorId =
  | 'failure_check'
  | 'emm_iterative'
  | 'evidence_anchored'
  | 'calibrated_confidence'
  | 'track_record_verify'
  | 'signature_style'
  | 'knowledge_grounded'
  | 'contradictions_surface'
  | 'rubric_anchored_output';

export type StrategyId = BaseStrategyId | DecoratorId;

/** 每次专家调用的痕迹，持久化到 expert_invocations JSONB */
export interface ExpertInvocationTrace {
  deliverable: string;
  expertId: string;
  invokeId: string;
  strategy: string;                    // full spec, e.g. "evidence_anchored|debate"
  emmPass: boolean;
  confidence: number;
  durationMs: number;
  stage?: string;                      // e.g. "positionA" | "judge" for debate
}

export interface StrategyContext {
  expertEngine: ExpertEngine;
  deps: ExpertLibraryDeps;
  experts: ExpertProfile[];
  inputData: string;
  taskType: TaskType;
  deliverable: string;                 // '⑬controversy' / '⑩insights' / ...
  contextHint?: string;
  params?: ExpertRequestParams;
  /** 提供给装饰器用的上游策略结果 (by the wrapped strategy) */
  wrappedResult?: StrategyResult;
}

export interface StrategyResult {
  output: { sections: OutputSection[] };
  traces: ExpertInvocationTrace[];
  /** 策略特定结构化产物（如 debate 的 agreement matrix、rotation 的 model_applications） */
  meta?: Record<string, any>;
}

export interface ExpertApplicationStrategy {
  id: StrategyId;
  name: string;
  requiresMultipleExperts: boolean;
  supportedTaskTypes: TaskType[];
  /** 装饰器型策略 wrap 其他策略 */
  wraps?: ExpertApplicationStrategy;
  apply(ctx: StrategyContext): Promise<StrategyResult>;
}

/** 客户端发来的策略配置 */
export interface ExpertStrategySpec {
  /** 预设 id：lite / standard / max / custom；custom 时必须提供 perDeliverable */
  preset?: 'lite' | 'standard' | 'max' | 'custom';
  /** 单个 spec 串，兜底；格式 `"decorator1|decorator2|base"` */
  default?: string;
  /** per-deliverable 覆盖：`{ '⑬controversy': 'evidence_anchored|debate', ... }` */
  perDeliverable?: Record<string, string>;
}

/** 经过解析的 per-deliverable spec 字符串映射（服务端用） */
export type StrategyMapping = Record<string, string>;
