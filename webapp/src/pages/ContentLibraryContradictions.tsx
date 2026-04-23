// 内容库 — 争议话题看板
// v7.4: 假阳性过滤 + 来源标注
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';
import { useZepStatus, ZepEnhancementPanel } from '../components/ZepEnhancementPanel';

const API_BASE = '/api/v1/content-library';
const PAGE_SIZE = 20;

// ── 假阳性过滤工具 ────────────────────────────────────────────────────────────

/** 归一化 object 值：去除近似/目的前缀、助词、千分位逗号 */
function normalizeValue(v: string): string {
  return v
    // 近似量词前缀
    .replace(/^(约为?|大约|近|超过|不到|至少|最多|约达|逾|达|仅|仅约)\s*/u, '')
    // 目的/动词前缀
    .replace(/^(为了?|用于|旨在)\s*/u, '')
    // 时间限定前缀（如"截至2018年底"）
    .replace(/^截至\S+?[底末]\s*/u, '')
    // 常见虚词
    .replace(/[的了着过地得]/gu, '')
    // 千分位逗号
    .replace(/,/g, '')
    // 各类引号（英文单双、中文全角）
    .replace(/['"'"«»「」『』【】]/g, '')
    .trim();
}

/** Levenshtein 编辑距离（O(n·m) 滚动数组） */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * 判断两个 object 值是否语义相同（假阳性）：
 * 1. 归一化后字符串相等
 * 2. 都能解析为数字且差异 < 0.1%
 * 3. 一方是另一方的子串（附加时间/修饰语场景）
 * 4. 编辑距离 / 最长串 < 15%（词序互换、标点细差）
 */
function isSemanticallyEqual(a: string, b: string): boolean {
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  if (na === nb) return true;

  const fa = parseFloat(na);
  const fb = parseFloat(nb);
  if (!isNaN(fa) && !isNaN(fb) && Math.abs(fa - fb) / (Math.max(Math.abs(fa), Math.abs(fb)) || 1) < 0.001) {
    return true;
  }

  if (na.length >= 4 && (nb.includes(na) || na.includes(nb))) return true;

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen > 0 && maxLen <= 200 && editDistance(na, nb) / maxLen < 0.15) return true;

  return false;
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Fact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  context: Record<string, unknown>;
  assetId?: string;
}

interface Contradiction {
  id: string;
  factA: Fact;
  factB: Fact;
  description: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
  // 深度召回扩展字段
  tensionType?: string;
  divergenceAxis?: string;
  parties?: Array<{ name: string; stance: string }>;
  timeSlice?: string;
  underlyingModel?: string;
  recallLayer?: 'L1' | 'L2' | 'L3';
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

export function ContentLibraryContradictions() {
  const [all, setAll] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSubject, setSearchSubject] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [tensionTypeFilter, setTensionTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [deepRecall, setDeepRecall] = useState(false);
  const [deepLimit, setDeepLimit] = useState(30);
  const zepStatus = useZepStatus();
  const [zepConflicts, setZepConflicts] = useState<Array<{
    fact: string; validAt?: string; invalidAt?: string; source: string; target: string
  }>>([]);
  const [zepLoading, setZepLoading] = useState(false);

  useEffect(() => { loadData(); }, [deepRecall, deepLimit]);

  useEffect(() => {
    const q = searchSubject.trim();
    if (!q) { setZepConflicts([]); setZepLoading(false); return; }
    setZepLoading(true);
    fetch(`${API_BASE}/zep/contradictions/${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setZepConflicts(d?.temporalConflicts?.length ? d.temporalConflicts : []))
      .catch(() => setZepConflicts([]))
      .finally(() => setZepLoading(false));
  }, [searchSubject]);

  const loadData = async () => {
    setLoading(true);
    try {
      let raw: Contradiction[] = [];
      if (deepRecall) {
        const res = await fetch(`${API_BASE}/contradictions/recall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: deepLimit, enableL3: true }),
        });
        if (res.ok) {
          const data = await res.json();
          raw = Array.isArray(data.items) ? data.items : [];
        }
      } else {
        const res = await fetch(`${API_BASE}/contradictions?limit=200`);
        if (res.ok) {
          const data = await res.json();
          raw = Array.isArray(data) ? data : (data?.items ?? []);
        }
      }
      // 去假阳性（L1 模式下仍有效；L2/L3 结果保留不过滤，语义对冲本就不同值）
      const deduped = deepRecall
        ? raw
        : raw.filter(c => !isSemanticallyEqual(c.factA.object, c.factB.object));
      const seen = new Set<string>();
      const unique = deduped.filter(c => {
        const key = `${c.factA.subject}||${c.factA.predicate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAll(unique);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const filtered = all.filter(c => {
    if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
    if (tensionTypeFilter !== 'all' && c.tensionType !== tensionTypeFilter) return false;
    if (searchSubject) {
      const q = searchSubject.toLowerCase();
      const match = c.factA.subject.toLowerCase().includes(q)
        || c.factB.subject.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const tensionTypes = Array.from(new Set(all.map(c => c.tensionType).filter(Boolean))) as string[];

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeP = Math.min(page, totalPages);
  const pageItems = filtered.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);
  const resetPage = () => setPage(1);

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

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
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
        {tensionTypes.length > 0 && (
          <select value={tensionTypeFilter} onChange={e => { setTensionTypeFilter(e.target.value); resetPage(); }}
            className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm">
            <option value="all">全部张力类型</option>
            {tensionTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button onClick={loadData} disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm">
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>
      {/* 深度召回控制栏 */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={deepRecall} onChange={e => { setDeepRecall(e.target.checked); resetPage(); }}
            disabled={loading} className="rounded accent-green-600" />
          <span className="text-green-700 dark:text-green-400 font-medium">🧬 深度召回</span>
          <span className="text-xs text-gray-400">（L1+L2+L3，输出张力地图）</span>
        </label>
        {deepRecall && (
          <label className="flex items-center gap-1.5 text-sm text-gray-500 select-none">
            召回数量
            <input type="number" min={5} max={200} value={deepLimit}
              onChange={e => setDeepLimit(Math.min(200, Math.max(5, Number(e.target.value) || 30)))}
              disabled={loading}
              className="w-16 px-1.5 py-0.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            条
          </label>
        )}
        <span className="text-xs text-gray-400">
          {deepRecall ? `深度召回（L1+L2+L3）· 共 ${all.length} 条` : `L1 字面对冲 · 共 ${all.length} 条`}
        </span>
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
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="font-medium text-gray-900 dark:text-white">{c.description}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.recallLayer && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono">
                        {c.recallLayer}
                      </span>
                    )}
                    {c.tensionType && c.tensionType !== 'unknown' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                        {c.tensionType}
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${cfg.color}`}>
                      严重度: {cfg.label}
                    </span>
                  </div>
                </div>
                {/* 张力地图 */}
                {(c.divergenceAxis || c.underlyingModel || (c.parties && c.parties.length > 0)) && (
                  <div className="mb-3 p-2.5 rounded bg-white/60 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-xs space-y-1">
                    {c.divergenceAxis && (
                      <div><span className="text-gray-400">分歧轴：</span><span className="text-gray-700 dark:text-gray-200">{c.divergenceAxis}</span></div>
                    )}
                    {c.underlyingModel && (
                      <div><span className="text-gray-400">心智模型：</span><span className="text-gray-700 dark:text-gray-200">{c.underlyingModel}</span></div>
                    )}
                    {c.parties && c.parties.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {c.parties.map((p, pi) => (
                          <span key={pi} className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                            <span className="font-medium">{p.name}</span>：{p.stance}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {([c.factA, c.factB] as Fact[]).map((fact, fi) => {
                    const source = fact.assetId || (fact.context?.source as string) || (fact.context?.assetId as string);
                    return (
                      <div key={fi} className="p-3 bg-white dark:bg-gray-700 rounded border">
                        <div className="text-sm text-gray-500 mb-1">事实 {fi === 0 ? 'A' : 'B'}</div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">
                          {fact.subject} · {fact.predicate}
                        </div>
                        <div className="font-medium text-gray-900 dark:text-white">{fact.object}</div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                          <span>置信度: {(fact.confidence * 100).toFixed(0)}%</span>
                          {source && (
                            <Link
                              to={`/assets/${encodeURIComponent(source)}`}
                              className="text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              来源: {source}
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ZepEnhancementPanel
        visible={!!searchSubject.trim()}
        zepStatus={zepStatus}
        loading={zepLoading}
        hasData={zepConflicts.length > 0}
        title="时间性矛盾（valid_at / invalid_at）"
      >
        {zepConflicts.map((tc, i) => (
          <div key={i} className="p-4 bg-white/80 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="text-sm text-purple-800 dark:text-purple-200 font-medium">{tc.fact}</div>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-purple-600 dark:text-purple-400">
              <span>{tc.source} → {tc.target}</span>
              {tc.validAt && <span>生效: {tc.validAt}</span>}
              {tc.invalidAt && <span>失效: {tc.invalidAt}</span>}
            </div>
          </div>
        ))}
      </ZepEnhancementPanel>
    </div>
  );
}
