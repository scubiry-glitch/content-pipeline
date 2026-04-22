// assetsAi.ts
// v6.2: Assets AI 批量处理 API 客户端

import apiClient from './client';

export interface AssetsBatchProcessRequest {
  assetIds?: string[];
  priority?: 'high' | 'normal' | 'low';
  force?: boolean;
  includeEmbedding?: boolean;
  /** v7.4: 深度分析开关 */
  enableDeepAnalysis?: boolean;
  /** Round 2: 专家应用策略配置 */
  expertStrategy?: ExpertStrategySpec;
  config?: {
    batchSize?: number;
    qualityThreshold?: number;
  };
}

/** Round 2: 专家应用策略配置 */
export interface ExpertStrategySpec {
  preset?: 'lite' | 'standard' | 'max' | 'custom';
  default?: string;
  perDeliverable?: Record<string, string>;
}

// ============================================================
// Round 2: Asset 深度分析响应（⑤-⑮ deliverables + 专家调用痕迹）
// ============================================================
export interface ControversyStakeholder {
  name: string;
  position: string;
  interest: string;
  credibility: 'high' | 'medium' | 'low';
}

export interface ControversyAnalysisItem {
  contradictionId: string;
  factA: { subject: string; predicate: string; object: string; confidence: number };
  factB: { subject: string; predicate: string; object: string; confidence: number };
  contradictionType: string;
  stakeholders?: ControversyStakeholder[];
  evidenceChainA?: string[];
  evidenceChainB?: string[];
  steelmanA?: string;
  steelmanB?: string;
  temporalContext?: string;
  sourceCredibilityGap?: string;
  realWorldImpact?: { level: string; reasoning: string };
  resolution?: string;
  residualUncertainty?: string;
  analyzedByExpertId?: string;
  expertInvokeId?: string;
}

export interface ExpertInvocationItem {
  deliverable: string;
  expertId: string;
  invokeId: string;
  emmPass: boolean;
  confidence?: number;
  durationMs?: number;
  strategy?: string;
  stage?: string;
}

export interface AssetDeepAnalysisResponse {
  assetId: string;
  matchedDomainExpertIds: string[];
  matchedSeniorExpertId?: string;
  matchReasons: string[];
  topicRecommendations?: any;
  trendSignals?: any;
  differentiationGaps?: any;
  knowledgeBlanks?: any;
  keyFacts?: any;
  entityGraph?: any;
  deltaReport?: any;
  staleFacts?: any;
  knowledgeCard?: any;
  insights?: any;
  materialRecommendations?: any;
  expertConsensus?: any;
  controversies?: ControversyAnalysisItem[];
  beliefEvolution?: any;
  crossDomainInsights?: any;
  expertInvocations: ExpertInvocationItem[];
  processingTimeMs: number;
  modelVersion: string;
}

export interface AssetsBatchProcessResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalAssets: number;
  message: string;
}

export interface AssetAIAnalysisResponse {
  assetId: string;
  quality: {
    overall: number;
    dimensions: {
      completeness: number;
      dataQuality: number;
      sourceAuthority: number;
      timeliness: number;
      readability: number;
      practicality: number;
    };
    aiAssessment: {
      summary: string;
      strengths: string[];
      weaknesses: string[];
      keyInsights: string[];
      dataHighlights: string[];
      recommendation: 'highly_recommended' | 'recommended' | 'normal' | 'archive';
      confidence: number;
    };
  };
  classification: {
    primaryTheme: {
      themeId: string;
      themeName: string;
      confidence: number;
      reason?: string;
    };
    secondaryThemes: Array<{
      themeId: string;
      themeName: string;
      confidence: number;
    }>;
    tags: Array<{
      tag: string;
      confidence: number;
      type: string;
    }>;
    entities: Array<{
      name: string;
      type: string;
      mentions: number;
    }>;
  };
  duplicate?: {
    isDuplicate: boolean;
    duplicateOf?: string;
    similarAssets: Array<{
      assetId: string;
      assetTitle: string;
      similarity: number;
    }>;
  };
  taskRecommendation?: {
    title: string;
    format: 'report' | 'article' | 'brief' | 'infographic';
    priority: 'high' | 'medium' | 'low';
    reason: string;
    content: {
      angle: string;
      keyPoints: string[];
      targetAudience: string;
      estimatedReadTime: number;
      suggestedLength: string;
    };
  };
  processingTimeMs: number;
  modelVersion: string;
}

export interface SemanticSearchRequest {
  query: string;
  themeId?: string;
  minQualityScore?: number;
  limit?: number;
  threshold?: number;
}

export interface SemanticSearchResponse {
  items: Array<{
    assetId: string;
    title: string;
    source?: string;
    qualityScore?: number;
    relevanceScore: number;
    matchedChunks: Array<{
      text: string;
      type: string;
      similarity: number;
    }>;
  }>;
  total: number;
  query: string;
}

export interface AnalysisResultsQuery {
  minQualityScore?: number;
  maxQualityScore?: number;
  themeId?: string;
  hasTaskRecommendation?: boolean;
  analyzedAfter?: string;
  analyzedBefore?: string;
  sortBy?: 'quality' | 'time';
  limit?: number;
  offset?: number;
}

export const assetsAiApi = {
  /**
   * 触发 Assets 批量处理
   */
  async triggerBatchProcess(params: AssetsBatchProcessRequest = {}): Promise<AssetsBatchProcessResponse> {
    const data = await apiClient.post('/ai/assets/batch-process', params);
    return data as unknown as AssetsBatchProcessResponse;
  },

  /**
   * 获取 Asset AI 分析结果
   */
  async getAnalysis(assetId: string): Promise<AssetAIAnalysisResponse> {
    const data = await apiClient.get(`/ai/assets/assets/${assetId}/ai-analysis`);
    return data as unknown as AssetAIAnalysisResponse;
  },

  /**
   * Round 2: 获取 Asset 深度分析结果（15 deliverable + 专家调用痕迹）
   * 返回 null 表示该 asset 还没跑过深度分析
   */
  async getDeepAnalysis(assetId: string): Promise<AssetDeepAnalysisResponse | null> {
    try {
      const data = await apiClient.get(`/ai/assets/assets/${assetId}/deep-analysis`);
      return data as unknown as AssetDeepAnalysisResponse;
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.status === 404 || err?.code === 'NOT_FOUND') {
        return null;
      }
      throw err;
    }
  },

  /**
   * 语义搜索
   */
  async semanticSearch(params: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    const data = await apiClient.post('/ai/assets/semantic-search', params);
    return data as unknown as SemanticSearchResponse;
  },

  /**
   * 查找相似素材
   */
  async findSimilar(assetId: string, limit?: number): Promise<{
    assetId: string;
    similarAssets: Array<{
      assetId: string;
      title: string;
      similarity: number;
    }>;
  }> {
    const data = await apiClient.get(`/ai/assets/assets/${assetId}/similar`, {
      params: { limit },
    });
    return data as any;
  },

  /**
   * 获取去重结果
   */
  async getDuplicates(assetId: string): Promise<{
    assetId: string;
    isDuplicate: boolean;
    duplicateOf?: string;
    similarAssets: Array<{
      assetId: string;
      title: string;
      similarity: number;
    }>;
  }> {
    const data = await apiClient.get(`/ai/assets/assets/${assetId}/duplicates`);
    return data as any;
  },

  /**
   * 查询分析结果列表
   */
  async queryAnalysisResults(params: AnalysisResultsQuery = {}): Promise<{
    items: Array<{
      asset_id: string;
      title: string;
      source?: string;
      file_type?: string;
      ai_quality_score?: number;
      ai_theme_id?: string;
      ai_analyzed_at: string;
      has_task_recommendation: boolean;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const data = await apiClient.get('/ai/assets/analysis-results', { params });
    return data as any;
  },

  /**
   * 获取任务推荐列表
   */
  async getTaskRecommendations(params: {
    sourceType?: 'asset' | 'rss' | 'all';
    status?: 'pending' | 'accepted' | 'rejected' | 'all';
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    items: Array<{
      id: string;
      source_type: string;
      source_asset_id?: string;
      recommendation_data: any;
      status: string;
      source_title?: string;
      quality_score?: number;
    }>;
    limit: number;
    offset: number;
  }> {
    const data = await apiClient.get('/ai/assets/task-recommendations', { params });
    return data as any;
  },

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalAnalyzed: number;
    analyzedToday: number;
    averageQualityScore: number;
    pendingRecommendations: number;
  }> {
    const data = await apiClient.get('/ai/assets/stats');
    return data as any;
  },

  /**
   * 获取主题分布
   */
  async getThemeStats(): Promise<{
    items: Array<{
      theme_id: string;
      count: number;
      avg_quality: number;
    }>;
  }> {
    const data = await apiClient.get('/ai/assets/stats/themes');
    return data as any;
  },

  /**
   * 获取质量分布
   */
  async getQualityStats(): Promise<{
    items: Array<{
      quality_range: string;
      count: number;
    }>;
  }> {
    const data = await apiClient.get('/ai/assets/stats/quality');
    return data as any;
  },
};
