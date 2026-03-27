// ============================================
// v6.2 Assets AI 批量处理 - Processors
// ============================================

import {
  Asset,
  AssetQualityScore,
  AssetThemeClassification,
  AssetTaskRecommendation,
  DuplicateDetection,
  SimilarAssetMatch,
  DuplicateAnalysis,
} from './types.js';
import { llmClient, LLMResponse } from '../ai/llmClient.js';
import { assetPromptManager } from './prompts.js';
import { query } from '../../db/connection.js';

// ============================================
// 基础 Processor
// ============================================
abstract class BaseAssetProcessor<TInput, TOutput> {
  protected llm = llmClient;

  async process(input: TInput): Promise<TOutput & { processingTimeMs: number }> {
    const startTime = Date.now();

    try {
      const prompt = this.createPrompt(input);
      const response = await this.llm.complete({
        prompt: prompt.userPrompt,
        systemPrompt: prompt.systemPrompt,
        temperature: 0.3,
        responseFormat: 'json',
      });

      const result = this.parseResponse(response);

      return {
        ...result,
        processingTimeMs: Date.now() - startTime,
      } as TOutput & { processingTimeMs: number };
    } catch (error) {
      console.error(`[${this.constructor.name}] Processing failed:`, error);
      return this.createFallbackResult(error as Error) as TOutput & { processingTimeMs: number };
    }
  }

  abstract createPrompt(input: TInput): { systemPrompt: string; userPrompt: string };
  abstract parseResponse(response: LLMResponse): TOutput;
  abstract createFallbackResult(error: Error): TOutput;
}

// ============================================
// 1. 质量评估 Processor
// ============================================
export interface QualityProcessorInput {
  asset: Asset;
  content: string;
}

export interface QualityProcessorOutput {
  quality: AssetQualityScore;
}

export class AssetQualityProcessor extends BaseAssetProcessor<
  QualityProcessorInput,
  QualityProcessorOutput
> {
  createPrompt(input: QualityProcessorInput): { systemPrompt: string; userPrompt: string } {
    return assetPromptManager.createQualityPrompt({
      title: input.asset.title,
      content: input.content,
      source: input.asset.source,
      author: input.asset.author,
      publishedAt: input.asset.publishedAt?.toISOString(),
      pageCount: input.asset.metadata?.pageCount,
      wordCount: input.asset.metadata?.wordCount || input.content.length,
      fileType: input.asset.fileType,
    });
  }

  parseResponse(response: LLMResponse): QualityProcessorOutput {
    try {
      const content = response.content.trim();
      const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        quality: {
          overall: this.clampScore(parsed.overall),
          dimensions: {
            completeness: this.clampScore(parsed.dimensions?.completeness),
            dataQuality: this.clampScore(parsed.dimensions?.dataQuality),
            sourceAuthority: this.clampScore(parsed.dimensions?.sourceAuthority),
            timeliness: this.clampScore(parsed.dimensions?.timeliness),
            readability: this.clampScore(parsed.dimensions?.readability),
            practicality: this.clampScore(parsed.dimensions?.practicality),
          },
          structure: {
            hasAbstract: Boolean(parsed.structure?.hasAbstract),
            hasTableOfContents: Boolean(parsed.structure?.hasTableOfContents),
            hasCharts: Boolean(parsed.structure?.hasCharts),
            hasDataTables: Boolean(parsed.structure?.hasDataTables),
            hasConclusion: Boolean(parsed.structure?.hasConclusion),
            hasReferences: Boolean(parsed.structure?.hasReferences),
            pageCount: Number(parsed.structure?.pageCount) || 0,
            wordCount: Number(parsed.structure?.wordCount) || 0,
          },
          aiAssessment: {
            summary: parsed.aiAssessment?.summary || '',
            strengths: (parsed.aiAssessment?.strengths || []).slice(0, 3),
            weaknesses: (parsed.aiAssessment?.weaknesses || []).slice(0, 3),
            keyInsights: (parsed.aiAssessment?.keyInsights || []).slice(0, 5),
            dataHighlights: (parsed.aiAssessment?.dataHighlights || []).slice(0, 5),
            recommendation: this.validateRecommendation(parsed.aiAssessment?.recommendation),
            confidence: this.clampConfidence(parsed.aiAssessment?.confidence),
          },
        },
      };
    } catch (error) {
      console.error('[AssetQualityProcessor] Failed to parse response:', error);
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): QualityProcessorOutput {
    return {
      quality: {
        overall: 50,
        dimensions: {
          completeness: 50,
          dataQuality: 50,
          sourceAuthority: 50,
          timeliness: 50,
          readability: 50,
          practicality: 50,
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
          summary: `分析失败: ${error.message}`,
          strengths: [],
          weaknesses: ['AI 分析过程中发生错误'],
          keyInsights: [],
          dataHighlights: [],
          recommendation: 'normal',
          confidence: 0,
        },
      },
    };
  }

  private clampScore(score: any): number {
    const num = Number(score);
    if (isNaN(num)) return 50;
    return Math.max(0, Math.min(100, Math.round(num)));
  }

  private clampConfidence(conf: any): number {
    const num = Number(conf);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(1, num));
  }

  private validateRecommendation(
    rec: any
  ): 'highly_recommended' | 'recommended' | 'normal' | 'archive' {
    const valid = ['highly_recommended', 'recommended', 'normal', 'archive'];
    return valid.includes(rec) ? rec : 'normal';
  }
}

// ============================================
// 2. 主题分类 Processor
// ============================================
export interface ClassificationProcessorInput {
  asset: Asset;
  content: string;
}

export interface ClassificationProcessorOutput {
  classification: AssetThemeClassification;
}

export class AssetClassificationProcessor extends BaseAssetProcessor<
  ClassificationProcessorInput,
  ClassificationProcessorOutput
> {
  private themes: Array<{ id: string; name: string; parentId?: string }> = [];

  async loadThemes(): Promise<void> {
    try {
      const result = await query('SELECT id, name, parent_id as "parentId" FROM themes');
      this.themes = result.rows;
    } catch (error) {
      console.error('[AssetClassificationProcessor] Failed to load themes:', error);
      // 使用默认主题列表
      this.themes = [
        { id: 'theme_001', name: '房地产' },
        { id: 'theme_002', name: '保租房', parentId: 'theme_001' },
        { id: 'theme_003', name: '新能源' },
        { id: 'theme_004', name: '储能', parentId: 'theme_003' },
        { id: 'theme_005', name: '人工智能' },
        { id: 'theme_006', name: '大模型', parentId: 'theme_005' },
        { id: 'theme_007', name: '半导体' },
        { id: 'theme_008', name: '云计算', parentId: 'theme_007' },
        { id: 'theme_009', name: '生物医药' },
        { id: 'theme_010', name: '消费品' },
        { id: 'theme_011', name: 'TMT' },
        { id: 'theme_012', name: '政策' },
        { id: 'theme_013', name: '资本市场' },
        { id: 'theme_014', name: '宏观经济' },
        { id: 'theme_015', name: '高端制造' },
      ];
    }
  }

  createPrompt(input: ClassificationProcessorInput): { systemPrompt: string; userPrompt: string } {
    return assetPromptManager.createClassificationPrompt({
      title: input.asset.title,
      content: input.content,
      abstract: input.asset.metadata?.abstract,
      source: input.asset.source,
      keywords: input.asset.metadata?.keywords,
      themes: this.themes,
    });
  }

  parseResponse(response: LLMResponse): ClassificationProcessorOutput {
    try {
      const content = response.content.trim();
      const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        classification: {
          primaryTheme: {
            themeId: parsed.primaryTheme?.themeId || '',
            themeName: parsed.primaryTheme?.themeName || '其他',
            confidence: this.clampConfidence(parsed.primaryTheme?.confidence),
            reason: parsed.primaryTheme?.reason || '',
          },
          secondaryThemes: (parsed.secondaryThemes || [])
            .filter((t: any) => t.confidence > 0.3)
            .slice(0, 3)
            .map((t: any) => ({
              themeId: t.themeId,
              themeName: t.themeName,
              confidence: this.clampConfidence(t.confidence),
            })),
          expertLibraryMapping: (parsed.expertLibraryMapping || []).map((m: any) => ({
            domain: m.domain,
            confidence: this.clampConfidence(m.confidence),
            mappedFrom: m.mappedFrom,
          })),
          tags: (parsed.tags || [])
            .slice(0, 10)
            .map((t: any) => ({
              tag: t.tag,
              confidence: this.clampConfidence(t.confidence),
              type: t.type || 'other',
            })),
          entities: (parsed.entities || [])
            .slice(0, 10)
            .map((e: any) => ({
              name: e.name,
              type: e.type || 'other',
              mentions: Number(e.mentions) || 1,
            })),
        },
      };
    } catch (error) {
      console.error('[AssetClassificationProcessor] Failed to parse response:', error);
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): ClassificationProcessorOutput {
    return {
      classification: {
        primaryTheme: {
          themeId: '',
          themeName: '其他',
          confidence: 0,
          reason: `分类失败: ${error.message}`,
        },
        secondaryThemes: [],
        expertLibraryMapping: [],
        tags: [],
        entities: [],
      },
    };
  }

  private clampConfidence(conf: any): number {
    const num = Number(conf);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(1, num));
  }
}

// ============================================
// 3. 任务推荐 Processor
// ============================================
export interface TaskRecommendationProcessorInput {
  asset: Asset;
  quality: AssetQualityScore;
  classification: AssetThemeClassification;
}

export interface TaskRecommendationProcessorOutput {
  taskRecommendation: AssetTaskRecommendation;
}

export class AssetTaskRecommendationProcessor extends BaseAssetProcessor<
  TaskRecommendationProcessorInput,
  TaskRecommendationProcessorOutput
> {
  createPrompt(input: TaskRecommendationProcessorInput): { systemPrompt: string; userPrompt: string } {
    return assetPromptManager.createTaskRecommendationPrompt({
      title: input.asset.title,
      content: input.asset.metadata?.abstract || '',
      source: input.asset.source,
      qualityScore: input.quality.overall,
      themeName: input.classification.primaryTheme.themeName,
      tags: input.classification.tags.map((t) => t.tag),
      keyInsights: input.quality.aiAssessment.keyInsights,
      dataHighlights: input.quality.aiAssessment.dataHighlights,
    });
  }

  parseResponse(response: LLMResponse): TaskRecommendationProcessorOutput {
    try {
      const content = response.content.trim();
      const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);
      const rec = parsed.recommendation;

      return {
        taskRecommendation: {
          title: rec?.title || '',
          format: this.validateFormat(rec?.format),
          priority: this.validatePriority(rec?.priority),
          reason: rec?.reason || '',
          content: {
            angle: rec?.content?.angle || '',
            keyPoints: rec?.content?.keyPoints || [],
            dataHighlights: rec?.content?.dataHighlights || [],
            targetAudience: rec?.content?.targetAudience || '',
            estimatedReadTime: Number(rec?.content?.estimatedReadTime) || 5,
            suggestedLength: rec?.content?.suggestedLength || '',
          },
          assetCombination: {
            primaryAsset: {
              assetId: rec?.assetCombination?.primaryAsset?.assetId || 'current_asset',
              usage: rec?.assetCombination?.primaryAsset?.usage || '主要数据来源',
              keySections: rec?.assetCombination?.primaryAsset?.keySections || [],
            },
            supportingAssets: (rec?.assetCombination?.supportingAssets || []).map((a: any) => ({
              assetId: a.assetId,
              relevanceScore: Number(a.relevanceScore) || 0.5,
              usageSuggestion: a.usageSuggestion || '',
            })),
          },
          suggestedExperts: (rec?.suggestedExperts || []).map((e: any) => ({
            role: this.validateRole(e.role),
            domain: e.domain,
            reason: e.reason || '',
          })),
          timeline: {
            suggestedPublishTime: rec?.timeline?.suggestedPublishTime || '',
            urgency: this.validateUrgency(rec?.timeline?.urgency),
            timeWindowReason: rec?.timeline?.timeWindowReason || '',
          },
        },
      };
    } catch (error) {
      console.error('[AssetTaskRecommendationProcessor] Failed to parse response:', error);
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): TaskRecommendationProcessorOutput {
    return {
      taskRecommendation: {
        title: '推荐生成失败',
        format: 'article',
        priority: 'medium',
        reason: `任务推荐生成失败: ${error.message}`,
        content: {
          angle: '',
          keyPoints: [],
          dataHighlights: [],
          targetAudience: '',
          estimatedReadTime: 5,
          suggestedLength: '',
        },
        assetCombination: {
          primaryAsset: {
            assetId: 'current_asset',
            usage: '主要数据来源',
            keySections: [],
          },
          supportingAssets: [],
        },
        suggestedExperts: [],
        timeline: {
          suggestedPublishTime: '',
          urgency: 'flexible',
          timeWindowReason: '',
        },
      },
    };
  }

  private validateFormat(val: any): 'report' | 'article' | 'brief' | 'infographic' {
    const valid = ['report', 'article', 'brief', 'infographic'];
    return valid.includes(val) ? val : 'article';
  }

  private validatePriority(val: any): 'high' | 'medium' | 'low' {
    const valid = ['high', 'medium', 'low'];
    return valid.includes(val) ? val : 'medium';
  }

  private validateRole(val: any): 'fact_checker' | 'logic_checker' | 'domain_expert' {
    const valid = ['fact_checker', 'logic_checker', 'domain_expert'];
    return valid.includes(val) ? val : 'domain_expert';
  }

  private validateUrgency(val: any): 'immediate' | 'today' | 'this_week' | 'flexible' {
    const valid = ['immediate', 'today', 'this_week', 'flexible'];
    return valid.includes(val) ? val : 'flexible';
  }
}

// ============================================
// 4. 去重检测 Processor
// ============================================
export interface DuplicateDetectionProcessorInput {
  assetId: string;
  embedding: number[];
}

export interface DuplicateDetectionProcessorOutput {
  duplicate: DuplicateDetection;
  processingTimeMs: number;
}

// 相似度阈值
const SIMILARITY_THRESHOLDS = {
  exact: 0.95, // >95% 视为完全相同
  high: 0.8, // >80% 视为高度相似
  medium: 0.6, // >60% 视为中度相似
  low: 0.4, // >40% 视为低度相似
};

export class AssetDuplicateDetectionProcessor {
  async process(input: DuplicateDetectionProcessorInput): Promise<DuplicateDetectionProcessorOutput> {
    const startTime = Date.now();

    try {
      // 1. 向量相似度搜索（找到候选集）
      const candidates = await this.searchSimilarDocuments(
        input.embedding,
        SIMILARITY_THRESHOLDS.low,
        10
      );

      // 2. 判断是否重复
      const bestMatch = candidates[0];
      if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLDS.exact) {
        return {
          duplicate: {
            isDuplicate: true,
            duplicateOf: bestMatch.assetId,
            similarityGroupId: await this.getSimilarityGroup(bestMatch.assetId),
            confidence: bestMatch.similarity,
            similarAssets: candidates.map((m) => ({
              assetId: m.assetId,
              assetTitle: m.title,
              similarity: m.similarity,
              matchType: this.getMatchType(m.similarity),
              matchedChunks: m.matchedChunks,
            })),
            analysis: {
              reason: bestMatch.similarity > 0.98 ? 'same_content' : 'same_source',
              commonSections: [],
              differences: [],
              recommendation: 'archive',
            },
          },
          processingTimeMs: Date.now() - startTime,
        };
      }

      // 3. 未重复，但可能有相似内容
      return {
        duplicate: {
          isDuplicate: false,
          confidence: bestMatch?.similarity || 0,
          similarAssets: candidates
            .filter((m) => m.similarity >= SIMILARITY_THRESHOLDS.medium)
            .map((m) => ({
              assetId: m.assetId,
              assetTitle: m.title,
              similarity: m.similarity,
              matchType: this.getMatchType(m.similarity),
              matchedChunks: m.matchedChunks,
            })),
        },
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[AssetDuplicateDetectionProcessor] Failed:', error);
      return {
        duplicate: {
          isDuplicate: false,
          confidence: 0,
          similarAssets: [],
        },
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private async searchSimilarDocuments(
    embedding: number[],
    threshold: number,
    limit: number
  ): Promise<Array<{ assetId: string; title: string; similarity: number; matchedChunks: number }>> {
    try {
      // 将 embedding 数组转换为 pgvector 格式
      const embeddingStr = '[' + embedding.join(',') + ']';
      
      const result = await query(
        `SELECT 
          asset_id,
          1 - (chunk_embedding <=> $1::vector) AS similarity
        FROM asset_embeddings
        WHERE asset_id != $2
          AND 1 - (chunk_embedding <=> $1::vector) > $3
        ORDER BY chunk_embedding <=> $1::vector
        LIMIT $4`,
        [embeddingStr, '', threshold, limit]
      );

      // 获取 asset 标题
      const assetIds = result.rows.map((r) => r.asset_id);
      if (assetIds.length === 0) return [];

      const assetsResult = await query(
        `SELECT id, title FROM assets WHERE id = ANY($1)`,
        [assetIds]
      );

      const titleMap = new Map(assetsResult.rows.map((r) => [r.id, r.title]));

      return result.rows.map((r) => ({
        assetId: r.asset_id,
        title: titleMap.get(r.asset_id) || 'Unknown',
        similarity: parseFloat(r.similarity),
        matchedChunks: 1, // 简化处理
      }));
    } catch (error) {
      console.error('[AssetDuplicateDetectionProcessor] Search failed:', error);
      return [];
    }
  }

  private async getSimilarityGroup(assetId: string): Promise<string | undefined> {
    try {
      const result = await query(
        `SELECT id FROM asset_similarity_groups WHERE $1 = ANY(asset_ids) LIMIT 1`,
        [assetId]
      );
      return result.rows[0]?.id;
    } catch (error) {
      return undefined;
    }
  }

  private getMatchType(similarity: number): 'exact' | 'high' | 'medium' | 'low' {
    if (similarity >= SIMILARITY_THRESHOLDS.exact) return 'exact';
    if (similarity >= SIMILARITY_THRESHOLDS.high) return 'high';
    if (similarity >= SIMILARITY_THRESHOLDS.medium) return 'medium';
    return 'low';
  }
}

// ============================================
// Processor 工厂
// ============================================
export class AssetProcessorFactory {
  private static instances: Map<string, any> = new Map();

  static getQualityProcessor(): AssetQualityProcessor {
    if (!this.instances.has('quality')) {
      this.instances.set('quality', new AssetQualityProcessor());
    }
    return this.instances.get('quality');
  }

  static getClassificationProcessor(): AssetClassificationProcessor {
    if (!this.instances.has('classification')) {
      this.instances.set('classification', new AssetClassificationProcessor());
    }
    return this.instances.get('classification');
  }

  static getTaskRecommendationProcessor(): AssetTaskRecommendationProcessor {
    if (!this.instances.has('taskRecommendation')) {
      this.instances.set('taskRecommendation', new AssetTaskRecommendationProcessor());
    }
    return this.instances.get('taskRecommendation');
  }

  static getDuplicateDetectionProcessor(): AssetDuplicateDetectionProcessor {
    if (!this.instances.has('duplicateDetection')) {
      this.instances.set('duplicateDetection', new AssetDuplicateDetectionProcessor());
    }
    return this.instances.get('duplicateDetection');
  }
}
