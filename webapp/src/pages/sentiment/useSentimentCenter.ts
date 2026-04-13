// 情感分析中心数据聚合 hook
// 并行拉取 6 个数据源，单源失败不阻塞其他 Tab

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sentimentApi as legacyApi,
  type SentimentAnalysis as SentimentListItem,
  type SentimentStats,
} from '../../api/client';
import {
  sentimentApi as v2Api,
  type MSIResult,
  type SentimentAlert,
} from '../../api/sentiment';

export interface TrendPoint {
  date: string;
  score: number;
}

export interface SentimentCenterData {
  msi: MSIResult | null;
  stats: SentimentStats | null;
  alerts: SentimentAlert[];
  trend: TrendPoint[];
  list: SentimentListItem[];
}

const EMPTY: SentimentCenterData = {
  msi: null,
  stats: null,
  alerts: [],
  trend: [],
  list: [],
};

export interface UseSentimentCenterResult {
  data: SentimentCenterData;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  trendDays: number;
  setTrendDays: (days: number) => void;
}

export function useSentimentCenter(): UseSentimentCenterResult {
  const [data, setData] = useState<SentimentCenterData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [trendDays, setTrendDays] = useState(30);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh = false, days = trendDays) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // 每个源独立 try/catch，失败降级为空值
      const results = await Promise.allSettled([
        v2Api.getMSI(),
        legacyApi.getStats(),
        v2Api.getAlerts(),
        legacyApi.getTrends(days),
        legacyApi.getAll({ limit: 100 }),
      ]);

      if (!mounted.current) return;

      const [msiR, statsR, alertsR, trendR, listR] = results;

      const msi =
        msiR.status === 'fulfilled' ? (msiR.value as any).data ?? null : null;
      const stats =
        statsR.status === 'fulfilled' ? (statsR.value as SentimentStats) : null;
      const alerts =
        alertsR.status === 'fulfilled'
          ? (alertsR.value as any).data ?? []
          : [];

      let trend: TrendPoint[] = [];
      if (trendR.status === 'fulfilled') {
        const raw = trendR.value as { dates: string[]; scores: number[] };
        if (raw?.dates?.length) {
          trend = raw.dates.map((date, i) => ({
            date,
            score: raw.scores?.[i] ?? 0,
          }));
        }
      }

      const list =
        listR.status === 'fulfilled'
          ? (listR.value as { items: SentimentListItem[] }).items ?? []
          : [];

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount === results.length) {
        setError('情感分析数据加载失败，请检查后端服务');
      } else if (failedCount > 0) {
        setError(`${failedCount} 个数据源不可用，部分 Tab 使用降级数据`);
      }

      setData({ msi, stats, alerts, trend, list });
      setLoading(false);
      setRefreshing(false);
    },
    [trendDays]
  );

  // 首次加载
  useEffect(() => {
    mounted.current = true;
    load(false);
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // trendDays 变化时只重拉趋势
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    legacyApi
      .getTrends(trendDays)
      .then((raw) => {
        if (cancelled) return;
        const points: TrendPoint[] = raw?.dates?.length
          ? raw.dates.map((date, i) => ({ date, score: raw.scores?.[i] ?? 0 }))
          : [];
        setData((prev) => ({ ...prev, trend: points }));
      })
      .catch(() => {
        if (!cancelled) setData((prev) => ({ ...prev, trend: [] }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendDays]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
    autoRefresh,
    setAutoRefresh,
    trendDays,
    setTrendDays,
  };
}
