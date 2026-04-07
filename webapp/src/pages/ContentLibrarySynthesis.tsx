// Content Library — ⑩ 有价值的认知综合
// LLM 跨多篇内容的事实聚合提炼

import { useState } from 'react';

const API_BASE = '/api/v1/content-library';

interface Insight {
  text: string;
  sources: string[];
  confidence: number;
}

export function ContentLibrarySynthesis() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [subjects, setSubjects] = useState('');

  const synthesize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain || undefined,
          subjects: subjects ? subjects.split(',').map(s => s.trim()) : undefined,
          limit: 10,
        }),
      });
      const data = await res.json();
      setInsights(data.insights || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to synthesize insights');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">有价值的认知</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          LLM 跨多篇内容的事实聚合提炼，发现新的核心洞察
        </p>
      </div>

      {/* 查询参数 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              领域（可选）
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g., AI, 芯片"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              主体（逗号分隔，可选）
            </label>
            <input
              type="text"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              placeholder="e.g., NVIDIA, OpenAI"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
        <button
          onClick={synthesize}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? '综合中...' : '综合认知'}
        </button>
      </div>

      {/* 结果展示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {insights.length === 0 && !loading && (
          <div className="text-gray-500 text-center py-8">暂无洞察</div>
        )}
        {insights.map((insight, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  {insight.text}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    置信度: {(insight.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
            {insight.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">来源：</p>
                <div className="flex flex-wrap gap-2">
                  {insight.sources.map((source, i) => (
                    <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
