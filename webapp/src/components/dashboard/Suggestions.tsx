import './Dashboard.css';

interface Suggestion {
  area: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
}

interface SuggestionsProps {
  suggestions: Suggestion[];
}

export function Suggestions({ suggestions }: SuggestionsProps) {
  if (!suggestions || suggestions.length === 0) {
    return <div className="alert-placeholder">暂无优化建议</div>;
  }

  // 按优先级排序
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...suggestions].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  return (
    <div className="suggestions-list">
      {sorted.map((s, index) => (
        <div key={index} className={`suggestion-item priority-${s.priority}`}>
          <span className="suggestion-area">{s.area}</span>
          <span className="suggestion-text">{s.suggestion}</span>
          <span className="suggestion-impact">📈 {s.impact}</span>
        </div>
      ))}
    </div>
  );
}
