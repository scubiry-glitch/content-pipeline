// 前端类型定义 — 与后端 types.ts 对应
// 通过 REST API 通信，不直接依赖后端模块

export type TierLevel = 'L0' | 'L1' | 'L2';
export type BeliefStance = 'confirmed' | 'disputed' | 'evolving' | 'refuted';
export type EntityType = 'company' | 'person' | 'concept' | 'metric' | 'event' | 'product' | 'organization' | 'location';

export interface ContentFact {
  id: string;
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  context: Record<string, any>;
  confidence: number;
  isCurrent: boolean;
  createdAt: string;
}

export interface ContentEntity {
  id: string;
  canonicalName: string;
  aliases: string[];
  entityType: EntityType;
  taxonomyDomainId?: string;
  metadata: Record<string, any>;
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

export interface TieredContent {
  assetId: string;
  level: TierLevel;
  data: any;
  tokenCount: number;
  canExpand: boolean;
}

export interface TopicRecommendation {
  entityId: string;
  entityName: string;
  score: number;
  factDensity: number;
  timeliness: number;
  gapScore: number;
  suggestedAngles: string[];
}

/** GET /topics/recommended 分页响应 */
export interface TopicRecommendationsPage {
  items: TopicRecommendation[];
  total: number;
  limit: number;
  offset: number;
}

export interface TrendSignal {
  entityId: string;
  entityName: string;
  metric: string;
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  dataPoints: Array<{ time: string; value: string; source: string }>;
  significance: number;
}

export interface KnowledgeCard {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  coreData: Array<{ label: string; value: string; freshness: 'fresh' | 'aging' | 'stale' }>;
  latestFacts: ContentFact[];
  relatedEntities: Array<{ id: string; name: string; relation: string }>;
  tokenCount: number;
}

export interface Contradiction {
  id: string;
  factA: ContentFact;
  factB: ContentFact;
  description: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
}

export interface SearchResult {
  items: Array<{
    assetId: string;
    content: TieredContent;
    scores: { semantic?: number; keyword?: number; quality: number; freshness: number; final: number };
    source: 'asset' | 'expert_knowledge';
  }>;
  totalCount: number;
  searchMode: string;
  latencyMs: number;
}

export interface DeltaReportData {
  period: { from: string; to: string };
  newFacts: ContentFact[];
  updatedFacts: Array<{ old: ContentFact; new: ContentFact }>;
  refutedFacts: ContentFact[];
  summary: string;
}
