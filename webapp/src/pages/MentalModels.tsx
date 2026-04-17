// Mental Models — 心智模型目录页面（Phase 8+10 前端呈现）
// 路由：/mental-models
// 功能：
//   1. 列出所有心智模型（支持按"共享/全部"过滤 + 搜索）
//   2. 点击卡片展开查看该模型的所有使用专家详情（summary/evidence/applicationContext/failureCondition）
//   3. 跨专家对比：同一模型在不同专家处的不同表达

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { expertLibraryApi } from '../api/client';

type FilterMode = 'all' | 'shared' | 'unique';

interface CatalogVariant {
  expert_id: string;
  expert_name: string;
  summary: string;
  evidence: string[];
  applicationContext: string;
  failureCondition: string;
}

interface CatalogModel {
  name: string;
  expertCount: number;
  isShared: boolean;
  variants: CatalogVariant[];
}

interface Catalog {
  generatedAt: string;
  totalModels: number;
  sharedCount: number;
  expertCount: number;
  experts: Array<{ expert_id: string; name: string }>;
  models: CatalogModel[];
}

export function MentalModels() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await expertLibraryApi.getMentalModelCatalog();
      setCatalog(data);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCatalog(); }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await expertLibraryApi.refreshMentalModels();
      await loadCatalog();
    } catch (e: any) {
      setError(e?.message || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const filteredModels = useMemo(() => {
    if (!catalog) return [];
    const keyword = search.trim().toLowerCase();
    return catalog.models.filter(m => {
      if (filter === 'shared' && !m.isShared) return false;
      if (filter === 'unique' && m.isShared) return false;
      if (keyword) {
        const hay = (m.name + ' ' + m.variants.map(v => v.expert_name + ' ' + v.summary + ' ' + v.applicationContext).join(' ')).toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  }, [catalog, filter, search]);

  if (loading && !catalog) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>加载中...</div>;
  }

  if (error && !catalog) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: 12 }}>加载失败: {error}</div>
        <button className="ea-secondary-btn" onClick={loadCatalog}>重试</button>
      </div>
    );
  }

  if (!catalog) return null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, margin: '0 0 8px', fontWeight: 600 }}>🧠 心智模型目录</h1>
        <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
          从 {catalog.expertCount} 位专家的 nuwa 增强 profile 中提取的 {catalog.totalModels} 个心智模型，
          其中 {catalog.sharedCount} 个被 2+ 位专家共享。
          <span style={{ color: '#aaa', marginLeft: 8 }}>Generated: {new Date(catalog.generatedAt).toLocaleString()}</span>
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: '#f5f5f5', borderRadius: 6, padding: 4 }}>
          {(['all', 'shared', 'unique'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                background: filter === mode ? '#111' : 'transparent',
                color: filter === mode ? '#fff' : '#666',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {mode === 'all' && `全部 (${catalog.totalModels})`}
              {mode === 'shared' && `共享 (${catalog.sharedCount})`}
              {mode === 'unique' && `独有 (${catalog.totalModels - catalog.sharedCount})`}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="搜索模型名称/专家/应用场景..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: 4,
            fontSize: 13,
          }}
        />

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ea-secondary-btn"
          style={{ fontSize: 12 }}
          title="强制刷新图谱缓存"
        >
          {refreshing ? '◌ 刷新中...' : '🔄 刷新'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        显示 {filteredModels.length} / {catalog.totalModels} 个心智模型
      </div>

      {/* Model list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredModels.map(model => {
          const isExpanded = expandedModel === model.name;
          return (
            <div
              key={model.name}
              style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 6,
                background: '#fff',
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}
            >
              {/* Card header */}
              <div
                onClick={() => setExpandedModel(isExpanded ? null : model.name)}
                style={{
                  padding: '14px 18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: isExpanded ? 'rgba(124, 58, 237, 0.04)' : '#fff',
                  borderLeft: `4px solid ${model.isShared ? '#7c3aed' : '#e5e7eb'}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{model.name}</span>
                    {model.isShared && (
                      <span style={{
                        padding: '1px 8px',
                        background: '#7c3aed',
                        color: '#fff',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 600,
                      }}>SHARED</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {model.expertCount} 位专家: {model.variants.map(v => v.expert_name).join('、')}
                  </div>
                </div>
                <span style={{ color: '#aaa', fontSize: 14 }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
              </div>

              {/* Expanded variants */}
              {isExpanded && (
                <div style={{ padding: '0 18px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                    {model.variants.map((v, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 12,
                          background: 'rgba(0,0,0,0.02)',
                          borderRadius: 4,
                          borderLeft: '3px solid #3b82f6',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/expert-admin/${v.expert_id}`); }}
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#3b82f6',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            {v.expert_name} ({v.expert_id})
                          </button>
                        </div>
                        <div style={{ fontSize: 13, color: '#111', marginBottom: 6 }}>{v.summary}</div>

                        {v.evidence.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>证据：</div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#555' }}>
                              {v.evidence.map((ev, j) => (
                                <li key={j} style={{ marginBottom: 2 }}>{ev}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, marginTop: 6 }}>
                          <div>
                            <div style={{ color: '#059669', fontWeight: 500, marginBottom: 2 }}>✓ 适用场景</div>
                            <div style={{ color: '#555' }}>{v.applicationContext}</div>
                          </div>
                          <div>
                            <div style={{ color: '#dc2626', fontWeight: 500, marginBottom: 2 }}>✗ 失效条件</div>
                            <div style={{ color: '#555' }}>{v.failureCondition}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredModels.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            没有匹配的心智模型
          </div>
        )}
      </div>
    </div>
  );
}

export default MentalModels;
