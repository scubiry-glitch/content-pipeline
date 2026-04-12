// Content Library — ⑮ 跨领域关联洞察
// v7.2: 下拉选择 + 上游/下游说明 + Adamic-Adar 显示

import { useState } from 'react';
import { ProductMetaBar, useDropdownOptions, DomainSelect, EntitySelect } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

interface Association {
  entity1: string;
  entity2: string;
  relationship: string;
  strength: number;
  adamicAdar?: number;
  commonNeighbors?: number;
  domains: string[];
}

interface CrossDomainData {
  associations: Association[];
  count: number;
}

export function ContentLibraryCrossDomain() {
  const { domains, entities } = useDropdownOptions();
  const [data, setData] = useState<CrossDomainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [entityInput, setEntityInput] = useState('');
  const [domain, setDomain] = useState('');

  const resolvedEntity = (() => {
    if (selectedEntityId) {
      const ent = entities.find(e => e.id === selectedEntityId);
      return ent?.id || selectedEntityId;
    }
    return entityInput;
  })();

  const discover = async () => {
    if (!resolvedEntity) {
      setError('请选择实体或输入名称');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (domain) params.append('domain', domain);
      params.append('limit', '30');
      const res = await fetch(`${API_BASE}/cross-domain/${encodeURIComponent(resolvedEntity)}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthColor = (s: number) =>
    s > 0.7 ? 'bg-red-100 text-red-800 border-red-300' :
    s > 0.4 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
    'bg-blue-100 text-blue-800 border-blue-300';

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">跨领域关联洞察</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          ⑮ 发现不同领域实体间的隐藏关联 (v7.2 Adamic-Adar 加权)
        </p>
      </div>

      <ProductMetaBar productKey="crossDomain" />

      {/* 范围选择 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">从实体选择 (推荐)</label>
            <EntitySelect value={selectedEntityId} onChange={v => { setSelectedEntityId(v); setEntityInput(''); }} entities={entities} placeholder="选择实体..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">或自由输入</label>
            <input
              type="text" value={entityInput}
              onChange={e => { setEntityInput(e.target.value); setSelectedEntityId(''); }}
              placeholder="实体名称"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              onKeyDown={e => e.key === 'Enter' && discover()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">领域过滤</label>
            <DomainSelect value={domain} onChange={setDomain} domains={domains} />
          </div>
        </div>
        <button
          onClick={discover}
          disabled={loading || !resolvedEntity}
          className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? '发现中...' : '发现跨域关联'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {data && data.associations.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            发现 <span className="font-semibold">{data.count}</span> 个跨领域关联
          </p>
          <div className="space-y-4">
            {data.associations.map((a, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4"
                style={{ borderColor: a.strength > 0.7 ? '#ef4444' : a.strength > 0.4 ? '#eab308' : '#3b82f6' }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">实体 A</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{a.entity1}</p>
                    {a.domains[0] && <p className="text-xs text-gray-500 mt-1">领域: {a.domains[0]}</p>}
                  </div>
                  <div className="flex flex-col justify-center items-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{a.relationship}</p>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStrengthColor(a.strength)}`}>
                        强度 {(a.strength * 100).toFixed(0)}%
                      </span>
                      {typeof a.adamicAdar === 'number' && (
                        <span className="px-2 py-1 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                          AA={a.adamicAdar.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {typeof a.commonNeighbors === 'number' && (
                      <p className="text-[10px] text-gray-400 mt-1">{a.commonNeighbors} 共同邻居</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">实体 B</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{a.entity2}</p>
                    {a.domains[1] && <p className="text-xs text-gray-500 mt-1">领域: {a.domains[1]}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && data && data.associations.length === 0 && (
        <div className="text-gray-400 text-center py-12">暂无跨领域关联数据</div>
      )}
      {!data && !loading && (
        <div className="text-gray-400 text-center py-12">选择实体，点击"发现跨域关联"</div>
      )}
    </div>
  );
}
