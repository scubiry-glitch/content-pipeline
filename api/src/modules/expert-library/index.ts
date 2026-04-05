// Expert Library — 统一导出 + 工厂函数
// 嵌入式: import { createExpertEngine } from './modules/expert-library'
// 独立部署: import { createExpertEngine, createRouter } from 'expert-library'

import { ExpertEngine } from './ExpertEngine.js';
import { createRouter } from './router.js';
import { muskProfile } from './data/musk.js';
import { xiaohongshuProfile } from './data/xiaohongshu.js';
import type { ExpertLibraryDeps, ExpertProfile } from './types.js';

// ===== 工厂函数 =====

/**
 * 创建 ExpertEngine 实例
 * @param deps 外部依赖（通过 Adapter 注入）
 * @param options 可选配置
 */
export function createExpertEngine(
  deps: ExpertLibraryDeps,
  options?: {
    /** 是否自动注册内置专家 (默认 true) */
    registerBuiltinExperts?: boolean;
    /** 额外的专家 profiles */
    additionalExperts?: ExpertProfile[];
  }
): ExpertEngine {
  const engine = new ExpertEngine(deps);

  // 注册内置专家
  if (options?.registerBuiltinExperts !== false) {
    engine.registerExpert(muskProfile);
    engine.registerExpert(xiaohongshuProfile);
  }

  // 注册额外专家
  if (options?.additionalExperts) {
    for (const expert of options.additionalExperts) {
      engine.registerExpert(expert);
    }
  }

  return engine;
}

// ===== 导出 =====

// 核心
export { ExpertEngine } from './ExpertEngine.js';
export { createRouter } from './router.js';

// 子模块
export { buildSystemPrompt } from './promptBuilder.js';
export { processInput } from './inputProcessor.js';
export { emmGateCheck, emmGateWithRetry } from './emmGate.js';
export { analyzeThenJudge } from './analyzeThenJudge.js';
export { formatOutput } from './outputFormatter.js';

// 数据
export { muskProfile } from './data/musk.js';
export { xiaohongshuProfile } from './data/xiaohongshu.js';

// 类型
export type {
  ExpertProfile,
  ExpertPersona,
  ExpertMethod,
  ExpertEMM,
  ExpertRequest,
  ExpertResponse,
  InputAnalysis,
  EMMGateResult,
  ViolationCost,
  AnalysisResult,
  ComparisonResult,
  ComparisonAxis,
  VerdictResult,
  ExtractionResult,
  OutputSection,
  KnowledgeSource,
  ExpertFeedback,
  ExpertPerformance,
  TaskType,
  InputType,
  DatabaseAdapter,
  LLMAdapter,
  FileParserAdapter,
  StorageAdapter,
  ExpertLibraryDeps,
} from './types.js';

// Adapters
export { createPipelineDeps, createPipelineDBAdapter, createPipelineLLMAdapter } from './adapters/pipeline.js';
