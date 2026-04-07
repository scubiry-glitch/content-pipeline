// Content Library — ⑫ 专家共识/分歧图
// 展示不同专家对同一议题的共识与分歧

import { useState, useEffect } from 'react';

const API_BASE = '/api/v1/content-library';

interface Consensus {
  position: string;
  supportingExperts: string[];
  confidence: number;
}

interface Divergence {
  position1: string;
  position2: string;
  experts1: string[];
  experts2: string[];
}

interface ConsensusData {
  consensus: Consensus[];
  divergences: Divergence[];
}

export function ContentLibraryConsensus() {
  const [consensusData, setConsensusData] = useState<ConsensusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [domain, setDomain] = useState('');

  const fetchConsensus = async () => {
    if (!topic) {
      setError('请输入议题');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (domain) params.append('domain', domain);
      params.append('limit', '20');

      const res = await fetch(`${API_BASE}/consensus/${encodeURIComponent(topic)}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConsensusData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch consensus');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">专家共识/分歧图</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          分析多个专家对同一议题的共识与分歧，帮助文章呈现多元视角
        </p>
      </div>

      {/* 查询参数 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              议题 *
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., AI 监管政策"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              onKeyPress={(e) => e.key === 'Enter' && fetchConsensus()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              领域（可选）
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g., 技术, 政策"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
        <button
          onClick={fetchConsensus}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? '查询中...' : '查询共识图'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 共识点 */}
      {consensusData && consensusData.consensus.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            ✓ 共识点 ({consensusData.consensus.length})
          </h2>
          <div className="space-y-3">
            {consensusData.consensus.map((item, idx) => (
              <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="font-medium text-gray-900 dark:text-white mb-2">
                  {item.position}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100 px-2 py-1 rounded">
                    置信度: {(item.confidence * 100).toFixed(0)}%
                  </span>
                  {item.supportingExperts.length > 0 && (
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {item.supportingExperts.length} 位专家支持
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分歧点 */}
      {consensusData && consensusData.divergences.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            ⚡ 分歧点 ({consensusData.divergences.length})
          </h2>
          <div className="space-y-3">
            {consensusData.divergences.map((item, idx) => (
              <div key={idx} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                      观点 A
                    </p>
                    <p className="text-gray-900 dark:text-white mb-2">
                      {item.position1}
                    </p>
                    {item.experts1.length > 0 && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {item.experts1.length} 位专家
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                      观点 B
                    </p>
                    <p className="text-gray-900 dark:text-white mb-2">
                      {item.position2}
                    </p>
                    {item.experts2.length > 0 && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {item.experts2.length} 位专家
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!loading && consensusData && consensusData.consensus.length === 0 && consensusData.divergences.length === 0 && (
        <div className="text-gray-500 text-center py-12">
          暂无共识/分歧数据
        </div>
      )}
    </div>
  );
}
