import './Dashboard.css';

interface SentimentData {
  msi: number;
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  change24h: number;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

interface SentimentProps {
  sentiment: SentimentData;
}

const levelNames: Record<string, string> = {
  extreme_fear: '极度恐慌',
  fear: '恐慌',
  neutral: '中性',
  greed: '贪婪',
  extreme_greed: '极度贪婪',
};

const levelColors: Record<string, string> = {
  extreme_fear: '#ff4d4f',
  fear: '#faad14',
  neutral: '#52c41a',
  greed: '#faad14',
  extreme_greed: '#ff4d4f',
};

export function Sentiment({ sentiment }: SentimentProps) {
  return (
    <div className="sentiment-card">
      <div className="msi-header">
        <h4>市场情绪指数 (MSI)</h4>
        <span
          className="msi-value"
          style={{ color: levelColors[sentiment.level] }}
        >
          {sentiment.msi}
        </span>
      </div>
      <div className="msi-level">{levelNames[sentiment.level]}</div>
      <div className={`msi-change ${sentiment.change24h >= 0 ? 'up' : 'down'}`}>
        {sentiment.change24h >= 0 ? '↑' : '↓'} {Math.abs(sentiment.change24h)}%
      </div>
      <div className="sentiment-distribution">
        <div className="dist-bar">
          <span className="dist-label">正面</span>
          <div className="dist-progress">
            <div
              className="dist-fill positive"
              style={{ width: `${sentiment.distribution.positive * 100}%` }}
            ></div>
          </div>
          <span className="dist-value">
            {(sentiment.distribution.positive * 100).toFixed(0)}%
          </span>
        </div>
        <div className="dist-bar">
          <span className="dist-label">中性</span>
          <div className="dist-progress">
            <div
              className="dist-fill neutral"
              style={{ width: `${sentiment.distribution.neutral * 100}%` }}
            ></div>
          </div>
          <span className="dist-value">
            {(sentiment.distribution.neutral * 100).toFixed(0)}%
          </span>
        </div>
        <div className="dist-bar">
          <span className="dist-label">负面</span>
          <div className="dist-progress">
            <div
              className="dist-fill negative"
              style={{ width: `${sentiment.distribution.negative * 100}%` }}
            ></div>
          </div>
          <span className="dist-value">
            {(sentiment.distribution.negative * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}
