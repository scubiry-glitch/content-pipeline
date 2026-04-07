// 内容库 — ⑨ 知识卡片
import { useState, useEffect } from 'react';

const API_BASE = '/api/v1/content-library';

interface KnowledgeCard {
  entityId: string;
  entityName: string;
  entityType: string;
  summary: string;
  keyFacts: Array<{ predicate: string; object: string; confidence: number }>;
  relatedEntities: Array<{ id: string; name: string; relationship: string }>;
  lastUpdated: string;
}

export function ContentLibraryCards() {
  const [entityId, setEntityId] = useState('');
  const [card, setCard] = useState<KnowledgeCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<Array<{ id: string; canonicalName: string; entityType: string }>>([]);

  useEffect(() => {
    fetch(`${API_BASE}/entities?limit=30`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setEntities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadCard = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cards/${id}`);
      if (res.ok) setCard(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const typeEmoji: Record<string, string> = {
    person: '👤', company: '🏢', product: '📦', technology: '🔬', concept: '💡', location: '📍',
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">知识卡片</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">⑨ 实体的高密度知识摘要卡，汇聚关键事实与关系</p>

      {/* 实体选择 */}
      <div className="flex gap-3 mb-6">
        <input type="text" value={entityId} onChange={e => setEntityId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadCard(entityId)}
          placeholder="输入实体 ID..." className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        <button onClick={() => loadCard(entityId)} disabled={!entityId || loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          生成卡片
        </button>
      </div>

      {/* 实体快速网格 */}
      {entities.length > 0 && !card && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
          {entities.map(e => (
            <button key={e.id} onClick={() => { setEntityId(e.id); loadCard(e.id); }}
              className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-left hover:border-indigo-400 hover:shadow-sm transition-all">
              <span className="text-lg">{typeEmoji[e.entityType] || '📄'}</span>
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{e.canonicalName}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">生成卡片中...</div>
      ) : card ? (
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {/* 卡片头 */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{typeEmoji[card.entityType] || '📄'}</span>
              <div>
                <h2 className="text-xl font-bold">{card.entityName}</h2>
                <span className="text-indigo-200 text-sm">{card.entityType}</span>
              </div>
            </div>
          </div>

          {/* 摘要 */}
          {card.summary && (
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300">{card.summary}</p>
            </div>
          )}

          {/* 关键事实 */}
          {card.keyFacts && card.keyFacts.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">关键事实</h3>
              <div className="space-y-2">
                {card.keyFacts.map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-500">{f.predicate}: </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{f.object}</span>
                    </div>
                    <span className="text-xs text-gray-400">{(f.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 关联实体 */}
          {card.relatedEntities && card.relatedEntities.length > 0 && (
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">关联实体</h3>
              <div className="flex gap-2 flex-wrap">
                {card.relatedEntities.map((r, i) => (
                  <button key={i} onClick={() => { setEntityId(r.id); loadCard(r.id); }}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                    title={r.relationship}>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 更新时间 */}
          {card.lastUpdated && (
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-400 text-right">
              最后更新: {new Date(card.lastUpdated).toLocaleDateString()}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">选择一个实体生成知识卡片</div>
      )}
    </div>
  );
}
