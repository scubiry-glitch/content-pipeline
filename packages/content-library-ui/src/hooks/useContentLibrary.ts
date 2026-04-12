// Hook: 内容库 API 调用
// 封装所有 15 类产出物的 API 请求

import { useState, useCallback } from 'react';
import { apiGet, apiPost } from '../api-client.js';
import type {
  TopicRecommendation,
  TopicRecommendationsPage,
  TrendSignal,
  ContentFact,
  ContentFactsPage,
  ContentEntitiesPage,
  KnowledgeCard,
  Contradiction,
  SearchResult,
  DeltaReportData,
} from '../types.js';

interface UseContentLibraryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useApiCall<T>() {
  const [state, setState] = useState<UseContentLibraryState<T>>({
    data: null, loading: false, error: null,
  });

  const execute = useCallback(async (fetcher: () => Promise<T>) => {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await fetcher();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err: any) {
      setState({ data: null, loading: false, error: err.message });
      return null;
    }
  }, []);

  return { ...state, execute };
}

export function useContentLibrary() {
  const topics = useApiCall<TopicRecommendationsPage>();
  const trends = useApiCall<TrendSignal[]>();
  const facts = useApiCall<ContentFactsPage>();
  const entities = useApiCall<ContentEntitiesPage>();
  const card = useApiCall<KnowledgeCard>();
  const contradictions = useApiCall<Contradiction[]>();
  const search = useApiCall<SearchResult>();
  const delta = useApiCall<DeltaReportData>();
  const staleFacts = useApiCall<ContentFact[]>();

  return {
    // 1. 议题推荐
    topics,
    fetchTopics: (domain?: string, page?: number, limit?: number) =>
      topics.execute(() =>
        apiGet('/topics/recommended', {
          ...(domain ? { domain } : {}),
          ...(page != null && page > 0 ? { page: String(page) } : {}),
          ...(limit != null && limit > 0 ? { limit: String(limit) } : {}),
        })
      ),

    // 2. 趋势信号
    trends,
    fetchTrends: (entityId: string) =>
      trends.execute(() => apiGet(`/trends/${entityId}`)),

    // 5. 关键事实
    facts,
    fetchFacts: (subject?: string, domain?: string, page?: number, limit?: number) =>
      facts.execute(() =>
        apiGet('/facts', {
          ...(subject && { subject }),
          ...(domain && { domain }),
          ...(page != null && page > 0 ? { page: String(page) } : {}),
          ...(limit != null && limit > 0 ? { limit: String(limit) } : {}),
        })
      ),

    // 6. 实体列表
    entities,
    fetchEntities: (search?: string, page?: number, limit?: number) =>
      entities.execute(() =>
        apiGet('/entities', {
          ...(search ? { search } : {}),
          ...(page != null && page > 0 ? { page: String(page) } : {}),
          ...(limit != null && limit > 0 ? { limit: String(limit) } : {}),
        })
      ),

    // 7. 信息增量
    delta,
    fetchDelta: (since?: string) =>
      delta.execute(() => apiGet('/delta', since ? { since } : undefined)),

    // 8. 过期事实
    staleFacts,
    fetchStaleFacts: (maxAgeDays?: number) =>
      staleFacts.execute(() => apiGet('/freshness/stale', maxAgeDays ? { maxAgeDays: String(maxAgeDays) } : undefined)),

    // 9. 知识卡片
    card,
    fetchCard: (entityId: string) =>
      card.execute(() => apiGet(`/cards/${entityId}`)),

    // 13. 争议话题
    contradictions,
    fetchContradictions: (domain?: string) =>
      contradictions.execute(() => apiGet('/contradictions', domain ? { domain } : undefined)),

    // 混合检索
    search,
    performSearch: (query: string, tier?: string, mode?: string) =>
      search.execute(() => apiPost('/search', { query, tier, mode })),
  };
}
