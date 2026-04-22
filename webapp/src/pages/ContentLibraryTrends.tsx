// 内容库 — ② 趋势信号
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';
import { Sparkline } from '../components/Sparkline';
import { SearchSuggestPanel } from '../components/SearchSuggestPanel';

const API_BASE = '/api/v1/content-library';

interface TrendSignal {
  entityId: string;
  entityName: string;
  metric: string;
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  dataPoints: Array<{ time: string; value: string; source: string; citationCount?: number }>;
  significance: number;
  velocity?: number;
  velocityLabel?: string;
  acceleration?: 'accelerating' | 'decelerating' | 'steady';
  forecastNote?: string;
}

interface EntityOption { id: string; name: string; factCount: number; }

const DIRECTION_META: Record<string, { text: string; color: string; icon: string }> = {
  rising:   { text: '上升', color: 'bg-green-100 text-green-700',  icon: 'trending_up' },
  falling:  { text: '下降', color: 'bg-red-100 text-red-700',      icon: 'trending_down' },
  stable:   { text: '稳定', color: 'bg-gray-100 text-gray-600',    icon: 'trending_flat' },
  volatile: { text: '波动', color: 'bg-amber-100 text-amber-700',  icon: 'show_chart' },
};

const ACCELERATION_META: Record<string, { text: string; icon: string; color: string }> = {
  accelerating: { text: '加速', icon: 'speed',        color: 'text-orange-600' },
  decelerating: { text: '减速', icon: 'slow_motion_video', color: 'text-sky-600' },
  steady:       { text: '匀速', icon: 'horizontal_rule',   color: 'text-gray-500' },
};

export function ContentLibraryTrends() {
  const [entityId, setEntityId] = useState('');
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMetric, setSearchMetric] = useState('');
  const [appendBanner, setAppendBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/dropdown/entities?limit=50`)
      .then(r => r.ok ? r.json() : [])
      .then((data: EntityOption[]) => setEntityOptions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadTrend = async (nameOrId: string) => {
    if (!nameOrId) return;
    setLoading(true);
    setEmpty(false);
    try {
      const res = await fetch(`${API_BASE}/trends/${encodeURIComponent(nameOrId)}`);
      if (res.ok) {
        const data = await res.json();
        const list: TrendSignal[] = Array.isArray(data) ? data : [data];
        setTrends(list);
        setEmpty(list.length === 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">趋势信号</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">定量：指标数值的速率与方向</p>
      <ProductMetaBar productKey="trends" />

      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text" value={entityId} onChange={e => setEntityId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadTrend(entityId)}
          placeholder="输入实体名称..." className="flex-1 min-w-[200px] px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <button onClick={() => loadTrend(entityId)} disabled={!entityId || loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          查询趋势
        </button>
        <button
          onClick={() => { setSearchMetric(''); setSearchOpen(true); }}
          disabled={!entityId}
          className="px-4 py-2 border border-indigo-500 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 text-sm"
          title="通过 TAVILY 搜索补充该实体的数值事实"
        >
          🔍 搜索补全
        </button>
      </div>

      {appendBanner && (
        <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-4 py-2 rounded mb-4 flex items-center justify-between">
          <span>{appendBanner}</span>
          <button onClick={() => setAppendBanner(null)} className="text-green-600 hover:text-green-800">×</button>
        </div>
      )}

      {entityOptions.length > 0 && (
        <div className="mb-6 flex gap-3 items-center">
          <select
            value={entityId}
            onChange={e => { setEntityId(e.target.value); if (e.target.value) loadTrend(e.target.value); }}
            className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
          >
            <option value="">— 从有数据的实体中选择（{entityOptions.length} 个）—</option>
            {entityOptions.map(e => (
              <option key={e.id} value={e.name}>{e.name}（{e.factCount} 条事实）</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : empty ? (
        <div className="text-center py-12 text-gray-400">
          <p>「{entityId}」在知识库中暂无可追踪的趋势信号</p>
          <p className="text-xs mt-2 text-gray-300">需要同一数值指标有 ≥2 个不同取值（静态属性如"成立时间"不会出现在此处）</p>
        </div>
      ) : trends.length === 0 ? (
        <div className="text-center py-12 text-gray-400">从下拉或输入框选择一个实体查看趋势信号</div>
      ) : (
        <div className="space-y-4">
          {trends.map((t, i) => {
            const dir = DIRECTION_META[t.direction] || DIRECTION_META.stable;
            const acc = t.acceleration ? ACCELERATION_META[t.acceleration] : null;
            return (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-start justify-between mb-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{t.entityName || t.entityId}</h3>
                    {t.metric && <p className="text-xs text-gray-500 mt-0.5">指标: {t.metric}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${dir.color}`}>
                      <span className="material-symbols-outlined text-base">{dir.icon}</span>
                      {dir.text}
                    </span>
                    {t.velocityLabel && (
                      <span className="px-2 py-1 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded font-mono">
                        {t.velocityLabel}
                      </span>
                    )}
                    {acc && (
                      <span className={`flex items-center gap-0.5 text-xs ${acc.color}`} title="后半段相对前半段的速率变化">
                        <span className="material-symbols-outlined text-sm">{acc.icon}</span>
                        {acc.text}
                      </span>
                    )}
                    {Number.isFinite(t.significance) && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-300 rounded">
                        显著度 {t.significance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {t.dataPoints && t.dataPoints.length >= 2 && (
                  <div className="overflow-x-auto">
                    <Sparkline points={t.dataPoints} direction={t.direction} />
                  </div>
                )}

                {t.forecastNote && (
                  <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">📈 {t.forecastNote}</p>
                )}

                {t.dataPoints && t.dataPoints.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-gray-500">
                      {t.dataPoints.length} 个数据点
                      {(() => {
                        const sources = Array.from(new Set(t.dataPoints.map(p => p.source).filter(s => s && s !== 'unknown')));
                        return sources.length > 0 ? ` · 来自 ${sources.length} 个信息源` : '';
                      })()}
                    </p>
                    <button
                      onClick={() => { setSearchMetric(t.metric); setSearchOpen(true); }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      🔍 补充此指标的数据
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {searchOpen && (
        <SearchSuggestPanel
          mode="trend"
          subject={entityId}
          predicate={searchMetric}
          apiBase={API_BASE}
          onClose={() => setSearchOpen(false)}
          onAppended={(count) => {
            setAppendBanner(`已写入 ${count} 条数据点，刷新趋势…`);
            loadTrend(entityId);
            setTimeout(() => setAppendBanner(null), 4000);
          }}
        />
      )}
    </div>
  );
}
