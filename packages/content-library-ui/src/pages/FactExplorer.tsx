// ⑤ 关键事实浏览 + ⑧ 保鲜度标记
import React, { useState, useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';
import { FactCard } from '../components/FactCard.js';

export function FactExplorer() {
  const { facts, fetchFacts } = useContentLibrary();
  const [subject, setSubject] = useState('');

  useEffect(() => { fetchFacts(); }, []);

  const handleSearch = () => { fetchFacts(subject || undefined); };

  return React.createElement('div', { className: 'fact-explorer' },
    React.createElement('h1', null, '事实浏览器'),
    React.createElement('div', { className: 'search-bar' },
      React.createElement('input', {
        type: 'text', value: subject, placeholder: '按主体搜索...',
        onChange: (e: any) => setSubject(e.target.value),
        onKeyDown: (e: any) => e.key === 'Enter' && handleSearch(),
      }),
      React.createElement('button', { onClick: handleSearch }, '搜索')
    ),
    facts.loading && React.createElement('p', null, '加载中...'),
    facts.error && React.createElement('p', { className: 'error' }, facts.error),
    facts.data && React.createElement('div', { className: 'fact-list' },
      (facts.data.items ?? []).map(f => React.createElement(FactCard, { key: f.id, fact: f }))
    )
  );
}
