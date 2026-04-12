// 内容库 — ② 趋势信号
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

/** 与 api TrendSignal 对齐 */
interface TrendSignal {
  entityId: string;
  entityName: string;
  metric: string;
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  dataPoints: Array<{ time: string; value: string; source: string }>;
  significance: number;
}

export function ContentLibraryTrends() {
  const [entityId, setEntityId] = useState('');
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentEntities, setRecentEntities] = useState<Array<{ id: string; canonicalName: string }>>([]);

  // 加载实体列表用于快速选择
  useEffect(() => {
    fetch(`${API_BASE}/entities?limit=20&page=1`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) {
          setRecentEntities([]);
          return;
        }
        const list = Array.isArray(data) ? data : (data.items ?? []);
        setRecentEntities(
          list.map((e: { id: string; canonicalName: string }) => ({ id: e.id, canonicalName: e.canonicalName }))
        );
      })
      .catch(() => {});
  }, []);

  const loadTrend = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/trends/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTrends(Array.isArray(data) ? data : [data]);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const directionLabel = (d: string) => {
    const map: Record<string, { text: string; color: string; icon: string }> = {
      rising: { text: '上升', color: 'bg-green-100 text-green-700', icon: 'trending_up' },
      falling: { text: '下降', color: 'bg-red-100 text-red-700', icon: 'trending_down' },
      stable: { text: '稳定', color: 'bg-gray-100 text-gray-600', icon: 'trending_flat' },
      volatile: { text: '波动', color: 'bg-amber-100 text-amber-700', icon: 'show_chart' },
    };
    return map[d] || map.stable;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">趋势信号</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">② 追踪实体相关事实的时间演变方向</p>
      <ProductMetaBar productKey="trends" />

      <div className="flex gap-3 mb-6">
        <input
          type="text" value={entityId} onChange={e => setEntityId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadTrend(entityId)}
          placeholder="输入实体 ID..." className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <button onClick={() => loadTrend(entityId)} disabled={!entityId || loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          查询趋势
        </button>
      </div>

      {/* 快速选择实体 */}
      {recentEntities.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-2">快速选择：</p>
          <div className="flex gap-2 flex-wrap">
            {recentEntities.slice(0, 10).map(e => (
              <button key={e.id} onClick={() => { setEntityId(e.id); loadTrend(e.id); }}
                className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                {e.canonicalName}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : trends.length === 0 ? (
        <div className="text-center py-12 text-gray-400">选择一个实体查看趋势信号</div>
      ) : (
        <div className="space-y-4">
          {trends.map((t, i) => {
            const dir = directionLabel(t.direction);
            return (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{t.entityName || t.entityId}</h3>
                    {t.metric && <p className="text-xs text-gray-500 mt-0.5">指标: {t.metric}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${dir.color}`}>
                      <span className="material-symbols-outlined text-base">{dir.icon}</span>
                      {dir.text}
                    </span>
                    {Number.isFinite(t.significance) && (
                      <span className="px-2 py-0.5 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                        显著度 {t.significance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                {t.dataPoints && t.dataPoints.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {t.dataPoints.map((dp, j) => (
                      <div key={j} className="flex flex-col items-center min-w-[96px] px-2 py-1.5 bg-gray-50 dark:bg-gray-900/50 rounded text-xs">
                        <span className="text-gray-500">{dp.time ? new Date(dp.time).toLocaleDateString() : '—'}</span>
                        <span className="font-medium text-gray-900 dark:text-white mt-0.5">{dp.value}</span>
                        {dp.source && <span className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[90px]" title={dp.source}>{dp.source}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
