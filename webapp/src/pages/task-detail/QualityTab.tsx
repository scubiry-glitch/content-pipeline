// 任务详情 - 质量分析 Tab
import { useOutletContext } from 'react-router-dom';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  sentiment: {
    msiIndex: number;
    trendDirection: string;
    positive: number;
    negative: number;
    neutral: number;
  } | null;
  hotTopics: any[];
  suggestions: Array<{
    area: string;
    suggestion: string;
    priority: string;
    impact: string;
  }>;
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
    suggestion?: string;
  }>;
}

export function QualityTab() {
  const { task, sentiment, hotTopics, suggestions, alerts } = useOutletContext<TaskContext>();
  return (
    <div className="tab-panel quality-panel">
      <div className="quality-grid">
        {/* 情感分析 (MSI) */}
        {sentiment && (
          <div className="info-card sentiment-card">
            <h3 className="card-title">📊 市场情绪指数 (MSI)</h3>
            <div className="sentiment-display">
              <div className="msi-gauge-small">
                <span className="msi-value-small">{sentiment.msiIndex}</span>
                <span className="msi-level-small">MSI</span>
              </div>
              <div className="msi-change">
                <span className={`change-badge ${sentiment.trendDirection}`}>
                  趋势 {sentiment.trendDirection === 'up' ? '📈 上升' : sentiment.trendDirection === 'down' ? '📉 下降' : '➡️ 稳定'}
                </span>
              </div>
            </div>
            <div className="sentiment-distribution">
              {(() => {
                const total = sentiment.positive + sentiment.neutral + sentiment.negative;
                const safeTotal = total > 0 ? total : 1;
                return (
                  <>
                    <div className="dist-bar">
                      <span className="dist-label">😊 正面</span>
                      <div className="dist-progress">
                        <div className="dist-fill positive" style={{ width: `${(sentiment.positive / safeTotal) * 100}%` }}></div>
                      </div>
                      <span className="dist-percent">{sentiment.positive}</span>
                    </div>
                    <div className="dist-bar">
                      <span className="dist-label">😐 中性</span>
                      <div className="dist-progress">
                        <div className="dist-fill neutral" style={{ width: `${(sentiment.neutral / safeTotal) * 100}%` }}></div>
                      </div>
                      <span className="dist-percent">{sentiment.neutral}</span>
                    </div>
                    <div className="dist-bar">
                      <span className="dist-label">😞 负面</span>
                      <div className="dist-progress">
                        <div className="dist-fill negative" style={{ width: `${(sentiment.negative / safeTotal) * 100}%` }}></div>
                      </div>
                      <span className="dist-percent">{sentiment.negative}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* 热点话题 */}
        <div className="info-card">
          <h3 className="card-title">🔥 热点话题</h3>
          {hotTopics.length > 0 ? (
            <div className="hot-topics-list">
              {hotTopics.slice(0, 5).map((topic) => (
                <div key={topic.id} className="hot-topic-item">
                  <span className="topic-name">{topic.title}</span>
                  <span className="topic-heat">{topic.hotScore || 0}°</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">暂无热点数据</p>
          )}
        </div>

        {/* 优化建议 */}
        {suggestions.length > 0 && (
          <div className="info-card full-width">
            <h3 className="card-title">💡 优化建议</h3>
            <div className="suggestions-list">
              {suggestions.map((s, idx) => (
                <div key={idx} className={`suggestion-card priority-${s.priority}`}>
                  <div className="suggestion-header">
                    <span className="suggestion-area">{s.area}</span>
                    <span className={`priority-badge ${s.priority}`}>
                      {s.priority === 'high' ? '高' : s.priority === 'medium' ? '中' : '低'}
                    </span>
                  </div>
                  <p className="suggestion-text">{s.suggestion}</p>
                  <span className="suggestion-impact">影响: {s.impact}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 预警信息 */}
        {alerts.length > 0 && (
          <div className="info-card full-width">
            <h3 className="card-title">⚠️ 预警信息</h3>
            <div className="alerts-list">
              {alerts.map((alert, idx) => (
                <div key={idx} className={`alert-item severity-${alert.severity}`}>
                  <span className="alert-type">
                    {alert.type === 'freshness' ? '⏰' :
                     alert.type === 'review' ? '👥' :
                     alert.type === 'quality' ? '⚠️' : 'ℹ️'}
                  </span>
                  <div className="alert-content">
                    <div className="alert-message">{alert.message}</div>
                    {alert.suggestion && (
                      <div className="alert-suggestion">{alert.suggestion}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 选题评估摘要 */}
        {task.evaluation && (
          <div className="info-card full-width">
            <h3 className="card-title">📋 选题评估摘要</h3>
            <div className="evaluation-summary">
              <div className="evaluation-score-large">
                <span className="score-number">{task.evaluation.score}</span>
                <span className="score-label">综合评分</span>
              </div>
              <div className="evaluation-details">
                <div className="eval-item">
                  <span className="eval-label">风险等级</span>
                  <span className={`eval-value risk-${task.evaluation.riskLevel}`}>
                    {task.evaluation.riskLevel === 'low' ? '低风险' :
                     task.evaluation.riskLevel === 'medium' ? '中风险' : '高风险'}
                  </span>
                </div>
                <div className="eval-item">
                  <span className="eval-label">强烈推荐</span>
                  <span className="eval-value">{task.evaluation.stronglyRecommended ? '✅ 是' : '❌ 否'}</span>
                </div>
                {task.evaluation.analysis && (
                  <div className="eval-analysis">
                    <strong>分析：</strong>{task.evaluation.analysis}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
