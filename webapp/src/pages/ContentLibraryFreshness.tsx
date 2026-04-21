// 内容库 — ⑧ 事实保鲜度
// v7.3: 分页 + 排序 (按天数/置信度/主体)
import { useState, useEffect, useMemo } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect } from '../components/ContentLibraryProductMeta';
import { DomainCascadeSelect, selectionToCode } from '../components/DomainCascadeSelect';
import type { TaxonomySelection } from '../types/taxonomy';

const API_BASE = '/api/v1/content-library';
const PAGE_SIZE = 30;

interface ContentFact {
  id: string;
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  context: Record<string, unknown>;
  confidence: number;
  isCurrent: boolean;
  createdAt: string;
}

type Freshness = 'fresh' | 'aging' | 'stale';
type SortKey = 'days' | 'confidence' | 'subject';

function computeFreshness(createdAt: string, maxAgeDays: number): { freshness: Freshness; days: number } {
  const days = Math.round((Date.now() - new Date(createdAt).getTime()) / 86400000);
  let freshness: Freshness = 'stale';
  if (days < maxAgeDays * 0.3) freshness = 'fresh';
  else if (days < maxAgeDays * 0.7) freshness = 'aging';
  return { freshness, days };
}

export function ContentLibraryFreshness() {
  const [facts, setFacts] = useState<ContentFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxAgeDays, setMaxAgeDays] = useState(90);
  const [domain, setDomain] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({ l1: null, l2: null });
  const { domains } = useDropdownOptions();
  const [sortBy, setSortBy] = useState<SortKey>('days');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ maxAgeDays: String(maxAgeDays), limit: '500' });
      const taxCode = selectionToCode(taxonomy);
      if (taxCode) params.set('taxonomy_code', taxCode);
      else if (domain) params.set('domain', domain);
      const res = await fetch(`${API_BASE}/freshness/stale?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFacts(Array.isArray(data) ? data : []);
        setPage(1);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const withFreshness = useMemo(
    () => facts.map(f => ({ ...f, ...computeFreshness(f.createdAt, maxAgeDays) })),
    [facts, maxAgeDays]
  );

  const sorted = useMemo(() => {
    const arr = [...withFreshness];
    switch (sortBy) {
      case 'days': arr.sort((a, b) => b.days - a.days); break;
      case 'confidence': arr.sort((a, b) => b.confidence - a.confidence); break;
      case 'subject': arr.sort((a, b) => a.subject.localeCompare(b.subject)); break;
    }
    return arr;
  }, [withFreshness, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeP = Math.min(page, totalPages);
  const pageItems = sorted.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

  const freshnessConfig: Record<string, { label: string; color: string; bg: string }> = {
    fresh: { label: '新鲜', color: 'text-green-700', bg: 'bg-green-100' },
    aging: { label: '老化', color: 'text-amber-700', bg: 'bg-amber-100' },
    stale: { label: '过期', color: 'text-red-700', bg: 'bg-red-100' },
  };

  const staleCount = withFreshness.filter(f => f.freshness === 'stale').length;
  const agingCount = withFreshness.filter(f => f.freshness === 'aging').length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">事实保鲜度</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">⑧ 检测需要更新或验证的过时事实</p>
      <ProductMetaBar productKey="freshness" />

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <label className="text-sm text-gray-600 dark:text-gray-400">最大天数：</label>
        <select value={maxAgeDays} onChange={e => setMaxAgeDays(Number(e.target.value))}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
          <option value={30}>30 天</option>
          <option value={60}>60 天</option>
          <option value={90}>90 天</option>
          <option value={180}>180 天</option>
          <option value={365}>1 年</option>
        </select>
        <DomainCascadeSelect value={taxonomy} onChange={setTaxonomy} compact />
        <DomainSelect value={domain} onChange={setDomain} domains={domains} />
        <label className="text-sm text-gray-600 dark:text-gray-400">排序：</label>
        <select value={sortBy} onChange={e => { setSortBy(e.target.value as SortKey); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
          <option value="days">按天数 (最旧优先)</option>
          <option value="confidence">按置信度 (最高优先)</option>
          <option value="subject">按主体 (A-Z)</option>
        </select>
        <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">查询</button>
      </div>

      {/* 摘要 */}
      {withFreshness.length > 0 && (
        <div className="flex gap-4 mb-6">
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <span className="text-2xl font-bold text-red-600">{staleCount}</span>
            <span className="text-sm text-gray-500 ml-2">过期</span>
          </div>
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <span className="text-2xl font-bold text-amber-600">{agingCount}</span>
            <span className="text-sm text-gray-500 ml-2">老化中</span>
          </div>
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-2xl font-bold text-gray-600">{withFreshness.length}</span>
            <span className="text-sm text-gray-500 ml-2">总计</span>
          </div>
        </div>
      )}

      {/* 分页 */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
          <button disabled={safeP <= 1} onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
            上一页
          </button>
          <span>第 {safeP} / {totalPages} 页（共 {sorted.length} 条）</span>
          <button disabled={safeP >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
            下一页
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : pageItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">所有事实都在保鲜期内，或暂无数据。</div>
      ) : (
        <div className="space-y-2">
          {pageItems.map(f => {
            const cfg = freshnessConfig[f.freshness] || freshnessConfig.stale;
            return (
              <div key={f.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{f.subject}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-600 dark:text-gray-300">{f.predicate}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-900 dark:text-white">{f.object}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500">{f.days} 天前</div>
                  <div className="text-xs text-gray-400">{(f.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
