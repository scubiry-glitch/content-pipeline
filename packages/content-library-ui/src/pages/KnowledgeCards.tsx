// ⑨ 高密度知识卡片浏览
import React, { useState } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';

export function KnowledgeCards() {
  const { card, fetchCard, entities, fetchEntities } = useContentLibrary();
  const [search, setSearch] = useState('');

  const handleSearch = () => { fetchEntities(search); };

  const freshnessColor = (f: string) =>
    f === 'fresh' ? '#38a169' : f === 'aging' ? '#dd6b20' : '#e53e3e';

  return React.createElement('div', { className: 'knowledge-cards' },
    React.createElement('h1', null, '知识卡片'),
    React.createElement('div', { className: 'search-bar' },
      React.createElement('input', {
        type: 'text', value: search, placeholder: '搜索实体...',
        onChange: (e: any) => setSearch(e.target.value),
        onKeyDown: (e: any) => e.key === 'Enter' && handleSearch(),
      }),
      React.createElement('button', { onClick: handleSearch }, '搜索')
    ),

    // 实体列表
    entities.data && React.createElement('div', { className: 'entity-list' },
      entities.data.map(e =>
        React.createElement('button', {
          key: e.id, className: 'entity-chip',
          onClick: () => fetchCard(e.id),
        }, `${e.canonicalName} (${e.entityType})`)
      )
    ),

    // 知识卡片详情
    card.loading && React.createElement('p', null, '加载中...'),
    card.data && React.createElement('div', { className: 'card-detail' },
      React.createElement('h2', null, card.data.entityName),
      React.createElement('span', { className: 'entity-type' }, card.data.entityType),
      React.createElement('div', { className: 'core-data' },
        card.data.coreData.map((d, i) =>
          React.createElement('div', { key: i, className: 'data-row' },
            React.createElement('span', { className: 'label' }, d.label),
            React.createElement('span', { className: 'value' }, d.value),
            React.createElement('span', {
              className: 'freshness',
              style: { color: freshnessColor(d.freshness) },
            }, d.freshness),
          )
        )
      ),
      card.data.relatedEntities.length > 0 && React.createElement('div', { className: 'related' },
        React.createElement('h3', null, '关联实体'),
        card.data.relatedEntities.map((r, i) =>
          React.createElement('span', {
            key: i, className: 'related-chip',
            onClick: () => fetchCard(r.id),
          }, `${r.name} (${r.relation})`)
        )
      ),
      React.createElement('p', { className: 'token-count' },
        `~${card.data.tokenCount} tokens`
      )
    )
  );
}
