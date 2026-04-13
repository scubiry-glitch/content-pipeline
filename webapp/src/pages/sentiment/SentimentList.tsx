// 情感卡片列表（从原 SentimentAnalysisPage 抽取）
import { useState } from 'react';
import type { SentimentAnalysis as SentimentListItem } from '../../api/client';
import { POLARITY_COLORS, polarityEmoji, polarityLabel } from './colors';

interface Props {
  items: SentimentListItem[];
}

type FilterKey = 'all' | 'positive' | 'neutral' | 'negative';

export function SentimentList({ items }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = items.filter((s) => (filter === 'all' ? true : s.polarity === filter));

  return (
    <div className="sentiment-list-wrap">
      <div className="filter-bar">
        <span>情感筛选：</span>
        {(['all', 'positive', 'neutral', 'negative'] as const).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && `全部 (${items.length})`}
            {f === 'positive' && '😊 正面'}
            {f === 'neutral' && '😐 中性'}
            {f === 'negative' && '😔 负面'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-mini">暂无匹配条目</div>
      ) : (
        <div className="sentiment-list">
          {filtered.map((item) => (
            <div key={item.id} className="sentiment-card">
              <div className="sentiment-header">
                <span
                  className="sentiment-icon"
                  style={{ background: POLARITY_COLORS[item.polarity] }}
                >
                  {polarityEmoji(item.polarity)}
                </span>
                <div className="sentiment-info">
                  <span className="sentiment-polarity">{polarityLabel(item.polarity)}</span>
                  <span className="sentiment-source">来源: {item.sourceType}</span>
                </div>
                <div className="sentiment-confidence">
                  <span className="confidence-label">置信度</span>
                  <span className="confidence-value">
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="sentiment-intensity">
                <span className="intensity-label">情感强度</span>
                <div className="intensity-bar">
                  <div
                    className="intensity-fill"
                    style={{
                      width: `${item.intensity}%`,
                      background: POLARITY_COLORS[item.polarity],
                    }}
                  />
                </div>
                <span className="intensity-value">{item.intensity}%</span>
              </div>

              {item.keywords && item.keywords.length > 0 && (
                <div className="sentiment-keywords">
                  {item.keywords.map((kw, i) => (
                    <span key={i} className="keyword-tag">
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <div className="sentiment-time">
                分析时间: {new Date(item.analyzedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
