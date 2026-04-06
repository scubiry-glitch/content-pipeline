// ② 趋势信号 + ⑭ 观点演化时间线
import React, { useState, useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';

export function TrendTimeline({ entityId }: { entityId?: string }) {
  const { trends, fetchTrends } = useContentLibrary();
  const [id, setId] = useState(entityId || '');

  useEffect(() => { if (id) fetchTrends(id); }, [id]);

  const directionIcon = (d: string) =>
    d === 'rising' ? '↑' : d === 'falling' ? '↓' : d === 'volatile' ? '~' : '→';

  return React.createElement('div', { className: 'trend-timeline' },
    React.createElement('h1', null, '趋势信号'),
    !entityId && React.createElement('input', {
      type: 'text', placeholder: '实体 ID...', value: id,
      onChange: (e: any) => setId(e.target.value),
    }),
    trends.loading && React.createElement('p', null, '加载中...'),
    trends.data && trends.data.map((t, i) =>
      React.createElement('div', { key: i, className: `trend trend-${t.direction}` },
        React.createElement('h3', null, `${directionIcon(t.direction)} ${t.metric}`),
        React.createElement('div', { className: 'data-points' },
          t.dataPoints.map((dp, j) =>
            React.createElement('span', { key: j, className: 'data-point' },
              `${dp.time}: ${dp.value}`
            )
          )
        )
      )
    )
  );
}
