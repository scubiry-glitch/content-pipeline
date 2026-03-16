import axios from 'axios';
import type { Task, Asset, AssetTheme, Expert } from '../types';

const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key-change-in-production';
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
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
};

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

  submitDecision: (reviewId: string, decision: { decision: 'accept' | 'revise' | 'reject'; note?: string }) =>
    client.post(`/production/reviews/${reviewId}/decision`, decision) as Promise<void>,
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

  getTrends: () =>
    client.get('/quality/hot-topics/trends') as Promise<{ topics: string[]; scores: number[] }>,

  follow: (id: string) =>
    client.post(`/quality/hot-topics/${id}/follow`) as Promise<void>,

  unfollow: (id: string) =>
    client.delete(`/quality/hot-topics/${id}/follow`) as Promise<void>,
};

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
    client.post('/quality/rss-sources/crawl', { id }) as Promise<{ crawled: number }>,
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
  checkContent: (content: string) =>
    client.post('/compliance/check', { content }) as Promise<ComplianceCheckResult>,

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

export default client;
