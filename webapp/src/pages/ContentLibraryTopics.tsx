// 内容库 — ① 议题推荐 + ③ 差异化角度 + ④ 知识空白
import { useState, useEffect } from 'react';

const API_BASE = '/api/v1/content-library';

interface TopicRecommendation {
  topic: string;
  score: number;
  reason: string;
  relatedEntities: string[];
  trendDirection: 'rising' | 'falling' | 'stable';
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

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (domain) params.set('domain', domain);
      params.set('limit', '20');

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

  const directionIcon = (d: string) =>
    d === 'rising' ? '↑' : d === 'falling' ? '↓' : '→';
  const directionColor = (d: string) =>
    d === 'rising' ? 'text-green-600' : d === 'falling' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">议题推荐 & 知识空白</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">①③④ 基于内容库事实图谱发现有价值的议题、差异化角度和知识空白</p>

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topics.map((t, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{t.topic}</h3>
                  <span className={`text-lg font-bold ${directionColor(t.trendDirection)}`}>{directionIcon(t.trendDirection)}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t.reason}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {t.relatedEntities?.slice(0, 3).map((e, j) => (
                      <span key={j} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full text-xs">{e}</span>
                    ))}
                  </div>
                  <span className="text-sm font-medium text-indigo-600">{(t.score * 100).toFixed(0)} 分</span>
                </div>
              </div>
            ))}
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
