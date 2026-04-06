// ⑦ 信息增量报告组件
import React, { useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';
import { FactCard } from './FactCard.js';

interface DeltaReportProps {
  since?: string;
}

export function DeltaReport({ since }: DeltaReportProps) {
  const { delta, fetchDelta } = useContentLibrary();

  useEffect(() => { fetchDelta(since); }, [since]);

  if (delta.loading) return React.createElement('p', null, '加载中...');
  if (!delta.data) return null;

  const { newFacts, updatedFacts, refutedFacts, summary, period } = delta.data;

  return React.createElement('div', { className: 'delta-report' },
    React.createElement('h2', null, '信息增量报告'),
    React.createElement('p', { className: 'period' },
      `${period.from} → ${period.to}`
    ),
    React.createElement('p', { className: 'summary' }, summary),

    newFacts.length > 0 && React.createElement('section', null,
      React.createElement('h3', null, `新增 (${newFacts.length})`),
      newFacts.slice(0, 10).map(f => React.createElement(FactCard, { key: f.id, fact: f }))
    ),

    updatedFacts.length > 0 && React.createElement('section', null,
      React.createElement('h3', null, `更新 (${updatedFacts.length})`),
      updatedFacts.slice(0, 10).map((u, i) =>
        React.createElement('div', { key: i, className: 'update-pair' },
          React.createElement('span', { className: 'old' }, `旧: ${u.old.object}`),
          React.createElement('span', null, ' → '),
          React.createElement('span', { className: 'new' }, `新: ${u.new.object}`),
        )
      )
    ),

    refutedFacts.length > 0 && React.createElement('section', null,
      React.createElement('h3', null, `推翻 (${refutedFacts.length})`),
      refutedFacts.slice(0, 5).map(f => React.createElement(FactCard, { key: f.id, fact: f }))
    ),
  );
}
