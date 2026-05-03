// 智能推荐面板 v7.5 — scene filter + purpose filter + 角度卡 + why 三问 + 张力地图
import { useState, useCallback, useEffect, useRef } from 'react';

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

type SortKey = 'score' | 'hot' | 'latest';

const SCENE_META: Record<SceneTag, { icon: string; bg: string; text: string; border: string }> = {
  '争议话题':    { icon: '🔥', bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-700 dark:text-red-300',    border: 'border-red-200 dark:border-red-700' },
  '新变化':      { icon: '📈', bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-700' },
  '被忽视的风险':{ icon: '⚠️', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-700' },
  '反常识':      { icon: '🪞', bg: 'bg-purple-100 dark:bg-purple-900/30',text: 'text-purple-700 dark:text-purple-300',border: 'border-purple-200 dark:border-purple-700' },
  '认知拼图':    { icon: '🧩', bg: 'bg-teal-100 dark:bg-teal-900/30',   text: 'text-teal-700 dark:text-teal-300',   border: 'border-teal-200 dark:border-teal-700' },
  '决策转折':    { icon: '🧭', bg: 'bg-indigo-100 dark:bg-indigo-900/30',text: 'text-indigo-700 dark:text-indigo-300',border: 'border-indigo-200 dark:border-indigo-700' },
  '人物切片':    { icon: '🎭', bg: 'bg-rose-100 dark:bg-rose-900/30',   text: 'text-rose-700 dark:text-rose-300',   border: 'border-rose-200 dark:border-rose-700' },
};

const PURPOSE_META: Record<PurposeId, { icon: string; color: string }> = {
  '建立权威': { icon: '🏆', color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700' },
  '引发讨论': { icon: '💬', color: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-700' },
  '拉新':     { icon: '🎯', color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700' },
  '转化':     { icon: '💰', color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  '教育':     { icon: '📚', color: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700' },
  '消费决策': { icon: '🛒', color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700' },
};

const CATEGORY_LABELS: Record<string, string> = {
  all: '全部', tech: '科技', finance: '金融', policy: '政策', industry: '产业',
};

const SORT_LABELS: Record<SortKey, string> = {
  score: '综合', hot: '热度', latest: '最新',
};

const TENSION_TYPE_ICON: Record<string, string> = {
  '立场':   '⚖️',
  '叙事归因': '🔀',
  '利益':   '💥',
  '时序':   '⏳',
  '定义漂移': '🔍',
};

const TREND_ICON: Record<string, string> = { up: '📈', down: '📉', stable: '➡️' };

interface AngleCard {
  title: string;
  hook: string;
  whoCares: string;
  promise: string;
}

interface DetectedTension {
  tensionType: string;
  divergenceAxis?: string;
  factASummary: string;
  factBSummary: string;
}

interface RecommendedItem {
  id: string;
  title: string;
  category: string;
  score: number;
  reason: string;
  hotScore: number;
  trend?: 'up' | 'down' | 'stable';
  createdAt?: string;
  // v7.5
  scene?: SceneTag;
  sceneReason?: string;
  purpose?: PurposeId;
  whyNow?: string;
  whyYou?: string;
  whyItWorks?: string;
  angleCards?: AngleCard[];
  detectedTensions?: DetectedTension[];
}

interface RecommendationPanelProps {
  recommendations?: RecommendedItem[];
  onItemClick?: (item: RecommendedItem) => void;
  onRefresh?: () => void;
  /** 目的变更回调 — 父组件用它触发后端重拉（传 null 表示回到自动推断/不限） */
  onPurposeChange?: (purpose: PurposeId | null) => void;
}

function scoreColor(score: number) {
  if (score >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 70) return 'text-blue-600 dark:text-blue-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-gray-500 dark:text-gray-400';
}

function FilterChip({
  active, onClick, children, className = '',
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function RecommendationPanel({
  recommendations = [],
  onItemClick,
  onRefresh,
  onPurposeChange,
}: RecommendationPanelProps) {
  const sceneScrollRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [selectedScene, setSelectedScene] = useState<SceneTag | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPurpose, setSelectedPurpose] = useState<PurposeId | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [onlyControversy, setOnlyControversy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const setPurpose = (next: PurposeId | 'all') => {
    setSelectedPurpose(next);
    onPurposeChange?.(next === 'all' ? null : next);
  };

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setLoading(false);
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    if (recommendations.length === 0) void handleRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 活跃场景数量统计（用于 badge）
  const sceneCounts = recommendations.reduce<Record<string, number>>((acc, item) => {
    if (item.scene) acc[item.scene] = (acc[item.scene] ?? 0) + 1;
    return acc;
  }, {});

  // 筛选 + 排序
  const filtered = recommendations
    .filter((item) => {
      if (selectedScene !== 'all' && item.scene !== selectedScene) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (selectedPurpose !== 'all' && item.purpose !== selectedPurpose) return false;
      if (onlyControversy && (item.detectedTensions?.length ?? 0) === 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'hot') return b.hotScore - a.hotScore;
      if (sortKey === 'latest') {
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      }
      return b.score - a.score;
    });

  const activeFilterCount =
    (selectedScene !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedPurpose !== 'all' ? 1 : 0) +
    (onlyControversy ? 1 : 0);

  const resetFilters = () => {
    setSelectedScene('all');
    setSelectedCategory('all');
    setPurpose('all');
    setSortKey('score');
    setOnlyControversy(false);
  };

  const controversyCount = recommendations.reduce(
    (n, item) => n + ((item.detectedTensions?.length ?? 0) > 0 ? 1 : 0),
    0
  );

  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

      {/* ── 头部 ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <span>💡</span>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm shrink-0">智能推荐</h3>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/60 transition-colors"
            >
              <span>{activeFilterCount} 个筛选</span>
              <span>×</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{filtered.length}/{recommendations.length}</span>
          <button
            onClick={() => void handleRefresh()}
            disabled={loading}
            className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            {loading ? '🔄' : '↻'} 刷新
          </button>
        </div>
      </div>

      {/* ── 场景筛选 (横向滚动) ── */}
      <div
        ref={sceneScrollRef}
        className="flex gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide"
      >
        <FilterChip active={selectedScene === 'all'} onClick={() => setSelectedScene('all')}>
          全部场景
        </FilterChip>
        {(Object.keys(SCENE_META) as SceneTag[]).map((scene) => {
          const meta = SCENE_META[scene];
          const count = sceneCounts[scene] ?? 0;
          return (
            <FilterChip
              key={scene}
              active={selectedScene === scene}
              onClick={() => setSelectedScene(scene === selectedScene ? 'all' : scene)}
            >
              {meta.icon} {scene}
              {count > 0 && (
                <span className="ml-1 opacity-60">{count}</span>
              )}
            </FilterChip>
          );
        })}
      </div>

      {/* ── 目的筛选 ── */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide">
        <FilterChip active={selectedPurpose === 'all'} onClick={() => setPurpose('all')}>
          不限目的
        </FilterChip>
        {(Object.keys(PURPOSE_META) as PurposeId[]).map((purpose) => {
          const meta = PURPOSE_META[purpose];
          return (
            <FilterChip
              key={purpose}
              active={selectedPurpose === purpose}
              onClick={() => setPurpose(purpose === selectedPurpose ? 'all' : purpose)}
            >
              {meta.icon} {purpose}
            </FilterChip>
          );
        })}
      </div>

      {/* ── 分类 + 排序 ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 gap-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {Object.keys(CATEGORY_LABELS).map((cat) => (
            <FilterChip
              key={cat}
              active={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOnlyControversy((v) => !v)}
            disabled={controversyCount === 0}
            title={controversyCount === 0 ? '当前无检测到张力的话题' : '只看检测到结构化张力的话题'}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              onlyControversy
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            ⚡ 仅看争议
            {controversyCount > 0 && <span className="opacity-70">{controversyCount}</span>}
          </button>
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                  sortKey === key
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 列表 ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">正在分析您的兴趣...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <span className="text-2xl">📊</span>
            <p className="text-sm">暂无匹配内容</p>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-indigo-500 hover:underline"
              >
                清除筛选条件
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {filtered.map((item, index) => {
              const isExpanded = expanded.has(item.id);
              const sceneMeta = item.scene ? SCENE_META[item.scene] : null;
              const purposeMeta = item.purpose ? PURPOSE_META[item.purpose] : null;
              const hasAngles = (item.angleCards?.length ?? 0) > 0;
              const hasTensions = (item.detectedTensions?.length ?? 0) > 0;
              const hasWhy = item.whyNow || item.whyYou || item.whyItWorks;
              const hasDetails = hasAngles || hasTensions;

              return (
                <div
                  key={item.id}
                  className="px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                >
                  {/* 行1: 序号 + badges + 标题 + 分数 */}
                  <div
                    className="flex items-start gap-2 mb-1 cursor-pointer"
                    onClick={() => onItemClick?.(item)}
                  >
                    <span className="shrink-0 w-5 text-center text-xs text-gray-400 mt-0.5 font-mono">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap mb-0.5">
                        {sceneMeta && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${sceneMeta.bg} ${sceneMeta.text} ${sceneMeta.border}`}
                            title={item.sceneReason ?? ''}
                          >
                            {sceneMeta.icon} {item.scene}
                          </span>
                        )}
                        {purposeMeta && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${purposeMeta.color}`}
                          >
                            {purposeMeta.icon} {item.purpose}
                          </span>
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
                          {item.title}
                        </span>
                      </div>

                      {/* reason fallback（无 why 三问时显示） */}
                      {item.reason && !hasWhy && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {item.reason}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${scoreColor(item.score)}`}>
                      {item.score}分
                    </span>
                  </div>

                  {/* why 三问 */}
                  {hasWhy && (
                    <div className="ml-7 mt-1.5 mb-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 px-3 py-2 space-y-1">
                      {item.whyNow && (
                        <div className="flex items-start gap-2 text-[11px]">
                          <span className="shrink-0 font-semibold text-gray-400 dark:text-gray-500 w-14">为什么现在</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.whyNow}</span>
                        </div>
                      )}
                      {item.whyYou && (
                        <div className="flex items-start gap-2 text-[11px]">
                          <span className="shrink-0 font-semibold text-gray-400 dark:text-gray-500 w-14">为什么你</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.whyYou}</span>
                        </div>
                      )}
                      {item.whyItWorks && (
                        <div className="flex items-start gap-2 text-[11px]">
                          <span className="shrink-0 font-semibold text-gray-400 dark:text-gray-500 w-14">历史表现</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.whyItWorks}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 展开内容：角度卡 + 张力地图 */}
                  {isExpanded && (
                    <div
                      className="ml-7 mt-2 space-y-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* 角度卡 */}
                      {hasAngles && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                            角度卡
                          </p>
                          <div className="grid grid-cols-1 gap-1.5">
                            {item.angleCards!.map((card, j) => (
                              <div
                                key={j}
                                className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/20 p-2.5"
                              >
                                <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                                  {card.title}
                                </p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1.5">
                                  💬 {card.hook}
                                </p>
                                <div className="flex gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                                  <span>🎯 {card.whoCares}</span>
                                  <span>📦 {card.promise}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 张力地图 */}
                      {hasTensions && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                            张力地图
                          </p>
                          <div className="space-y-1.5">
                            {item.detectedTensions!.map((t, j) => (
                              <div
                                key={j}
                                className="rounded-lg border border-red-100 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10 p-2.5"
                              >
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <span className="text-[11px]">
                                    {TENSION_TYPE_ICON[t.tensionType] ?? '⚡'}
                                  </span>
                                  <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">
                                    {t.tensionType}矛盾
                                  </span>
                                  {t.divergenceAxis && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                      · 分歧轴：{t.divergenceAxis}
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                  <div className="rounded bg-white dark:bg-gray-900/60 border border-red-100 dark:border-red-800/40 px-2 py-1 text-gray-600 dark:text-gray-400">
                                    <span className="font-medium text-gray-400 dark:text-gray-500 mr-1">A</span>
                                    {t.factASummary}
                                  </div>
                                  <div className="rounded bg-white dark:bg-gray-900/60 border border-red-100 dark:border-red-800/40 px-2 py-1 text-gray-600 dark:text-gray-400">
                                    <span className="font-medium text-gray-400 dark:text-gray-500 mr-1">B</span>
                                    {t.factBSummary}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 底部 meta + 展开按钮 */}
                  <div className="ml-7 mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      <span>🔥 {item.hotScore.toFixed(1)}</span>
                      {item.trend && <span>{TREND_ICON[item.trend]}</span>}
                      {hasTensions && !isExpanded && (
                        <span className="text-red-400">⚡ {item.detectedTensions!.length} 张力</span>
                      )}
                    </div>
                    {hasDetails && (
                      <button
                        className="text-[11px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 shrink-0"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                      >
                        {isExpanded
                          ? '收起 ↑'
                          : [
                              hasAngles && `角度卡 ${item.angleCards!.length}`,
                              hasTensions && `张力 ${item.detectedTensions!.length}`,
                            ].filter(Boolean).join(' · ') + ' ↓'
                        }
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 底部说明 ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
        <span>🤖 基于阅读历史、收藏偏好和热门趋势综合计算</span>
        {activeFilterCount > 0 && (
          <button onClick={resetFilters} className="text-indigo-400 hover:text-indigo-600">
            重置筛选
          </button>
        )}
      </div>
    </div>
  );
}
