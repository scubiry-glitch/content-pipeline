// 智能推荐面板 v7.5 — scene badge + 角度卡 + why 三问
import { useState, useCallback, useEffect } from 'react';

type SceneTag =
  | '争议话题'
  | '新变化'
  | '被忽视的风险'
  | '反常识'
  | '认知拼图'
  | '决策转折'
  | '人物切片';

const SCENE_META: Record<SceneTag, { icon: string; bg: string; text: string; border: string }> = {
  '争议话题':    { icon: '🔥', bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-800 dark:text-red-300',    border: 'border-red-200 dark:border-red-700' },
  '新变化':      { icon: '📈', bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-800 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-700' },
  '被忽视的风险':{ icon: '⚠️', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-700' },
  '反常识':      { icon: '🪞', bg: 'bg-purple-100 dark:bg-purple-900/30',text: 'text-purple-800 dark:text-purple-300',border: 'border-purple-200 dark:border-purple-700' },
  '认知拼图':    { icon: '🧩', bg: 'bg-teal-100 dark:bg-teal-900/30',   text: 'text-teal-800 dark:text-teal-300',   border: 'border-teal-200 dark:border-teal-700' },
  '决策转折':    { icon: '🧭', bg: 'bg-indigo-100 dark:bg-indigo-900/30',text: 'text-indigo-800 dark:text-indigo-300',border: 'border-indigo-200 dark:border-indigo-700' },
  '人物切片':    { icon: '🎭', bg: 'bg-rose-100 dark:bg-rose-900/30',   text: 'text-rose-800 dark:text-rose-300',   border: 'border-rose-200 dark:border-rose-700' },
};

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
  // v7.5
  scene?: SceneTag;
  sceneReason?: string;
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
}

const CATEGORY_LABELS: Record<string, string> = {
  all: '全部', tech: '科技', finance: '金融', policy: '政策', industry: '产业',
};

const TREND_ICON: Record<string, string> = { up: '📈', down: '📉', stable: '➡️' };

function scoreColor(score: number) {
  if (score >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 70) return 'text-blue-600 dark:text-blue-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-gray-500 dark:text-gray-400';
}

export function RecommendationPanel({
  recommendations = [],
  onItemClick,
  onRefresh,
}: RecommendationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const filtered =
    selectedCategory === 'all'
      ? recommendations
      : recommendations.filter((item) => item.category === selectedCategory);

  return (
    <div className="flex flex-col gap-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span>💡</span>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">智能推荐</h3>
          <span className="text-xs text-gray-400">基于您的阅读偏好</span>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          {loading ? '🔄' : '↻'} 刷新
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex-wrap">
        {Object.keys(CATEGORY_LABELS).map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">正在分析您的兴趣...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-1 text-gray-400">
            <span className="text-2xl">📊</span>
            <p className="text-sm">暂无推荐内容</p>
            <span className="text-xs text-gray-400">多阅读一些话题，我们会为您推荐相关内容</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {filtered.map((item, index) => {
              const isExpanded = expanded.has(item.id);
              const sceneMeta = item.scene ? SCENE_META[item.scene] : null;
              const hasAngles = (item.angleCards?.length ?? 0) > 0;
              const hasWhy = item.whyNow || item.whyYou || item.whyItWorks;
              const hasDetails = hasAngles || hasWhy;

              return (
                <div
                  key={item.id}
                  className="px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                  onClick={() => onItemClick?.(item)}
                  style={{ animationDelay: `${index * 0.04}s` }}
                >
                  {/* 行1: 排名 + 场景 badge + 标题 + 分数 */}
                  <div className="flex items-start gap-2 mb-1">
                    <span className="shrink-0 w-5 text-center text-xs text-gray-400 mt-0.5 font-mono">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        {sceneMeta && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${sceneMeta.bg} ${sceneMeta.text} ${sceneMeta.border}`}
                            title={item.sceneReason || ''}
                          >
                            {sceneMeta.icon} {item.scene}
                          </span>
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-white leading-snug">{item.title}</span>
                      </div>

                      {/* reason (fallback，无 why 三问时显示) */}
                      {item.reason && !hasWhy && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{item.reason}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${scoreColor(item.score)}`}>
                      {item.score}分
                    </span>
                  </div>

                  {/* why 三问 (折叠外常显) */}
                  {hasWhy && (
                    <div className="ml-7 mt-1.5 mb-1.5 rounded-md bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5 space-y-0.5">
                      {item.whyNow && (
                        <div className="flex items-start gap-1 text-[11px]">
                          <span className="shrink-0 font-medium text-gray-500 dark:text-gray-400 w-[56px]">为什么现在</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.whyNow}</span>
                        </div>
                      )}
                      {item.whyYou && (
                        <div className="flex items-start gap-1 text-[11px]">
                          <span className="shrink-0 font-medium text-gray-500 dark:text-gray-400 w-[56px]">为什么你</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.whyYou}</span>
                        </div>
                      )}
                      {item.whyItWorks && (
                        <div className="flex items-start gap-1 text-[11px]">
                          <span className="shrink-0 font-medium text-gray-500 dark:text-gray-400 w-[56px]">历史表现</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.whyItWorks}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 角度卡 (展开后显示) */}
                  {isExpanded && hasAngles && (
                    <div
                      className="ml-7 mt-2 grid grid-cols-1 gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.angleCards!.map((card, j) => (
                        <div
                          key={j}
                          className="rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/20 p-2"
                        >
                          <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100 mb-0.5">{card.title}</p>
                          <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1">💬 {card.hook}</p>
                          <div className="flex gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                            <span>🎯 {card.whoCares}</span>
                            <span>📦 {card.promise}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 底部: meta + 展开按钮 */}
                  <div className="ml-7 mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      <span>🔥 {item.hotScore.toFixed(1)}</span>
                      {item.trend && <span>{TREND_ICON[item.trend] ?? ''}</span>}
                    </div>
                    {hasDetails && (
                      <button
                        className="text-[11px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 shrink-0"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                      >
                        {isExpanded ? '收起' : `角度卡 ${item.angleCards?.length ?? 0} 个 ↓`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
        <span>🤖</span>
        <span>基于阅读历史、收藏偏好和热门趋势综合计算</span>
      </div>
    </div>
  );
}
