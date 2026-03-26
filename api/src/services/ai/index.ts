// AI 批量处理服务 - 统一导出
// v6.1 RSS 内容智能分析

// LLM Client
export { llmClient, createLLMClient, LLMClient, LLMConfig, LLMRequest, LLMResponse } from './llmClient.js';

// Prompt 模板
export { promptManager, DOMAIN_CATEGORIES } from './prompts.js';
export { PromptVersionManager } from './prompts-v2.js';

// Processors
export {
  QualityProcessor,
  CategoryProcessor,
  SentimentProcessor,
  TaskRecommendationProcessor,
  ProcessorFactory,
  analyzeQuality,
  analyzeCategory,
  analyzeSentiment,
  generateTaskRecommendation,
} from './processors.js';

export type {
  QualityScore,
  CategoryAnalysis,
  SentimentAnalysis,
  TaskRecommendation,
  TaskRecommendationInput,
  AIAnalysisResult,
} from './processors.js';

// Batch Processor
export {
  batchProcessor,
  persistenceService,
  AIBatchProcessor,
  AIResultPersistenceService,
} from './batchProcessor.js';

export type { BatchProcessingConfig, BatchProcessResult } from './batchProcessor.js';

// Scheduler
export {
  aiScheduler,
  AIProcessingScheduler,
  triggerImmediateProcessing,
} from './scheduler.js';

// Phase 5: 缓存系统
export {
  embeddingCache,
  responseCache,
  EmbeddingCache,
  ResponseCache,
} from './cache.js';

// Phase 5: 监控告警
export {
  AIMonitoringLogger,
  AIAlertManager,
  AIMetricsCollector,
  alertManager,
  metricsCollector,
} from './monitoring.js';

// Phase 5: 反馈闭环
export {
  AIFeedbackService,
  PromptIterationService,
  feedbackService,
  promptIterationService,
} from './feedback.js';
export type { AIFeedback, FeedbackType } from './feedback.js';
