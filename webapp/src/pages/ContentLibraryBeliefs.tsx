// Content Library — ⑭ 观点演化脉络
// 追踪某个命题或信念的立场变迁 + 组合模式识别

import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';
import { useZepStatus, ZepEnhancementPanel } from '../components/ZepEnhancementPanel';
import { SearchSuggestPanel } from '../components/SearchSuggestPanel';

const API_BASE = '/api/v1/content-library';

interface SourceItem {
  id: string;
  label: string;
  assetId?: string | null;
  assetTitle?: string;
  assetUrl?: string;
  passage?: string;
  domain?: string;
  sourceHint?: string;
}

interface TimelineEntry {
  date: string;
  state: string;
  sources: SourceItem[];
  reason?: string;
  confidence?: number;
  confidenceDelta?: number;
}

type PatternSeverity = 'info' | 'notice' | 'alert';
type PatternType =
  | 'correction' | 'reinforcement' | 'risk_reversal' | 'oscillation'
  | 'evidence_saturation' | 'staleness' | 'emerging' | 'bidirectional_buildup';

interface EvolutionPattern {
  type: PatternType;
  label: string;
  severity: PatternSeverity;
  windowStart: string;
  windowEnd: string;
  affectedStances: string[];
  explanation: string;
}

interface BeliefTimeline {
  timeline: TimelineEntry[];
  patterns: EvolutionPattern[];
  summary: string;
  currentConfidence?: number;
}

interface BeliefOption { id: string; subject: string; state: string; }

const STATE_META: Record<string, { dot: string; badge: string; text: string; label: string }> = {
  confirmed:  { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-800 border-green-300',   text: 'text-green-700',  label: '✓ 已确认' },
  disputed:   { dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300', text: 'text-yellow-700', label: '⚠️ 有争议' },
  evolving:   { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-800 border-blue-300',      text: 'text-blue-700',   label: '🔄 演变中' },
  refuted:    { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-800 border-red-300',         text: 'text-red-700',    label: '✗ 已推翻' },
};

function stateMeta(state: string) {
  return STATE_META[state] || { dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-800 border-gray-300', text: 'text-gray-700', label: state };
}

function normalizeText(v?: string | null): string {
  return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDate(date?: string): string {
  if (!date) return '';
  const datePartMatch = /^(\d{4}-\d{2}-\d{2})/.exec(date);
  if (datePartMatch) return datePartMatch[1];
  const d = new Date(date);
  if (isNaN(d.getTime())) return normalizeText(date);
  return d.toISOString().slice(0, 10);
}

function sourceSignature(src: SourceItem): string {
  return [
    normalizeText(src.id),
    normalizeText(src.assetId),
    normalizeText(src.assetUrl),
    normalizeText(src.assetTitle),
    normalizeText(src.label),
    normalizeText(src.passage),
  ].join('||');
}

function dedupeSources(sources: SourceItem[]): SourceItem[] {
  const seen = new Set<string>();
  const deduped: SourceItem[] = [];
  for (const src of sources || []) {
    const sig = sourceSignature(src);
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(src);
  }
  return deduped;
}

function dedupeTimelineEntries(entries: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  const deduped: TimelineEntry[] = [];
  for (const entry of entries || []) {
    const uniqueSources = dedupeSources(Array.isArray(entry.sources) ? entry.sources : []);
    const sourcesSig = uniqueSources.map(sourceSignature).sort().join('###');
    const sig = [
      normalizeDate(entry.date),
      normalizeText(entry.state),
      normalizeText(entry.reason),
      sourcesSig,
    ].join('@@@');
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push({ ...entry, sources: uniqueSources });
  }
  return deduped;
}

const SEVERITY_STYLE: Record<PatternSeverity, { wrap: string; tag: string; icon: string }> = {
  alert:  { wrap: 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700',      tag: 'bg-red-500 text-white',    icon: '⚠' },
  notice: { wrap: 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700', tag: 'bg-yellow-500 text-white', icon: '◈' },
  info:   { wrap: 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700',  tag: 'bg-green-500 text-white',  icon: '✓' },
};

export function ContentLibraryBeliefs() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [patterns, setPatterns] = useState<EvolutionPattern[]>([]);
  const [currentConfidence, setCurrentConfidence] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beliefId, setBeliefId] = useState('');
  const [subject, setSubject] = useState('');
  const [options, setOptions] = useState<BeliefOption[]>([]);
  const zepStatus = useZepStatus();
  const [zepTimeline, setZepTimeline] = useState<Array<{ fact: string; validAt?: string; invalidAt?: string }>>([]);
  const [zepLoading, setZepLoading] = useState(false);
  const [beliefZepQueried, setBeliefZepQueried] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [appendBanner, setAppendBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/dropdown/beliefs`)
      .then(r => r.ok ? r.json() : [])
      .then((data: BeliefOption[]) => setOptions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchTimeline = async () => {
    if (!beliefId && !subject) {
      setError('请输入命题 ID 或主体');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (subject) params.append('subject', subject);
      params.append('limit', '50');
      const endpoint = beliefId ? `/beliefs/${encodeURIComponent(beliefId)}/timeline` : `/beliefs/${encodeURIComponent(subject)}/timeline`;
      const res = await fetch(`${API_BASE}${endpoint}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BeliefTimeline = await res.json();
      const rawTimeline = Array.isArray(data.timeline) ? data.timeline : [];
      setTimeline(dedupeTimelineEntries(rawTimeline));
      setPatterns(Array.isArray(data.patterns) ? data.patterns : []);
      setCurrentConfidence(data.currentConfidence);
      setBeliefZepQueried(true);
      const prop = subject || beliefId;
      setZepLoading(true);
      setZepTimeline([]);
      fetch(`${API_BASE}/zep/beliefs/${encodeURIComponent(prop)}/timeline`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setZepTimeline(Array.isArray(d) ? d : []))
        .catch(() => setZepTimeline([]))
        .finally(() => setZepLoading(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">观点演化脉络</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          定性：命题立场的变迁与组合模式（纠偏 / 强化 / 反转）
        </p>
        <ProductMetaBar productKey="beliefs" />
      </div>

      {/* 查询参数 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              选择主体 {options.length > 0 && <span className="text-gray-400">({options.length} 个)</span>}
            </label>
            {options.length > 0 ? (
              <select
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setBeliefId(''); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">-- 选择命题主体 --</option>
                {options.map(o => (
                  <option key={o.id} value={o.subject}>{o.subject}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., ChatGPT 是否会失业"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              或直接输入主体
            </label>
            <input
              type="text"
              value={beliefId}
              onChange={(e) => { setBeliefId(e.target.value); if (e.target.value) setSubject(''); }}
              placeholder="手动输入命题或实体名"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchTimeline}
            disabled={loading || (!subject && !beliefId)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? '查询中...' : '查询演化脉络'}
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            disabled={!subject && !beliefId}
            className="px-4 py-2 border border-indigo-500 text-indigo-600 dark:text-indigo-300 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            title="通过 TAVILY 搜索网络证据，勾选后作为新的时间点写入"
          >
            🔍 搜索补全
          </button>
        </div>
      </div>

      {appendBanner && (
        <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-4 py-2 rounded mb-4 flex items-center justify-between">
          <span>{appendBanner}</span>
          <button onClick={() => setAppendBanner(null)} className="text-green-600 hover:text-green-800">×</button>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 组合模式横幅 */}
      {patterns.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">识别到 {patterns.length} 个组合模式</p>
          {patterns.map((p, i) => {
            const sty = SEVERITY_STYLE[p.severity];
            return (
              <div key={i} className={`flex items-start gap-3 border-l-4 rounded-r p-3 ${sty.wrap}`}>
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0 ${sty.tag}`}>
                  {sty.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">{p.label}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(p.windowStart).toLocaleDateString('zh-CN')} → {new Date(p.windowEnd).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{p.explanation}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 时间线 */}
      <div>
        {timeline.length === 0 && !loading && (
          <div className="text-gray-500 text-center py-8">暂无演化数据</div>
        )}

        {timeline.map((entry, idx) => {
          const meta = stateMeta(entry.state);
          const nextMeta = idx < timeline.length - 1 ? stateMeta(timeline[idx + 1].state) : null;
          const isMajorShift = nextMeta && (
            (entry.state === 'confirmed' && (timeline[idx + 1].state === 'disputed' || timeline[idx + 1].state === 'refuted'))
          );
          return (
            <div key={idx} className="flex gap-4">
              {/* 时间线点 + 连接线（状态着色） */}
              <div className="flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full ring-2 ring-white dark:ring-gray-900 mt-2 ${meta.dot}`}></div>
                {idx < timeline.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 min-h-16 ${isMajorShift ? 'bg-red-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                    style={isMajorShift ? { width: '3px' } : undefined}
                  ></div>
                )}
              </div>

              {/* 内容 */}
              <div className="pb-6 pt-1 flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {new Date(entry.date).toLocaleDateString('zh-CN')}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${meta.badge}`}>
                    {meta.label}
                  </span>
                  {entry.confidence !== undefined && (
                    <span className={`text-xs ${meta.text}`}>
                      置信 {entry.confidence.toFixed(2)}
                    </span>
                  )}
                  {entry.confidenceDelta !== undefined && Math.abs(entry.confidenceDelta) >= 0.01 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${entry.confidenceDelta > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {entry.confidenceDelta > 0 ? '↑' : '↓'}{Math.abs(entry.confidenceDelta).toFixed(2)}
                    </span>
                  )}
                </div>

                {entry.reason && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 italic">
                    变更原因：{entry.reason}
                  </p>
                )}

                {entry.sources.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">依据（{entry.sources.length} 项）：</p>
                    {entry.sources.map((src, i) => {
                      const key = `${idx}-${i}-${src.id}`;
                      const isOpen = expandedSource === key;
                      const hasDetail = src.assetTitle || src.passage || src.assetUrl;
                      return (
                        <div
                          key={key}
                          className="border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800/40"
                        >
                          <button
                            onClick={() => setExpandedSource(isOpen ? null : key)}
                            className="w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                {src.assetTitle || src.label}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                {src.sourceHint && <span>{src.sourceHint}</span>}
                                {src.domain && <span className="px-1.5 bg-gray-100 dark:bg-gray-700 rounded">{src.domain}</span>}
                                <span className="text-gray-400">{src.label}</span>
                              </div>
                            </div>
                            {hasDetail && (
                              <span className="text-xs text-indigo-600 dark:text-indigo-400 shrink-0">
                                {isOpen ? '收起' : '展开'}
                              </span>
                            )}
                          </button>
                          {isOpen && hasDetail && (
                            <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                              {src.passage && (
                                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                  {src.passage}
                                </p>
                              )}
                              <div className="mt-2 flex items-center gap-3 text-xs">
                                {src.assetUrl && (
                                  <a
                                    href={src.assetUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    打开原文 ↗
                                  </a>
                                )}
                                {src.assetId && !String(src.assetId).startsWith('tavily:') && (
                                  <a
                                    href={`/assets/${src.assetId}`}
                                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                  >
                                    素材详情
                                  </a>
                                )}
                                <span className="text-gray-400 font-mono" title={src.id}>
                                  fact {String(src.id).slice(0, 8)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ZepEnhancementPanel
        visible={beliefZepQueried}
        zepStatus={zepStatus}
        loading={zepLoading}
        hasData={zepTimeline.length > 0}
        title="时间版本链（事实 valid / invalid）"
      >
        {zepTimeline.map((zt, i) => (
          <div key={i} className="p-3 bg-white/80 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-sm text-purple-800 dark:text-purple-200">{zt.fact}</span>
            <div className="flex flex-wrap gap-3 text-xs text-purple-500 shrink-0">
              {zt.validAt && <span>生效: {zt.validAt}</span>}
              {zt.invalidAt && <span className="text-red-600 dark:text-red-400">失效: {zt.invalidAt}</span>}
            </div>
          </div>
        ))}
      </ZepEnhancementPanel>

      {/* 底部汇总 */}
      {timeline.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            共 <span className="font-semibold">{timeline.length}</span> 次变更
            {patterns.length > 0 && <> · 识别出 <span className="font-semibold">{patterns.length}</span> 个模式</>}
            {currentConfidence !== undefined && <> · 当前置信 <span className="font-semibold">{currentConfidence.toFixed(2)}</span></>}
          </p>
        </div>
      )}

      {searchOpen && (
        <SearchSuggestPanel
          mode="belief"
          subject={subject || beliefId}
          predicate="web_mention"
          apiBase={API_BASE}
          onClose={() => setSearchOpen(false)}
          onAppended={(count) => {
            setAppendBanner(`已写入 ${count} 条证据，刷新时间线…`);
            fetchTimeline();
            setTimeout(() => setAppendBanner(null), 4000);
          }}
        />
      )}
    </div>
  );
}
