// ============================================
// v6.2 Assets AI 批量处理 - 批处理器主服务
// ============================================

import { Asset, AssetsBatchProcessingConfig, AssetsBatchProcessResult, AssetAIAnalysisResult } from './types.js';
import {
  AssetProcessorFactory,
  QualityProcessorInput,
  ClassificationProcessorInput,
  TaskRecommendationProcessorInput,
  DuplicateDetectionProcessorInput,
} from './processors.js';
import { DocumentChunkingService, SimpleDocumentParser } from './chunking.js';
import { EmbeddingService } from './embedding.js';
import { PersistenceService } from './persistence.js';
import { FileParserService, FileTypeDetector } from './fileParser.js';
import { query } from '../../db/connection.js';

// ============================================
// 默认配置
// ============================================
const DEFAULT_CONFIG: AssetsBatchProcessingConfig = {
  batchSize: 5,
  maxConcurrency: 2,
  qualityThreshold: 70,
  enableVectorization: true,
  enableDuplicateDetection: true,
  enableTaskRecommendation: true,
  chunkSize: 512,
  chunkOverlap: 50,
  enableDeepAnalysis: false,
};

// ============================================
// Assets AI 批处理器
// ============================================
export class AssetsAIBatchProcessor {
  private config: AssetsBatchProcessingConfig;
  private chunkingService: DocumentChunkingService;
  private parser: SimpleDocumentParser;
  private embeddingService: EmbeddingService;
  private persistenceService: PersistenceService;
  private fileParserService: FileParserService;

  // Processors
  private qualityProcessor = AssetProcessorFactory.getQualityProcessor();
  private classificationProcessor = AssetProcessorFactory.getClassificationProcessor();
  private taskRecommendationProcessor = AssetProcessorFactory.getTaskRecommendationProcessor();
  private duplicateDetectionProcessor = AssetProcessorFactory.getDuplicateDetectionProcessor();

  constructor(config: Partial<AssetsBatchProcessingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.chunkingService = new DocumentChunkingService({
      maxChunkSize: this.config.chunkSize,
      overlap: this.config.chunkOverlap,
    });
    this.parser = new SimpleDocumentParser();
    this.embeddingService = new EmbeddingService();
    this.persistenceService = new PersistenceService();
    this.fileParserService = new FileParserService();
  }

  /**
   * 批量处理 Assets
   */
  async processBatch(assets: Asset[]): Promise<AssetsBatchProcessResult> {
    const startTime = Date.now();
    const results: AssetAIAnalysisResult[] = [];
    const errors: { assetId: string; error: string }[] = [];

    console.log(`[AssetsAIBatchProcessor] Starting batch processing for ${assets.length} assets`);

    // 加载主题分类数据
    await this.classificationProcessor.loadThemes();

    // 分批处理
    for (let i = 0; i < assets.length; i += this.config.batchSize) {
      const batch = assets.slice(i, i + this.config.batchSize);
      const batchNum = Math.floor(i / this.config.batchSize) + 1;
      const totalBatches = Math.ceil(assets.length / this.config.batchSize);

      console.log(`[AssetsAIBatchProcessor] Processing batch ${batchNum}/${totalBatches}`);

      try {
        const batchResults = await this.processBatchItems(batch);
        results.push(...batchResults);
      } catch (error) {
        console.error(`[AssetsAIBatchProcessor] Batch ${batchNum} failed:`, error);
        batch.forEach((asset) => {
          errors.push({ assetId: asset.id, error: (error as Error).message });
        });
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    console.log(
      `[AssetsAIBatchProcessor] Batch completed: ${results.length} success, ${errors.length} failed, total time: ${totalProcessingTime}ms`
    );

    return {
      total: assets.length,
      success: results.length,
      failed: errors.length,
      results,
      errors,
      totalProcessingTimeMs: totalProcessingTime,
    };
  }

  /**
   * 处理一批 Assets（串行处理每个 asset）
   */
  private async processBatchItems(assets: Asset[]): Promise<AssetAIAnalysisResult[]> {
    const results: AssetAIAnalysisResult[] = [];

    for (const asset of assets) {
      try {
        // 更新处理状态
        await this.updateProcessingStatus(asset.id, 'processing');

        const result = await this.processSingleAsset(asset);
        results.push(result);

        // 保存结果
        await this.persistenceService.saveResult(result);
      } catch (error) {
        console.error(`[AssetsAIBatchProcessor] Failed to process asset ${asset.id}:`, error);
        await this.markFailed(asset.id, (error as Error).message);

        // 创建失败结果
        results.push(this.createErrorResult(asset.id, error as Error));
      }
    }

    return results;
  }

  /**
   * 处理单个 Asset
   */
  private async processSingleAsset(asset: Asset): Promise<AssetAIAnalysisResult> {
    const startTime = Date.now();

    console.log(`[AssetsAIBatchProcessor] Processing asset ${asset.id}: ${asset.title}`);

    // 1. 解析文件内容
    const { content, document } = await this.parseAssetContent(asset);

    // 2. 文档分块
    const chunks = this.chunkingService.chunkDocument(document);

    // 保存分块
    await this.persistenceService.saveChunks(asset.id, chunks);

    // 3. 质量评估
    const qualityInput: QualityProcessorInput = { asset, content };
    const qualityResult = await this.qualityProcessor.process(qualityInput);

    // 4. 主题分类
    const classificationInput: ClassificationProcessorInput = { asset, content };
    const classificationResult = await this.classificationProcessor.process(classificationInput);

    // 5. 向量化
    let vectorizationResult: AssetAIAnalysisResult['vectorization'] = undefined;
    if (this.config.enableVectorization) {
      try {
        vectorizationResult = await this.embeddingService.vectorizeAsset(asset.id, chunks);
      } catch (error) {
        console.error(`[AssetsAIBatchProcessor] Vectorization failed for ${asset.id}:`, error);
      }
    }

    // 6. 去重检测
    let duplicateResult: AssetAIAnalysisResult['duplicate'] = undefined;
    if (this.config.enableDuplicateDetection && vectorizationResult) {
      try {
        const duplicateInput: DuplicateDetectionProcessorInput = {
          assetId: asset.id,
          embedding: vectorizationResult.documentEmbedding,
        };
        const duplicateOutput = await this.duplicateDetectionProcessor.process(duplicateInput);
        duplicateResult = duplicateOutput.duplicate;
      } catch (error) {
        console.error(`[AssetsAIBatchProcessor] Duplicate detection failed for ${asset.id}:`, error);
      }
    }

    // 7. 任务推荐（仅高质量内容）
    let taskRecommendation: AssetAIAnalysisResult['taskRecommendation'] = undefined;
    if (this.config.enableTaskRecommendation && qualityResult.quality.overall >= this.config.qualityThreshold) {
      try {
        const taskInput: TaskRecommendationProcessorInput = {
          asset,
          quality: qualityResult.quality,
          classification: classificationResult.classification,
        };
        const taskResult = await this.taskRecommendationProcessor.process(taskInput);
        taskRecommendation = taskResult.taskRecommendation;
      } catch (error) {
        console.error(`[AssetsAIBatchProcessor] Task recommendation failed for ${asset.id}:`, error);
      }
    }

    // 8. 深度分析（可选 — 15 deliverable + 专家库 EMM）
    let deepAnalysis: AssetAIAnalysisResult['deepAnalysis'] = undefined;
    if (this.config.enableDeepAnalysis) {
      try {
        const { runDeepAnalysis } = await import('./deepAnalysisOrchestrator.js');
        deepAnalysis = await runDeepAnalysis(
          asset,
          qualityResult.quality,
          classificationResult.classification,
          this.config.expertStrategy,
        );
      } catch (error) {
        console.error(`[AssetsAIBatchProcessor] Deep analysis failed for ${asset.id}:`, error);
        // 不阻断主流程
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    console.log(
      `[AssetsAIBatchProcessor] Completed asset ${asset.id}: quality=${qualityResult.quality.overall}, time=${totalProcessingTime}ms${deepAnalysis ? ' (deep)' : ''}`
    );

    return {
      assetId: asset.id,
      quality: qualityResult.quality,
      classification: classificationResult.classification,
      vectorization: vectorizationResult,
      duplicate: duplicateResult,
      taskRecommendation,
      deepAnalysis,
      processingTimeMs: totalProcessingTime,
      modelVersion: deepAnalysis ? 'v2.0-deep' : 'v1.0',
    };
  }

  /**
   * 解析 Asset 内容
   * 支持 PDF, DOCX, TXT, MD, 图片 OCR
   */
  private async parseAssetContent(asset: Asset): Promise<{ content: string; document: import('./chunking.js').ParsedDocument }> {
    try {
      // 1. 优先使用数据库中已存储的 content（如果存在且有效）
      if (asset.content && asset.content.length > 100) {
        console.log(`[AssetsAIBatchProcessor] Using stored content for asset ${asset.id}: ${asset.content.length} chars`);
        const doc = this.parser.parseText(asset.content, asset.title);
        return { content: asset.content, document: doc };
      }

      // 2. 检查文件 URL
      if (!asset.fileUrl) {
        console.warn(`[AssetsAIBatchProcessor] Asset ${asset.id} has no fileUrl and no content`);
        const fallbackDoc = this.parser.parseText(asset.metadata?.abstract || asset.title, asset.title);
        return { content: asset.metadata?.abstract || asset.title, document: fallbackDoc };
      }

      // 2. 检查文件类型是否支持
      const isUrl = asset.fileUrl.startsWith('http://') || asset.fileUrl.startsWith('https://');
      
      let parseResult;
      
      if (isUrl) {
        // 从 URL 下载并解析
        console.log(`[AssetsAIBatchProcessor] Parsing asset ${asset.id} from URL: ${asset.fileUrl}`);
        parseResult = await this.fileParserService.parseFromUrl(asset.fileUrl, asset.title);
      } else {
        // 本地文件路径
        console.log(`[AssetsAIBatchProcessor] Parsing asset ${asset.id} from file: ${asset.fileUrl}`);
        parseResult = await this.fileParserService.parseFile(asset.fileUrl, asset.title);
      }

      if (!parseResult.success) {
        console.warn(`[AssetsAIBatchProcessor] Failed to parse asset ${asset.id}: ${parseResult.error}`);
        const fallbackDoc = this.parser.parseText(asset.metadata?.abstract || asset.title, asset.title);
        return { content: asset.metadata?.abstract || asset.title, document: fallbackDoc };
      }

      // 3. 合并文档内容
      const doc = parseResult.document;
      let content = '';
      
      if (doc.abstract) {
        content += `摘要：\n${doc.abstract}\n\n`;
      }
      
      for (const chapter of doc.chapters) {
        content += `${chapter.title}\n${chapter.content}\n\n`;
      }
      
      if (doc.conclusion) {
        content += `结论：\n${doc.conclusion}\n\n`;
      }

      console.log(`[AssetsAIBatchProcessor] Parsed asset ${asset.id}: ${parseResult.metadata.wordCount} words, ${parseResult.metadata.pageCount || 1} pages`);

      return { content: content.trim() || asset.title, document: doc };
    } catch (error) {
      console.error(`[AssetsAIBatchProcessor] Error extracting content for asset ${asset.id}:`, error);
      const fallbackDoc = this.parser.parseText(asset.metadata?.abstract || asset.title, asset.title);
      return { content: asset.metadata?.abstract || asset.title, document: fallbackDoc };
    }
  }

  /**
   * 更新处理状态
   */
  private async updateProcessingStatus(assetId: string, status: string): Promise<void> {
    await query(
      `UPDATE assets SET ai_processing_status = $2 WHERE id = $1`,
      [assetId, status]
    );
  }

  /**
   * 标记处理失败
   */
  private async markFailed(assetId: string, errorMessage: string): Promise<void> {
    await query(
      `UPDATE assets SET 
        ai_processing_status = 'failed'
      WHERE id = $1`,
      [assetId]
    );

    // 记录错误到 analysis 表
    await query(
      `INSERT INTO asset_ai_analysis (asset_id, quality_summary, model_version)
       VALUES ($1, $2, 'v1.0-error')
       ON CONFLICT (asset_id) DO UPDATE SET
         quality_summary = EXCLUDED.quality_summary,
         model_version = EXCLUDED.model_version`,
      [assetId, `处理失败: ${errorMessage}`]
    );
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(assetId: string, error: Error): AssetAIAnalysisResult {
    return {
      assetId,
      quality: {
        overall: 0,
        dimensions: {
          completeness: 0,
          dataQuality: 0,
          sourceAuthority: 0,
          timeliness: 0,
          readability: 0,
          practicality: 0,
        },
        structure: {
          hasAbstract: false,
          hasTableOfContents: false,
          hasCharts: false,
          hasDataTables: false,
          hasConclusion: false,
          hasReferences: false,
          pageCount: 0,
          wordCount: 0,
        },
        aiAssessment: {
          summary: `处理失败: ${error.message}`,
          strengths: [],
          weaknesses: ['AI 分析过程中发生错误'],
          keyInsights: [],
          dataHighlights: [],
          recommendation: 'archive',
          confidence: 0,
        },
      },
      classification: {
        primaryTheme: {
          themeId: '',
          themeName: '其他',
          confidence: 0,
          reason: '处理失败',
        },
        secondaryThemes: [],
        expertLibraryMapping: [],
        tags: [],
        entities: [],
      },
      processingTimeMs: 0,
      modelVersion: 'v1.0-error',
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AssetsBatchProcessingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): AssetsBatchProcessingConfig {
    return { ...this.config };
  }
}

// ============================================
// 导出单例（延迟初始化，确保环境变量已加载）
// ============================================
let _assetsBatchProcessor: AssetsAIBatchProcessor | null = null;

export function getAssetsBatchProcessor(): AssetsAIBatchProcessor {
  if (!_assetsBatchProcessor) {
    _assetsBatchProcessor = new AssetsAIBatchProcessor();
  }
  return _assetsBatchProcessor;
}

// 兼容旧代码的导出（延迟初始化）
// @ts-ignore - Type compatibility handled at runtime
export const assetsBatchProcessor: AssetsAIBatchProcessor = {
  // @ts-ignore - Accessing private property via getter
  get config() { return getAssetsBatchProcessor().config; },
  processBatch(assets: Asset[]) { return getAssetsBatchProcessor().processBatch(assets); },
  // @ts-ignore - Accessing private method
  processSingleAsset(asset: Asset, force?: boolean) { return getAssetsBatchProcessor().processSingleAsset(asset, force); },
  updateConfig(config: Partial<AssetsBatchProcessingConfig>) { return getAssetsBatchProcessor().updateConfig(config); },
} as any;
