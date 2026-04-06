// 内容库 — 事实浏览器页面
import { useState, useEffect } from 'react';

const API_BASE = '/api/v1/content-library';

interface ContentFact {
  id: string;
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  context: Record<string, any>;
  confidence: number;
  isCurrent: boolean;
  createdAt: string;
}

export function ContentLibraryFacts() {
  const [facts, setFacts] = useState<ContentFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');

  const loadFacts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('subject', search);
      if (domain) params.set('domain', domain);
      params.set('limit', '50');
      const res = await fetch(`${API_BASE}/facts?${params}`);
      if (res.ok) setFacts(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadFacts(); }, []);

  const getFreshnessColor = (date: string) => {
    const days = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 30) return 'text-green-600';
    if (days < 90) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">事实浏览器</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">浏览和搜索结构化事实三元组 (subject → predicate → object)</p>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadFacts()}
          placeholder="按主体搜索..."
          className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <input
          type="text"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="领域过滤..."
          className="w-40 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <button onClick={loadFacts} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          搜索
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : facts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无事实数据。导入内容后将自动提取。</div>
      ) : (
        <div className="space-y-3">
          {facts.map(f => (
            <div key={f.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-lg">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{f.subject}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-600 dark:text-gray-300">{f.predicate}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-900 dark:text-white">{f.object}</span>
              </div>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-gray-500">置信度: {(f.confidence * 100).toFixed(0)}%</span>
                {f.context?.time && <span className="text-gray-500">{f.context.time}</span>}
                {f.context?.domain && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">{f.context.domain}</span>
                )}
                <span className={getFreshnessColor(f.createdAt)}>
                  {new Date(f.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
