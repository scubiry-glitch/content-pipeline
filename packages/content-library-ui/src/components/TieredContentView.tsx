// L0 → L1 → L2 渐进展开组件
import React from 'react';
import { useTieredLoad } from '../hooks/useTieredLoad.js';

interface TieredContentViewProps {
  assetId: string;
  initialLevel?: 'L0' | 'L1' | 'L2';
}

export function TieredContentView({ assetId, initialLevel = 'L0' }: TieredContentViewProps) {
  const { content, loading, error, load, expand, canExpand, currentLevel } = useTieredLoad(assetId);

  React.useEffect(() => { load(initialLevel); }, [assetId, initialLevel]);

  if (loading) return React.createElement('div', { className: 'tiered-loading' }, '加载中...');
  if (error) return React.createElement('div', { className: 'tiered-error' }, error);
  if (!content) return null;

  const data = content.data as any;

  return React.createElement('div', { className: `tiered-content level-${currentLevel}` },
    // L0: 标题 + 摘要 + 标签
    React.createElement('div', { className: 'l0' },
      React.createElement('h3', null, data.title || '(无标题)'),
      React.createElement('p', { className: 'summary' }, data.summary),
      data.tags && React.createElement('div', { className: 'tags' },
        data.tags.map((t: string, i: number) =>
          React.createElement('span', { key: i, className: 'tag' }, t)
        )
      ),
      React.createElement('span', { className: 'quality' },
        `质量: ${(data.qualityScore * 100).toFixed(0)}%`
      ),
    ),

    // L1: 核心观点 + 结论
    currentLevel !== 'L0' && data.keyPoints && React.createElement('div', { className: 'l1' },
      React.createElement('h4', null, '核心观点'),
      React.createElement('ul', null,
        data.keyPoints.map((p: string, i: number) =>
          React.createElement('li', { key: i }, p)
        )
      ),
      data.conclusion && React.createElement('div', { className: 'conclusion' },
        React.createElement('strong', null, '结论: '),
        data.conclusion,
      ),
    ),

    // L2: 全文
    currentLevel === 'L2' && data.fullContent && React.createElement('div', { className: 'l2' },
      React.createElement('h4', null, '全文'),
      React.createElement('div', { className: 'full-content' }, data.fullContent),
    ),

    // 展开按钮
    canExpand && currentLevel !== 'L2' && React.createElement('button', {
      className: 'expand-btn',
      onClick: expand,
    }, `展开到 ${currentLevel === 'L0' ? 'L1' : 'L2'}`),

    // Token 计数
    React.createElement('div', { className: 'token-info' },
      `${currentLevel} · ${content.tokenCount} tokens`
    ),
  );
}
