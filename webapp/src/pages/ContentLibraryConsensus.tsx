// Content Library — ⑫ 专家共识/分歧图
// v7.2: 下拉选择 + 上游/下游说明 + 生成功能

import { useState } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect, EntitySelect } from '../components/ContentLibraryProductMeta';
import { DomainCascadeSelect, selectionToCode } from '../components/DomainCascadeSelect';
import type { TaxonomySelection } from '../types/taxonomy';

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
  const { domains, entities } = useDropdownOptions();
  const [consensusData, setConsensusData] = useState<ConsensusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 支持下拉选实体 OR 自由输入
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [domain, setDomain] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({ l1: null, l2: null });

  // 最终用的 topic: 优先下拉选择的实体名, 否则自由输入
  const resolvedTopic = (() => {
    if (selectedEntityId) {
      const ent = entities.find(e => e.id === selectedEntityId);
      return ent?.name || selectedEntityId;
    }
    return topicInput;
  })();

  const fetchConsensus = async () => {
    const topic = resolvedTopic;
    if (!topic) {
      setError('请选择实体或输入议题');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const taxonomyCode = selectionToCode(taxonomy);
      if (taxonomyCode) params.append('taxonomy_code', taxonomyCode);
      if (domain) params.append('domain', domain);
      params.append('limit', '20');
      const res = await fetch(`${API_BASE}/consensus/${encodeURIComponent(topic)}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConsensusData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch consensus');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">专家共识/分歧图</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          ⑫ 分析多个专家对同一议题的共识与分歧，帮助文章呈现多元视角
        </p>
      </div>

      <ProductMetaBar productKey="consensus" />

      {/* 范围选择: 下拉 + 自由输入 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">领域过滤（级联）</label>
            <DomainCascadeSelect value={taxonomy} onChange={setTaxonomy} compact />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">从实体选择 (推荐)</label>
            <EntitySelect value={selectedEntityId} onChange={v => { setSelectedEntityId(v); setTopicInput(''); }} entities={entities} placeholder="选择实体..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">或自由输入议题</label>
            <input
              type="text" value={topicInput}
              onChange={e => { setTopicInput(e.target.value); setSelectedEntityId(''); }}
              placeholder="如: AI 监管政策"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
              onKeyDown={e => e.key === 'Enter' && fetchConsensus()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">领域过滤（兼容旧数据）</label>
            <DomainSelect value={domain} onChange={setDomain} domains={domains} />
          </div>
        </div>
        <button
          onClick={fetchConsensus}
          disabled={loading || !resolvedTopic}
          className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? '生成中...' : '生成共识图'}
        </button>
        {resolvedTopic && (
          <span className="ml-3 text-xs text-gray-400">将分析: {resolvedTopic}</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {consensusData && consensusData.consensus.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            ✓ 共识点 ({consensusData.consensus.length})
          </h2>
          <div className="space-y-3">
            {consensusData.consensus.map((item, idx) => (
              <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="font-medium text-gray-900 dark:text-white mb-2">{item.position}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100 px-2 py-1 rounded">
                    置信度: {(item.confidence * 100).toFixed(0)}%
                  </span>
                  {item.supportingExperts.length > 0 && (
                    <span className="text-xs text-gray-500">{item.supportingExperts.length} 位专家支持</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">观点 A</p>
                    <p className="text-gray-900 dark:text-white mb-2">{item.position1}</p>
                    {item.experts1.length > 0 && (
                      <p className="text-xs text-gray-500">{item.experts1.join(', ')}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">观点 B</p>
                    <p className="text-gray-900 dark:text-white mb-2">{item.position2}</p>
                    {item.experts2.length > 0 && (
                      <p className="text-xs text-gray-500">{item.experts2.join(', ')}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && consensusData && consensusData.consensus.length === 0 && consensusData.divergences.length === 0 && (
        <div className="text-gray-400 text-center py-12">暂无共识/分歧数据</div>
      )}

      {!consensusData && !loading && (
        <div className="text-gray-400 text-center py-12">选择实体或输入议题，点击"生成共识图"</div>
      )}
    </div>
  );
}
