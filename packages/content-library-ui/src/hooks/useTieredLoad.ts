// Hook: L0 → L1 → L2 按需加载
// 支持渐进式展开，节省 token/带宽

import { useState, useCallback } from 'react';
import { apiGet } from '../api-client.js';
import type { TieredContent, TierLevel } from '../types.js';

export function useTieredLoad(assetId: string) {
  const [content, setContent] = useState<TieredContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (level: TierLevel = 'L0') => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<TieredContent>(`/assets/${assetId}/tiered`, { level });
      setContent(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  const expand = useCallback(async () => {
    if (!content) return null;
    const nextLevel: TierLevel =
      content.level === 'L0' ? 'L1' :
      content.level === 'L1' ? 'L2' : 'L2';
    if (content.level === 'L2') return content;
    return load(nextLevel);
  }, [content, load]);

  return {
    content,
    loading,
    error,
    load,
    expand,
    canExpand: content?.canExpand ?? true,
    currentLevel: content?.level ?? null,
  };
}
