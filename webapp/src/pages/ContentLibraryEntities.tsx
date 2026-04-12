// 内容库 — 实体与图谱页面
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

const ENTITIES_PAGE_SIZE = 50;

interface ContentEntity {
  id: string;
  canonicalName: string;
  aliases: string[];
  entityType: string;
  taxonomyDomainId?: string;
  metadata: Record<string, any>;
}

interface EntityRelation {
  entity: ContentEntity;
  relation: string;
  strength: number;
}

export function ContentLibraryEntities() {
  const [entities, setEntities] = useState<ContentEntity[]>([]);
  const [entitiesTotal, setEntitiesTotal] = useState(0);
  const [entitiesPage, setEntitiesPage] = useState(1);
  const [selected, setSelected] = useState<ContentEntity | null>(null);
  const [relations, setRelations] = useState<EntityRelation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadEntities = async (pageArg?: number) => {
    const page = pageArg ?? entitiesPage;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', String(ENTITIES_PAGE_SIZE));
      params.set('page', String(page));
      const res = await fetch(`${API_BASE}/entities?${params}`);
      if (res.ok) {
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : (raw?.items ?? []);
        const total = Array.isArray(raw) ? raw.length : (typeof raw?.total === 'number' ? raw.total : list.length);
        setEntities(list);
        setEntitiesTotal(total);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const entitiesTotalPages = Math.max(1, Math.ceil(entitiesTotal / ENTITIES_PAGE_SIZE) || 1);

  useEffect(() => { void loadEntities(entitiesPage); }, [entitiesPage]);

  const loadGraph = async (entityId: string) => {
    try {
      const res = await fetch(`${API_BASE}/entities/${entityId}/graph`);
      if (res.ok) {
        const data = await res.json();
        setSelected(data.center);
        setRelations(data.relations);
      }
    } catch { /* ignore */ }
  };

  const typeIcons: Record<string, string> = {
    company: '🏢', person: '👤', concept: '💡', metric: '📊',
    event: '📅', product: '📦', organization: '🏛️', location: '📍',
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">实体图谱</h1>
      <ProductMetaBar productKey="entities" />

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (setEntitiesPage(1), void loadEntities(1))}
          placeholder="搜索实体..."
          className="flex-1 min-w-[200px] px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <button
          type="button"
          onClick={() => { setEntitiesPage(1); void loadEntities(1); }}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          搜索
        </button>
        {entitiesTotal > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <button
              type="button"
              disabled={entitiesPage <= 1 || loading}
              onClick={() => setEntitiesPage(p => Math.max(1, p - 1))}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              上一页
            </button>
            <span>
              第 {entitiesPage} / {entitiesTotalPages} 页（共 {entitiesTotal} 个）
            </span>
            <button
              type="button"
              disabled={entitiesPage >= entitiesTotalPages || loading}
              onClick={() => setEntitiesPage(p => p + 1)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 实体列表 */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">实体列表</h2>
          {loading ? (
            <p className="text-gray-500">加载中...</p>
          ) : entities.length === 0 ? (
            <p className="text-gray-400">暂无实体。导入内容后将自动注册。</p>
          ) : (
            <div className="space-y-2">
              {entities.map(e => (
                <div
                  key={e.id}
                  onClick={() => loadGraph(e.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected?.id === e.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                  } bg-white dark:bg-gray-800`}
                >
                  <div className="flex items-center gap-2">
                    <span>{typeIcons[e.entityType] || '📎'}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{e.canonicalName}</span>
                    <span className="text-xs text-gray-500">{e.entityType}</span>
                  </div>
                  {e.aliases.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      别名: {e.aliases.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 关系图 */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">关联关系</h2>
          {selected ? (
            <div>
              <div className="text-center p-4 mb-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <span className="text-2xl">{typeIcons[selected.entityType] || '📎'}</span>
                <h3 className="text-xl font-bold text-indigo-800 dark:text-indigo-300 mt-1">{selected.canonicalName}</h3>
                <span className="text-sm text-indigo-600 dark:text-indigo-400">{selected.entityType}</span>
              </div>
              {relations.length === 0 ? (
                <p className="text-gray-400 text-center">暂无关联关系</p>
              ) : (
                <div className="space-y-2">
                  {relations.map((r, i) => (
                    <div
                      key={i}
                      onClick={() => loadGraph(r.entity.id)}
                      className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-indigo-300 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span>{typeIcons[r.entity.entityType] || '📎'}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{r.entity.canonicalName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{r.relation}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                          强度: {r.strength}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">点击左侧实体查看关联关系</p>
          )}
        </div>
      </div>
    </div>
  );
}
