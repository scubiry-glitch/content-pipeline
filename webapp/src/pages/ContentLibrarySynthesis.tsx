// Content Library — ⑩ 有价值的认知综合
// LLM 跨多篇内容的事实聚合提炼
// v7.2: 修复空页面 + 自动加载 + 错误透传 + 下拉选择 + 上下游说明

import { useState, useEffect } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect, EntitySelect } from '../components/ContentLibraryProductMeta';
import { DomainCascadeSelect, selectionToCode } from '../components/DomainCascadeSelect';
import type { TaxonomySelection } from '../types/taxonomy';

const API_BASE = '/api/v1/content-library';

interface Insight {
  text: string;
  sources: string[];
  confidence: number;
}

interface SynthResult {
  insights: Insight[];
  summary: string;
  error?: string;
  factsUsed?: number;
}

interface SynthesisCacheItem {
  cacheKey: string;
  scopeType: string;
  scopeValue: string | null;
  summary: string;
  factsUsed: number;
  generatedAt: string;
  insights: Insight[];
}

export function ContentLibrarySynthesis() {
  const [result, setResult] = useState<SynthResult | null>(null);
  const [loading, setLoading] = useState(true);  // 默认 true, 自动加载
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { domains, entities } = useDropdownOptions();
  const [domain, setDomain] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({ l1: null, l2: null });
  const [subjects, setSubjects] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [insightLimit, setInsightLimit] = useState(10);
  const [cacheItems, setCacheItems] = useState<SynthesisCacheItem[]>([]);
  const [cacheTotal, setCacheTotal] = useState(0);
  const [cachePage, setCachePage] = useState(1);
  const [cachePageSize, setCachePageSize] = useState(10);
  const [cacheSortOrder, setCacheSortOrder] = useState<'asc' | 'desc'>('desc');
  const [cacheLoading, setCacheLoading] = useState(false);
  const [expandedCacheKeys, setExpandedCacheKeys] = useState<Set<string>>(new Set());

  const synthesize = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxonomy_code: selectionToCode(taxonomy),
          domain: domain || undefined,
          subjects: subjects ? subjects.split(',').map(s => s.trim()) : undefined,
          limit: insightLimit,
        }),
      });
      if (!res.ok) {
        setFetchError(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }
      const data = (await res.json()) as SynthResult;
      setResult(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to synthesize insights');
    } finally {
      setLoading(false);
    }
  };

  const loadCache = async (page: number, pageSize: number, sortOrder: 'asc' | 'desc') => {
    setCacheLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sortOrder,
      });
      const res = await fetch(`${API_BASE}/synthesize/cache?${q.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: SynthesisCacheItem[]; total: number };
      const normalizedItems = Array.isArray(data.items)
        ? data.items.map((item) => {
          const rawInsights: any = (item as any).insights;
          const insights = Array.isArray(rawInsights)
            ? rawInsights.filter((i: any) => i && typeof i.text === 'string')
            : [];
          return { ...item, insights };
        })
        : [];
      setCacheItems(normalizedItems);
      setCacheTotal(Number(data.total || 0));
      setExpandedCacheKeys(new Set());
    } finally {
      setCacheLoading(false);
    }
  };

  const toggleCacheExpand = (cacheKey: string) => {
    setExpandedCacheKeys(prev => {
      const next = new Set(prev);
      if (next.has(cacheKey)) next.delete(cacheKey);
      else next.add(cacheKey);
      return next;
    });
  };

  // v7.2: 页面加载时自动触发一次
  useEffect(() => {
    synthesize();
  }, []);

  useEffect(() => {
    loadCache(cachePage, cachePageSize, cacheSortOrder);
  }, [cachePage, cachePageSize, cacheSortOrder]);

  const insights = result?.insights || [];
  const hasError = fetchError || result?.error;
  const totalPages = Math.max(1, Math.ceil(cacheTotal / cachePageSize));

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">有价值的认知</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          ⑩ LLM 跨多篇内容的事实聚合提炼，发现新的核心洞察
        </p>
      </div>

      <ProductMetaBar productKey="synthesis" />

      {/* 范围选择: 下拉领域 + 下拉/自由输入主体 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">领域过滤（级联）</label>
            <DomainCascadeSelect value={taxonomy} onChange={setTaxonomy} compact />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">领域过滤（兼容旧数据）</label>
            <DomainSelect value={domain} onChange={setDomain} domains={domains} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">聚焦实体 (下拉)</label>
            <EntitySelect
              value={selectedEntityId}
              onChange={v => {
                setSelectedEntityId(v);
                const ent = entities.find(e => e.id === v);
                if (ent) setSubjects(ent.name);
              }}
              entities={entities}
              placeholder="选择实体..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">或自由输入主体 (逗号分隔)</label>
            <input
              type="text" value={subjects}
              onChange={e => { setSubjects(e.target.value); setSelectedEntityId(''); }}
              placeholder="如: NVIDIA, OpenAI"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
        </div>
        <button
          onClick={synthesize}
          disabled={loading}
          className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 text-sm font-medium"
        >
          {loading ? '综合提炼中...' : '重新生成'}
        </button>
        <label className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          结果条数
          <select value={insightLimit} onChange={e => setInsightLimit(Number(e.target.value))}
            className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>
      </div>

      {/* 摘要行 */}
      {result && (
        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="text-gray-600 dark:text-gray-300">{result.summary}</span>
          {typeof result.factsUsed === 'number' && (
            <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-2 py-0.5 rounded">
              基于 {result.factsUsed} 条事实
            </span>
          )}
        </div>
      )}

      {/* 错误展示 (v7.2: 不再静默) */}
      {hasError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
          <p className="font-medium mb-1">提炼遇到问题</p>
          <p className="text-red-600 dark:text-red-400">{fetchError || result?.error}</p>
          {result?.error === 'NO_FACTS' && (
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              提示: 请先到素材库导入文档，内容库会自动提取事实三元组。
              也可以到 <a href="/content-library/facts" className="text-indigo-600 underline">事实浏览器</a> 检查已有事实。
            </p>
          )}
        </div>
      )}

      {/* 结果展示 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-pulse">LLM 综合提炼中，请稍候...</div>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {insights.length === 0 && !hasError && (
            <div className="text-gray-400 text-center py-8">
              暂无认知洞察。请导入更多素材或调整领域/主体过滤条件后重试。
            </div>
          )}
          {insights.map((insight, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-start gap-3">
                <span className="text-lg shrink-0">💡</span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white mb-2 leading-relaxed">
                    {insight.text}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      insight.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                      insight.confidence >= 0.5 ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      置信度 {(insight.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
              {insight.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 ml-8">
                  <p className="text-xs text-gray-500 font-medium mb-1.5">来源事实:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {insight.sources.map((source, i) => (
                      <span key={i} className="text-xs bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 缓存列表：支持时间排序 + 分页 + 每页数量 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🗂️</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">历史认知缓存</h2>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-gray-500">时间排序</label>
            <select
              value={cacheSortOrder}
              onChange={e => {
                setCacheSortOrder(e.target.value === 'asc' ? 'asc' : 'desc');
                setCachePage(1);
              }}
              className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="desc">最新优先</option>
              <option value="asc">最早优先</option>
            </select>
            <label className="text-gray-500">每页</label>
            <select
              value={cachePageSize}
              onChange={e => {
                setCachePageSize(Number(e.target.value));
                setCachePage(1);
              }}
              className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

          {cacheLoading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-pulse">缓存加载中...</div>
            </div>
          ) : cacheItems.length === 0 ? (
            <div className="text-gray-400 text-center py-8">暂无缓存记录</div>
          ) : (
            <div className="space-y-4">
              {cacheItems.map(item => (
                <div key={item.cacheKey} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                  <button
                    type="button"
                    onClick={() => toggleCacheExpand(item.cacheKey)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0">🧠</span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white mb-2 leading-relaxed">
                        {item.summary || '（无摘要）'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          {item.scopeType}
                        </span>
                        {item.scopeValue && (
                          <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {item.scopeValue}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          事实 {item.factsUsed}
                        </span>
                        <span className="text-gray-500">{new Date(item.generatedAt).toLocaleString()}</span>
                        <span className="text-indigo-600 dark:text-indigo-300">
                          {expandedCacheKeys.has(item.cacheKey) ? '收起认知清单' : '展开认知清单'}
                        </span>
                      </div>
                    </div>
                  </div>
                  </button>

                  {expandedCacheKeys.has(item.cacheKey) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 ml-8">
                      {Array.isArray(item.insights) && item.insights.length > 0 ? (
                        <div className="space-y-2">
                          {item.insights.map((insight, idx) => (
                            <div key={`${item.cacheKey}-${idx}`} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
                              <p className="text-sm text-gray-800 dark:text-gray-200">{insight.text}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                  置信度 {(Number(insight.confidence || 0) * 100).toFixed(0)}%
                                </span>
                                {(insight.sources || []).slice(0, 5).map((source, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                    {source}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">该缓存暂无可展示的认知清单</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>共 {cacheTotal} 条</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCachePage(p => Math.max(1, p - 1))}
                disabled={cachePage <= 1}
                className="px-2 py-1 border rounded disabled:opacity-50 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                上一页
              </button>
              <span>{cachePage} / {totalPages}</span>
              <button
                onClick={() => setCachePage(p => Math.min(totalPages, p + 1))}
                disabled={cachePage >= totalPages}
                className="px-2 py-1 border rounded disabled:opacity-50 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
