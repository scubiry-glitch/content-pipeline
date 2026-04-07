// Content Library — ⑮ 跨领域关联洞察
// 发现不同领域实体之间的隐藏关联

import { useState } from 'react';

const API_BASE = '/api/v1/content-library';

interface Association {
  entity1: string;
  entity2: string;
  relationship: string;
  strength: number;
  domains: string[];
}

interface CrossDomainData {
  associations: Association[];
  count: number;
}

export function ContentLibraryCrossDomain() {
  const [data, setData] = useState<CrossDomainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityId, setEntityId] = useState('');
  const [domain, setDomain] = useState('');

  const discover = async () => {
    if (!entityId) {
      setError('请输入实体 ID 或名称');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (domain) params.append('domain', domain);
      params.append('limit', '30');

      const res = await fetch(`${API_BASE}/cross-domain/${encodeURIComponent(entityId)}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      setData(resData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover cross-domain insights');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthColor = (strength: number): string => {
    if (strength > 0.7) return 'bg-red-100 text-red-800 border-red-300';
    if (strength > 0.4) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">跨领域关联洞察</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          发现不同领域实体间的隐藏关联，找到意外的创意角度
        </p>
      </div>

      {/* 查询参数 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              实体 ID / 名称 *
            </label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="e.g., 新能源, NVIDIA, 芯片"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              onKeyPress={(e) => e.key === 'Enter' && discover()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              领域过滤（可选）
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g., 技术"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
        <button
          onClick={discover}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? '发现中...' : '发现关联'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 关联列表 */}
      {data && data.associations.length > 0 && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              发现 <span className="font-semibold">{data.count}</span> 个跨领域关联
            </p>
          </div>

          <div className="space-y-4">
            {data.associations.map((assoc, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4"
                style={{
                  borderColor: assoc.strength > 0.7 ? '#ef4444' : assoc.strength > 0.4 ? '#eab308' : '#3b82f6',
                }}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 实体1 */}
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">实体 A</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {assoc.entity1}
                    </p>
                    {assoc.domains[0] && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        领域: {assoc.domains[0]}
                      </p>
                    )}
                  </div>

                  {/* 关系 */}
                  <div className="flex flex-col justify-center items-center">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {assoc.relationship}
                      </p>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getStrengthColor(assoc.strength)}`}>
                        强度: {(assoc.strength * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* 实体2 */}
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">实体 B</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {assoc.entity2}
                    </p>
                    {assoc.domains[1] && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        领域: {assoc.domains[1]}
                      </p>
                    )}
                  </div>
                </div>

                {/* 创意提示 */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    💡 创意角度: 为什么 {assoc.entity1} 和 {assoc.entity2} 会关联？有什么有趣的故事吗？
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!loading && data && data.associations.length === 0 && (
        <div className="text-gray-500 text-center py-12">
          暂无跨领域关联数据
        </div>
      )}
    </div>
  );
}
