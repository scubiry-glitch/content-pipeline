// ============================================
// v6.2 Assets AI 批量处理 - 类型定义
// ============================================

// ============================================
// Asset 基础类型
// ============================================
export interface Asset {
  id: string;
  title: string;
  content?: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  source?: string;
  author?: string;
  publishedAt?: Date;
  createdAt: Date;
  metadata?: AssetMetadata;
}

export interface AssetMetadata {
  pageCount?: number;
  wordCount?: number;
  abstract?: string;
  keywords?: string[];
  language?: string;
}

// ============================================
// 质量评估类型
// ============================================
export interface AssetQualityDimensions {
  completeness: number;       // 完整性 0-100
  dataQuality: number;        // 数据质量 0-100
  sourceAuthority: number;    // 来源权威性 0-100
  timeliness: number;         // 时效性 0-100
  readability: number;        // 可读性 0-100
  practicality: number;       // 实用性 0-100
}

export interface AssetStructureAnalysis {
  hasAbstract: boolean;
  hasTableOfContents: boolean;
  hasCharts: boolean;
  hasDataTables: boolean;
  hasConclusion: boolean;
  hasReferences: boolean;
  pageCount: number;
  wordCount: number;
}

export interface AssetQualityAssessment {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  keyInsights: string[];
  dataHighlights: string[];
  recommendation: 'highly_recommended' | 'recommended' | 'normal' | 'archive';
  confidence: number;
}

export interface AssetQualityScore {
  overall: number;        // 综合得分 0-100
  dimensions: AssetQualityDimensions;
  structure: AssetStructureAnalysis;
  aiAssessment: AssetQualityAssessment;
}

// ============================================
// 主题分类类型
// ============================================
export interface ThemeMatch {
  themeId: string;
  themeName: string;
  confidence: number;
  reason?: string;
}

export interface ExpertLibraryMapping {
  domain: string;
  confidence: number;
  mappedFrom: string;
}

export interface ExtractedTag {
  tag: string;
  confidence: number;
  type: 'industry' | 'concept' | 'company' | 'person' | 'technology' | 'product' | 'time' | 'event' | 'other';
}

export interface ExtractedEntity {
  name: string;
  type: string;
  mentions: number;
}

export interface AssetThemeClassification {
  primaryTheme: ThemeMatch;
  secondaryThemes: ThemeMatch[];
  expertLibraryMapping: ExpertLibraryMapping[];
  tags: ExtractedTag[];
  entities: ExtractedEntity[];
}

// ============================================
// 向量化类型
// ============================================
export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  type: 'abstract' | 'toc' | 'body' | 'conclusion' | 'chart';
  chapterTitle?: string;
  startPage?: number;
  endPage?: number;
  priority: number;
}

export interface AssetVectorization {
  assetId: string;
  documentEmbedding: number[];
  chunks: {
    chunkIndex: number;
    chunkText: string;
    chunkEmbedding: number[];
    chunkType: string;
    chapterTitle?: string;
    startPage?: number;
    endPage?: number;
    priority: number;
  }[];
  vectorModel: string;
  createdAt: string;
}

// ============================================
// 去重检测类型
// ============================================
export interface SimilarAssetMatch {
  assetId: string;
  assetTitle: string;
  similarity: number;
  matchType: 'exact' | 'high' | 'medium' | 'low';
  matchedChunks: number;
}

export interface DuplicateAnalysis {
  reason: 'same_source' | 'same_content' | 'new_version' | 'partial_overlap';
  commonSections: string[];
  differences: string[];
  recommendation: 'merge' | 'archive' | 'keep' | 'review';
}

export interface DuplicateDetection {
  isDuplicate: boolean;
  duplicateOf?: string;
  similarityGroupId?: string;
  confidence: number;
  similarAssets: SimilarAssetMatch[];
  analysis?: DuplicateAnalysis;
}

// ============================================
// 任务推荐类型
// ============================================
export interface AssetCombination {
  primaryAsset: {
    assetId: string;
    usage: string;
    keySections: string[];
  };
  supportingAssets: {
    assetId: string;
    relevanceScore: number;
    usageSuggestion: string;
  }[];
}

export interface SuggestedExpert {
  role: 'fact_checker' | 'logic_checker' | 'domain_expert';
  domain: string;
  reason: string;
}

export interface AssetTaskRecommendation {
  title: string;
  format: 'report' | 'article' | 'brief' | 'infographic';
  priority: 'high' | 'medium' | 'low';
  reason: string;
  content: {
    angle: string;
    keyPoints: string[];
    dataHighlights: string[];
    targetAudience: string;
    estimatedReadTime: number;
    suggestedLength: string;
  };
  assetCombination: AssetCombination;
  suggestedExperts: SuggestedExpert[];
  timeline: {
    suggestedPublishTime: string;
    urgency: 'immediate' | 'today' | 'this_week' | 'flexible';
    timeWindowReason: string;
  };
}

// ============================================
// AI 分析结果类型
// ============================================
export interface AssetAIAnalysisResult {
  assetId: string;
  quality: AssetQualityScore;
  classification: AssetThemeClassification;
  vectorization?: AssetVectorization;
  duplicate?: DuplicateDetection;
  taskRecommendation?: AssetTaskRecommendation;
  /** v7.4: 深度分析结果 — 仅当 config.enableDeepAnalysis 为 true 时填充 */
  deepAnalysis?: AssetDeepAnalysis;
  processingTimeMs: number;
  modelVersion: string;
}

// ============================================
// v7.4 深度分析 — 15 deliverable + Expert Library
// ============================================
export interface ExpertInvocationTrace {
  deliverable: string;      // '⑩insights' / '⑫consensus' / '⑬controversy'
  expertId: string;
  invokeId: string;
  emmPass: boolean;
  confidence?: number;
  durationMs?: number;
}

export interface ControversyStakeholder {
  name: string;
  position: string;
  interest: string;
  credibility: 'high' | 'medium' | 'low';
}

export interface ControversyAnalysis {
  /** 原始矛盾 ID，来自 ContentLibraryEngine.getContradictions */
  contradictionId: string;
  factA: { subject: string; predicate: string; object: string; confidence: number };
  factB: { subject: string; predicate: string; object: string; confidence: number };
  /** LLM 分析结果 */
  contradictionType: 'time_shift' | 'source_error' | 'real_disagreement' | 'definition_drift' | 'unknown';
  stakeholders: ControversyStakeholder[];
  evidenceChainA: string[];
  evidenceChainB: string[];
  steelmanA: string;
  steelmanB: string;
  temporalContext?: string;
  sourceCredibilityGap?: string;
  realWorldImpact: { level: 'high' | 'medium' | 'low'; reasoning: string };
  resolution: string;
  residualUncertainty?: string;
  /** 调用的专家 */
  analyzedByExpertId?: string;
  expertInvokeId?: string;
}

export interface AssetDeepAnalysis {
  assetId: string;
  matchedDomainExpertIds: string[];
  matchedSeniorExpertId?: string;
  matchReasons: string[];
  // 15 个 deliverable
  topicRecommendations?: unknown;
  trendSignals?: unknown;
  differentiationGaps?: unknown;
  knowledgeBlanks?: unknown;
  keyFacts?: unknown;
  entityGraph?: unknown;
  deltaReport?: unknown;
  staleFacts?: unknown;
  knowledgeCard?: unknown;
  insights?: unknown;
  materialRecommendations?: unknown;
  expertConsensus?: unknown;
  controversies?: ControversyAnalysis[];
  beliefEvolution?: unknown;
  crossDomainInsights?: unknown;
  expertInvocations: ExpertInvocationTrace[];
  processingTimeMs: number;
  modelVersion: string;
}

// ============================================
// 批处理配置类型
// ============================================
export interface AssetsBatchProcessingConfig {
  batchSize: number;
  maxConcurrency: number;
  qualityThreshold: number;
  enableVectorization: boolean;
  enableDuplicateDetection: boolean;
  enableTaskRecommendation: boolean;
  chunkSize: number;
  chunkOverlap: number;
  /** v7.4: 开启后跑完标签化再调用 ContentLibraryEngine 15 个 deliverable + 专家库 EMM */
  enableDeepAnalysis?: boolean;
}

export interface AssetsBatchProcessResult {
  total: number;
  success: number;
  failed: number;
  results: AssetAIAnalysisResult[];
  errors: { assetId: string; error: string }[];
  totalProcessingTimeMs: number;
}

// ============================================
// 语义搜索类型
// ============================================
export interface SemanticSearchOptions {
  themeId?: string;
  minQualityScore?: number;
  limit?: number;
  threshold?: number;
  chunkTypes?: string[];
}

export interface SemanticSearchResult {
  assetId: string;
  title: string;
  source?: string;
  qualityScore?: number;
  relevanceScore: number;
  matchedChunks: {
    text: string;
    type: string;
    similarity: number;
  }[];
}

// ============================================
// 数据库行类型
// ============================================
export interface AssetAIAnalysisRow {
  id: number;
  asset_id: string;
  quality_score: number;
  quality_dimensions: any;
  quality_summary: string;
  quality_strengths: string[];
  quality_weaknesses: string[];
  quality_key_insights: string[];
  quality_data_highlights: string[];
  quality_recommendation: string;
  structure_analysis: any;
  primary_theme_id: string;
  primary_theme_confidence: number;
  secondary_themes: any;
  expert_library_mapping: any;
  extracted_tags: any;
  extracted_entities: any;
  embedding_status: string;
  document_embedding: number[];
  chunk_count: number;
  embedding_model: string;
  duplicate_detection_result: any;
  similarity_group_id: string;
  has_recommendation: boolean;
  analyzed_at: Date;
  model_version: string;
  processing_time_ms: number;
}
