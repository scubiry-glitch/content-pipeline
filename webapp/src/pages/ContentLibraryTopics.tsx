// 内容库 — ① 议题推荐 + ③ 差异化角度 + ④ 知识空白
// v7.2: 议题卡片从"一堆数字"变成"小简报"
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

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
}

interface KnowledgeGap {
  topic: string;
  type: 'differentiation' | 'blank';
  description: string;
  opportunity: string;
}

export function ContentLibraryTopics() {
  const [topics, setTopics] = useState<TopicRecommendation[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [tab, setTab] = useState<'topics' | 'gaps'>('topics');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (domain) params.set('domain', domain);
      params.set('limit', '10');

      const [topicsRes, gapsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/topics/recommended?${params}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/gaps?${params}`).then(r => r.ok ? r.json() : []),
      ]);

      setTopics(topicsRes.status === 'fulfilled' ? (Array.isArray(topicsRes.value) ? topicsRes.value : []) : []);
      setGaps(gapsRes.status === 'fulfilled' ? (Array.isArray(gapsRes.value) ? gapsRes.value : []) : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
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
        <input
          type="text" value={domain} onChange={e => setDomain(e.target.value)}
          placeholder="领域过滤..." className="w-40 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
        />
        <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">刷新</button>
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
                  {/* 头部: 名称 + 时效 + 分数 */}
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{t.entityName || '(未命名)'}</h3>
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
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
