// ⑥ 实体关系图谱可视化
import React, { useState, useEffect } from 'react';
import { apiGet } from '../api-client.js';
import type { ContentEntity } from '../types.js';

interface EntityGraphData {
  center: ContentEntity;
  relations: Array<{ entity: ContentEntity; relation: string; strength: number }>;
}

export function EntityGraph({ entityId }: { entityId?: string }) {
  const [data, setData] = useState<EntityGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(entityId || '');

  const loadGraph = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await apiGet<EntityGraphData>(`/entities/${id}/graph`);
      setData(result);
    } catch (err) {
      console.error('Failed to load entity graph:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selectedId) loadGraph(selectedId); }, [selectedId]);

  return React.createElement('div', { className: 'entity-graph' },
    React.createElement('h1', null, '实体关系图谱'),
    !entityId && React.createElement('input', {
      type: 'text', placeholder: '输入实体 ID...',
      value: selectedId,
      onChange: (e: any) => setSelectedId(e.target.value),
    }),
    loading && React.createElement('p', null, '加载中...'),
    data && React.createElement('div', { className: 'graph-container' },
      React.createElement('div', { className: 'center-entity' },
        React.createElement('h2', null, data.center.canonicalName),
        React.createElement('span', { className: 'entity-type' }, data.center.entityType),
      ),
      React.createElement('ul', { className: 'relations' },
        data.relations.map((r, i) =>
          React.createElement('li', { key: i, onClick: () => setSelectedId(r.entity.id) },
            `${r.relation} → ${r.entity.canonicalName} (强度: ${r.strength})`
          )
        )
      )
    )
  );
}
