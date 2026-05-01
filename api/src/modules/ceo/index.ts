// CEO Module — 统一导出 + 工厂函数
// 嵌入式: import { createCeoEngine, createRouter } from './modules/ceo'

import { CeoEngine, type CeoEngineOptions } from './CeoEngine.js';
import { createRouter } from './router.js';
import type { CeoEngineDeps } from './types.js';

/**
 * 创建 CeoEngine 实例
 */
export function createCeoEngine(
  deps: CeoEngineDeps,
  options?: CeoEngineOptions,
): CeoEngine {
  return new CeoEngine(deps, options);
}

// ===== 导出 =====

export { CeoEngine } from './CeoEngine.js';
export { createRouter } from './router.js';

// Adapters
export { createCeoPipelineDeps } from './adapters/pipeline.js';
export { NullCeoLLMAdapter, createClaudeCliCeoLLMAdapter } from './adapters/llm.js';

// Singleton
export {
  initCeoEngineSingleton,
  getCeoEngine,
  isCeoInitialized,
} from './singleton.js';

// Types
export type { CeoEngineOptions } from './CeoEngine.js';
export type {
  CeoEngineDeps,
  DatabaseAdapter,
  MeetingNotesEngineHandle,
  ExpertEngineHandle,
  ContentLibraryEngineHandle,
  CeoLLMAdapter,
  CeoLLMInvokeInput,
  CeoLLMInvokeResult,
  PrismKind,
  Prism,
  PrismWeight,
  StrategicLine,
  DirectorConcern,
  Stakeholder,
  BalconyReflection,
  CeoRunRequest,
} from './types.js';
