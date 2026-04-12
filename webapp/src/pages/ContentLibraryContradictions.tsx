// 内容库 — 争议话题看板
// v7.3: 分页 + severity/domain/subject 筛选
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';
const PAGE_SIZE = 20;

interface Contradiction {
  id: string;
  factA: { subject: string; predicate: string; object: string; confidence: number; context: any };
  factB: { subject: string; predicate: string; object: string; confidence: number; context: any };
  description: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
}

export function ContentLibraryContradictions() {
  const [all, setAll] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  // 筛选
  const [searchSubject, setSearchSubject] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  // 分页
  const [page, setPage] = useState(1);
  // Zep 增强: 时间性矛盾
  const [zepConflicts, setZepConflicts] = useState<Array<{ fact: string; validAt?: string; invalidAt?: string; source: string; target: string }>>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/contradictions?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setAll(Array.isArray(data) ? data : (data?.items ?? []));
      }
    } catch { /* ignore */ }
    setLoading(false);
    // Zep 增强: 查询时间性矛盾 (异步不阻塞)
    if (searchSubject) {
      fetch(`${API_BASE}/zep/contradictions/${encodeURIComponent(searchSubject)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.temporalConflicts?.length) setZepConflicts(d.temporalConflicts); else setZepConflicts([]); })
        .catch(() => setZepConflicts([]));
    }
  };

  // 客户端筛选
  const filtered = all.filter(c => {
    if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
    if (searchSubject) {
      const q = searchSubject.toLowerCase();
      const match = c.factA.subject.toLowerCase().includes(q)
        || c.factB.subject.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeP = Math.min(page, totalPages);
  const pageItems = filtered.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

  const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
    high: { label: '高', color: 'text-red-700', bg: 'bg-red-100 border-red-300' },
    medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300' },
    low: { label: '低', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-300' },
  };

  const resetPage = () => setPage(1);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">争议话题</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        同一主体的同一指标存在矛盾数据时自动检出
      </p>
      <ProductMetaBar productKey="contradictions" />

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input
          type="text" value={searchSubject}
          onChange={e => { setSearchSubject(e.target.value); resetPage(); }}
          placeholder="搜索主体/描述..."
          className="flex-1 min-w-[180px] px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
        />
        <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); resetPage(); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
          <option value="all">全部严重度</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <button onClick={loadData} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
          刷新
        </button>
        {/* 分页 */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 ml-auto">
            <button disabled={safeP <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
              上一页
            </button>
            <span>第 {safeP} / {totalPages} 页（共 {filtered.length} 条）</span>
            <button disabled={safeP >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
              下一页
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : pageItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {all.length === 0 ? '暂未检测到矛盾。事实积累后将自动扫描。' : '当前筛选条件下无结果'}
        </div>
      ) : (
        <div className="space-y-4">
          {pageItems.map(c => {
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
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">{c.factA.subject} · {c.factA.predicate}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{c.factA.object}</div>
                    <div className="text-xs text-gray-500 mt-1">置信度: {(c.factA.confidence * 100).toFixed(0)}%</div>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-700 rounded border">
                    <div className="text-sm text-gray-500 mb-1">事实 B</div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">{c.factB.subject} · {c.factB.predicate}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{c.factB.object}</div>
                    <div className="text-xs text-gray-500 mt-1">置信度: {(c.factB.confidence * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zep 增强: 时间性矛盾 */}
      {zepConflicts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-3 flex items-center gap-1.5">
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded">Zep</span>
            时间性矛盾 ({zepConflicts.length})
          </h2>
          <div className="space-y-2">
            {zepConflicts.map((tc, i) => (
              <div key={i} className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="text-sm text-purple-800 dark:text-purple-200 font-medium">{tc.fact}</div>
                <div className="flex gap-4 mt-2 text-xs text-purple-600 dark:text-purple-400">
                  <span>{tc.source} → {tc.target}</span>
                  {tc.validAt && <span>生效: {tc.validAt}</span>}
                  {tc.invalidAt && <span>失效: {tc.invalidAt}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
