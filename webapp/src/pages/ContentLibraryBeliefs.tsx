// Content Library — ⑭ 观点演化脉络
// 追踪某个命题或信念的历史演变

import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

interface TimelineEntry {
  date: string;
  state: string;
  sources: string[];
}

interface BeliefTimeline {
  timeline: TimelineEntry[];
  summary: string;
}

interface BeliefOption { id: string; subject: string; state: string; }

export function ContentLibraryBeliefs() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beliefId, setBeliefId] = useState('');
  const [subject, setSubject] = useState('');
  const [options, setOptions] = useState<BeliefOption[]>([]);

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
      setTimeline(data.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline');
    } finally {
      setLoading(false);
    }
  };

  const getStateColor = (state: string): string => {
    const stateMap: Record<string, string> = {
      'confirmed': 'bg-green-100 text-green-800 border-green-300',
      'disputed': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'evolving': 'bg-blue-100 text-blue-800 border-blue-300',
      'refuted': 'bg-red-100 text-red-800 border-red-300',
    };
    return stateMap[state] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStateLabel = (state: string): string => {
    const labels: Record<string, string> = {
      'confirmed': '✓ 已确认',
      'disputed': '⚠️ 有争议',
      'evolving': '🔄 演变中',
      'refuted': '✗ 已推翻',
    };
    return labels[state] || state;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">观点演化脉络</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          追踪某个命题或信念的状态演变，展现认知发展历程
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
        <button
          onClick={fetchTimeline}
          disabled={loading || (!subject && !beliefId)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? '查询中...' : '查询演化脉络'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 时间线 */}
      <div className="space-y-1">
        {timeline.length === 0 && !loading && (
          <div className="text-gray-500 text-center py-8">暂无演化数据</div>
        )}

        {timeline.map((entry, idx) => (
          <div key={idx} className="flex gap-4">
            {/* 时间线点 */}
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 mt-2"></div>
              {idx < timeline.length - 1 && <div className="w-0.5 h-16 bg-gray-300 dark:bg-gray-600"></div>}
            </div>

            {/* 内容 */}
            <div className="pb-8 pt-1 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {new Date(entry.date).toLocaleDateString('zh-CN')}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStateColor(entry.state)}`}>
                  {getStateLabel(entry.state)}
                </span>
              </div>

              {entry.sources.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">依据：</p>
                  <div className="flex flex-wrap gap-1">
                    {entry.sources.map((source, i) => (
                      <span
                        key={i}
                        className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded"
                      >
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 统计信息 */}
      {timeline.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            追踪了 <span className="font-semibold">{timeline.length}</span> 个状态变更
          </p>
        </div>
      )}
    </div>
  );
}
