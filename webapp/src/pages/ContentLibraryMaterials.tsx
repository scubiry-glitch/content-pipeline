// 内容库 — ⑪ 素材组合推荐
// 基于生产经验 (content_production_log) 推荐高质量素材组合
import { useState } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect } from '../components/ContentLibraryProductMeta';
import { DomainCascadeSelect, selectionToCode } from '../components/DomainCascadeSelect';
import type { TaxonomySelection } from '../types/taxonomy';

const API_BASE = '/api/v1/content-library';

interface Recommendation {
  assetIds: string[];
  experts: string[];
  score: number;
  rationale: string;
  theme?: string;
  tags?: string[];
  titles?: string[];
}

interface MaterialsData {
  recommendations: Recommendation[];
  totalMatches: number;
  source?: 'production_log' | 'assets_fallback';
}

const TASK_TYPES = [
  { value: 'research', label: '研究报告' },
  { value: 'article', label: '文章写作' },
  { value: 'brief', label: '快报简报' },
  { value: 'analysis', label: '深度分析' },
  { value: 'comparison', label: '对比评测' },
];

export function ContentLibraryMaterials() {
  const { domains } = useDropdownOptions();
  const [data, setData] = useState<MaterialsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskType, setTaskType] = useState('research');
  const [domain, setDomain] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({ l1: null, l2: null });
  const [limit, setLimit] = useState(10);
  // 分页
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const loadRecommendations = async () => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const params = new URLSearchParams();
      const taxCode = selectionToCode(taxonomy);
      if (taxCode) params.set('taxonomy_code', taxCode);
      else if (domain) params.set('domain', domain);
      params.set('limit', String(limit));
      const res = await fetch(`${API_BASE}/recommendations/${taskType}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const recs = data?.recommendations || [];
  const totalPages = Math.max(1, Math.ceil(recs.length / PAGE_SIZE));
  const safeP = Math.min(page, totalPages);
  const pageItems = recs.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

  const getScoreColor = (score: number) =>
    score >= 0.9 ? 'text-green-700 bg-green-100' :
    score >= 0.8 ? 'text-blue-700 bg-blue-100' :
    'text-gray-700 bg-gray-100';

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">素材组合推荐</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          ⑪ 基于历史生产经验，推荐高质量的素材组合方案
        </p>
      </div>

      <ProductMetaBar productKey="materials" />

      {/* 筛选条件 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">任务类型</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
              {TASK_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">领域过滤（级联）</label>
            <DomainCascadeSelect value={taxonomy} onChange={setTaxonomy} compact />
            <div className="mt-2">
              <DomainSelect value={domain} onChange={setDomain} domains={domains} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">最大条数</label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={loadRecommendations} disabled={loading}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
              {loading ? '加载中...' : '获取推荐'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* 分页 */}
      {recs.length > PAGE_SIZE && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
          <button disabled={safeP <= 1} onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
            上一页
          </button>
          <span>第 {safeP} / {totalPages} 页（共 {recs.length} 条）</span>
          <button disabled={safeP >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
            下一页
          </button>
        </div>
      )}

      {/* 数据来源说明 */}
      {data && (
        <div className={`text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${
          data.source === 'production_log'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
        }`}>
          {data.source === 'production_log' ? '✅ 基于历史生产记录推荐' : '📊 基于素材质量评分推荐（尚无生产记录，自动按主题分组）'}
          <span className="ml-auto">共 {data.totalMatches} 个组合</span>
        </div>
      )}

      {/* 推荐列表 */}
      {data && recs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无推荐数据</div>
      ) : (
        <div className="space-y-4">
          {pageItems.map((rec, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-gray-300">#{(safeP - 1) * PAGE_SIZE + idx + 1}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getScoreColor(rec.score)}`}>
                    质量分 {(rec.score * 100).toFixed(0)}%
                  </span>
                  {rec.theme && (
                    <span className="px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      {rec.theme}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{rec.assetIds.length} 篇素材</span>
              </div>

              {/* 代表性标题 */}
              {rec.titles && rec.titles.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-500 mb-1.5">代表性研报</div>
                  <ul className="space-y-1">
                    {rec.titles.map((title, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 truncate">· {title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 标签 */}
              {rec.tags && rec.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {rec.tags.slice(0, 8).map((tag, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 text-[11px] rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 素材链接 */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-500 mb-1.5">全部素材</div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.assetIds.length > 0 ? rec.assetIds.map((id, i) => (
                    <a key={i} href={`/assets/${id}`}
                      className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors">
                      📄 {id.length > 16 ? `${id.slice(0, 16)}…` : id}
                    </a>
                  )) : <span className="text-xs text-gray-400">无关联素材</span>}
                </div>
              </div>

              {/* 专家 */}
              {rec.experts.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {rec.experts.map((e, i) => (
                    <span key={i} className="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs rounded border border-purple-200 dark:border-purple-800">
                      👤 {e}
                    </span>
                  ))}
                </div>
              )}

              {/* 推荐理由 */}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic border-t border-gray-100 dark:border-gray-700 pt-2">
                {rec.rationale}
              </div>
            </div>
          ))}
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-12 text-gray-400">选择任务类型，点击"获取推荐"</div>
      )}
    </div>
  );
}
