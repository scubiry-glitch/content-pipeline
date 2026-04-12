// 内容库 — 争议话题看板
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

interface Contradiction {
  id: string;
  factA: { subject: string; predicate: string; object: string; confidence: number; context: any };
  factB: { subject: string; predicate: string; object: string; confidence: number; context: any };
  description: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
}

export function ContentLibraryContradictions() {
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/contradictions?limit=50`);
      if (res.ok) setContradictions(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
    high: { label: '高', color: 'text-red-700', bg: 'bg-red-100 border-red-300' },
    medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300' },
    low: { label: '低', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-300' },
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">争议话题</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        同一主体的同一指标存在矛盾数据时自动检出
      </p>
      <ProductMetaBar productKey="contradictions" />

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : contradictions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂未检测到矛盾。事实积累后将自动扫描。</div>
      ) : (
        <div className="space-y-4">
          {contradictions.map(c => {
            const cfg = severityConfig[c.severity] || severityConfig.low;
            return (
              <div key={c.id} className={`rounded-lg border p-5 ${cfg.bg} dark:bg-gray-800 dark:border-gray-700`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-900 dark:text-white">{c.description}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${cfg.color}`}>
                    严重度: {cfg.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white dark:bg-gray-700 rounded border">
                    <div className="text-sm text-gray-500 mb-1">事实 A</div>
                    <div className="font-medium text-gray-900 dark:text-white">{c.factA.object}</div>
                    <div className="text-xs text-gray-500 mt-1">置信度: {(c.factA.confidence * 100).toFixed(0)}%</div>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-700 rounded border">
                    <div className="text-sm text-gray-500 mb-1">事实 B</div>
                    <div className="font-medium text-gray-900 dark:text-white">{c.factB.object}</div>
                    <div className="text-xs text-gray-500 mt-1">置信度: {(c.factB.confidence * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
