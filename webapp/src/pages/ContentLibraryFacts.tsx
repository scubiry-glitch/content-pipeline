// 内容库 — 事实浏览器页面
import { useState, useEffect } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

const FACTS_PAGE_SIZE = 50;

interface ContentFact {
  id: string;
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  context: Record<string, any>;
  confidence: number;
  isCurrent: boolean;
  createdAt: string;
}

interface ReextractResult {
  processed: number;
  newFacts: number;
  updatedFacts: number;
  skipped: number;
  errors: number;
  tokenEstimate: number;
}

export function ContentLibraryFacts() {
  const [facts, setFacts] = useState<ContentFact[]>([]);
  const [factsTotal, setFactsTotal] = useState(0);
  const [factsPage, setFactsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const { domains } = useDropdownOptions();

  // v7.1: 回填相关状态
  const [showReextract, setShowReextract] = useState(false);
  const [reextractLimit, setReextractLimit] = useState(20);
  const [reextractSince, setReextractSince] = useState('');
  const [reextractMinConf, setReextractMinConf] = useState(0.7);
  const [reextracting, setReextracting] = useState(false);
  const [reextractResult, setReextractResult] = useState<ReextractResult | null>(null);

  const loadFacts = async (pageArg?: number) => {
    const page = pageArg ?? factsPage;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('subject', search);
      if (domain) params.set('domain', domain);
      params.set('limit', String(FACTS_PAGE_SIZE));
      params.set('page', String(page));
      const res = await fetch(`${API_BASE}/facts?${params}`);
      if (res.ok) {
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : (raw?.items ?? []);
        const total = Array.isArray(raw) ? raw.length : (typeof raw?.total === 'number' ? raw.total : list.length);
        setFacts(list);
        setFactsTotal(total);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void loadFacts(factsPage); }, [factsPage]);

  const factsTotalPages = Math.max(1, Math.ceil(factsTotal / FACTS_PAGE_SIZE) || 1);

  const getFreshnessColor = (date: string) => {
    const days = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 30) return 'text-green-600';
    if (days < 90) return 'text-yellow-600';
    return 'text-red-600';
  };

  // v7.1: 触发回填
  const handleReextract = async (dryRun: boolean) => {
    if (reextracting) return;
    setReextracting(true);
    setReextractResult(null);
    try {
      const body: Record<string, unknown> = {
        limit: reextractLimit,
        minConfidence: reextractMinConf,
        dryRun,
      };
      if (reextractSince) body.since = reextractSince;
      const res = await fetch(`${API_BASE}/reextract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as ReextractResult;
        setReextractResult(data);
        if (!dryRun) {
          // 实际跑完后刷新事实列表
          void loadFacts(factsPage);
        }
      } else {
        alert(`回填失败: HTTP ${res.status}`);
      }
    } catch (err) {
      alert(`回填失败: ${(err as Error).message}`);
    } finally {
      setReextracting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">事实浏览器</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">浏览和搜索结构化事实三元组 (subject → predicate → object)</p>
          <ProductMetaBar productKey="facts" />
        </div>
        <button
          onClick={() => setShowReextract(v => !v)}
          className="px-4 py-2 text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 rounded-lg flex items-center gap-2"
          title="使用两段式 ingest 对历史素材重新提取事实"
        >
          🔄 重新提取事实
        </button>
      </div>

      {/* v7.1: 回填面板 */}
      {showReextract && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
          <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">两段式 ingest 回填 (v7.1)</h3>
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
            用新的两段式提取流程 (analyze → generate) 对历史素材重新提取事实。建议先用 "预演" 估算 token 成本。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">处理数量上限</label>
              <input
                type="number" min={1} max={200} value={reextractLimit}
                onChange={e => setReextractLimit(Math.min(200, Math.max(1, Number(e.target.value) || 20)))}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">起始日期 (可选)</label>
              <input
                type="date" value={reextractSince}
                onChange={e => setReextractSince(e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">最低置信度</label>
              <input
                type="number" step={0.05} min={0} max={1} value={reextractMinConf}
                onChange={e => setReextractMinConf(Math.min(1, Math.max(0, Number(e.target.value) || 0.7)))}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleReextract(true)}
              disabled={reextracting}
              className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
            >
              {reextracting ? '运行中...' : '🧪 预演 (dry run)'}
            </button>
            <button
              onClick={() => {
                if (confirm(`确认对最近 ${reextractLimit} 个素材进行两段式重新提取? 将消耗 LLM token。`)) {
                  handleReextract(false);
                }
              }}
              disabled={reextracting}
              className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {reextracting ? '运行中...' : '▶️ 正式执行'}
            </button>
          </div>

          {reextractResult && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-amber-200 dark:border-amber-800">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
                <div><span className="text-gray-500">处理</span> <span className="font-bold text-gray-900 dark:text-white">{reextractResult.processed}</span></div>
                <div><span className="text-gray-500">新事实</span> <span className="font-bold text-green-600">{reextractResult.newFacts}</span></div>
                <div><span className="text-gray-500">更新</span> <span className="font-bold text-blue-600">{reextractResult.updatedFacts}</span></div>
                <div><span className="text-gray-500">跳过</span> <span className="font-bold text-gray-500">{reextractResult.skipped}</span></div>
                <div><span className="text-gray-500">错误</span> <span className="font-bold text-red-500">{reextractResult.errors}</span></div>
                <div><span className="text-gray-500">~Tokens</span> <span className="font-bold text-indigo-600">{reextractResult.tokenEstimate.toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (setFactsPage(1), void loadFacts(1))}
          placeholder="按主体搜索..."
          className="flex-1 min-w-[200px] px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <DomainSelect value={domain} onChange={setDomain} domains={domains} />
        <button
          type="button"
          onClick={() => { setFactsPage(1); void loadFacts(1); }}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          搜索
        </button>
        {factsTotal > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <button
              type="button"
              disabled={factsPage <= 1 || loading}
              onClick={() => setFactsPage(p => Math.max(1, p - 1))}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              上一页
            </button>
            <span>
              第 {factsPage} / {factsTotalPages} 页（共 {factsTotal} 条）
            </span>
            <button
              type="button"
              disabled={factsPage >= factsTotalPages || loading}
              onClick={() => setFactsPage(p => p + 1)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : facts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无事实数据。导入内容后将自动提取。</div>
      ) : (
        <div className="space-y-3">
          {facts.map(f => (
            <div key={f.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-lg">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{f.subject}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-600 dark:text-gray-300">{f.predicate}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-900 dark:text-white">{f.object}</span>
              </div>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-gray-500">置信度: {(f.confidence * 100).toFixed(0)}%</span>
                {f.context?.time && <span className="text-gray-500">{f.context.time}</span>}
                {f.context?.domain && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">{f.context.domain}</span>
                )}
                <span className={getFreshnessColor(f.createdAt)}>
                  {new Date(f.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
