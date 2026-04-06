// 事实三元组卡片组件
import React from 'react';
import type { ContentFact } from '../types.js';

interface FactCardProps {
  fact: ContentFact;
  showFreshness?: boolean;
  onClick?: (fact: ContentFact) => void;
}

export function FactCard({ fact, showFreshness = true, onClick }: FactCardProps) {
  const daysSince = (Date.now() - new Date(fact.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const freshness = daysSince < 30 ? 'fresh' : daysSince < 90 ? 'aging' : 'stale';
  const freshnessColor = freshness === 'fresh' ? '#38a169' : freshness === 'aging' ? '#dd6b20' : '#e53e3e';

  return React.createElement('div', {
    className: 'fact-card',
    onClick: () => onClick?.(fact),
    style: { cursor: onClick ? 'pointer' : 'default' },
  },
    React.createElement('div', { className: 'triple' },
      React.createElement('span', { className: 'subject' }, fact.subject),
      React.createElement('span', { className: 'predicate' }, fact.predicate),
      React.createElement('span', { className: 'object' }, fact.object),
    ),
    React.createElement('div', { className: 'meta' },
      React.createElement('span', { className: 'confidence' },
        `置信度: ${(fact.confidence * 100).toFixed(0)}%`
      ),
      fact.context?.time && React.createElement('span', { className: 'time' }, fact.context.time),
      fact.context?.domain && React.createElement('span', { className: 'domain' }, fact.context.domain),
      showFreshness && React.createElement('span', {
        className: 'freshness',
        style: { color: freshnessColor },
      }, freshness),
    )
  );
}
