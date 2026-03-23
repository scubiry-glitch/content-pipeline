import axios from 'axios';
import type { Task, Asset, AssetTheme, Expert, OutlineComment, OutlineVersion } from '../types';
export type { Task, Asset, AssetTheme, Expert, OutlineComment, OutlineVersion };

export const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key';
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minutes for LLM operations
});

// 请求拦截器
client.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
client.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('[API] Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// 任务相关 API
export const tasksApi = {
  getAll: (params?: { limit?: number; status?: string }) =>
    client.get('/production', { params }) as Promise<{ items: Task[]; total: number }>,

  getById: (id: string) =>
    client.get(`/production/${id}`) as Promise<Task>,

  create: (data: {
    topic: string;
    source_materials?: { type: 'url' | 'asset'; url?: string; asset_id?: string; title: string }[];
    target_formats?: string[];
  }) => client.post('/production', data) as Promise<Task>,

  update: (id: string, data: Partial<Task>) =>
    client.put(`/production/${id}`, data) as Promise<Task>,

  delete: (id: string) =>
    client.delete(`/production/${id}`) as Promise<void>,

  hide: (id: string) =>
    client.post(`/production/${id}/hide`) as Promise<void>,

  submitFeedback: (id: string, feedback: { decision: 'accept' | 'revise' | 'reject'; note?: string }) =>
    client.post(`/production/${id}/feedback`, feedback) as Promise<void>,

  approve: (id: string, approved: boolean) =>
    client.post(`/production/${id}/approve`, { approved }) as Promise<void>,

  getReviews: (id: string) =>
    client.get(`/production/${id}/reviews`) as Promise<BlueTeamReview[]>,

  // 最终确认任务 - Finalize
  finalize: (id: string) =>
    client.post(`/production/${id}/finalize`, {}) as Promise<{ success: boolean; finalDraftId?: string; outputPath?: string; error?: string }>,

  // 确认大纲并继续 (FR-005)
  confirmOutline: (id: string) =>
    client.post(`/production/${id}/outline/confirm`) as Promise<void>,

  // 重做某个阶段
  redoStage: (id: string, stage: 'planning' | 'research' | 'writing' | 'review', data?: { comments?: string[]; comment?: string; topic?: string; context?: string; config?: any }) =>
    client.post(`/production/${id}/redo/${stage}`, data) as Promise<void>,

  // ===== 大纲评论 API =====
  getOutlineComments: (id: string) =>
    client.get(`/production/${id}/outline/comments`) as Promise<{ items: OutlineComment[] }>,

  addOutlineComment: (id: string, content: string) =>
    client.post(`/production/${id}/outline/comments`, { content }) as Promise<OutlineComment>,

  deleteOutlineComment: (id: string, commentId: string) =>
    client.delete(`/production/${id}/outline/comments/${commentId}`) as Promise<void>,

  // ===== 大纲版本历史 API =====
  getOutlineVersions: (id: string) =>
    client.get(`/production/${id}/outline/versions`) as Promise<{ items: OutlineVersion[] }>,

  getOutlineVersion: (id: string, version: number) =>
    client.get(`/production/${id}/outline/versions/${version}`) as Promise<OutlineVersion>,

  compareOutlineVersions: (id: string, version1: number, version2: number) =>
    client.post(`/production/${id}/outline/compare`, { version1, version2 }) as Promise<{ version1: any; version2: any; outline1: any; outline2: any }>,
};

// 素材相关 API
export const assetsApi = {
  getAll: (params?: { limit?: number; theme_id?: string }) =>
    client.get('/assets', { params }) as Promise<{ items: Asset[]; total: number }>,

  getById: (id: string) =>
    client.get(`/assets/${id}`) as Promise<Asset>,

  create: (data: FormData) =>
    client.post('/assets', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<Asset>,

  update: (id: string, data: Partial<Asset>) =>
    client.put(`/assets/${id}`, data) as Promise<Asset>,

  delete: (id: string) =>
    client.delete(`/assets/${id}`) as Promise<void>,

  togglePin: (id: string, isPinned: boolean) =>
    client.post(`/assets/${id}/pin`, { is_pinned: isPinned }) as Promise<Asset>,

  search: (query: string) =>
    client.get('/assets/search', { params: { q: query } }) as Promise<Asset[]>,

  quote: (id: string, taskId?: string) =>
    client.post(`/assets/${id}/quote`, { taskId }) as Promise<any>,

  // v3.0.2: 素材引用统计
  getUsageStats: (id: string) =>
    client.get(`/assets/${id}/usage`) as Promise<AssetUsage>,

  getPopularAssets: (limit?: number) =>
    client.get('/assets/popular', { params: { limit } }) as Promise<{ items: PopularAsset[] }>,

  // v3.0.3: 智能标签补全
  autoTag: (id: string) =>
    client.post(`/assets/${id}/auto-tag`) as Promise<{ suggestedTags: string[] }>,

  updateTags: (id: string, tags: string[]) =>
    client.put(`/assets/${id}/tags`, { tags }) as Promise<Asset>,
};

// 素材使用统计类型 (v3.0.2)
export interface AssetUsage {
  assetId: string;
  quoteCount: number;
  lastUsedAt: string;
  usedInTasks: string[];
  usageHistory: Array<{
    taskId: string;
    taskTitle: string;
    usedAt: string;
  }>;
}

export interface PopularAsset {
  asset: Asset;
  quoteCount: number;
  lastUsedAt: string;
}

// 主题相关 API
export const themesApi = {
  getAll: () =>
    client.get('/assets/themes') as Promise<AssetTheme[]>,

  create: (data: Partial<AssetTheme>) =>
    client.post('/assets/themes', data) as Promise<AssetTheme>,

  update: (id: string, data: Partial<AssetTheme>) =>
    client.put(`/assets/themes/${id}`, data) as Promise<AssetTheme>,

  delete: (id: string) =>
    client.delete(`/assets/themes/${id}`) as Promise<void>,

  togglePin: (id: string, isPinned: boolean) =>
    client.post(`/assets/themes/${id}/pin`, { is_pinned: isPinned }) as Promise<AssetTheme>,
};

// 目录绑定相关类型
export interface DirectoryBinding {
  id: string;
  name: string;
  path: string;
  theme_id?: string;
  autoSync?: boolean;
  auto_import?: boolean;
  lastScannedAt?: string;
  last_scan_at?: string;
  fileCount?: number;
  total_imported?: number;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
}

// 目录绑定 API
export const bindingsApi = {
  getAll: () =>
    client.get('/assets/bindings') as Promise<DirectoryBinding[]>,

  create: (data: Partial<DirectoryBinding>) =>
    client.post('/assets/bindings', data) as Promise<DirectoryBinding>,

  update: (id: string, data: Partial<DirectoryBinding>) =>
    client.put(`/assets/bindings/${id}`, data) as Promise<DirectoryBinding>,

  delete: (id: string) =>
    client.delete(`/assets/bindings/${id}`) as Promise<void>,

  scan: (id: string) =>
    client.post(`/assets/bindings/${id}/scan`) as Promise<{ scanned: number; added: number }>,
};

// 深度研究相关类型
export interface ResearchConfig {
  autoCollect: boolean;
  sources: string[];
  maxResults: number;
  minCredibility: number;
  keywords: string[];
  excludeKeywords: string[];
  timeRange: string;
}

// 文稿生成进度类型 (v5.0)
export interface DraftProgress {
  currentIndex: number;
  total: number;
  currentTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  generatedWordCount: number;
  estimatedTotalWordCount: number;
  sections: {
    id: string;
    title: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    wordCount?: number;
  }[];
  currentSection: {
    id: string;
    title: string;
    status: 'pending' | 'processing' | 'done' | 'error';
  } | null;
  accumulatedContent: string;
}

export interface CollectedResearch {
  id: string;
  type: string;
  url: string;
  title: string;
  credibility: {
    overall: number;
    source_reliability: number;
    data_freshness: number;
    citation_quality: number;
  };
  created_at: string;
}

// 深度研究 API
export const researchApi = {
  getConfig: (taskId: string) =>
    client.get(`/research/${taskId}/config`) as Promise<ResearchConfig>,

  saveConfig: (taskId: string, config: ResearchConfig) =>
    client.post(`/research/${taskId}/config`, config) as Promise<{ success: boolean }>,

  collect: (taskId: string) =>
    client.post(`/research/${taskId}/collect`) as Promise<{ message: string; taskId: string; config: ResearchConfig }>,

  getCollected: (taskId: string, params?: { limit?: number; offset?: number }) =>
    client.get(`/research/${taskId}/collected`, { params }) as Promise<{ items: CollectedResearch[]; total: number }>,
};

// 专家相关 API
export const expertsApi = {
  getAll: (params?: { angle?: string }) =>
    client.get('/experts', { params }) as Promise<{ items: Expert[]; total: number }>,

  getById: (id: string) =>
    client.get(`/experts/${id}`) as Promise<Expert>,

  create: (data: Partial<Expert>) =>
    client.post('/experts', data) as Promise<Expert>,

  update: (id: string, data: Partial<Expert>) =>
    client.put(`/experts/${id}`, data) as Promise<Expert>,

  delete: (id: string) =>
    client.delete(`/experts/${id}`) as Promise<void>,
};

// BlueTeam 评审相关类型
export interface BlueTeamReview {
  id: string;
  task_id: string;
  round: number;
  expert_role: string;
  expert_name?: string;
  questions: Array<{
    id: string;
    question: string;
    severity: 'high' | 'medium' | 'low' | 'praise';
    suggestion: string;
    location?: string;
  }>;
  status: 'pending' | 'completed';
  user_decision?: 'accept' | 'revise' | 'reject';
  decision_note?: string;
  decided_at?: string;
}

// BlueTeam 评审 API
export const blueTeamApi = {
  getReviews: (taskId: string) =>
    client.get(`/production/${taskId}/reviews`) as Promise<{ items: BlueTeamReview[] }>,

  // 提交单个评审意见决策 (FR-021)
  // 支持 question 级别决策，通过 questionIndex 参数
  submitDecision: (taskId: string, reviewId: string, data: {
    decision: 'accept' | 'ignore' | 'manual_resolved';
    note?: string;
    questionIndex?: number;
  }) =>
    client.post(`/production/${taskId}/review-items/${reviewId}/decide`, data) as Promise<void>,

  // 批量决策 (FR-021)
  batchDecide: (taskId: string, data: { decisions: Array<{ reviewId: string; decision: 'accept' | 'ignore' | 'manual_resolved'; note?: string }> }) =>
    client.post(`/production/${taskId}/review-items/batch-decide`, data) as Promise<void>,

  // 申请重新评审 (FR-023)
  requestReReview: (taskId: string, data: { expertRole: string; reason?: string }) =>
    client.post(`/production/${taskId}/review-items/re-review`, data) as Promise<void>,

  // 检查是否可以进入确认环节 (FR-022)
  canProceed: (taskId: string) =>
    client.get(`/production/${taskId}/can-proceed`) as Promise<{ canProceed: boolean; pendingCritical: number }>,
};

// 健康检查
export const healthApi = {
  check: () =>
    client.get('/health') as Promise<{ status: string; version: string }>,
};

// 热点追踪相关类型
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
}

export interface RSSSource {
  id: string;
  name: string;
  url: string;
  category?: string;
  isActive: boolean;
  lastCrawledAt?: string;
}

// 热点追踪 API (v3.4)
export const hotTopicsApi = {
  getAll: (params?: { limit?: number; trend?: string }) =>
    client.get('/quality/hot-topics', { params }) as Promise<{ items: HotTopic[]; total: number }>,

  getById: (id: string) =>
    client.get(`/quality/hot-topics/${id}`) as Promise<HotTopic>,

  getTrends: (id?: string, days?: number) =>
    id
      ? client.get(`/quality/hot-topics/${id}/trend`, { params: { days } }) as Promise<{ items: any[] }>
      : client.get('/quality/hot-topics/trends') as Promise<{ topics: string[]; scores: number[] }>,

  follow: (id: string) =>
    client.post(`/quality/hot-topics/${id}/follow`) as Promise<void>,

  unfollow: (id: string) =>
    client.post(`/quality/hot-topics/${id}/unfollow`) as Promise<void>,
};

// RSS文章类型
export interface RSSItem {
  id: string;
  source_name: string;
  title: string;
  link: string;
  summary: string;
  published_at: string;
  author?: string;
  tags: string[];
  relevance_score: number;
  hot_score?: number;
  trend?: string;
  sentiment?: string;
  created_at: string;
}

// RSS源采集进度
export interface RSSCollectionProgress {
  jobId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string;
  percent: number;
  currentSource?: string;
  processedSources: number;
  totalSources: number;
  totalFetched: number;
  totalImported: number;
  duplicates: number;
  errors: string[]; // 错误信息数组
  sourceProgress: Array<{
    sourceId: string;
    sourceName: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    fetched: number;
    imported: number;
    duplicates: number;
    error?: string;
  }>;
}

// RSS源管理 API
export const rssSourcesApi = {
  getAll: () =>
    client.get('/quality/rss-sources') as Promise<{ items: RSSSource[] }>,

  create: (data: Partial<RSSSource>) =>
    client.post('/quality/rss-sources', data) as Promise<RSSSource>,

  update: (id: string, data: Partial<RSSSource>) =>
    client.put(`/quality/rss-sources/${id}`, data) as Promise<RSSSource>,

  delete: (id: string) =>
    client.delete(`/quality/rss-sources/${id}`) as Promise<void>,

  triggerCrawl: (id?: string) =>
    client.post('/quality/rss-sources/crawl', { id }) as Promise<{ success: boolean; message: string; status: string; jobId?: string }>,

  // 获取采集进度
  getProgress: () =>
    client.get('/quality/rss-sources/progress') as Promise<{ hasRunningJob: boolean; progress: RSSCollectionProgress | null }>,

  // 获取历史任务
  getHistory: (limit?: number) =>
    client.get('/quality/rss-sources/history', { params: { limit } }) as Promise<{ items: Array<{
      jobId: string;
      status: string;
      startedAt: string;
      completedAt?: string;
      totalSources: number;
      totalFetched: number;
      totalImported: number;
      duplicates: number;
      errors: number;
    }> }>,

  // RSS文章列表
  getItems: (params?: { limit?: number; offset?: number; sourceId?: string }) =>
    client.get('/quality/items', { params }) as Promise<{ items: RSSItem[]; pagination: { total: number; limit: number; offset: number } }>,

  getStats: () =>
    client.get('/quality/stats') as Promise<{ totalItems: number; todayItems: number; totalSources: number; activeSources: number; avgRelevance: number; hotTopicsCount: number; todayHotTopics: number }>,
};

// 情感分析相关类型 (v3.2)
export interface SentimentAnalysis {
  id: string;
  contentId: string;
  topicId?: string;
  sourceType: string;
  polarity: 'positive' | 'negative' | 'neutral';
  intensity: number;
  confidence: number;
  keywords: string[];
  analyzedAt: string;
}

export interface SentimentStats {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  msiIndex: number; // Market Sentiment Index
  trendDirection: 'up' | 'stable' | 'down';
}

// 情感分析 API (v3.2)
export const sentimentApi = {
  getAll: (params?: { limit?: number; polarity?: string }) =>
    client.get('/quality/sentiment', { params }) as Promise<{ items: SentimentAnalysis[]; total: number }>,

  getStats: () =>
    client.get('/quality/sentiment/stats') as Promise<SentimentStats>,

  getById: (id: string) =>
    client.get(`/quality/sentiment/${id}`) as Promise<SentimentAnalysis>,

  analyze: (contentId: string, content: string) =>
    client.post('/quality/sentiment/analyze', { contentId, content }) as Promise<SentimentAnalysis>,

  getTrends: (days: number = 7) =>
    client.get('/quality/sentiment/trends', { params: { days } }) as Promise<{ dates: string[]; scores: number[] }>,
};

// 智能推荐相关类型 (v3.1)
export interface Recommendation {
  id: string;
  type: 'topic' | 'report' | 'asset';
  title: string;
  reason: string;
  score: number;
  metadata: Record<string, any>;
  createdAt: string;
}

// 智能推荐 API (v3.1)
export const recommendationsApi = {
  getAll: (params?: { limit?: number }) =>
    client.get('/quality/recommendations', { params }) as Promise<{ items: Recommendation[]; total: number }>,

  getById: (id: string) =>
    client.get(`/quality/recommendations/${id}`) as Promise<Recommendation>,

  accept: (id: string) =>
    client.post(`/quality/recommendations/${id}/accept`) as Promise<void>,

  reject: (id: string) =>
    client.post(`/quality/recommendations/${id}/reject`) as Promise<void>,

  refresh: () =>
    client.post('/quality/recommendations/refresh') as Promise<{ generated: number }>,
};

// 研报相关 API (v3.3)
export const reportsApi = {
  getAll: (params?: { limit?: number; status?: string }) =>
    client.get('/reports', { params }) as Promise<{ items: import('../types').Report[]; total: number }>,

  getById: (id: string) =>
    client.get(`/reports/${id}`) as Promise<import('../types').Report>,

  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/reports/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<import('../types').ReportUploadResponse>;
  },

  parse: (id: string) =>
    client.post(`/reports/${id}/parse`) as Promise<import('../types').ReportParseResult>,

  getMatches: (id: string) =>
    client.get(`/reports/${id}/matches`) as Promise<{ items: import('../types').ReportMatch[] }>,

  getQuality: (id: string) =>
    client.get(`/reports/${id}/quality`) as Promise<import('../types').Report['qualityDimensions']>,

  search: (query: string, limit?: number) =>
    client.get('/reports/search', { params: { q: query, limit } }) as Promise<{ items: import('../types').Report[] }>,

  delete: (id: string) =>
    client.delete(`/reports/${id}`) as Promise<void>,

  export: (id: string, format: 'pdf' | 'docx' = 'pdf') =>
    client.get(`/reports/${id}/export`, { params: { format }, responseType: 'blob' }) as Promise<Blob>,
};

// 合规检测相关类型 (v4.0)
export interface ComplianceRule {
  id: string;
  category: 'sensitive' | 'ad_law' | 'privacy' | 'custom';
  level: 'strict' | 'warning' | 'info';
  pattern: string;
  suggestion: string;
  isActive: boolean;
  createdAt: string;
}

export interface ComplianceIssue {
  type: string;
  level: 'strict' | 'warning' | 'info';
  content: string;
  suggestion: string;
  position?: { start: number; end: number };
}

export interface ComplianceCheckResult {
  id: string;
  content: string;
  overallScore: number;
  passed: boolean;
  issues: ComplianceIssue[];
  checkedAt: string;
}

// 合规检测 API (v4.0)
export const complianceApi = {
  checkContent: (contentId: string, content: string) =>
    client.post('/compliance/check', { contentId, content }) as Promise<ComplianceCheckResult>,

  getRules: (params?: { category?: string; level?: string }) =>
    client.get('/compliance/rules', { params }) as Promise<{ items: ComplianceRule[]; total: number }>,

  getHistory: (params?: { limit?: number }) =>
    client.get('/compliance/history', { params }) as Promise<{ items: ComplianceCheckResult[]; total: number }>,

  createRule: (data: Partial<ComplianceRule>) =>
    client.post('/compliance/rules', data) as Promise<ComplianceRule>,

  updateRule: (id: string, data: Partial<ComplianceRule>) =>
    client.put(`/compliance/rules/${id}`, data) as Promise<ComplianceRule>,

  deleteRule: (id: string) =>
    client.delete(`/compliance/rules/${id}`) as Promise<void>,
};

// 流水线编排相关类型 (v4.1)
export interface WorkflowRule {
  id: string;
  name: string;
  description?: string;
  conditionExpression: string;
  actionType: 'back_to_stage' | 'skip_step' | 'add_warning' | 'notify' | 'split_output' | 'block_and_notify';
  actionParams: Record<string, any>;
  priority: number;
  isEnabled: boolean;
  triggerStage?: string;
}

export interface TaskSchedule {
  id: string;
  taskId: string;
  taskType: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  assignedTo?: string;
  stage: number;
  dueTime?: string;
}

export interface WorkflowContext {
  taskId: string;
  currentStage: number;
  qualityScore?: number;
  hotScore?: number;
  wordCount?: number;
  sentiment?: string;
  complianceScore?: number;
  contentType?: string;
}

// 流水线编排 API (v4.1)
export const orchestratorApi = {
  getRules: () =>
    client.get('/orchestrator/rules') as Promise<{ items: WorkflowRule[] }>,

  getQueue: (limit?: number) =>
    client.get('/orchestrator/queue', { params: { limit } }) as Promise<{ items: TaskSchedule[] }>,

  processWorkflow: (context: WorkflowContext) =>
    client.post('/orchestrator/process', context) as Promise<{
      appliedRules: WorkflowRule[];
      actions: any[];
      shouldProceed: boolean;
      messages: string[];
    }>,

  enqueueTask: (data: { taskId: string; taskType: string; stage: number; priority?: number; dueTime?: string }) =>
    client.post('/orchestrator/queue', data) as Promise<TaskSchedule>,
};

// Stage3 文稿增强相关类型 (v4.2)
export interface Annotation {
  id: string;
  draftId: string;
  versionId?: string;
  type: 'comment' | 'suggestion' | 'issue' | 'praise';
  startOffset: number;
  endOffset: number;
  selectedText: string;
  comment?: string;
  suggestion?: string;
  status: 'open' | 'resolved' | 'rejected';
  createdBy: string;
  createdAt: string;
}

export interface Version {
  id: string;
  draftId: string;
  name: string;
  content: string;
  createdBy: string;
  createdAt: string;
  autoSave: boolean;
}

export interface ChangeLog {
  id: string;
  draftId: string;
  versionFrom?: string;
  versionTo?: string;
  changeType: 'edit' | 'rewrite' | 'merge' | 'split' | 'annotate';
  changeSummary: string;
  changesDetail?: any;
  changedBy: string;
  changedAt: string;
}

// Stage3 文稿增强 API (v4.2)
export const stage3Api = {
  // 标注相关
  getAnnotations: (draftId: string, versionId?: string) =>
    client.get('/stage3/annotations', { params: { draftId, versionId } }) as Promise<{ items: Annotation[] }>,

  createAnnotation: (data: {
    draftId: string;
    versionId?: string;
    type: string;
    startOffset: number;
    endOffset: number;
    selectedText: string;
    comment?: string;
    suggestion?: string;
    createdBy?: string;
  }) => client.post('/stage3/annotations', data) as Promise<Annotation>,

  updateAnnotation: (id: string, data: { status?: string; comment?: string; suggestion?: string }) =>
    client.patch(`/stage3/annotations/${id}`, data) as Promise<Annotation>,

  deleteAnnotation: (id: string) =>
    client.delete(`/stage3/annotations/${id}`) as Promise<void>,

  getAnnotationStats: (draftId: string) =>
    client.get('/stage3/annotations/stats', { params: { draftId } }) as Promise<{
      total: number;
      open: number;
      resolved: number;
      byType: Record<string, number>;
    }>,

  // 版本相关
  getVersions: (draftId: string) =>
    client.get('/stage3/versions', { params: { draftId } }) as Promise<{ items: Version[] }>,

  createVersion: (data: { draftId: string; name: string; content: string; createdBy?: string }) =>
    client.post('/stage3/versions', data) as Promise<Version>,

  autoSave: (draftId: string, content: string, createdBy?: string) =>
    client.post('/stage3/versions/auto-save', { draftId, content, createdBy }) as Promise<Version>,

  getVersion: (id: string) =>
    client.get(`/stage3/versions/${id}`) as Promise<Version>,

  deleteVersion: (id: string) =>
    client.delete(`/stage3/versions/${id}`) as Promise<void>,

  compareVersions: (id1: string, id2: string) =>
    client.get(`/stage3/versions/${id1}/compare/${id2}`) as Promise<{
      version1: Version;
      version2: Version;
      differences: Array<{ type: string; position: number; text1: string; text2: string }>;
    }>,

  // 修改历史
  getChangeLogs: (draftId: string, limit?: number) =>
    client.get('/stage3/change-logs', { params: { draftId, limit } }) as Promise<{ items: ChangeLog[] }>,

  getChangeLog: (id: string) =>
    client.get(`/stage3/change-logs/${id}`) as Promise<ChangeLog>,

  logChange: (data: {
    draftId: string;
    versionFrom?: string;
    versionTo?: string;
    changeType: string;
    changeSummary: string;
    changesDetail?: any;
    changedBy: string;
  }) => client.post('/stage3/change-logs', data) as Promise<ChangeLog>,
};

// 内容预测相关类型 (v4.3)
export interface PerformancePrediction {
  id: string;
  draftId: string;
  overallScore: number;
  confidence: number;
  predictedViews: number;
  predictedLikes: number;
  predictedComments: number;
  predictedShares: number;
  predictedReadRate: number;
  predictedEngagement: number;
  predictedShareRate: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskWarnings: string[];
  recommendedTimes: string[];
  platformBreakdown: Record<string, number>;
  createdAt: string;
  title: string;
  contentType: string;
}

export interface ScheduledPublish {
  id: string;
  draftId: string;
  platform: string;
  scheduledTime: string;
  status: 'pending' | 'published' | 'cancelled';
  predictionId?: string;
  createdAt: string;
}

// 内容预测 API (v4.3)
export const predictionApi = {
  predictPerformance: (data: {
    draftId: string;
    title: string;
    content: string;
    contentType: string;
    features?: Record<string, any>;
  }) => client.post('/prediction/performance', data) as Promise<PerformancePrediction>,

  getPredictions: (draftId: string) =>
    client.get('/prediction/performance', { params: { draftId } }) as Promise<{ items: PerformancePrediction[] }>,

  getPrediction: (id: string) =>
    client.get(`/prediction/performance/${id}`) as Promise<PerformancePrediction>,

  getScheduleRecommendation: (data: {
    draftId: string;
    title: string;
    content: string;
    contentType: string;
    features?: Record<string, any>;
  }) => client.post('/prediction/schedule', data) as Promise<{
    draftId: string;
    recommendedTimes: string[];
    overallScore: number;
    confidence: number;
  }>,

  analyzePlatforms: (data: { draftId: string; content: string; features?: Record<string, any> }) =>
    client.post('/prediction/platforms', data) as Promise<{ items: Array<{ platform: string; score: number }> }>,

  detectRisks: (data: {
    draftId: string;
    title: string;
    content: string;
    contentType: string;
    features?: Record<string, any>;
  }) => client.post('/prediction/risks', data) as Promise<{
    draftId: string;
    riskLevel: 'low' | 'medium' | 'high';
    warnings: string[];
    overallScore: number;
  }>,

  schedulePublish: (data: {
    draftId: string;
    platform: string;
    scheduledTime: string;
    predictionId?: string;
  }) => client.post('/prediction/schedule/book', data) as Promise<ScheduledPublish>,

  getSchedules: (draftId: string) =>
    client.get('/prediction/schedule', { params: { draftId } }) as Promise<{ items: ScheduledPublish[] }>,

  cancelSchedule: (id: string) =>
    client.delete(`/prediction/schedule/${id}`) as Promise<void>,

  getSimilarContentAnalysis: (contentType: string, topicCategory?: string) =>
    client.get('/prediction/history/similar', { params: { contentType, topicCategory } }) as Promise<{
      averageViews: number;
      averageEngagement: number;
      topPerformers: Array<{ title: string; views: number }>;
    }>,
};

// 国际化相关类型 (v4.5)
export interface Translation {
  id: string;
  sourceId: string;
  sourceType: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceContent: string;
  translatedContent: string;
  status: 'pending' | 'completed' | 'reviewing' | 'rejected';
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface Terminology {
  id: string;
  term: string;
  language: string;
  definition?: string;
  context?: string;
  translations: Record<string, string>;
  category?: string;
  tags?: string[];
  sourceUrl?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface TranslationMemory {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceType?: string;
  similarity?: number;
  usageCount: number;
  createdAt: string;
}

// 国际化 API (v4.5)
export const i18nApi = {
  // 翻译管理
  machineTranslate: (data: {
    content: string;
    sourceLanguage?: string;
    targetLanguage: string;
    useMemory?: boolean;
  }) => client.post('/i18n/translations/machine', data) as Promise<{
    sourceContent: string;
    translatedContent: string;
    sourceLanguage: string;
    targetLanguage: string;
    fromMemory: boolean;
    terminologyReplacements?: Array<{ source: string; target: string }>;
  }>,

  getTranslations: (sourceId: string, sourceType: string) =>
    client.get('/i18n/translations', { params: { sourceId, sourceType } }) as Promise<{ items: Translation[] }>,

  getTranslation: (id: string) =>
    client.get(`/i18n/translations/${id}`) as Promise<Translation>,

  createTranslation: (data: {
    sourceId: string;
    sourceType: string;
    sourceLanguage?: string;
    targetLanguage: string;
    sourceContent: string;
    createdBy?: string;
  }) => client.post('/i18n/translations', data) as Promise<Translation>,

  batchCreateTranslations: (data: {
    sourceId: string;
    sourceType: string;
    sourceContent: string;
    targetLanguages: string[];
    createdBy?: string;
  }) => client.post('/i18n/translations/batch', data) as Promise<{ items: Translation[] }>,

  updateTranslation: (id: string, data: Partial<Translation>) =>
    client.patch(`/i18n/translations/${id}`, data) as Promise<Translation>,

  getTranslationStats: () =>
    client.get('/i18n/translations/stats') as Promise<{
      totalTranslations: number;
      totalTerminology: number;
      totalMemoryEntries: number;
      supportedLanguages: number;
      byLanguage: Record<string, number>;
      byType: Record<string, number>;
    }>,

  // 术语库
  searchTerminology: (q: string, language?: string, category?: string) =>
    client.get('/i18n/terminology/search', { params: { q, language, category } }) as Promise<{ items: Terminology[] }>,

  getTerminology: (term: string, language: string, category?: string) =>
    client.get(`/i18n/terminology/${encodeURIComponent(term)}`, { params: { language, category } }) as Promise<Terminology>,

  getTermsByCategory: (category: string, language?: string) =>
    client.get(`/i18n/terminology/category/${category}`, { params: { language } }) as Promise<{ items: Terminology[] }>,

  getTermTranslation: (term: string, sourceLanguage: string, targetLanguage: string, category?: string) =>
    client.get(`/i18n/terminology/${encodeURIComponent(term)}/translate`, {
      params: { sourceLanguage, targetLanguage, category }
    }) as Promise<{ term: string; translation: string }>,

  createTerminology: (data: {
    term: string;
    language: string;
    definition?: string;
    context?: string;
    translations: Record<string, string>;
    category?: string;
    tags?: string[];
    sourceUrl?: string;
    notes?: string;
    createdBy?: string;
  }) => client.post('/i18n/terminology', data) as Promise<Terminology>,

  // 语言设置
  getLanguages: () =>
    client.get('/i18n/languages') as Promise<{ items: Array<{ code: string; name: string; nativeName: string; isEnabled: boolean }> }>,

  getDefaultLanguage: () =>
    client.get('/i18n/languages/default') as Promise<{ code: string; name: string; nativeName: string }>,

  getLanguage: (code: string) =>
    client.get(`/i18n/languages/${code}`) as Promise<{ code: string; name: string; nativeName: string; isEnabled: boolean }>,

  updateLanguage: (code: string, data: { isEnabled?: boolean; isDefault?: boolean }) =>
    client.patch(`/i18n/languages/${code}`, data) as Promise<{ code: string; name: string; nativeName: string; isEnabled: boolean }>,

  // 翻译记忆库
  searchTranslationMemory: (params: {
    text: string;
    sourceLanguage: string;
    targetLanguage: string;
    minSimilarity?: number;
  }) => client.get('/i18n/memory/search', { params }) as Promise<{ items: TranslationMemory[] }>,

  addTranslationMemory: (data: {
    sourceText: string;
    targetText: string;
    sourceLanguage: string;
    targetLanguage: string;
    sourceType?: string;
  }) => client.post('/i18n/memory', data) as Promise<TranslationMemory>,
};

// Dashboard 相关类型
export interface DashboardScores {
  overallScore: number;
  trend: string;
  freshness: number;
  credibility: number;
  differentiation: number;
  audienceMatch: number;
}

export interface DashboardData {
  scores: DashboardScores;
  hotTopics: Array<{ title: string; score: number; source: string }>;
  alerts: Array<{
    type: 'freshness' | 'credibility' | 'differentiation' | 'audience';
    severity: 'warning' | 'info' | 'error';
    message: string;
    suggestion: string;
  }>;
  rssSources: Array<{ name: string; status: 'active' | 'error'; lastFetch: string }>;
  suggestions: Array<{
    area: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
    impact: string;
  }>;
  userProfile: {
    interests: Record<string, number>;
    topInterests: string[];
  };
  sentiment: {
    msi: number;
    level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
    change24h: number;
    distribution: { positive: number; neutral: number; negative: number };
    alerts: string[];
  };
  recommendations: Array<{
    id: string;
    title: string;
    category: string;
    score: number;
    reason: string;
    hotScore: number;
  }>;
}

// Dashboard API
export const dashboardApi = {
  getDashboard: () => client.get('/dashboard') as Promise<DashboardData>,

  refreshData: () => client.post('/dashboard/refresh') as Promise<DashboardData>,

  analyzeContent: (content: string) =>
    client.post('/dashboard/analyze', { content }) as Promise<{
      score: number;
      wordCount: number;
      readingTime: number;
      issues: string[];
      suggestions: string[];
    }>,

  recordFeedback: (topicId: string, action: 'like' | 'ignore') =>
    client.post(`/dashboard/feedback`, { topicId, action }) as Promise<void>,
};

// 归档管理相关类型
export interface ArchivedTask {
  id: string;
  topic: string;
  status: string;
  deletedAt: string;
  originalCreatedAt: string;
  willBePermanentlyDeletedAt?: string;
}

// 归档管理 API
export const archiveApi = {
  getRecycleBin: () =>
    client.get('/archive/recycle-bin') as Promise<{ items: ArchivedTask[] }>,

  getHidden: () =>
    client.get('/archive/hidden') as Promise<{ items: ArchivedTask[] }>,

  deleteTask: (taskId: string) =>
    client.post(`/archive/${taskId}/delete`) as Promise<void>,

  batchDelete: (taskIds: string[]) =>
    client.post('/archive/batch-delete', { taskIds }) as Promise<void>,

  hideTask: (taskId: string) =>
    client.post(`/archive/${taskId}/hide`) as Promise<void>,

  batchHide: (taskIds: string[]) =>
    client.post('/archive/batch-hide', { taskIds }) as Promise<void>,

  restoreTask: (taskId: string) =>
    client.post(`/archive/${taskId}/restore`) as Promise<void>,

  permanentDelete: (taskId: string) =>
    client.delete(`/archive/${taskId}/permanent`) as Promise<void>,
};

export default client;
