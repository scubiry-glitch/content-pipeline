// v2.2 情感分析 API 客户端
// SA-001 ~ SA-005: 情感分析增强

import client from './client';

// ============ 类型定义 ============

export interface SentimentResult {
  polarity: 'positive' | 'negative' | 'neutral';
  intensity: number;
  confidence: number;
  keywords: string[];
  aspects: Record<string, SentimentResult>;
}

export interface MSIResult {
  value: number;
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  change24h: number;
  change7d: number;
  components: {
    newsSentiment: number;
    socialSentiment: number;
    expertSentiment: number;
  };
  calculatedAt: string;
}

export interface SentimentAlert {
  topicId: string;
  topicTitle: string;
  alertType: 'extreme_positive' | 'extreme_negative' | 'sudden_change';
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface SentimentTrend {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  overall: number;
}

export interface TopicSentiment {
  topicId: string;
  topicTitle: string;
  overall: number;
  confidence: number;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  trend: 'rising' | 'stable' | 'falling';
  sourceCount: number;
  analyzedAt: string;
}

// ============ API 方法 ============

export const sentimentApi = {
  // SA-001: 单条文本情感分析
  analyze: (text: string) =>
    client.post('/sentiment/analyze', { text }) as Promise<{ success: boolean; data: SentimentResult }>,

  // SA-002: 批量情感分析
  batchAnalyze: (items: Array<{ id: string; text: string; source: string }>) =>
    client.post('/sentiment/batch-analyze', { items }) as Promise<{ success: boolean; data: Record<string, SentimentResult> }>,

  // SA-003: 获取市场情绪指数 MSI
  getMSI: () =>
    client.get('/sentiment/msi') as Promise<{ success: boolean; data: MSIResult }>,

  // SA-003: 获取话题情感分析
  getTopicSentiment: (topicId: string) =>
    client.get(`/sentiment/topic/${topicId}`) as Promise<{ success: boolean; data: TopicSentiment }>,

  // SA-004: 获取情感异常预警
  getAlerts: () =>
    client.get('/sentiment/alerts') as Promise<{ success: boolean; data: SentimentAlert[] }>,

  // SA-005: 获取话题情感趋势
  getTrend: (topicId: string, days?: number) =>
    client.get(`/sentiment/trend/${topicId}`, { params: { days } }) as Promise<{ success: boolean; data: SentimentTrend[] }>,
};

export default sentimentApi;
