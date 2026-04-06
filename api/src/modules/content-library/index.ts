// Content Library — 统一导出 + 工厂函数
// 嵌入式: import { createContentLibraryEngine } from './modules/content-library'
// 独立部署: import { createContentLibraryEngine, createStandaloneServer } from 'content-library'

import { ContentLibraryEngine } from './ContentLibraryEngine.js';
import { createRouter } from './router.js';
import type { ContentLibraryDeps, ContentLibraryOptions, StandaloneConfig } from './types.js';

// ===== 工厂函数 =====

/**
 * 创建 ContentLibraryEngine 实例
 * @param deps 外部依赖（通过 Adapter 注入）
 * @param options 可选配置
 */
export function createContentLibraryEngine(
  deps: ContentLibraryDeps,
  options?: ContentLibraryOptions
): ContentLibraryEngine {
  return new ContentLibraryEngine(deps, options);
}

/**
 * 创建独立部署服务器
 * 用于模块拆分为独立微服务时
 */
export async function createStandaloneServer(config: StandaloneConfig): Promise<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
}> {
  // 动态导入以避免嵌入模式下的不必要依赖
  const { createStandalone } = await import('./standalone.js');
  return createStandalone(config);
}

// ===== 导出 =====

export { ContentLibraryEngine } from './ContentLibraryEngine.js';
export { createRouter } from './router.js';

// Adapters
export { PostgresTextSearch } from './adapters/postgres-text-search.js';
export { LocalEventBus } from './adapters/local-event-bus.js';
export { RedisEventBus } from './adapters/redis-event-bus.js';

// Types
export type {
  ContentLibraryDeps,
  ContentLibraryOptions,
  StandaloneConfig,
  DatabaseAdapter,
  LLMAdapter,
  EmbeddingAdapter,
  TextSearchAdapter,
  EventBusAdapter,
  StorageAdapter,
  ContentFact,
  ContentEntity,
  ContentBelief,
  Contradiction,
  TieredContent,
  TierLevel,
  TierL0,
  TierL1,
  TierL2,
  HybridSearchRequest,
  HybridSearchResult,
  SearchResultItem,
  TopicRecommendation,
  TrendSignal,
  DeltaReport,
  KnowledgeCard,
  ConsensusMap,
  ProductionExperience,
} from './types.js';

export { CONTENT_LIBRARY_EVENTS } from './types.js';
