// Shared types for MVP

export interface OutlineSection {
  title: string;
  level: number;
  content: string;
  coreQuestion?: string;
  analysisApproach?: string;
  hypothesis?: string;
  dataNeeds?: DataNeed[];
  visualizationPlan?: {
    chartType: string;
    title: string;
    dataMapping: string;
  };
  subsections?: OutlineSection[];
}

export interface DataNeed {
  metric: string;
  searchKeywords: string[];
  priority: 'P0' | 'P1' | 'P2';
  timeRange?: string;
}

export interface DataRequirement {
  type: 'government' | 'industry' | 'academic' | 'expert';
  description: string;
  priority: 'high' | 'medium' | 'low';
  searchKeywords?: string[];
  timeRange?: string;
}

export interface TopicPlan {
  id: string;
  title: string;
  outline: OutlineSection[];
  dataRequirements: DataRequirement[];
  priority: number;
  estimatedTime: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CleanData {
  source: string;
  content: string;
  metadata: any;
  quality: number;
  url?: string;
}

export interface AnalysisResult {
  statistics: any;
  trends: any[];
  comparisons: any[];
}

export interface Insight {
  type: 'anomaly' | 'cause' | 'trend' | 'action';
  content: string;
  confidence: number;
  evidence: string[];
}

export interface ResearchReport {
  id: string;
  topicId: string;
  dataPackage: CleanData[];
  analysis: AnalysisResult;
  insights: Insight[];
}

export interface BlueTeamQuestion {
  id?: string;
  expertId: string;
  expertName: string;
  question: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  suggestedImprovement?: string;
  round?: number;
}

export interface ExpertProfile {
  id: string;
  name: string;
  title: string;
  bio?: string;
  authority_score: number;
  credentials: any;
  domains: any;
  core_viewpoints: any;
  communication_style: string;
  question_patterns: any;
  favorite_frameworks: any;
}

export interface Document {
  id: string;
  topicId: string;
  title: string;
  sections: any[];
  metadata: any;
  version: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Generation types for LLM providers
export interface GenerationParams {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** OpenAI 兼容：json_object，需提示词要求输出 JSON */
  responseFormat?: 'json' | 'text';
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface GenerationResult {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    promptTokens?: number;
    completionTokens?: number;
  };
}

// Asset Library types
export interface AssetLibraryItem {
  id: string;
  content: string;
  contentType: string;
  source: string;
  sourceUrl?: string;
  tags: AutoTag[];
  qualityScore: number;
  embedding?: number[];
  metadata?: any;
  createdAt?: Date;
}

export interface AutoTag {
  tag: string;
  confidence: number;
  method: string;
}

export interface QualityFactors {
  completeness: number;
  credibility: number;
  relevance: number;
  timeliness: number;
  sourceCredibility?: number;
  freshness?: number;
}
