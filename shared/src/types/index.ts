// 核心类型定义

export interface TopicPlan {
  id: string;
  title: string;
  outline: OutlineSection[];
  dataRequirements: DataRequirement[];
  priority: number;
  estimatedTime: number;
  status: 'draft' | 'researching' | 'writing' | 'reviewing' | 'published';
  createdAt: Date;
  updatedAt: Date;
}

export interface OutlineSection {
  title: string;
  level: number;
  content?: string;
  subsections?: OutlineSection[];
}

export interface DataRequirement {
  type: 'government' | 'industry' | 'academic' | 'expert';
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ResearchReport {
  id: string;
  topicId: string;
  dataPackage: CleanData[];
  analysis: AnalysisResult;
  insights: Insight[];
  visualizations: ChartSpec[];
  createdAt: Date;
}

export interface CleanData {
  source: string;
  content: string;
  metadata: Record<string, any>;
  quality: number;
}

export interface AnalysisResult {
  statistics: Record<string, number>;
  trends: Trend[];
  comparisons: Comparison[];
}

export interface Trend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  magnitude: number;
  period: string;
}

export interface Comparison {
  dimension: string;
  items: Array<{ name: string; value: number }>;
}

export interface Insight {
  type: 'anomaly' | 'cause' | 'trend' | 'action';
  content: string;
  confidence: number;
  evidence: string[];
}

export interface ChartSpec {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap';
  title: string;
  data: any[];
  config: Record<string, any>;
}

export interface Document {
  id: string;
  title: string;
  sections: DocumentSection[];
  metadata: DocumentMetadata;
  version: number;
}

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  subsections?: DocumentSection[];
  order: number;
}

export interface DocumentMetadata {
  author: string;
  wordCount: number;
  readingTime: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BlueTeamQuestion {
  id: string;
  expertId: string;
  expertName: string;
  question: string;
  category: 'logic' | 'evidence' | 'assumption' | 'impact';
  severity: 'high' | 'medium' | 'low';
  suggestedImprovement?: string;
}

export interface ExpertProfile {
  id: string;
  name: string;
  title: string;
  avatar?: string;
  bio: string;
  authorityScore: number;
  credentials: string[];
  domains: DomainExpertise[];
  coreViewpoints: ViewPoint[];
  communicationStyle: string;
  questionPatterns: string[];
  favoriteFrameworks: string[];
}

export interface DomainExpertise {
  domain: string;
  level: 'expert' | 'authority' | 'practitioner';
  years: number;
}

export interface ViewPoint {
  topic: string;
  stance: string;
  evidence: string[];
  confidence: number;
}

export interface AssetLibraryItem {
  id: string;
  content: string;
  contentType: 'text' | 'image' | 'pdf' | 'url';
  autoTags: AutoTag[];
  qualityScore: number;
  qualityFactors: QualityFactors;
  referenceWeight: number;
  combinedWeight: number;
  embedding: number[];
  citationCount: number;
  lastUsedAt?: Date;
  source: string;
  sourceUrl?: string;
  publishDate?: Date;
}

export interface AutoTag {
  tag: string;
  confidence: number;
  method: 'NER' | 'LDA' | 'KeyBERT';
}

export interface QualityFactors {
  sourceCredibility: number;
  completeness: number;
  freshness: number;
  crossValidation?: number;
}

export interface LLMProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  models: ModelConfig[];
  enabled: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
  capabilities: string[];
  contextLength: number;
  costPer1kTokens: number;
  bestFor: string[];
}

export interface GenerationParams {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface GenerationResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  latency: number;
  cost: number;
}

export interface Task {
  id: string;
  type: 'planning' | 'research' | 'writing' | 'conversion' | 'publishing';
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  payload: any;
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ProjectConfig {
  name: string;
  description: string;
  why: string;
  scope: string[];
  timeline: TimelineMilestone[];
  experts: string[];
  blueTeamStandard: BlueTeamStandard;
}

export interface TimelineMilestone {
  name: string;
  date: Date;
  deliverables: string[];
}

export interface BlueTeamStandard {
  expertCount: number;
  questionsPerExpert: number;
  rounds: number;
  passCriteria: string;
}
