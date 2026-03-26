// AI 批量处理核心 Processors
// v6.1 RSS 内容智能分析处理服务

import { RSSItem } from '../rssCollector.js';
import { llmClient, LLMResponse } from './llmClient.js';

// ============================================
// JSON 解析工具函数
// ============================================

function safeJsonParse(content: string): any {
  // 1. 清理前后空白和 markdown 代码块标记
  let cleaned = content.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  
  // 2. 提取 JSON 对象（处理 LLM 返回的额外文本）
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
  
  // 3. 清理非法字符和格式问题
  const cleanedJson = jsonStr
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 移除控制字符
    .replace(/,\s*([}\]])/g, '$1') // 移除尾随逗号
    .replace(/(['"])(\w+)\1\s*:/g, '"$2":') // 统一引号
    .replace(/:\s*'(.*?)'/g, ':"$1"'); // 将单引号值转为双引号
  
  try {
    return JSON.parse(cleanedJson);
  } catch (error) {
    // 如果失败，尝试更宽松的清理
    const relaxedJson = cleanedJson
      .replace(/\n/g, ' ') // 移除换行
      .replace(/\s+/g, ' ') // 合并多个空格
      .replace(/([{,])\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":'); // 给无引号的 key 加引号
    
    return JSON.parse(relaxedJson);
  }
}
import {
  promptManager,
  QualityPromptParams,
  CategoryPromptParams,
  SentimentPromptParams,
  TaskRecommendationPromptParams,
  BatchQualityPromptParams,
} from './prompts.js';

// ============================================
// 类型定义
// ============================================

export interface QualityScore {
  overall: number;
  dimensions: {
    contentRichness: number;
    sourceCredibility: number;
    timeliness: number;
    uniqueness: number;
    readability: number;
    dataSupport: number;
  };
  aiAssessment: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendation: 'promote' | 'normal' | 'demote' | 'filter';
    confidence: number;
  };
}

export interface CategoryAnalysis {
  primaryCategory: {
    domain: string;
    confidence: number;
    reason: string;
  };
  secondaryCategories: {
    domain: string;
    confidence: number;
  }[];
  tags: {
    tag: string;
    confidence: number;
    type: string;
  }[];
  entities: {
    name: string;
    type: string;
    mentions: number;
  }[];
  expertLibraryMatch: {
    matchedDomains: string[];
    suggestedExperts: string[];
    confidence: number;
  };
}

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative' | 'mixed';
  score: number;
  dimensions: {
    marketSentiment: number;
    policySentiment: number;
    industryOutlook: number;
    investmentSentiment: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  keyOpinions: {
    opinion: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    confidence: number;
    context?: string;
  }[];
  keyElements: {
    opportunities: string[];
    risks: string[];
    uncertainties: string[];
    catalysts: string[];
  };
  intensity: 'strong' | 'moderate' | 'weak';
  stance: 'bullish' | 'bearish' | 'neutral' | 'mixed';
}

export interface TaskRecommendation {
  title: string;
  format: 'report' | 'article' | 'brief' | 'thread';
  priority: 'high' | 'medium' | 'low';
  reason: string;
  content: {
    angle: string;
    keyPoints: string[];
    targetAudience: string;
    estimatedReadTime: number;
    suggestedLength: string;
  };
  differentiation: {
    uniqueAngle: string;
    contentGap: string[];
    competitiveAdvantage: string;
  };
  suggestedAssets: {
    assetId: string;
    relevanceScore: number;
    usageSuggestion: string;
  }[];
  suggestedExperts: {
    role: string;
    domain: string;
    reason: string;
  }[];
  timeline: {
    suggestedPublishTime: string;
    urgency: 'immediate' | 'today' | 'this_week' | 'flexible';
    timeWindowReason: string;
  };
}

export interface AIAnalysisResult {
  rssItemId: string;
  quality: QualityScore;
  category: CategoryAnalysis;
  sentiment: SentimentAnalysis;
  taskRecommendation?: TaskRecommendation;
  processingTimeMs: number;
  modelVersion: string;
}

// ============================================
// 基础 Processor 类
// ============================================

abstract class BaseProcessor<TInput, TOutput> {
  protected llm = llmClient;
  protected abstract promptName: string;

  async process(input: TInput): Promise<TOutput> {
    const startTime = Date.now();
    
    try {
      const prompt = this.createPrompt(input);
      const response = await this.llm.complete({
        prompt: prompt.userPrompt,
        systemPrompt: prompt.systemPrompt,
        temperature: 0.3,
        maxTokens: 16000,
        responseFormat: 'json',
      });

      const result = this.parseResponse(response);
      
      return {
        ...result,
        processingTimeMs: Date.now() - startTime,
      } as TOutput;
    } catch (error) {
      console.error(`[${this.constructor.name}] Processing failed:`, error);
      return this.createFallbackResult(error as Error) as TOutput;
    }
  }

  abstract createPrompt(input: TInput): { systemPrompt: string; userPrompt: string };
  abstract parseResponse(response: LLMResponse): Omit<TOutput, 'processingTimeMs'>;
  abstract createFallbackResult(error: Error): Omit<TOutput, 'processingTimeMs'>;
}

// ============================================
// 质量评估 Processor
// ============================================

export class QualityProcessor extends BaseProcessor<RSSItem, { quality: QualityScore; processingTimeMs: number }> {
  protected promptName = 'quality';

  createPrompt(item: RSSItem): { systemPrompt: string; userPrompt: string } {
    const params: QualityPromptParams = {
      title: item.title,
      content: item.content || item.summary || '',
      source: item.sourceName,
      publishedAt: item.publishedAt.toISOString(),
      wordCount: (item.content || item.summary || '').length,
    };
    return promptManager.createPrompt('quality', params);
  }

  parseResponse(response: LLMResponse): { quality: QualityScore } {
    try {
      let content = response.content.trim();
      
      // 处理可能的 markdown 代码块
      content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      
      // 尝试提取 JSON 对象（有时 LLM 会返回额外的文本）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      
      // 清理可能的非法字符
      const cleanedJson = jsonStr
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 移除控制字符
        .replace(/,\s*([}\]])/g, '$1'); // 移除尾随逗号
      
      const parsed = safeJsonParse(cleanedJson);

      return {
        quality: {
          overall: this.clampScore(parsed.overall),
          dimensions: {
            contentRichness: this.clampScore(parsed.dimensions?.contentRichness),
            sourceCredibility: this.clampScore(parsed.dimensions?.sourceCredibility),
            timeliness: this.clampScore(parsed.dimensions?.timeliness),
            uniqueness: this.clampScore(parsed.dimensions?.uniqueness),
            readability: this.clampScore(parsed.dimensions?.readability),
            dataSupport: this.clampScore(parsed.dimensions?.dataSupport),
          },
          aiAssessment: {
            summary: parsed.aiAssessment?.summary || '',
            strengths: parsed.aiAssessment?.strengths?.slice(0, 3) || [],
            weaknesses: parsed.aiAssessment?.weaknesses?.slice(0, 3) || [],
            recommendation: this.validateRecommendation(parsed.aiAssessment?.recommendation),
            confidence: this.clampConfidence(parsed.aiAssessment?.confidence),
          },
        },
      };
    } catch (error) {
      console.error('[QualityProcessor] Failed to parse response:', error);
      console.error('[QualityProcessor] Raw content:', response.content?.substring(0, 500));
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): { quality: QualityScore } {
    return {
      quality: {
        overall: 50,
        dimensions: {
          contentRichness: 50,
          sourceCredibility: 50,
          timeliness: 50,
          uniqueness: 50,
          readability: 50,
          dataSupport: 50,
        },
        aiAssessment: {
          summary: `分析失败: ${error.message}`,
          strengths: [],
          weaknesses: ['AI 分析过程中发生错误'],
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

  private validateRecommendation(rec: any): 'promote' | 'normal' | 'demote' | 'filter' {
    const valid = ['promote', 'normal', 'demote', 'filter'];
    return valid.includes(rec) ? rec : 'normal';
  }
}

// ============================================
// 领域分类 Processor
// ============================================

export class CategoryProcessor extends BaseProcessor<RSSItem, { category: CategoryAnalysis; processingTimeMs: number }> {
  protected promptName = 'category';

  createPrompt(item: RSSItem): { systemPrompt: string; userPrompt: string } {
    const params: CategoryPromptParams = {
      title: item.title,
      content: item.content || item.summary || '',
      source: item.sourceName,
      existingTags: item.tags,
    };
    return promptManager.createPrompt('category', params);
  }

  parseResponse(response: LLMResponse): { category: CategoryAnalysis } {
    try {
      const content = response.content.trim();
      const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        category: {
          primaryCategory: {
            domain: parsed.primaryCategory?.domain || '其他',
            confidence: this.clampConfidence(parsed.primaryCategory?.confidence),
            reason: parsed.primaryCategory?.reason || '',
          },
          secondaryCategories: (parsed.secondaryCategories || [])
            .filter((c: any) => c.confidence > 0.3)
            .slice(0, 3)
            .map((c: any) => ({
              domain: c.domain,
              confidence: this.clampConfidence(c.confidence),
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
          expertLibraryMatch: {
            matchedDomains: parsed.expertLibraryMatch?.matchedDomains || [],
            suggestedExperts: parsed.expertLibraryMatch?.suggestedExperts || [],
            confidence: this.clampConfidence(parsed.expertLibraryMatch?.confidence),
          },
        },
      };
    } catch (error) {
      console.error('[CategoryProcessor] Failed to parse response:', error);
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): { category: CategoryAnalysis } {
    return {
      category: {
        primaryCategory: {
          domain: '其他',
          confidence: 0,
          reason: `分类失败: ${error.message}`,
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
    };
  }

  private clampConfidence(conf: any): number {
    const num = Number(conf);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(1, num));
  }
}

// ============================================
// 情感分析 Processor
// ============================================

export class SentimentProcessor extends BaseProcessor<RSSItem, { sentiment: SentimentAnalysis; processingTimeMs: number }> {
  protected promptName = 'sentiment';

  createPrompt(item: RSSItem): { systemPrompt: string; userPrompt: string } {
    const params: SentimentPromptParams = {
      title: item.title,
      content: item.content || item.summary || '',
      source: item.sourceName,
    };
    return promptManager.createPrompt('sentiment', params);
  }

  parseResponse(response: LLMResponse): { sentiment: SentimentAnalysis } {
    try {
      const content = response.content.trim();
      const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);

      return {
        sentiment: {
          overall: this.validateOverall(parsed.overall),
          score: this.clampScore(parsed.score),
          dimensions: {
            marketSentiment: this.clampScore(parsed.dimensions?.marketSentiment),
            policySentiment: this.clampScore(parsed.dimensions?.policySentiment),
            industryOutlook: this.clampScore(parsed.dimensions?.industryOutlook),
            investmentSentiment: this.clampScore(parsed.dimensions?.investmentSentiment),
            riskLevel: this.validateRiskLevel(parsed.dimensions?.riskLevel),
          },
          keyOpinions: (parsed.keyOpinions || [])
            .slice(0, 5)
            .map((o: any) => ({
              opinion: o.opinion,
              sentiment: this.validateOpinionSentiment(o.sentiment),
              confidence: this.clampConfidence(o.confidence),
              context: o.context,
            })),
          keyElements: {
            opportunities: parsed.keyElements?.opportunities || [],
            risks: parsed.keyElements?.risks || [],
            uncertainties: parsed.keyElements?.uncertainties || [],
            catalysts: parsed.keyElements?.catalysts || [],
          },
          intensity: this.validateIntensity(parsed.intensity),
          stance: this.validateStance(parsed.stance),
        },
      };
    } catch (error) {
      console.error('[SentimentProcessor] Failed to parse response:', error);
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): { sentiment: SentimentAnalysis } {
    return {
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
    };
  }

  private clampScore(score: any): number {
    const num = Number(score);
    if (isNaN(num)) return 0;
    return Math.max(-100, Math.min(100, Math.round(num)));
  }

  private clampConfidence(conf: any): number {
    const num = Number(conf);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(1, num));
  }

  private validateOverall(val: any): 'positive' | 'neutral' | 'negative' | 'mixed' {
    const valid = ['positive', 'neutral', 'negative', 'mixed'];
    return valid.includes(val) ? val : 'neutral';
  }

  private validateRiskLevel(val: any): 'low' | 'medium' | 'high' {
    const valid = ['low', 'medium', 'high'];
    return valid.includes(val) ? val : 'medium';
  }

  private validateOpinionSentiment(val: any): 'positive' | 'neutral' | 'negative' {
    const valid = ['positive', 'neutral', 'negative'];
    return valid.includes(val) ? val : 'neutral';
  }

  private validateIntensity(val: any): 'strong' | 'moderate' | 'weak' {
    const valid = ['strong', 'moderate', 'weak'];
    return valid.includes(val) ? val : 'weak';
  }

  private validateStance(val: any): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
    const valid = ['bullish', 'bearish', 'neutral', 'mixed'];
    return valid.includes(val) ? val : 'neutral';
  }
}

// ============================================
// 任务推荐 Processor
// ============================================

export interface TaskRecommendationInput {
  item: RSSItem;
  quality: QualityScore;
  category: CategoryAnalysis;
  sentiment: SentimentAnalysis;
}

export class TaskRecommendationProcessor extends BaseProcessor<TaskRecommendationInput, { taskRecommendation: TaskRecommendation; processingTimeMs: number }> {
  protected promptName = 'taskRecommendation';

  createPrompt(input: TaskRecommendationInput): { systemPrompt: string; userPrompt: string } {
    const params: TaskRecommendationPromptParams = {
      title: input.item.title,
      summary: input.item.summary || input.item.content?.slice(0, 500) || '',
      source: input.item.sourceName,
      publishedAt: input.item.publishedAt.toISOString(),
      qualityScore: input.quality.overall,
      category: input.category.primaryCategory.domain,
      sentiment: input.sentiment.overall,
      sentimentScore: input.sentiment.score,
      tags: input.category.tags.map(t => t.tag),
    };
    return promptManager.createPrompt('taskRecommendation', params);
  }

  parseResponse(response: LLMResponse): { taskRecommendation: TaskRecommendation } {
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
            targetAudience: rec?.content?.targetAudience || '',
            estimatedReadTime: Number(rec?.content?.estimatedReadTime) || 5,
            suggestedLength: rec?.content?.suggestedLength || '',
          },
          differentiation: {
            uniqueAngle: rec?.differentiation?.uniqueAngle || '',
            contentGap: rec?.differentiation?.contentGap || [],
            competitiveAdvantage: rec?.differentiation?.competitiveAdvantage || '',
          },
          suggestedAssets: (rec?.suggestedAssets || []).map((a: any) => ({
            assetId: a.assetId,
            relevanceScore: Number(a.relevanceScore) || 0.5,
            usageSuggestion: a.usageSuggestion || '',
          })),
          suggestedExperts: (rec?.suggestedExperts || []).map((e: any) => ({
            role: e.role,
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
      console.error('[TaskRecommendationProcessor] Failed to parse response:', error);
      return this.createFallbackResult(error as Error);
    }
  }

  createFallbackResult(error: Error): { taskRecommendation: TaskRecommendation } {
    return {
      taskRecommendation: {
        title: '推荐生成失败',
        format: 'article',
        priority: 'medium',
        reason: `任务推荐生成失败: ${error.message}`,
        content: {
          angle: '',
          keyPoints: [],
          targetAudience: '',
          estimatedReadTime: 5,
          suggestedLength: '',
        },
        differentiation: {
          uniqueAngle: '',
          contentGap: [],
          competitiveAdvantage: '',
        },
        suggestedAssets: [],
        suggestedExperts: [],
        timeline: {
          suggestedPublishTime: '',
          urgency: 'flexible',
          timeWindowReason: '',
        },
      },
    };
  }

  private validateFormat(val: any): 'report' | 'article' | 'brief' | 'thread' {
    const valid = ['report', 'article', 'brief', 'thread'];
    return valid.includes(val) ? val : 'article';
  }

  private validatePriority(val: any): 'high' | 'medium' | 'low' {
    const valid = ['high', 'medium', 'low'];
    return valid.includes(val) ? val : 'medium';
  }

  private validateUrgency(val: any): 'immediate' | 'today' | 'this_week' | 'flexible' {
    const valid = ['immediate', 'today', 'this_week', 'flexible'];
    return valid.includes(val) ? val : 'flexible';
  }
}

// ============================================
// Processor 工厂
// ============================================

export class ProcessorFactory {
  private static instances: Map<string, any> = new Map();

  static getQualityProcessor(): QualityProcessor {
    if (!this.instances.has('quality')) {
      this.instances.set('quality', new QualityProcessor());
    }
    return this.instances.get('quality');
  }

  static getCategoryProcessor(): CategoryProcessor {
    if (!this.instances.has('category')) {
      this.instances.set('category', new CategoryProcessor());
    }
    return this.instances.get('category');
  }

  static getSentimentProcessor(): SentimentProcessor {
    if (!this.instances.has('sentiment')) {
      this.instances.set('sentiment', new SentimentProcessor());
    }
    return this.instances.get('sentiment');
  }

  static getTaskRecommendationProcessor(): TaskRecommendationProcessor {
    if (!this.instances.has('taskRecommendation')) {
      this.instances.set('taskRecommendation', new TaskRecommendationProcessor());
    }
    return this.instances.get('taskRecommendation');
  }
}

// 导出便捷函数
export async function analyzeQuality(item: RSSItem): Promise<{ quality: QualityScore; processingTimeMs: number }> {
  return ProcessorFactory.getQualityProcessor().process(item);
}

export async function analyzeCategory(item: RSSItem): Promise<{ category: CategoryAnalysis; processingTimeMs: number }> {
  return ProcessorFactory.getCategoryProcessor().process(item);
}

export async function analyzeSentiment(item: RSSItem): Promise<{ sentiment: SentimentAnalysis; processingTimeMs: number }> {
  return ProcessorFactory.getSentimentProcessor().process(item);
}

export async function generateTaskRecommendation(
  input: TaskRecommendationInput
): Promise<{ taskRecommendation: TaskRecommendation; processingTimeMs: number }> {
  return ProcessorFactory.getTaskRecommendationProcessor().process(input);
}
