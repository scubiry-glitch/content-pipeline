// ============================================
// v6.2 Assets AI 批量处理 - 模块导出
// ============================================

// 类型定义
export * from './types.js';

// Processors
export {
  AssetProcessorFactory,
  AssetQualityProcessor,
  AssetClassificationProcessor,
  AssetTaskRecommendationProcessor,
  AssetDuplicateDetectionProcessor,
  type QualityProcessorInput,
  type QualityProcessorOutput,
  type ClassificationProcessorInput,
  type ClassificationProcessorOutput,
  type TaskRecommendationProcessorInput,
  type TaskRecommendationProcessorOutput,
  type DuplicateDetectionProcessorInput,
  type DuplicateDetectionProcessorOutput,
} from './processors.js';

// 批处理器
export {
  AssetsAIBatchProcessor,
  assetsBatchProcessor,
} from './batchProcessor.js';

// 持久化服务
export {
  PersistenceService,
  persistenceService,
} from './persistence.js';

// 分块服务
export {
  DocumentChunkingService,
  SimpleDocumentParser,
  documentChunkingService,
  simpleDocumentParser,
  type ParsedDocument,
  type ChunkingConfig,
} from './chunking.js';

// 向量化服务
export {
  EmbeddingService,
  embeddingService,
  type EmbeddingConfig,
} from './embedding.js';

// 文件解析服务
export {
  FileParserService,
  fileParserService,
  FileTypeDetector,
  type FileParserConfig,
  type FileParseResult,
} from './fileParser.js';

// 定时任务调度器
export {
  AssetsAIProcessingScheduler,
  assetsAIScheduler,
  type SchedulerConfig,
} from './scheduler.js';

// Prompt 模板
export {
  AssetPromptManager,
  assetPromptManager,
  createAssetQualityPrompt,
  createAssetClassificationPrompt,
  createAssetTaskRecommendationPrompt,
  createDocumentChunkSummaryPrompt,
  type AssetQualityPromptParams,
  type AssetClassificationPromptParams,
  type AssetTaskRecommendationPromptParams,
  type DocumentChunkPromptParams,
} from './prompts.js';
