import { useState } from 'react';
import './HotTopicAIAnalysis.css';

interface HotTopicAIAnalysisProps {
  topicName: string;
  sentiment?: number;
  trend?: 'up' | 'down' | 'stable';
}

export function HotTopicAIAnalysis({ topicName, sentiment, trend }: HotTopicAIAnalysisProps) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  const generateAnalysis = () => {
    setLoading(true);
    setTimeout(() => {
      const analyses = [
        `【${topicName}】热度持续上升，市场情绪偏积极。建议关注相关产业链机会。`,
        `【${topicName}】近期话题量增长30%，社交媒体讨论度较高。`,
        `【${topicName}】受政策利好影响，预计短期内将保持热度。`,
        `【${topicName}】市场情绪分化，建议理性看待，关注基本面变化。`,
      ];
      setAnalysis(analyses[Math.floor(Math.random() * analyses.length)]);
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="hot-topic-ai-analysis">
      <div className="analysis-header">
        <h4>🤖 AI智能分析</h4>
        <button onClick={generateAnalysis} disabled={loading}>
          {loading ? '分析中...' : '生成分析'}
        </button>
      </div>
      {analysis && (
        <div className="analysis-content">
          <p>{analysis}</p>
          <div className="analysis-metrics">
            <div className="metric">
              <span className="metric-label">情感指数</span>
              <span className="metric-value">{sentiment ?? 65}</span>
            </div>
            <div className="metric">
              <span className="metric-label">趋势</span>
              <span className={`metric-value trend-${trend ?? 'up'}`}>
                {trend === 'up' ? '↗️ 上升' : trend === 'down' ? '↘️ 下降' : '➡️ 稳定'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
