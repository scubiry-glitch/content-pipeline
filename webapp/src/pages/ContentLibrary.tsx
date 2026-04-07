// 内容库总览页 — 集成 @content-library/ui 组件
// webapp 嵌入模式入口

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api/v1/content-library';

interface OutputCategory {
  number: string;
  name: string;
  phase: string;
  status: 'live' | 'preview' | 'planned';
  endpoint: string;
  page: string;  // 对应的前端页面路由
  count: number | null;
}

export function ContentLibrary() {
  const [categories, setCategories] = useState<OutputCategory[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const outputDefs: OutputCategory[] = [
    { number: '①', name: '有价值的议题', phase: '选题', status: 'live', endpoint: '/topics/recommended', page: '/content-library/topics', count: null },
    { number: '②', name: '趋势信号', phase: '选题', status: 'live', endpoint: '/trends', page: '/content-library/trends', count: null },
    { number: '③', name: '差异化角度', phase: '选题', status: 'live', endpoint: '/gaps', page: '/content-library/topics', count: null },
    { number: '④', name: '知识空白', phase: '选题', status: 'live', endpoint: '/gaps', page: '/content-library/topics', count: null },
    { number: '⑤', name: '关键事实', phase: '研究', status: 'live', endpoint: '/facts', page: '/content-library/facts', count: null },
    { number: '⑥', name: '实体图谱', phase: '研究', status: 'live', endpoint: '/entities', page: '/content-library/entities', count: null },
    { number: '⑦', name: '信息增量', phase: '研究', status: 'live', endpoint: '/delta', page: '/content-library/delta', count: null },
    { number: '⑧', name: '事实保鲜度', phase: '研究', status: 'live', endpoint: '/freshness/stale', page: '/content-library/freshness', count: null },
    { number: '⑨', name: '知识卡片', phase: '研究', status: 'live', endpoint: '/cards', page: '/content-library/cards', count: null },
    { number: '⑩', name: '有价值的认知', phase: '写作', status: 'live', endpoint: '/synthesize', page: '/content-library/synthesis', count: null },
    { number: '⑪', name: '素材组合推荐', phase: '写作', status: 'live', endpoint: '/recommendations', page: '/content-library/cards', count: null },
    { number: '⑫', name: '专家共识图', phase: '写作', status: 'live', endpoint: '/consensus', page: '/content-library/consensus', count: null },
    { number: '⑬', name: '争议话题', phase: '审核', status: 'live', endpoint: '/contradictions', page: '/content-library/contradictions', count: null },
    { number: '⑭', name: '观点演化', phase: '审核', status: 'live', endpoint: '/beliefs', page: '/content-library/beliefs', count: null },
    { number: '⑮', name: '跨领域关联', phase: '审核', status: 'live', endpoint: '/cross-domain', page: '/content-library/cross-domain', count: null },
  ];

  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    setLoading(true);
    const updated = [...outputDefs];

    // 并行加载可用端点的数量
    const endpoints = [
      { idx: 0, url: `${API_BASE}/topics/recommended` },
      { idx: 4, url: `${API_BASE}/facts?limit=1` },
      { idx: 5, url: `${API_BASE}/entities?limit=1` },
      { idx: 12, url: `${API_BASE}/contradictions?limit=1` },
    ];

    await Promise.allSettled(
      endpoints.map(async ({ idx, url }) => {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            updated[idx].count = Array.isArray(data) ? data.length : (data.totalCount || 0);
          }
        } catch { /* ignore */ }
      })
    );

    setCategories(updated);
    setLoading(false);
  };

  const phases = ['all', '选题', '研究', '写作', '审核'];
  const phaseColors: Record<string, string> = {
    '选题': 'bg-blue-100 text-blue-800',
    '研究': 'bg-green-100 text-green-800',
    '写作': 'bg-orange-100 text-orange-800',
    '审核': 'bg-red-100 text-red-800',
  };
  const statusColors: Record<string, string> = {
    live: 'bg-green-500',
    preview: 'bg-yellow-500',
    planned: 'bg-gray-400',
  };

  const filtered = selectedPhase === 'all'
    ? categories
    : categories.filter(c => c.phase === selectedPhase);

  const liveCount = categories.filter(c => c.status === 'live').length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">内容库</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          四层模型驱动 · {liveCount}/15 个产出物已上线 · 结构化记忆与层级检索
        </p>
      </div>

      {/* 阶段筛选 */}
      <div className="flex gap-2 mb-6">
        {phases.map(p => (
          <button
            key={p}
            onClick={() => setSelectedPhase(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedPhase === p
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {p === 'all' ? '全部' : `${p}阶段`}
          </button>
        ))}
      </div>

      {/* 产出物网格 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cat, i) => (
            <div
              key={i}
              onClick={() => navigate(cat.page)}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.number}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${statusColors[cat.status]}`} />
                  <span className={`text-xs px-2 py-0.5 rounded-full ${phaseColors[cat.phase] || ''}`}>
                    {cat.phase}
                  </span>
                </div>
              </div>
              {cat.count !== null && (
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {cat.count}
                  <span className="text-sm font-normal text-gray-500 ml-1">条</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 快速操作 */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/content-library/facts" className="block p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 hover:shadow-md transition-shadow">
          <h3 className="font-medium text-green-800 dark:text-green-300">事实浏览器</h3>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">浏览和搜索结构化事实三元组</p>
        </a>
        <a href="/content-library/entities" className="block p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 hover:shadow-md transition-shadow">
          <h3 className="font-medium text-blue-800 dark:text-blue-300">实体图谱</h3>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">可视化实体关系网络</p>
        </a>
        <a href="/content-library/contradictions" className="block p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 hover:shadow-md transition-shadow">
          <h3 className="font-medium text-red-800 dark:text-red-300">争议话题</h3>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">查看矛盾事实和争议点</p>
        </a>
      </div>
    </div>
  );
}
