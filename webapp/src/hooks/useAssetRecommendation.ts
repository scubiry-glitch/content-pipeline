// useAssetRecommendation.ts
// v3.0.1: 素材推荐Hook

import { useState, useEffect, useCallback, useRef } from 'react';
import { assetsApi, type Asset } from '../api/client';

interface UseAssetRecommendationOptions {
  maxRecommendations?: number;
  minInputLength?: number;
  debounceMs?: number;
  relevanceThreshold?: number;
}

interface UseAssetRecommendationResult {
  recommendations: Asset[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAssetRecommendation(
  inputText: string,
  options: UseAssetRecommendationOptions = {}
): UseAssetRecommendationResult {
  const {
    maxRecommendations = 5,
    minInputLength = 10,
    debounceMs = 500,
    relevanceThreshold = 0.3,
  } = options;

  const [recommendations, setRecommendations] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastInputRef = useRef(inputText);

  // 提取关键词
  const extractKeywords = useCallback((text: string): string[] => {
    const words = text.split(/[\s,，。！？；：""''（）【】]+/);
    return words.filter(w => w.length >= 4).slice(-10);
  }, []);

  // 计算相关性
  const calculateRelevance = useCallback((asset: Asset, keywords: string[]): number => {
    if (!asset.tags || keywords.length === 0) return 0;

    const assetTags = asset.tags.map(t => t.toLowerCase());
    let matchCount = 0;

    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (assetTags.some(tag => tag.includes(keywordLower))) {
        matchCount += 1;
      }
      if (asset.title?.toLowerCase().includes(keywordLower)) {
        matchCount += 0.5;
      }
    });

    return matchCount / keywords.length;
  }, []);

  // 获取推荐
  const fetchRecommendations = useCallback(async () => {
    if (!inputText || inputText.length < minInputLength) {
      setRecommendations([]);
      return;
    }

    setLoading(true);
    setError(null);
    lastInputRef.current = inputText;

    try {
      const keywords = extractKeywords(inputText);
      if (keywords.length === 0) {
        setRecommendations([]);
        return;
      }

      const allAssets = await assetsApi.getAll();

      const scoredAssets = allAssets.map(asset => ({
        asset,
        score: calculateRelevance(asset, keywords),
      }));

      const filtered = scoredAssets
        .filter(item => item.score > relevanceThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxRecommendations)
        .map(item => item.asset);

      setRecommendations(filtered);
    } catch (err) {
      setError('获取推荐失败');
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoading(false);
    }
  }, [inputText, minInputLength, maxRecommendations, relevanceThreshold, extractKeywords, calculateRelevance]);

  // 防抖处理
  useEffect(() => {
    const timer = setTimeout(fetchRecommendations, debounceMs);
    return () => clearTimeout(timer);
  }, [fetchRecommendations, debounceMs]);

  const refresh = useCallback(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return {
    recommendations,
    loading,
    error,
    refresh,
  };
}

export default useAssetRecommendation;
