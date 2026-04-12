// ① 议题推荐 + ③ 差异化建议 + ④ 知识空白
import React, { useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';

export function TopicRecommender({ domain }: { domain?: string }) {
  const { topics, fetchTopics } = useContentLibrary();

  useEffect(() => { fetchTopics(domain); }, [domain]);

  return React.createElement('div', { className: 'topic-recommender' },
    React.createElement('h1', null, '议题推荐'),
    topics.loading && React.createElement('p', null, '加载中...'),
    topics.data && React.createElement('div', { className: 'topic-list' },
      (topics.data.items ?? []).map(t =>
        React.createElement('div', { key: t.entityId, className: 'topic-card' },
          React.createElement('h3', null, t.entityName),
          React.createElement('div', { className: 'scores' },
            React.createElement('span', null, `综合: ${t.score.toFixed(1)}`),
            React.createElement('span', null, `事实密度: ${t.factDensity}`),
            React.createElement('span', null, `时效: ${(t.timeliness * 100).toFixed(0)}%`),
          ),
          t.suggestedAngles.length > 0 && React.createElement('ul', null,
            t.suggestedAngles.map((a, i) => React.createElement('li', { key: i }, a))
          )
        )
      )
    )
  );
}
