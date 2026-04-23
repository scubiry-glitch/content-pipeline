// 内容库 — ① 议题推荐 + ③ 差异化角度 + ④ 知识空白
// v7.2: 议题卡片从"一堆数字"变成"小简报"
import { useState, useEffect } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect } from '../components/ContentLibraryProductMeta';
import { DomainCascadeSelect, selectionToCode } from '../components/DomainCascadeSelect';
import type { TaxonomySelection } from '../types/taxonomy';

const API_BASE = '/api/v1/content-library';

type SceneTag =
  | '争议话题'
  | '新变化'
  | '被忽视的风险'
  | '反常识'
  | '认知拼图'
  | '决策转折'
  | '人物切片';

type PurposeId =
  | '建立权威'
  | '引发讨论'
  | '拉新'
  | '转化'
  | '教育'
  | '消费决策';

interface TopicRecommendation {
  entityId: string;
  entityName: string;
  score: number;
  factDensity: number;
  timeliness: number;
  gapScore: number;
  suggestedAngles: string[];
  // v7.2 LLM 增强字段
  reason?: string;
  titleSuggestion?: string;
  narrative?: string;
  evidenceFacts?: Array<{ subject: string; predicate: string; object: string; confidence: number }>;
  angleMatrix?: Array<{ angle: string; rationale: string }>;
  communityId?: string;
  communityCohesion?: number;
  createdAt?: string;
  updatedAt?: string;
  // v7.5 场景化 + 目的倒推 + why 三问 + 角度卡
  scene?: SceneTag;
  sceneReason?: string;
  whyNow?: string;
  whyYou?: string;
  whyItWorks?: string;
  purpose?: PurposeId;
  angleCards?: Array<{ title: string; hook: string; whoCares: string; promise: string }>;
  detectedTensions?: Array<{
    tensionType: string;
    divergenceAxis?: string;
    factASummary: string;
    factBSummary: string;
  }>;
  narrativeGeneratedAt?: string;
}

const SCENE_META: Record<SceneTag, { icon: string; color: string; label: string }> = {
  '争议话题':   { icon: '🔥', color: 'bg-red-100 text-red-800 border-red-200', label: '争议话题' },
  '新变化':     { icon: '📈', color: 'bg-blue-100 text-blue-800 border-blue-200', label: '新变化' },
  '被忽视的风险': { icon: '⚠️', color: 'bg-amber-100 text-amber-800 border-amber-200', label: '被忽视的风险' },
  '反常识':     { icon: '🪞', color: 'bg-purple-100 text-purple-800 border-purple-200', label: '反常识' },
  '认知拼图':   { icon: '🧩', color: 'bg-teal-100 text-teal-800 border-teal-200', label: '认知拼图' },
  '决策转折':   { icon: '🧭', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', label: '决策转折' },
  '人物切片':   { icon: '🎭', color: 'bg-rose-100 text-rose-800 border-rose-200', label: '人物切片' },
};

interface KnowledgeGap {
  topic: string;
  type: 'differentiation' | 'blank';
  description: string;
  opportunity: string;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_TOPICS_PAGE_SIZE = 10;

export function ContentLibraryTopics() {
  const [topics, setTopics] = useState<TopicRecommendation[]>([]);
  const [topicsTotal, setTopicsTotal] = useState(0);
  const [topicsPage, setTopicsPage] = useState(1);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({ l1: null, l2: null });
  const { domains } = useDropdownOptions();
  const [tab, setTab] = useState<'topics' | 'gaps'>('topics');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [enriching, setEnriching] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'time' | 'narrative_at'>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [onlyNarrative, setOnlyNarrative] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_TOPICS_PAGE_SIZE);

  const load = async (pageArg?: number) => {
    const page = pageArg ?? topicsPage;
    setLoading(true);
    try {
      const taxCode = selectionToCode(taxonomy);
      const topicParams = new URLSearchParams();
      if (taxCode) topicParams.set('taxonomy_code', taxCode);
      else if (domain) topicParams.set('domain', domain);
      topicParams.set('limit', String(pageSize));
      topicParams.set('page', String(page));
      const topicSort =
        sortBy === 'time' ? 'time' : sortBy === 'narrative_at' ? 'narrative_at' : 'score';
      topicParams.set('sortBy', topicSort);
      topicParams.set('sortOrder', sortOrder);
      if (onlyNarrative) topicParams.set('has_narrative', 'true');

      const gapParams = new URLSearchParams();
      if (taxCode) gapParams.set('taxonomy_code', taxCode);
      else if (domain) gapParams.set('domain', domain);
      gapParams.set('limit', '10');
      gapParams.set('sortBy', sortBy);
      gapParams.set('sortOrder', sortOrder);

      const [topicsRes, gapsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/topics/recommended?${topicParams}`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE}/gaps?${gapParams}`).then(r => r.ok ? r.json() : []),
      ]);

      if (topicsRes.status === 'fulfilled' && topicsRes.value) {
        const raw = topicsRes.value as TopicRecommendation[] | { items?: TopicRecommendation[]; total?: number };
        const list = Array.isArray(raw) ? raw : (raw.items ?? []);
        const total = Array.isArray(raw) ? raw.length : (typeof raw.total === 'number' ? raw.total : list.length);
        setTopics(list);
        setTopicsTotal(total);
      } else {
        setTopics([]);
        setTopicsTotal(0);
      }
      setGaps(gapsRes.status === 'fulfilled' ? (Array.isArray(gapsRes.value) ? gapsRes.value : []) : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(topicsPage); }, [topicsPage, sortBy, sortOrder, pageSize, onlyNarrative]);

  const topicsTotalPages = Math.max(1, Math.ceil(topicsTotal / pageSize) || 1);

  const toggleExpand = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const generateEnrichment = async () => {
    setEnriching(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), page: String(topicsPage) });
      const topicSort =
        sortBy === 'time' ? 'time' : sortBy === 'narrative_at' ? 'narrative_at' : 'score';
      params.set('sortBy', topicSort);
      params.set('sortOrder', sortOrder);
      if (onlyNarrative) params.set('has_narrative', 'true');
      const taxCode = selectionToCode(taxonomy);
      if (taxCode) params.set('taxonomy_code', taxCode);
      else if (domain) params.set('domain', domain);
      await fetch(`${API_BASE}/topics/enrich?${params}`, { method: 'POST' });
      await load(topicsPage);
    } catch { /* ignore */ }
    setEnriching(false);
  };

  const copyToClipboard = (t: TopicRecommendation) => {
    const text = `${t.titleSuggestion || t.entityName}\n\n${t.narrative || t.reason || ''}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const timelinessLabel = (t: number) => {
    if (!Number.isFinite(t)) return '—';
    if (t >= 0.75) return '新';
    if (t >= 0.4) return '中';
    return '旧';
  };

  const timelinessColor = (t: number) => {
    if (!Number.isFinite(t)) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    if (t >= 0.75) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    if (t >= 0.4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  };

  const formatDate = (v?: string) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', { hour12: false });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">议题推荐 & 知识空白</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">①③④ 基于内容库事实图谱发现有价值的议题、差异化角度和知识空白</p>
      <ProductMetaBar productKey="topics" />

      <div className="flex gap-3 mb-6 items-center">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button onClick={() => setTab('topics')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'topics' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            ① 议题推荐
          </button>
          <button onClick={() => setTab('gaps')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'gaps' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            ③④ 差异化 & 空白
          </button>
        </div>
        <DomainCascadeSelect value={taxonomy} onChange={setTaxonomy} compact />
        <DomainSelect value={domain} onChange={setDomain} domains={domains} />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyNarrative}
            onChange={(e) => {
              setOnlyNarrative(e.target.checked);
              setTopicsPage(1);
            }}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          仅看有叙事
        </label>
        <select
          value={sortBy}
          onChange={(e) => {
            const v = e.target.value;
            const next: 'default' | 'time' | 'narrative_at' =
              v === 'time' ? 'time' : v === 'narrative_at' ? 'narrative_at' : 'default';
            setSortBy(next);
            setTopicsPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <option value="default">默认排序（综合分）</option>
          <option value="time">按最近事实时间</option>
          <option value="narrative_at">按叙事生成时间</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => {
            const next = e.target.value === 'asc' ? 'asc' : 'desc';
            setSortOrder(next);
            setTopicsPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <option value="desc">倒序（新→旧 / 高→低）</option>
          <option value="asc">正序（旧→新 / 低→高）</option>
        </select>
        <select
          value={String(pageSize)}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10) || DEFAULT_TOPICS_PAGE_SIZE;
            setPageSize(next);
            setTopicsPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <option value="10">每页 10 条</option>
          <option value="20">每页 20 条</option>
          <option value="50">每页 50 条</option>
          <option value="100">每页 100 条</option>
        </select>
        <button type="button" onClick={() => void load()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">刷新</button>
        {tab === 'topics' && topicsTotal > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <button
              type="button"
              disabled={topicsPage <= 1 || loading}
              onClick={() => setTopicsPage(p => Math.max(1, p - 1))}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              上一页
            </button>
            <span>
              第 {topicsPage} / {topicsTotalPages} 页（共 {topicsTotal} 条）
            </span>
            <button
              type="button"
              disabled={topicsPage >= topicsTotalPages || loading}
              onClick={() => setTopicsPage(p => p + 1)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              下一页
            </button>
          </div>
        )}
        <button onClick={generateEnrichment} disabled={enriching}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 text-sm"
          title="调用 LLM 生成议题标题/导语/角度，结果缓存到数据库">
          {enriching ? '生成中...' : '✍️ 生成叙事'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : tab === 'topics' ? (
        topics.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无议题推荐。积累更多事实数据后将自动生成。</div>
        ) : (
          <div className="space-y-4">
            {topics.map((t, i) => {
              const isExpanded = expanded.has(i);
              const hasEnriched = !!t.reason || !!t.titleSuggestion || !!t.narrative;
              return (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                  {/* 头部: 名称 + 场景 badge + 时效 + 分数 */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* v7.5: 场景 badge */}
                      {t.scene && SCENE_META[t.scene] && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SCENE_META[t.scene].color}`}
                          title={t.sceneReason || ''}
                        >
                          {SCENE_META[t.scene].icon} {SCENE_META[t.scene].label}
                        </span>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{t.entityName || '(未命名)'}</h3>
                        {t.narrativeGeneratedAt && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            叙事生成：{formatDate(t.narrativeGeneratedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${timelinessColor(t.timeliness)}`}>
                        {timelinessLabel(t.timeliness)}
                      </span>
                      <span className="text-sm font-medium text-indigo-600">{Number.isFinite(t.score) ? t.score.toFixed(1) : '—'}</span>
                    </div>
                  </div>

                  {/* v7.2: 推荐理由 (一句话) */}
                  {t.reason && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-start gap-1.5">
                      <span className="shrink-0">📌</span>
                      <span>{t.reason}</span>
                    </p>
                  )}

                  {/* v7.5: 角度卡(横向两列) */}
                  {t.angleCards && t.angleCards.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 mt-2">
                      {t.angleCards.slice(0, isExpanded ? 3 : 2).map((card, j) => (
                        <div key={j} className="border border-indigo-200 dark:border-indigo-700 rounded-md p-2.5 bg-indigo-50/40 dark:bg-indigo-900/20">
                          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-1">{card.title}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mb-1.5">💬 {card.hook}</p>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            <span>🎯 {card.whoCares}</span>
                            <span>📦 {card.promise}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* v7.5: why 三问 */}
                  {(t.whyNow || t.whyYou || t.whyItWorks) && (
                    <div className="mt-2 mb-2 space-y-1 bg-gray-50 dark:bg-gray-900/30 rounded p-2.5 text-xs">
                      {t.whyNow && (
                        <div className="flex items-start gap-1.5">
                          <span className="shrink-0 font-medium text-gray-600 dark:text-gray-400">为什么现在:</span>
                          <span className="text-gray-700 dark:text-gray-300">{t.whyNow}</span>
                        </div>
                      )}
                      {t.whyYou && (
                        <div className="flex items-start gap-1.5">
                          <span className="shrink-0 font-medium text-gray-600 dark:text-gray-400">为什么你:</span>
                          <span className="text-gray-700 dark:text-gray-300">{t.whyYou}</span>
                        </div>
                      )}
                      {t.whyItWorks && (
                        <div className="flex items-start gap-1.5">
                          <span className="shrink-0 font-medium text-gray-600 dark:text-gray-400">历史表现:</span>
                          <span className="text-gray-700 dark:text-gray-300">{t.whyItWorks}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* v7.2: 建议标题 */}
                  {t.titleSuggestion && (
                    <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2 flex items-start gap-1.5">
                      <span className="shrink-0">✏️</span>
                      <span>{t.titleSuggestion}</span>
                    </p>
                  )}

                  {/* 角度 (角度矩阵优先，fallback 到旧 suggestedAngles) */}
                  {((t.angleMatrix && t.angleMatrix.length > 0) || (t.suggestedAngles && t.suggestedAngles.length > 0)) && (
                    <div className="mb-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {(t.angleMatrix || []).slice(0, isExpanded ? 10 : 3).map((a, j) => (
                          <span key={j} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full text-xs"
                            title={a.rationale}>
                            {a.angle}
                          </span>
                        ))}
                        {!t.angleMatrix?.length && t.suggestedAngles?.slice(0, 3).map((a, j) => (
                          <span key={j} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 展开区: narrative + 证据 + 角度详情 */}
                  {isExpanded && hasEnriched && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
                      {/* 导语 */}
                      {t.narrative && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">📝 选题会导语</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-900/50 rounded p-3">{t.narrative}</p>
                        </div>
                      )}

                      {/* 角度详情 */}
                      {t.angleMatrix && t.angleMatrix.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">🔖 角度分析</p>
                          {t.angleMatrix.map((a, j) => (
                            <div key={j} className="ml-2 mb-1 text-sm">
                              <span className="font-medium text-gray-800 dark:text-gray-200">{a.angle}</span>
                              {a.rationale && <span className="text-gray-500 ml-1">— {a.rationale}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 证据事实 */}
                      {t.evidenceFacts && t.evidenceFacts.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">🧾 支撑证据 ({t.evidenceFacts.length} 条)</p>
                          {t.evidenceFacts.map((f, j) => (
                            <div key={j} className="ml-2 text-xs text-gray-600 dark:text-gray-400">
                              · {f.subject} · {f.predicate} → {f.object} ({Math.round(f.confidence * 100)}%)
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 底部: 指标 + 操作按钮 */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    <div className="text-xs text-gray-400">
                      密度 {t.factDensity} · 空白 {Number.isFinite(t.gapScore) ? t.gapScore.toFixed(2) : '—'}
                      {t.communityId && ` · 社区 ${t.communityId}`}
                      {' · '}创建 {formatDate(t.createdAt)} · 更新 {formatDate(t.updatedAt)}
                    </div>
                    <div className="flex gap-2">
                      {hasEnriched && (
                        <>
                          <button
                            onClick={() => copyToClipboard(t)}
                            className="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                            title="复制标题+导语到剪贴板"
                          >
                            📋 复制
                          </button>
                          <button
                            onClick={() => toggleExpand(i)}
                            className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            {isExpanded ? '收起' : '展开详情'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        gaps.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无知识空白数据。</div>
        ) : (
          <div className="space-y-3">
            {gaps.map((g, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${g.type === 'differentiation' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                    {g.type === 'differentiation' ? '③ 差异化' : '④ 空白'}
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{g.topic}</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{g.description}</p>
                <p className="text-sm text-green-600 dark:text-green-400">{g.opportunity}</p>
                <p className="text-xs text-gray-400 mt-2">
                  创建 {formatDate(g.createdAt)} · 更新 {formatDate(g.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
