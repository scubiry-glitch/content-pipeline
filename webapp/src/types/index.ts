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
  external_links?: Array<{ title: string; url: string }>;
  versions?: DraftVersion[];
  due_date?: string;
  quality_score?: number;
  sequential_review_config?: any;
  review_mode?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'outline_pending'
  | 'researching'
  | 'writing'
  | 'reviewing'
  | 'awaiting_approval'
  | 'finalizing'
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
  type?: 'trend' | 'gap' | 'evolution';
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
  searchStats?: {
    webSources: number;
    assetSources: number;
  };
  validation_results?: any[];
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
  analysis?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  stronglyRecommended?: boolean;
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

// 资产类型
export type AssetType = 'file' | 'report' | 'quote' | 'data' | 'rss_item';

// 资产基础接口
export interface Asset {
  id: string;
  title: string;
  content: string;
  content_preview?: string;
  content_type: string;
  filename?: string;
  source: string;
  source_url?: string;
  tags: string[];
  auto_tags: AutoTag[];
  quality_score: number;
  quality_dimensions?: Record<string, number>;
  citation_count: number;
  is_pinned: boolean;
  pinned_at?: string;
  theme_id?: string;
  view_count?: number;
  influence_score?: number;
  asset_type: AssetType; // 资产类型区分
  summary?: string;
  key_points?: string[];
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

// 研报特有属性（作为 Asset 的扩展）
export interface ReportAsset extends Asset {
  asset_type: 'report';
  authors: string[];
  institution: string;
  publish_date: string;
  page_count: number;
  key_points: string[];
  quality_dimensions?: {
    authority: number;
    completeness: number;
    logic: number;
    freshness: number;
  };
  status: 'pending' | 'parsed' | 'matched' | 'completed';
  // 研报关联
  related_assets?: string[];
  related_topics?: string[];
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

// Expert interface moved below (line ~482)

export interface BlueTeamReview {
  id: string;
  task_id: string;
  round: number;
  expert_role: string;
  expert_name?: string;
  expertId?: string;
  questions: ReviewQuestion[];
  status: 'pending' | 'completed';
  user_decision?: 'accept' | 'revise' | 'reject';
  decision_note?: string;
  decided_at?: string;
  created_at?: string;
  is_historical?: boolean;
}

export interface ReviewQuestion {
  id: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise' | 'critical' | 'warning';
  suggestion: string;
  location?: string;
}

export interface DraftVersion {
  id: string;
  task_id: string;
  version: number;
  content: string;
  change_summary: string;
  comment?: string;
  created_by?: string;
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
  summary?: string;
  rating?: string;
  targetPrice?: number;
  riskFactors?: string[];
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
  matchType: 'rss' | 'asset' | 'topic' | 'report';
  matchId: string;
  matchScore: number;
  matchReason: string;
  matchedAt?: string;
  matchedItem?: {
    id?: string;
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
  outline_pending: { text: '待确认大纲', className: 'badge-planning', stage: 1 },
  researching: { text: '深度研究中', className: 'badge-researching', stage: 2 },
  writing: { text: '文稿生成中', className: 'badge-writing', stage: 3 },
  reviewing: { text: '评审中', className: 'badge-reviewing', stage: 3 },
  awaiting_approval: { text: '待正式发布', className: 'badge-reviewing', stage: 4 },
  finalizing: { text: '最终确认中', className: 'badge-reviewing', stage: 4 },
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

// HotTopic 热点话题
export interface HotTopic {
  id: string;
  title: string;
  source: string;
  sourceUrl?: string;
  hotScore: number;
  trend: 'up' | 'stable' | 'down';
  sentiment: 'positive' | 'neutral' | 'negative';
  publishedAt?: string;
  createdAt: string;
  isFollowed?: boolean;
  relevance?: number;
  category?: string;
}

export interface RSSSource {
  id: string;
  name: string;
  url: string;
  category?: string;
  isActive: boolean;
  lastCrawledAt?: string;
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

// ==================== 专家库类型 (v5.0) ====================

export type ExpertLevel = 'senior' | 'domain';

export interface ExpertProfile {
  title: string;
  background: string;
  personality: string;
  avatar?: string;
}

export interface ExpertPhilosophy {
  core: string[];
  quotes: string[];
}

export interface ExpertAchievement {
  title: string;
  description: string;
  date: string;
  impact: string;
}

export interface Expert {
  id: string;
  name: string;
  code: string;
  level: ExpertLevel;
  domainCode: string;
  domainName: string;
  profile: ExpertProfile;
  philosophy: ExpertPhilosophy;
  achievements: ExpertAchievement[];
  reviewDimensions: string[];
  status: 'active' | 'inactive';
  totalReviews: number;
  acceptanceRate: number;
  avgResponseTime: number;
  angle?: 'challenger' | 'expander' | 'synthesizer' | 'reader'; // 评审风格角度
  // 兼容旧版属性
  title?: string;
  company?: string;
  domain?: string;
  bio?: string;
  // CDT 认知数字孪生扩展（来自 /api/v1/expert-library/experts/:id）
  cdtProfile?: {
    expert_id: string;
    persona: {
      style: string;
      tone: string;
      bias?: string[];
      cognition?: {
        mentalModel?: string;
        mentalModels?: Array<{
          name: string;
          summary: string;
          evidence: string[];
          applicationContext: string;
          failureCondition: string;
        }>;
        decisionStyle?: string;
        riskAttitude?: string;
        timeHorizon?: string;
        heuristics?: Array<{
          trigger: string;
          rule: string;
          example?: string;
        }>;
      };
      values?: {
        excites?: string[];
        irritates?: string[];
        qualityBar?: string;
        dealbreakers?: string[];
      };
      taste?: {
        admires?: string[];
        disdains?: string[];
        benchmark?: string;
      };
      voice?: {
        disagreementStyle?: string;
        praiseStyle?: string;
      };
      blindSpots?: {
        knownBias?: string[];
        weakDomains?: string[];
        selfAwareness?: string;
        informationCutoff?: string;
        confidenceThreshold?: string;
        explicitLimitations?: string[];
      };
      expressionDNA?: {
        sentencePattern?: string;
        vocabularyPreference?: string;
        certaintyCali?: string;
        citationHabit?: string;
      };
      contradictions?: Array<{
        tension: string;
        context: string;
        resolution: string;
      }>;
    };
    method: {
      frameworks: string[];
      reasoning?: string;
      analysis_steps: string[];
      reviewLens?: {
        firstGlance?: string;
        deepDive?: string[];
        killShot?: string;
        bonusPoints?: string[];
      };
      dataPreference?: string;
      evidenceStandard?: string;
      agenticProtocol?: {
        requiresResearch?: boolean;
        researchSteps?: string[];
        noGuessPolicy?: boolean;
      };
    };
    emm?: {
      critical_factors: string[];
      factor_hierarchy: Record<string, number>;
      veto_rules: string[];
      aggregation_logic: string;
    };
    output_schema?: {
      format?: string;
      sections?: string[];
      rubrics?: Array<{
        dimension: string;
        levels: Array<{ score: number; description: string }>;
      }>;
    };
    anti_patterns?: string[];
    signature_phrases?: string[];
  };
}

export interface ExpertReview {
  id: string;
  expertId: string;
  expertName: string;
  taskId: string;
  contentType: 'outline' | 'draft' | 'research';
  opinion: string;
  focusAreas: string[];
  suggestions: string[];
  confidence: number;
  differentiationTags: string[];
  userAction?: 'accept' | 'ignore' | 'partial';
  userNote?: string;
  createdAt: string;
  // v5.1.2 个性化生成元数据
  personalizationMeta?: {
    angle: string;
    philosophyAligned: boolean;
    achievementReferenced: boolean;
  };
}

// v5.1.2 专家观点接口
export interface ExpertOpinion {
  id: string;
  expertId: string;
  expertName: string;
  content: string;
  timestamp: string;
  confidence: number;
  intensity: 'strong' | 'moderate' | 'weak';
  dimensions: string[];
  relatedAchievements?: string[];
  personalization?: {
    angle: string;
    philosophyAlignment: boolean;
    achievementReferences: boolean;
    tone: string;
  };
}

export interface ExpertAssignment {
  domainExperts: Expert[];
  universalExperts: {
    factChecker: Expert;
    logicChecker: Expert;
    readerRep: Expert;
  };
  seniorExpert?: Expert;
  matchReasons: string[];
  // v5.1.1 语义匹配新增字段
  confidence?: number;
  matchingMethod?: 'keyword' | 'semantic' | 'hybrid';
  domainScores?: Array<{
    domain: string;
    score: number;
  }>;
  experts?: Array<{
    expertId: string;
    role: 'primary' | 'secondary' | 'observer';
    reasoning: string;
  }>;
}

export interface ExpertMatchRequest {
  topic: string;
  industry?: string;
  taskType?: string;
  importance?: number;
  // v5.1.1 语义匹配新增字段
  context?: string;
  requiredDimensions?: string[];
}

// ===== 大纲评论 =====
export interface OutlineComment {
  id: string;
  task_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

// ===== 大纲版本历史 =====
export interface OutlineVersion {
  id: string;
  task_id: string;
  version: number;
  outline: Outline;
  comment?: string;
  created_by: string;
  created_at: string;
}


// ===== 蓝军评审配置 =====
export interface ReviewConfig {
  mode: 'parallel' | 'serial';
  aiExperts: Array<{ role: string; enabled: boolean }>;
  humanExperts: string[]; // Expert IDs
  autoRevise: 'per-round' | 'final';
  maxRounds?: number;
  // 读者测试配置 - 从专家库选择读者
  readerTest?: {
    enabled: boolean;
    selectedReaders: string[]; // 选中的读者专家ID列表
    count?: number;
  };
}
