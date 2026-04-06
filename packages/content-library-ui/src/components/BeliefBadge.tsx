// 命题状态标签组件 (confirmed/disputed/evolving/refuted)
import React from 'react';
import type { BeliefStance } from '../types.js';

interface BeliefBadgeProps {
  stance: BeliefStance;
  confidence?: number;
  size?: 'sm' | 'md' | 'lg';
}

const stanceConfig: Record<BeliefStance, { label: string; color: string; bg: string }> = {
  confirmed: { label: '已确认', color: '#276749', bg: '#c6f6d5' },
  disputed: { label: '有争议', color: '#9c4221', bg: '#feebc8' },
  evolving: { label: '演化中', color: '#2b6cb0', bg: '#bee3f8' },
  refuted: { label: '已推翻', color: '#9b2c2c', bg: '#fed7d7' },
};

export function BeliefBadge({ stance, confidence, size = 'md' }: BeliefBadgeProps) {
  const config = stanceConfig[stance] || stanceConfig.evolving;
  const fontSize = size === 'sm' ? '12px' : size === 'lg' ? '16px' : '14px';

  return React.createElement('span', {
    className: `belief-badge belief-${stance}`,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '12px', fontSize,
      color: config.color, backgroundColor: config.bg,
    },
  },
    config.label,
    confidence !== undefined && React.createElement('span', { className: 'confidence' },
      `(${(confidence * 100).toFixed(0)}%)`
    )
  );
}
