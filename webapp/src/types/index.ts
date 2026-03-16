// 内容生产流水线 - 类型定义

export interface WritingData {
  draft?: string;
  version?: number;
  status?: string;
  word_count?: number;
  generated_at?: string;
}

export interface Task {
  id: string;
  topic: string;
  source_materials: SourceMaterial[];
  target_formats: string[];
  status: TaskStatus;
  progress: number;
  current_stage: string;
  outline?: Outline;
  research_data?: ResearchData;
  writing_data?: WritingData;
  approval_feedback?: string;
  output_ids?: string[];
  is_hidden?: boolean;
  hidden_at?: string;
  evaluation?: TopicEvaluation;
  competitor_analysis?: CompetitorAnalysis;
  asset_ids?: string[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'researching'
  | 'writing'
  | 'reviewing'
  | 'converting'
  | 'completed'
  | 'failed';

export interface SourceMaterial {
  type: 'url' | 'asset';
  url?: string;
  asset_id?: string;
  title: string;
  credibility?: CredibilityScore;
}

export interface CredibilityScore {
  overall: number;
  source_reliability: number;
  data_freshness: number;
  citation_quality: number;
}

export interface Outline {
  sections: OutlineSection[];
  knowledgeInsights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
}

export interface OutlineSection {
  title: string;
  key_points: string[];
  estimated_length: number;
}

export interface KnowledgeInsight {
  content: string;
  source: string;
  relevance: number;
}

export interface NovelAngle {
  angle: string;
  description: string;
  differentiation_score: number;
  potentialImpact?: 'high' | 'medium' | 'low';
  rationale?: string;
  differentiation?: string;
}

export interface ResearchData {
  insights: ResearchInsight[];
  annotations: ResearchAnnotation[];
  sources: ResearchSource[];
}

export interface ResearchInsight {
  id: string;
  content: string;
  source: string;
  type: 'data' | 'trend' | 'case' | 'expert';
  confidence: number;
}

export interface ResearchAnnotation {
  id: string;
  type: 'url' | 'asset';
  url?: string;
  asset_id?: string;
  title: string;
  credibility?: CredibilityScore;
  created_at: string;
}

export interface ResearchSource {
  name: string;
  url: string;
  reliability: number;
}

export interface TopicEvaluation {
  score: number;
  dimensions: {
    dataAvailability: number;
    novelty: number;
    timeliness: number;
    expertiseMatch: number;
  };
  suggestions: string[];
}

export interface CompetitorAnalysis {
  similarReports?: SimilarReport[];
  reports?: CompetitorReport[];
  differentiationSuggestions?: DifferentiationSuggestion[];
  summary?: {
    totalFound?: number;
    marketPosition?: string;
    gaps?: string[];
  };
  gapOpportunities?: string[];
}

export interface SimilarReport {
  title: string;
  source: string;
  similarity_score: number;
  published_date: string;
}

export interface CompetitorReport {
  title: string;
  source: string;
  publishDate: string;
  url?: string;
  coreView?: string;
  keyPoints?: string[];
  relevance: number;
}

export interface DifferentiationSuggestion {
  angle: string;
  rationale: string;
  potentialValue: 'high' | 'medium' | 'low';
}

export interface Asset {
  id: string;
  title: string;
  content: string;
  content_type: string;
  filename?: string;
  source: string;
  tags: string[];
  auto_tags: AutoTag[];
  quality_score: number;
  citation_count: number;
  is_pinned: boolean;
  pinned_at?: string;
  theme_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AutoTag {
  tag: string;
  confidence: number;
  method: 'NER' | 'LDA' | 'KeyBERT';
}

export interface AssetTheme {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  sort_order: number;
  is_pinned: boolean;
  pinned_at?: string;
}

export interface Expert {
  id: string;
  name: string;
  title: string;
  company: string;
  angle: 'challenger' | 'expander' | 'synthesizer';
  domain: string;
  bio?: string;
  status: 'active' | 'inactive';
}

export interface BlueTeamReview {
  id: string;
  task_id: string;
  round: number;
  expert_role: string;
  expert_name?: string;
  questions: ReviewQuestion[];
  status: 'pending' | 'completed';
  user_decision?: 'accept' | 'revise' | 'reject';
  decision_note?: string;
  decided_at?: string;
}

export interface ReviewQuestion {
  id: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  location?: string;
}

export interface DraftVersion {
  id: string;
  task_id: string;
  version: number;
  content: string;
  change_summary: string;
  created_at: string;
}

// ==================== 研报类型 (v3.3) ====================

export interface Report {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  publishDate: string;
  pageCount: number;
  fileUrl?: string;
  content?: string;
  keyPoints: string[];
  tags: string[];
  qualityScore: number;
  qualityDimensions?: {
    authority: number;
    completeness: number;
    logic: number;
    freshness: number;
  };
  status: 'pending' | 'parsed' | 'matched' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface ReportMatch {
  id: string;
  reportId: string;
  matchType: 'rss' | 'asset' | 'topic';
  matchId: string;
  matchScore: number;
  matchReason: string;
  matchedItem?: {
    title: string;
    source?: string;
    publishedAt?: string;
  };
}

export interface ReportUploadResponse {
  id: string;
  status: string;
  message: string;
}

export interface ReportParseResult {
  title: string;
  authors: string[];
  institution: string;
  publishDate: string;
  pageCount: number;
  sections: Array<{
    title: string;
    level: number;
    content: string;
  }>;
  keyPoints: string[];
  tags: string[];
}

export interface StageInfo {
  id: number;
  name: string;
  color: string;
  icon: string;
}

export const STAGES: Record<number, StageInfo> = {
  1: { id: 1, name: '选题策划', color: '#6366f1', icon: '💡' },
  2: { id: 2, name: '深度研究', color: '#8b5cf6', icon: '🔍' },
  3: { id: 3, name: '文稿生成', color: '#ec4899', icon: '✍️' },
  4: { id: 4, name: '多态转换', color: '#f59e0b', icon: '🎯' },
};

export const STATUS_MAP: Record<TaskStatus, { text: string; className: string; stage: number }> = {
  pending: { text: '待处理', className: 'badge-pending', stage: 0 },
  planning: { text: '选题策划中', className: 'badge-planning', stage: 1 },
  researching: { text: '深度研究中', className: 'badge-researching', stage: 2 },
  writing: { text: '文稿生成中', className: 'badge-writing', stage: 3 },
  reviewing: { text: '评审中', className: 'badge-reviewing', stage: 3 },
  converting: { text: '多态转换中', className: 'badge-converting', stage: 4 },
  completed: { text: '已完成', className: 'badge-completed', stage: 4 },
  failed: { text: '失败', className: 'badge-failed', stage: -1 },
};

// ==================== Dashboard 类型 ====================

export interface DashboardScores {
  overallScore: number;
  trend: string;
  freshness: number;
  credibility: number;
  differentiation: number;
  audienceMatch: number;
}

export interface HotTopicItem {
  title: string;
  score: number;
  source: string;
}

export interface AlertItem {
  type: 'freshness' | 'credibility' | 'differentiation' | 'audience';
  severity: 'warning' | 'info' | 'error';
  message: string;
  suggestion: string;
}

export interface RSSSourceStatus {
  name: string;
  status: 'active' | 'error';
  lastFetch: string;
}

export interface SuggestionItem {
  area: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
}

export interface UserInterests {
  interests: Record<string, number>;
  topInterests: string[];
}

export interface SentimentData {
  msi: number;
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  change24h: number;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  alerts: string[];
}

export interface RecommendationItem {
  id: string;
  title: string;
  category: string;
  score: number;
  reason: string;
  hotScore: number;
}

export interface DashboardData {
  scores: DashboardScores;
  hotTopics: HotTopicItem[];
  alerts: AlertItem[];
  rssSources: RSSSourceStatus[];
  suggestions: SuggestionItem[];
  userProfile: UserInterests;
  sentiment: SentimentData;
  recommendations: RecommendationItem[];
}

export interface ContentAnalysisResult {
  score: number;
  wordCount: number;
  readingTime: number;
  issues: string[];
  suggestions: string[];
}
