// 产出物总览仪表盘 — 15 类产出物的入口
import React, { useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';

export function ContentDashboard() {
  const { topics, fetchTopics, contradictions, fetchContradictions, staleFacts, fetchStaleFacts } = useContentLibrary();

  useEffect(() => {
    fetchTopics();
    fetchContradictions();
    fetchStaleFacts(90);
  }, []);

  return React.createElement('div', { className: 'content-dashboard' },
    React.createElement('h1', null, '内容库仪表盘'),

    // 选题推荐
    React.createElement('section', null,
      React.createElement('h2', null, '① 议题推荐'),
      topics.loading && React.createElement('p', null, '加载中...'),
      topics.data && React.createElement('ul', null,
        topics.data.map(t =>
          React.createElement('li', { key: t.entityId },
            `${t.entityName} (得分: ${t.score.toFixed(2)}, 事实密度: ${t.factDensity})`
          )
        )
      )
    ),

    // 争议话题
    React.createElement('section', null,
      React.createElement('h2', null, '⑬ 争议话题'),
      contradictions.loading && React.createElement('p', null, '加载中...'),
      contradictions.data && React.createElement('ul', null,
        contradictions.data.map(c =>
          React.createElement('li', { key: c.id, className: `severity-${c.severity}` },
            c.description
          )
        )
      )
    ),

    // 过期事实
    React.createElement('section', null,
      React.createElement('h2', null, '⑧ 事实保鲜度'),
      staleFacts.loading && React.createElement('p', null, '加载中...'),
      staleFacts.data && React.createElement('p', null,
        `${staleFacts.data.length} 条事实需要更新`
      )
    )
  );
}
