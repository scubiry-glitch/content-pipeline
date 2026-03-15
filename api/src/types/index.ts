// Shared types for MVP

export interface OutlineSection {
  title: string;
  level: number;
  content: string;
  subsections?: OutlineSection[];
}

export interface DataRequirement {
  type: 'government' | 'industry' | 'academic' | 'expert';
  description: string;
  priority: 'high' | 'medium' | 'low';
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
