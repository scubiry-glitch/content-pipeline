// AI 批量处理服务
// v6.1 RSS 内容批量分析服务

import { RSSItem } from '../rssCollector.js';
import { query } from '../../db/connection.js';
import {
  ProcessorFactory,
  QualityScore,
  CategoryAnalysis,
  SentimentAnalysis,
  TaskRecommendation,
  TaskRecommendationInput,
  AIAnalysisResult,
} from './processors.js';

// ============================================
// 批处理配置
// ============================================

export interface BatchProcessingConfig {
  batchSize: number;           // 每批处理的篇数
  maxConcurrency: number;      // 最大并发批次数
  qualityThreshold: number;    // 生成任务推荐的质量阈值
  enableTaskRecommendation: boolean;  // 是否启用任务推荐
}

const DEFAULT_CONFIG: BatchProcessingConfig = {
  batchSize: 5,
  maxConcurrency: 2,
  qualityThreshold: 70,
  enableTaskRecommendation: true,
};

// ============================================
// 批处理结果
// ============================================

export interface BatchProcessResult {
  total: number;
  success: number;
  failed: number;
  results: AIAnalysisResult[];
  errors: { itemId: string; error: string }[];
  totalProcessingTimeMs: number;
}

// ============================================
// AI 批量处理服务
// ============================================

export class AIBatchProcessor {
  private config: BatchProcessingConfig;
  private qualityProcessor = ProcessorFactory.getQualityProcessor();
  private categoryProcessor = ProcessorFactory.getCategoryProcessor();
  private sentimentProcessor = ProcessorFactory.getSentimentProcessor();
  private taskRecommendationProcessor = ProcessorFactory.getTaskRecommendationProcessor();

  constructor(config: Partial<BatchProcessingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 批量处理 RSS items
   */
  async processBatch(items: RSSItem[]): Promise<BatchProcessResult> {
    const startTime = Date.now();
    const results: AIAnalysisResult[] = [];
    const errors: { itemId: string; error: string }[] = [];

    console.log(`[AIBatchProcessor] Starting batch processing for ${items.length} items`);

    // 分批处理
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      const batch = items.slice(i, i + this.config.batchSize);
      console.log(`[AIBatchProcessor] Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(items.length / this.config.batchSize)}`);

      try {
        const batchResults = await this.processBatchItems(batch);
        results.push(...batchResults);
      } catch (error) {
        console.error(`[AIBatchProcessor] Batch failed:`, error);
        // 记录批次中所有 item 为失败
        batch.forEach(item => {
          errors.push({ itemId: item.id, error: (error as Error).message });
        });
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    console.log(`[AIBatchProcessor] Batch completed: ${results.length} success, ${errors.length} failed, total time: ${totalProcessingTime}ms`);

    return {
      total: items.length,
      success: results.length,
      failed: errors.length,
      results,
      errors,
      totalProcessingTimeMs: totalProcessingTime,
    };
  }

  /**
   * 处理一批 items（串行处理每个 item，避免并发过大）
   */
  private async processBatchItems(items: RSSItem[]): Promise<AIAnalysisResult[]> {
    const results: AIAnalysisResult[] = [];

    for (const item of items) {
      try {
        const result = await this.processSingleItem(item);
        results.push(result);
      } catch (error) {
        console.error(`[AIBatchProcessor] Failed to process item ${item.id}:`, error);
        // 创建失败结果
        results.push(this.createErrorResult(item.id, error as Error));
      }
    }

    return results;
  }

  /**
   * 处理单个 item
   */
  private async processSingleItem(item: RSSItem): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    // 1. 质量评估
    const qualityResult = await this.qualityProcessor.process(item);

    // 2. 领域分类
    const categoryResult = await this.categoryProcessor.process(item);

    // 3. 情感分析
    const sentimentResult = await this.sentimentProcessor.process(item);

    // 4. 任务推荐（仅高质量内容）
    let taskRecommendation: TaskRecommendation | undefined;
    if (this.config.enableTaskRecommendation && qualityResult.quality.overall >= this.config.qualityThreshold) {
      const taskInput: TaskRecommendationInput = {
        item,
        quality: qualityResult.quality,
        category: categoryResult.category,
        sentiment: sentimentResult.sentiment,
      };
      const taskResult = await this.taskRecommendationProcessor.process(taskInput);
      taskRecommendation = taskResult.taskRecommendation;
    }

    const totalProcessingTime = Date.now() - startTime;

    return {
      rssItemId: item.id,
      quality: qualityResult.quality,
      category: categoryResult.category,
      sentiment: sentimentResult.sentiment,
      taskRecommendation,
      processingTimeMs: totalProcessingTime,
      modelVersion: 'v1.0',
    };
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(itemId: string, error: Error): AIAnalysisResult {
    return {
      rssItemId: itemId,
      quality: {
        overall: 0,
        dimensions: {
          contentRichness: 0,
          sourceCredibility: 0,
          timeliness: 0,
          uniqueness: 0,
          readability: 0,
          dataSupport: 0,
        },
        aiAssessment: {
          summary: `处理失败: ${error.message}`,
          strengths: [],
          weaknesses: ['AI 分析过程中发生错误'],
          recommendation: 'filter',
          confidence: 0,
        },
      },
      category: {
        primaryCategory: {
          domain: '其他',
          confidence: 0,
          reason: '处理失败',
        },
        secondaryCategories: [],
        tags: [],
        entities: [],
        expertLibraryMatch: {
          matchedDomains: [],
          suggestedExperts: [],
          confidence: 0,
        },
      },
      sentiment: {
        overall: 'neutral',
        score: 0,
        dimensions: {
          marketSentiment: 0,
          policySentiment: 0,
          industryOutlook: 0,
          investmentSentiment: 0,
          riskLevel: 'medium',
        },
        keyOpinions: [],
        keyElements: {
          opportunities: [],
          risks: [],
          uncertainties: [],
          catalysts: [],
        },
        intensity: 'weak',
        stance: 'neutral',
      },
      processingTimeMs: 0,
      modelVersion: 'v1.0-error',
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<BatchProcessingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): BatchProcessingConfig {
    return { ...this.config };
  }
}

// ============================================
// 数据持久化服务
// ============================================

export class AIResultPersistenceService {
  /**
   * 保存分析结果到数据库
   */
  async saveResults(results: AIAnalysisResult[]): Promise<void> {
    for (const result of results) {
      await this.saveSingleResult(result);
    }
  }

  /**
   * 保存单个分析结果
   */
  private async saveSingleResult(result: AIAnalysisResult): Promise<void> {
    const { rssItemId, quality, category, sentiment, taskRecommendation, processingTimeMs, modelVersion } = result;

    try {
      // 1. 保存到 rss_item_ai_analysis 表
      await query(
        `INSERT INTO rss_item_ai_analysis (
          rss_item_id,
          quality_score, quality_dimensions, quality_summary, quality_strengths, quality_weaknesses, quality_recommendation,
          primary_category, primary_category_confidence, secondary_categories, extracted_tags, extracted_entities, expert_library_match,
          sentiment, sentiment_score, sentiment_dimensions, key_opinions, key_elements, sentiment_intensity, sentiment_stance,
          task_recommendations,
          processing_time_ms, model_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (rss_item_id) DO UPDATE SET
          quality_score = EXCLUDED.quality_score,
          quality_dimensions = EXCLUDED.quality_dimensions,
          quality_summary = EXCLUDED.quality_summary,
          quality_strengths = EXCLUDED.quality_strengths,
          quality_weaknesses = EXCLUDED.quality_weaknesses,
          quality_recommendation = EXCLUDED.quality_recommendation,
          primary_category = EXCLUDED.primary_category,
          primary_category_confidence = EXCLUDED.primary_category_confidence,
          secondary_categories = EXCLUDED.secondary_categories,
          extracted_tags = EXCLUDED.extracted_tags,
          extracted_entities = EXCLUDED.extracted_entities,
          expert_library_match = EXCLUDED.expert_library_match,
          sentiment = EXCLUDED.sentiment,
          sentiment_score = EXCLUDED.sentiment_score,
          sentiment_dimensions = EXCLUDED.sentiment_dimensions,
          key_opinions = EXCLUDED.key_opinions,
          key_elements = EXCLUDED.key_elements,
          sentiment_intensity = EXCLUDED.sentiment_intensity,
          sentiment_stance = EXCLUDED.sentiment_stance,
          task_recommendations = EXCLUDED.task_recommendations,
          processing_time_ms = EXCLUDED.processing_time_ms,
          model_version = EXCLUDED.model_version,
          analyzed_at = NOW()`,
        [
          rssItemId,
          quality.overall,
          JSON.stringify(quality.dimensions),
          quality.aiAssessment.summary,
          quality.aiAssessment.strengths,
          quality.aiAssessment.weaknesses,
          quality.aiAssessment.recommendation,
          category.primaryCategory.domain,
          category.primaryCategory.confidence,
          JSON.stringify(category.secondaryCategories),
          JSON.stringify(category.tags),
          JSON.stringify(category.entities),
          JSON.stringify(category.expertLibraryMatch),
          sentiment.overall,
          sentiment.score,
          JSON.stringify(sentiment.dimensions),
          JSON.stringify(sentiment.keyOpinions),
          JSON.stringify(sentiment.keyElements),
          sentiment.intensity,
          sentiment.stance,
          JSON.stringify(taskRecommendation ? [taskRecommendation] : []),
          processingTimeMs,
          modelVersion,
        ]
      );

      // 2. 同步到 rss_items 表
      await query(
        `UPDATE rss_items SET
          ai_quality_score = $2,
          ai_category = $3,
          ai_sentiment = $4,
          ai_analyzed_at = NOW()
        WHERE id = $1`,
        [rssItemId, quality.overall, category.primaryCategory.domain, sentiment.overall]
      );

      // 3. 如果有任务推荐，保存到 ai_task_recommendations
      if (taskRecommendation) {
        await query(
          `INSERT INTO ai_task_recommendations (rss_item_id, recommendation_data)
           VALUES ($1, $2)
           ON CONFLICT (rss_item_id) DO UPDATE SET
             recommendation_data = EXCLUDED.recommendation_data,
             status = 'pending',
             updated_at = NOW()`,
          [rssItemId, JSON.stringify(taskRecommendation)]
        );

        // 标记 rss_item 已生成任务推荐
        await query(
          `UPDATE rss_items SET ai_task_recommended = TRUE WHERE id = $1`,
          [rssItemId]
        );
      }

      console.log(`[AIResultPersistence] Saved analysis for ${rssItemId}`);
    } catch (error) {
      console.error(`[AIResultPersistence] Failed to save result for ${rssItemId}:`, error);
      throw error;
    }
  }

  /**
   * 获取待处理的 RSS items
   */
  async getUnprocessedItems(options: {
    limit?: number;
    minHotScore?: number;
    maxAgeHours?: number;
  } = {}): Promise<RSSItem[]> {
    const { limit = 20, minHotScore = 0, maxAgeHours = 168 } = options;

    const result = await query(
      `SELECT 
        id, source_id, source_name, title, link, content, summary,
        published_at, author, categories, tags, relevance_score,
        hot_score, trend, sentiment, created_at
      FROM rss_items
      WHERE ai_analyzed_at IS NULL
        AND hot_score >= $1
        AND created_at > NOW() - INTERVAL '${maxAgeHours} hours'
        AND (is_deleted = false OR is_deleted IS NULL)
      ORDER BY hot_score DESC, published_at DESC
      LIMIT $2`,
      [minHotScore, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      title: row.title,
      link: row.link,
      content: row.content,
      summary: row.summary,
      publishedAt: row.published_at,
      author: row.author,
      categories: row.categories || [],
      tags: row.tags || [],
      relevanceScore: row.relevance_score,
      hotScore: row.hot_score,
      trend: row.trend,
      sentiment: row.sentiment,
      createdAt: row.created_at,
    }));
  }

  /**
   * 获取已处理 items 的统计
   */
  async getProcessingStats(): Promise<{
    totalAnalyzed: number;
    analyzedToday: number;
    averageQualityScore: number;
    pendingRecommendations: number;
  }> {
    const totalResult = await query(`SELECT COUNT(*) FROM rss_item_ai_analysis`);
    
    const todayResult = await query(
      `SELECT COUNT(*) FROM rss_item_ai_analysis WHERE analyzed_at > CURRENT_DATE`
    );
    
    const avgQualityResult = await query(
      `SELECT AVG(quality_score) FROM rss_item_ai_analysis`
    );
    
    const pendingRecResult = await query(
      `SELECT COUNT(*) FROM ai_task_recommendations WHERE status = 'pending'`
    );

    return {
      totalAnalyzed: parseInt(totalResult.rows[0].count),
      analyzedToday: parseInt(todayResult.rows[0].count),
      averageQualityScore: Math.round(parseFloat(avgQualityResult.rows[0].avg || 0)),
      pendingRecommendations: parseInt(pendingRecResult.rows[0].count),
    };
  }

  /**
   * 获取分析结果
   */
  async getAnalysisResult(rssItemId: string): Promise<AIAnalysisResult | null> {
    const result = await query(
      `SELECT * FROM rss_item_ai_analysis WHERE rss_item_id = $1`,
      [rssItemId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.parseAnalysisResult(row);
  }

  /**
   * 解析数据库结果为 AIAnalysisResult
   */
  private parseAnalysisResult(row: any): AIAnalysisResult {
    return {
      rssItemId: row.rss_item_id,
      quality: {
        overall: row.quality_score,
        dimensions: row.quality_dimensions || {},
        aiAssessment: {
          summary: row.quality_summary,
          strengths: row.quality_strengths || [],
          weaknesses: row.quality_weaknesses || [],
          recommendation: row.quality_recommendation,
          confidence: 0.9, // 从数据库恢复时默认高置信度
        },
      },
      category: {
        primaryCategory: {
          domain: row.primary_category,
          confidence: row.primary_category_confidence,
          reason: '', // 数据库中未存储
        },
        secondaryCategories: row.secondary_categories || [],
        tags: row.extracted_tags || [],
        entities: row.extracted_entities || [],
        expertLibraryMatch: row.expert_library_match || {},
      },
      sentiment: {
        overall: row.sentiment,
        score: row.sentiment_score,
        dimensions: row.sentiment_dimensions || {},
        keyOpinions: row.key_opinions || [],
        keyElements: row.key_elements || {},
        intensity: row.sentiment_intensity,
        stance: row.sentiment_stance,
      },
      taskRecommendation: row.task_recommendations?.[0],
      processingTimeMs: row.processing_time_ms,
      modelVersion: row.model_version,
    };
  }
}

// 导出单例
export const batchProcessor = new AIBatchProcessor();
export const persistenceService = new AIResultPersistenceService();
