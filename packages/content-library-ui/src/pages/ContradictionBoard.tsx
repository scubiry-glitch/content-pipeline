// ⑬ 争议话题看板
import React, { useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';

export function ContradictionBoard({ domain }: { domain?: string }) {
  const { contradictions, fetchContradictions } = useContentLibrary();

  useEffect(() => { fetchContradictions(domain); }, [domain]);

  const severityColor = (s: string) =>
    s === 'high' ? '#e53e3e' : s === 'medium' ? '#dd6b20' : '#718096';

  return React.createElement('div', { className: 'contradiction-board' },
    React.createElement('h1', null, '争议话题'),
    contradictions.loading && React.createElement('p', null, '加载中...'),
    contradictions.data && React.createElement('div', { className: 'contradiction-list' },
      contradictions.data.map(c =>
        React.createElement('div', {
          key: c.id,
          className: 'contradiction-card',
          style: { borderLeft: `4px solid ${severityColor(c.severity)}` },
        },
          React.createElement('p', { className: 'description' }, c.description),
          React.createElement('div', { className: 'facts' },
            React.createElement('div', { className: 'fact-a' },
              `A: ${c.factA.object} (置信度: ${c.factA.confidence})`
            ),
            React.createElement('div', { className: 'fact-b' },
              `B: ${c.factB.object} (置信度: ${c.factB.confidence})`
            ),
          ),
          React.createElement('span', { className: 'severity' }, c.severity)
        )
      )
    )
  );
}
