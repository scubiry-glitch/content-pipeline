// 搜索补全面板 — 复用于「观点演化脉络」「趋势信号」
// 点击按钮调用 TAVILY 搜索，勾选想采纳的结果，确认后写入 content_facts

import { useState } from 'react';

export type SearchSuggestMode = 'belief' | 'trend';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source?: string;
  publishedAt?: string;
  relevance?: number;
  credibility?: { level: string; score: number; reason: string };
}

interface Props {
  mode: SearchSuggestMode;
  subject: string;
  /** trend 模式需要指定指标名；belief 模式通常用 "web_mention" 默认值 */
  predicate?: string;
  onClose: () => void;
  /** 写入成功后回调（由父组件刷新时间线/趋势） */
  onAppended: (count: number) => void;
  apiBase: string;
}

interface Draft extends SearchResult {
  selected: boolean;
  editableDate: string;
  editableValue: string; // trend 模式下用户输入的数值
}

function isoToInput(iso?: string): string {
  if (!iso) return '';
  // 优先保留原始日期部分，避免时区换算导致日期偏移
  const datePartMatch = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (datePartMatch) return datePartMatch[1];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function inputDateToIso(dateInput?: string): string | undefined {
  if (!dateInput) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    // 以 UTC 零点持久化，保证“看到的日期”与“写入的日期”一致
    return `${dateInput}T00:00:00.000Z`;
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function normalizeDetectedDate(y: string, m: string, d: string): string | null {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectResultDate(result: SearchResult): string {
  const fromPublishedAt = isoToInput(result.publishedAt);
  if (fromPublishedAt) return fromPublishedAt;

  const text = [result.snippet, result.title, result.url].filter(Boolean).join(' ');
  const patterns = [
    /(?:19|20)\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?/g,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const raw of matches) {
      const nums = raw.match(/\d+/g);
      if (!nums || nums.length < 3) continue;
      const normalized = normalizeDetectedDate(nums[0], nums[1], nums[2]);
      if (normalized) return normalized;
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function detectTrendValue(result: SearchResult): string {
  const text = [result.title, result.snippet].filter(Boolean).join(' ');
  if (!text) return '';

  // 优先抓“更像指标取值”的格式（百分比/金额/人数/倍数）
  const patterns = [
    /\d+(?:\.\d+)?\s*%/,
    /(?:约|近|超|超过|达|达到|突破)?\s*\d+(?:\.\d+)?\s*(?:万亿|千亿|百亿|十亿|亿元|亿元人民币|亿|千万|百万|万|元|美元|US\$|\$)/i,
    /(?:约|近|超|超过|达|达到|突破)?\s*\d+(?:\.\d+)?\s*(?:万人|人次|万人次|亿人|人)/,
    /\d+(?:\.\d+)?\s*(?:倍|x|X)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return match[0].replace(/\s+/g, '').trim();
    }
  }

  // 兜底：取第一个纯数字（含小数）
  const fallback = text.match(/\d+(?:\.\d+)?/);
  return fallback?.[0] || '';
}

export function SearchSuggestPanel({ mode, subject, predicate, onClose, onAppended, apiBase }: Props) {
  const [extraKeywords, setExtraKeywords] = useState('');
  const [metric, setMetric] = useState(predicate || (mode === 'trend' ? '' : 'web_mention'));
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appending, setAppending] = useState(false);
  const [query, setQuery] = useState('');

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    setDrafts([]);
    try {
      const res = await fetch(`${apiBase}/search/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          mode,
          metric: mode === 'trend' ? metric : undefined,
          extraKeywords,
          limit: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `搜索失败 HTTP ${res.status}`);
        return;
      }
      setQuery(data.query || '');
      const results: SearchResult[] = Array.isArray(data.results) ? data.results : [];
      setDrafts(results.map((r) => ({
        ...r,
        selected: false,
        editableDate: detectResultDate(r),
        editableValue: mode === 'trend' ? detectTrendValue(r) : '',
      })));
    } catch (e: any) {
      setError(e?.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    setDrafts(d => d.map((x, idx) => idx === i ? { ...x, selected: !x.selected } : x));
  };

  const toggleAll = () => {
    setDrafts((prev) => {
      const shouldSelectAll = prev.some((item) => !item.selected);
      return prev.map((item) => ({ ...item, selected: shouldSelectAll }));
    });
  };

  const updateField = (i: number, key: 'editableDate' | 'editableValue', v: string) => {
    setDrafts(d => d.map((x, idx) => idx === i ? { ...x, [key]: v } : x));
  };

  const confirm = async () => {
    const picked = drafts.filter(d => d.selected);
    if (picked.length === 0) { setError('请至少勾选一项'); return; }
    if (mode === 'trend') {
      if (!metric) { setError('趋势模式需要填入指标名'); return; }
      if (picked.some(p => !p.editableValue.trim())) {
        setError('趋势模式下每个勾选项都要填入取值');
        return;
      }
    }
    setAppending(true);
    setError(null);
    try {
      const body = {
        subject,
        predicate: mode === 'trend' ? metric : (predicate || 'web_mention'),
        mode,
        items: picked.map(p => ({
          title: p.title,
          snippet: p.snippet,
          url: p.url,
          publishedAt: inputDateToIso(p.editableDate),
          value: mode === 'trend' ? p.editableValue : undefined,
          source: p.source,
        })),
      };
      const res = await fetch(`${apiBase}/search/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `写入失败 HTTP ${res.status}`);
        return;
      }
      onAppended(data.appendedCount || picked.length);
      onClose();
    } catch (e: any) {
      setError(e?.message || '写入失败');
    } finally {
      setAppending(false);
    }
  };

  const selectedCount = drafts.filter(d => d.selected).length;
  const allSelected = drafts.length > 0 && selectedCount === drafts.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              🔍 TAVILY 搜索补全 · {mode === 'belief' ? '观点演化' : '趋势信号'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">主体：<span className="font-mono">{subject}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        {/* Query params */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          {mode === 'trend' && (
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">指标名（写入 content_facts.predicate）</label>
              <input
                value={metric}
                onChange={e => setMetric(e.target.value)}
                placeholder="e.g. 连锁化率 / 月活 / 融资金额"
                className="w-full px-3 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">附加关键词（可选）</label>
            <div className="flex gap-2">
              <input
                value={extraKeywords}
                onChange={e => setExtraKeywords(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && runSearch()}
                placeholder={mode === 'trend' ? '2024 最新 数据' : '争议 最新 研究'}
                className="flex-1 px-3 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
              <button
                onClick={runSearch}
                disabled={loading}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? '搜索中...' : '搜索'}
              </button>
            </div>
            {query && !loading && (
              <p className="text-xs text-gray-400 mt-1">实际查询：<span className="font-mono">{query}</span></p>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
          )}
          {!loading && drafts.length > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>共 {drafts.length} 条搜索结果</span>
              <button
                onClick={toggleAll}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
            </div>
          )}
          {!loading && drafts.length === 0 && !error && (
            <div className="text-center text-gray-400 py-12 text-sm">
              输入关键词后点击「搜索」查找网络证据
            </div>
          )}
          {drafts.map((d, i) => (
            <div
              key={i}
              className={`border rounded-lg p-3 transition ${d.selected ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={d.selected}
                  onChange={() => toggle(i)}
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline break-words">
                    {d.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{d.source}</span>
                    {d.publishedAt && <span>· {new Date(d.publishedAt).toLocaleDateString('zh-CN')}</span>}
                    {d.credibility && (
                      <span className={`px-1.5 rounded ${d.credibility.level === 'A' ? 'bg-green-100 text-green-700' : d.credibility.level === 'B' ? 'bg-blue-100 text-blue-700' : d.credibility.level === 'C' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                        可信度 {d.credibility.level}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 line-clamp-3">{d.snippet}</p>

                  {d.selected && (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="text-xs">
                        <span className="block text-gray-500 mb-0.5">时间点</span>
                        <input
                          type="date"
                          value={d.editableDate}
                          onChange={e => updateField(i, 'editableDate', e.target.value)}
                          className="w-full px-2 py-1 text-xs border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                        />
                      </label>
                      {mode === 'trend' && (
                        <label className="text-xs">
                          <span className="block text-gray-500 mb-0.5">取值（必填）</span>
                          <input
                            value={d.editableValue}
                            onChange={e => updateField(i, 'editableValue', e.target.value)}
                            placeholder="e.g. 27% / 1.5亿"
                            className="w-full px-2 py-1 text-xs border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {selectedCount > 0 ? `已勾选 ${selectedCount} 项` : '勾选想写入的结果后确认'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              取消
            </button>
            <button
              onClick={confirm}
              disabled={appending || selectedCount === 0}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {appending ? '写入中...' : `确认添加 ${selectedCount || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
