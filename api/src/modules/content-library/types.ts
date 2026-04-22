// Content Library Module — Core Type Definitions
// 独立模块，零外部依赖，所有外部服务通过 Adapter 接口注入
// 灵感来源: Hermes Agent Memory Providers (Hindsight / OpenViking / RetainDB / Mem0)

// ============================================================
// Adapter Interfaces (可插拔外部依赖 — 复用专家库模式)
// ============================================================

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

export interface LLMAdapter {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
  completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string>;
  embed?(text: string): Promise<number[]>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: 'text' | 'json';
}

export interface StorageAdapter {
  save(key: string, data: Buffer | string): Promise<string>;
  load(key: string): Promise<Buffer | null>;
}

export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EventBusAdapter {
  /** 发布事件（嵌入=EventEmitter, 独立=Redis/HTTP） */
  publish(event: string, payload: any): Promise<void>;
  /** 订阅事件 */
  subscribe(event: string, handler: (payload: any) => Promise<void>): void;
  /** 取消订阅 */
  unsubscribe(event: string): void;
}

export interface TextSearchAdapter {
  /** 全文检索（嵌入=PostgreSQL tsvector, 独立=可换 Elasticsearch/Meilisearch） */
  search(query: string, options?: TextSearchOptions): Promise<TextSearchResult[]>;
  /** 索引内容 */
  index(id: string, content: string, metadata?: Record<string, any>): Promise<void>;
  /** 批量索引 */
  indexBatch?(items: Array<{ id: string; content: string; metadata?: Record<string, any> }>): Promise<void>;
  /** 删除索引 */
  remove?(id: string): Promise<void>;
}

export interface TextSearchOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  /** 最低相关度阈值 (0-1) */
  minScore?: number;
}

export interface TextSearchResult {
  id: string;
  score: number;
  highlights?: string[];
  metadata?: Record<string, any>;
}

/** 注入 ContentLibraryEngine 的全部外部依赖 */
export interface ContentLibraryDeps {
  db: DatabaseAdapter;
  llm: LLMAdapter;
  embedding: EmbeddingAdapter;
  textSearch: TextSearchAdapter;
  eventBus?: EventBusAdapter;
  storage?: StorageAdapter;
}

// ============================================================
// Content Library Configuration
// ============================================================

export interface ContentLibraryOptions {
  /** 启用跨内容推理层 (Phase 3, 默认 false) */
  enableReasoning?: boolean;
  /** 启用观点演化追踪 (Phase 3, 默认 false) */
  enableBeliefTracking?: boolean;
  /** 事实提取最低置信度 (默认 0.7) */
  factConfidenceThreshold?: number;
  /** 默认检索结果数 */
  defaultSearchLimit?: number;
  /** L0 摘要最大字数 */
  l0MaxChars?: number;
  /** L1 关键点最大条数 */
  l1MaxPoints?: number;
  /** v7.1: 启用两段式事实提取 (analyze → generate)，提升 F1 但每次多一次 LLM 调用 */
  useTwoStageExtraction?: boolean;
}

export const DEFAULT_OPTIONS: Required<ContentLibraryOptions> = {
  enableReasoning: false,
  enableBeliefTracking: false,
  factConfidenceThreshold: 0.7,
  defaultSearchLimit: 20,
  l0MaxChars: 50,
  l1MaxPoints: 5,
  useTwoStageExtraction: true,
};

// ============================================================
// Layer 1: 知识整合层 — 事实 & 实体 (← Mem0 + RetainDB)
// ============================================================

/** 结构化事实三元组 */
export interface ContentFact {
  id: string;
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  /** 上下文：时间、领域、条件等 */
  context: FactContext;
  confidence: number;
  isCurrent: boolean;
  /** 被哪个新事实取代 */
  supersededBy?: string;
  sourceChunkIndex?: number;
  createdAt: Date;
}

export interface FactContext {
  time?: string;
  domain?: string;
  condition?: string;
  source?: string;
  [key: string]: any;
}

/** 全局实体 */
export interface ContentEntity {
  id: string;
  canonicalName: string;
  aliases: string[];
  entityType: EntityType;
  /** 关联 v6.3 统一分类 */
  taxonomyDomainId?: string;
  metadata: EntityMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type EntityType = 'company' | 'person' | 'concept' | 'metric' | 'event' | 'product' | 'organization' | 'location';

export interface EntityMetadata {
  /** 动态摘要（Hindsight Entity Summaries） */
  summary?: string;
  /** 关联事实数 */
  factCount?: number;
  /** 最近更新的事实 */
  lastFactUpdate?: Date;
  [key: string]: any;
}

/** GET /facts 分页 */
export interface ContentFactsPage {
  items: ContentFact[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /entities 分页 */
export interface ContentEntitiesPage {
  items: ContentEntity[];
  total: number;
  limit: number;
  offset: number;
}

/** 事实提取请求 */
export interface FactExtractionRequest {
  content: string;
  assetId: string;
  sourceChunkIndex?: number;
  /** v7.3: Step 2 产出的主题分类 ID，写入 fact.context.themeId */
  themeId?: string;
  /** v7.3: 主题名称 (用于 LLM 提示上下文) */
  themeName?: string;
}

/** 事实提取结果 */
export interface FactExtractionResult {
  facts: Omit<ContentFact, 'id' | 'createdAt'>[];
  entities: Omit<ContentEntity, 'id' | 'createdAt' | 'updatedAt'>[];
}

// ============================================================
// Layer 2: 层级加载层 (← OpenViking L0/L1/L2)
// ============================================================

export type TierLevel = 'L0' | 'L1' | 'L2';

/** L0: 摘要索引 (~80 tokens) */
export interface TierL0 {
  assetId: string;
  title: string;
  summary: string;        // 50字摘要
  tags: string[];
  qualityScore: number;
  entityCount: number;
  contentType: string;
  createdAt: Date;
}

/** L1: 结构化片段 (~300-500 tokens) */
export interface TierL1 extends TierL0 {
  keyPoints: string[];     // 核心观点 (最多5条)
  keyData: string[];       // 关键数据
  conclusion?: string;     // 结论
  chartDescriptions?: string[];
  tokenCount: number;
}

/** L2: 全文 (1000+ tokens) */
export interface TierL2 extends TierL1 {
  fullContent: string;
  chunks?: ContentChunk[];
}

export interface ContentChunk {
  index: number;
  type: 'abstract' | 'toc' | 'body' | 'conclusion' | 'chart';
  content: string;
}

/** 层级加载选项 */
export interface TieredLoadOptions {
  level: TierLevel;
  /** 最大 token 预算 */
  tokenBudget?: number;
  /** 当相关度 > 阈值时自动升级层级 */
  autoExpandThreshold?: number;
}

/** 层级加载结果 */
export interface TieredContent {
  assetId: string;
  level: TierLevel;
  data: TierL0 | TierL1 | TierL2;
  tokenCount: number;
  canExpand: boolean;
}

// ============================================================
// Layer 3: 混合检索层 (← RetainDB Vector + BM25 + Reranking)
// ============================================================

export type SearchMode = 'semantic' | 'keyword' | 'hybrid';
export type RerankStrategy = 'rrf' | 'llm';

export interface HybridSearchRequest {
  query: string;
  mode?: SearchMode;
  /** 返回层级 */
  tier?: TierLevel;
  /** 检索数量 */
  limit?: number;
  /** Rerank 策略 */
  rerankStrategy?: RerankStrategy;
  /** 领域过滤 */
  domainFilter?: string[];
  /** 实体过滤 */
  entityFilter?: string[];
  /** 时间范围 */
  dateRange?: { from?: Date; to?: Date };
  /** 最低质量分 */
  minQualityScore?: number;
  /** 是否搜索专家知识源 */
  includeExpertKnowledge?: boolean;
}

export interface HybridSearchResult {
  items: SearchResultItem[];
  totalCount: number;
  searchMode: SearchMode;
  rerankStrategy: RerankStrategy;
  /** 检索耗时 (ms) */
  latencyMs: number;
}

export interface SearchResultItem {
  assetId: string;
  content: TieredContent;
  scores: {
    semantic?: number;
    keyword?: number;
    quality: number;
    freshness: number;
    /** 融合后最终得分 */
    final: number;
  };
  source: 'asset' | 'expert_knowledge';
}

// ============================================================
// Layer 4: 跨内容推理层 (← Hindsight 4-网络模型)
// ============================================================

/** 内容信念/观点状态 */
export type BeliefStance = 'confirmed' | 'disputed' | 'evolving' | 'refuted';

export interface ContentBelief {
  id: string;
  proposition: string;
  currentStance: BeliefStance;
  confidence: number;
  supportingFactIds: string[];
  contradictingFactIds: string[];
  taxonomyDomainId?: string;
  lastUpdated: Date;
  history: BeliefHistoryEntry[];
}

export interface BeliefHistoryEntry {
  stance: BeliefStance;
  confidence: number;
  reason: string;
  timestamp: Date;
}

/** 矛盾检测结果 */
export interface Contradiction {
  id: string;
  factA: ContentFact;
  factB: ContentFact;
  description: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: Date;
}

/** 生产经验记录 */
export interface ProductionExperience {
  id: string;
  taskId: string;
  assetIds: string[];
  expertIds: string[];
  outputQualityScore: number;
  humanFeedbackScore?: number;
  combinationInsight?: string;
  createdAt: Date;
}

// ============================================================
// 产出物类型 (15 类可消费产出物)
// ============================================================

/** ① 议题推荐 (v7.2: LLM 增强字段) */
export interface TopicRecommendation {
  entityId: string;
  entityName: string;
  score: number;
  factDensity: number;
  timeliness: number;
  gapScore: number;
  suggestedAngles: string[];
  /** v7.2: 一句话推荐理由 */
  reason?: string;
  /** v7.2: 建议文章标题 (15~25 字) */
  titleSuggestion?: string;
  /** v7.2: 80~120 字选题会导语 */
  narrative?: string;
  /** v7.2: 支撑证据事实 */
  evidenceFacts?: Array<{ subject: string; predicate: string; object: string; confidence: number }>;
  /** v7.2: 角度矩阵 */
  angleMatrix?: Array<{ angle: string; rationale: string }>;
  /** v7.2: Louvain 社区 */
  communityId?: string;
  communityCohesion?: number;
  /** v7.2: 与 task purpose 的匹配度 */
  purposeAlignment?: number;
}

/** ① 议题推荐分页响应 */
export interface TopicRecommendationsPage {
  items: TopicRecommendation[];
  total: number;
  limit: number;
  offset: number;
}

/** ② 趋势信号 */
export interface TrendSignal {
  entityId: string;
  entityName: string;
  metric: string;
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  dataPoints: Array<{ time: string; value: string; source: string; citationCount?: number }>;
  significance: number;
  /** 平均速率（单位/天，基于去重后的数值序列） */
  velocity?: number;
  /** 人读速率标签，如 "↑ 2.3/月" */
  velocityLabel?: string;
  /** 后半段相对前半段的速率变化 */
  acceleration?: 'accelerating' | 'decelerating' | 'steady';
  /** 外推说明，仅 rising/falling 才计算 */
  forecastNote?: string;
}

/** ⑦ 信息增量报告 */
export interface DeltaReport {
  period: { from: Date; to: Date };
  newFacts: ContentFact[];
  updatedFacts: Array<{ old: ContentFact; new: ContentFact }>;
  refutedFacts: ContentFact[];
  summary: string;
}

/** ⑨ 高密度知识卡片 */
export interface KnowledgeCard {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  coreData: Array<{ label: string; value: string; freshness: 'fresh' | 'aging' | 'stale' }>;
  latestFacts: ContentFact[];
  relatedEntities: Array<{ id: string; name: string; relation: string }>;
  tokenCount: number;
}

/** ⑫ 专家共识/分歧图 */
export interface ConsensusMap {
  topic: string;
  experts: Array<{
    expertId: string;
    expertName: string;
    stance: string;
    keyArguments: string[];
  }>;
  consensusPoints: string[];
  divergencePoints: string[];
}

// ============================================================
// Standalone Server Configuration
// ============================================================

export interface StandaloneConfig {
  port: number;
  host?: string;
  /** 数据库连接字符串 */
  databaseUrl: string;
  /** LLM API 配置 */
  llm: {
    provider: string;
    apiKey: string;
    model?: string;
  };
  /** Embedding 配置 */
  embedding: {
    provider: string;
    apiKey?: string;
    model?: string;
  };
  /** CORS 允许的域名 */
  corsOrigins?: string[];
}

// ============================================================
// Events (通过 EventBusAdapter 发布)
// ============================================================

export const CONTENT_LIBRARY_EVENTS = {
  ASSET_IMPORTED: 'content-library:asset-imported',
  FACTS_EXTRACTED: 'content-library:facts-extracted',
  ENTITY_REGISTERED: 'content-library:entity-registered',
  CONTRADICTION_DETECTED: 'content-library:contradiction-detected',
  BELIEF_UPDATED: 'content-library:belief-updated',
  SEARCH_COMPLETED: 'content-library:search-completed',
} as const;
