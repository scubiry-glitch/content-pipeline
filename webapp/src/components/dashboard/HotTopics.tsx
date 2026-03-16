import './Dashboard.css';

interface HotTopic {
  title: string;
  score: number;
  source: string;
}

interface HotTopicsProps {
  topics: HotTopic[];
}

export function HotTopics({ topics }: HotTopicsProps) {
  if (!topics || topics.length === 0) {
    return <div className="alert-placeholder">暂无热点数据</div>;
  }

  return (
    <ul className="hot-topics-list">
      {topics.map((topic, index) => (
        <li key={index} className="hot-topic-item">
          <span className="topic-title">{topic.title}</span>
          <span className="topic-score">{topic.score}</span>
          <span className="topic-source">{topic.source}</span>
        </li>
      ))}
    </ul>
  );
}
