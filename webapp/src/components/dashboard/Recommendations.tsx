import './Dashboard.css';

interface Recommendation {
  id: string;
  title: string;
  category: string;
  score: number;
  reason: string;
  hotScore: number;
}

interface RecommendationsProps {
  recommendations: Recommendation[];
  onFeedback: (id: string, action: 'like' | 'ignore') => void;
}

export function Recommendations({
  recommendations,
  onFeedback,
}: RecommendationsProps) {
  if (!recommendations || recommendations.length === 0) {
    return <div className="alert-placeholder">暂无推荐</div>;
  }

  return (
    <ul className="recommendations-list">
      {recommendations.map((r) => (
        <li key={r.id} className="recommendation-item" data-id={r.id}>
          <div className="recommendation-header">
            <span className="topic-title">{r.title}</span>
            <span className="recommendation-score">{r.score}</span>
          </div>
          <div className="recommendation-meta">
            <span className="topic-category">{r.category}</span>
            <span className="recommendation-reason">💡 {r.reason}</span>
            <span className="hot-score">🔥 {r.hotScore}</span>
          </div>
          <div className="recommendation-actions">
            <button
              onClick={() => onFeedback(r.id, 'like')}
              className="btn-like"
            >
              👍 感兴趣
            </button>
            <button
              onClick={() => onFeedback(r.id, 'ignore')}
              className="btn-ignore"
            >
              不感兴趣
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
