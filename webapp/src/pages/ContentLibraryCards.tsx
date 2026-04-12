// 内容库 — ⑨ 知识卡片
import { useState, useEffect, useMemo } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

interface ContentFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  createdAt: string;
}

interface KnowledgeCard {
  entityId: string;
  entityName: string;
  entityType: string;
  coreData: Array<{ label: string; value: string; freshness: 'fresh' | 'aging' | 'stale' }>;
  latestFacts: ContentFact[];
  relatedEntities: Array<{ id: string; name: string; relation: string }>;
  tokenCount: number;
}

interface EntityOption {
  id: string;
  name: string;
  type: string;
  factCount: number;
  coreDataCount: number;
}

const ENTITY_TYPES = ['全部类型', 'company', 'concept', 'person', 'product', 'technology', 'location'];

const typeEmoji: Record<string, string> = {
  person: '👤', company: '🏢', product: '📦', technology: '🔬',
  concept: '💡', location: '📍', 区域: '🗺️', 企业群体: '🏗️',
};

export function ContentLibraryCards() {
  const [query, setQuery] = useState('');
  const [card, setCard] = useState<KnowledgeCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<EntityOption[]>([]);

  // 筛选状态
  const [filterFacts, setFilterFacts] = useState(false);       // 有事实
  const [filterCore, setFilterCore] = useState(false);         // 有核心数据
  const [filterType, setFilterType] = useState('全部类型');    // 实体类型
  const [minFacts, setMinFacts] = useState(0);                  // 最低事实数

  useEffect(() => {
    fetch(`${API_BASE}/dropdown/entities?limit=100`)
      .then(r => r.ok ? r.json() : [])
      .then((data: EntityOption[]) => setEntities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // 可用类型列表（从数据推导）
  const availableTypes = useMemo(() => {
    const types = [...new Set(entities.map(e => e.type).filter(Boolean))];
    return ['全部类型', ...types.sort()];
  }, [entities]);

  // 筛选后的列表
  const filtered = useMemo(() => {
    return entities.filter(e => {
      if (filterFacts && e.factCount === 0) return false;
      if (filterCore && e.coreDataCount === 0) return false;
      if (filterType !== '全部类型' && e.type !== filterType) return false;
      if (e.factCount < minFacts) return false;
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [entities, filterFacts, filterCore, filterType, minFacts, query]);

  const loadCard = async (nameOrId: string) => {
    if (!nameOrId) return;
    setLoading(true);
    setCard(null);
    try {
      const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(nameOrId)}`);
      if (res.ok) setCard(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const freshColor = (f: string) =>
    f === 'fresh' ? 'text-green-600' : f === 'aging' ? 'text-amber-600' : 'text-red-500';
  const freshLabel = (f: string) =>
    f === 'fresh' ? '新鲜' : f === 'aging' ? '老化' : '过期';

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">知识卡片</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-4">⑨ 实体的高密度知识摘要卡，汇聚关键事实与关系</p>
      <ProductMetaBar productKey="cards" />

      {/* 筛选栏 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-5 space-y-3">
        {/* 搜索 + 类型 */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text" value={query} onChange={e => { setQuery(e.target.value); setCard(null); }}
            placeholder="搜索实体名称..."
            className="flex-1 min-w-40 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <select
            value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* 快速筛选 chips */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400">快速筛选：</span>
          <button
            onClick={() => setFilterFacts(v => !v)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterFacts
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
            }`}
          >
            ✓ 有事实
          </button>
          <button
            onClick={() => setFilterCore(v => !v)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterCore
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-amber-400'
            }`}
          >
            📊 有核心数据
          </button>
          {minFacts > 0 && (
            <button onClick={() => setMinFacts(0)}
              className="px-3 py-1 rounded-full text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300">
              ≥{minFacts} 条事实 ✕
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">最低事实数：</span>
            <input
              type="range" min={0} max={50} step={5} value={minFacts}
              onChange={e => setMinFacts(Number(e.target.value))}
              className="w-24 accent-indigo-600"
            />
            <span className="text-xs text-gray-500 w-6">{minFacts}</span>
          </div>
        </div>

        {/* 结果计数 */}
        <div className="text-xs text-gray-400">
          共 {filtered.length} 个实体
          {(filterFacts || filterCore || filterType !== '全部类型' || minFacts > 0 || query) && (
            <button onClick={() => { setFilterFacts(false); setFilterCore(false); setFilterType('全部类型'); setMinFacts(0); setQuery(''); }}
              className="ml-2 text-indigo-500 hover:underline">清除筛选</button>
          )}
        </div>
      </div>

      {/* 实体网格 */}
      {!card && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 mb-6">
          {filtered.slice(0, 60).map(e => (
            <button
              key={e.id}
              onClick={() => loadCard(e.name)}
              className="flex flex-col gap-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-left hover:border-indigo-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{typeEmoji[e.type] || '📄'}</span>
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate font-medium group-hover:text-indigo-600">{e.name}</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                {e.factCount > 0 && (
                  <span className="text-indigo-500">{e.factCount} 事实</span>
                )}
                {e.coreDataCount > 0 && (
                  <span className="text-amber-500">📊 {e.coreDataCount} 数据</span>
                )}
                {e.factCount === 0 && (
                  <span className="text-gray-300">无事实</span>
                )}
              </div>
            </button>
          ))}
          {filtered.length > 60 && (
            <div className="col-span-full text-center text-xs text-gray-400 py-2">
              仅显示前 60 条，请使用搜索或筛选缩小范围
            </div>
          )}
        </div>
      )}

      {/* 卡片区 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">生成卡片中...</div>
      ) : card ? (
        <div className="max-w-2xl mx-auto">
          {/* 返回按钮 */}
          <button onClick={() => setCard(null)}
            className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors">
            ← 返回列表
          </button>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
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

            {/* 核心数据 */}
            {card.coreData && card.coreData.length > 0 && (
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📊 核心数据</h3>
                <div className="space-y-2">
                  {card.coreData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-gray-500">{d.label}: </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{d.value}</span>
                      </div>
                      <span className={`text-[10px] ${freshColor(d.freshness)}`}>● {freshLabel(d.freshness)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 最新事实 */}
            {card.latestFacts && card.latestFacts.length > 0 && (
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📋 最新事实</h3>
                <div className="space-y-2">
                  {card.latestFacts.map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="text-gray-500">{f.predicate}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="font-medium text-gray-900 dark:text-white">{f.object}</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{(f.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 关联实体 */}
            {card.relatedEntities && card.relatedEntities.length > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">🔗 关联实体</h3>
                <div className="flex gap-2 flex-wrap">
                  {card.relatedEntities.map((r, i) => (
                    <button key={i} onClick={() => loadCard(r.name || r.id)}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                      title={r.relation}>
                      {r.name}
                      <span className="ml-1 text-[10px] text-gray-400">{r.relation}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 空状态 */}
            {(!card.coreData || card.coreData.length === 0) &&
             (!card.latestFacts || card.latestFacts.length === 0) && (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                该实体在知识库中暂无事实数据
              </div>
            )}

            {Number.isFinite(card.tokenCount) && card.tokenCount > 0 && (
              <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-400 text-right">
                约 {card.tokenCount} tokens
              </div>
            )}
          </div>
        </div>
      ) : (
        !filterFacts && !filterCore && !query && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">选择一个实体生成知识卡片</div>
        )
      )}
    </div>
  );
}
