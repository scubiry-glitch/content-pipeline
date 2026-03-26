// AI 质量分数徽章组件
// v6.1 展示 RSS 文章的 AI 质量评分

import './AIQualityBadge.css';

interface AIQualityBadgeProps {
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function AIQualityBadge({
  score,
  size = 'sm',
  showIcon = true,
  className = '',
}: AIQualityBadgeProps) {
  // 未分析状态
  if (score === undefined || score === null) {
    return (
      <span className={`ai-quality-badge unanalyzed ${size} ${className}`}>
        {showIcon && <span className="icon">🤖</span>}
        <span>未分析</span>
      </span>
    );
  }

  // 根据分数确定等级
  let level: 'excellent' | 'good' | 'average' | 'poor';
  let label: string;
  let icon: string;

  if (score >= 80) {
    level = 'excellent';
    label = '优秀';
    icon = '⭐';
  } else if (score >= 60) {
    level = 'good';
    label = '良好';
    icon = '✓';
  } else if (score >= 40) {
    level = 'average';
    label = '一般';
    icon = '~';
  } else {
    level = 'poor';
    label = '较差';
    icon = '!';
  }

  return (
    <span className={`ai-quality-badge ${level} ${size} ${className}`} title={`AI质量评分: ${score}/100`}>
      {showIcon && <span className="icon">{icon}</span>}
      <span className="score">{score}分</span>
      <span className="label">{label}</span>
    </span>
  );
}

// 分类标签组件
interface AICategoryTagProps {
  category?: string;
  confidence?: number;
}

export function AICategoryTag({ category, confidence }: AICategoryTagProps) {
  if (!category) return null;

  return (
    <span className="ai-category-tag" title={confidence ? `置信度: ${(confidence * 100).toFixed(0)}%` : undefined}>
      {category}
    </span>
  );
}

// 情感标签组件
interface AISentimentTagProps {
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  score?: number;
}

export function AISentimentTag({ sentiment, score }: AISentimentTagProps) {
  if (!sentiment) return null;

  const sentimentMap = {
    positive: { label: '积极', icon: '😊' },
    negative: { label: '消极', icon: '😔' },
    neutral: { label: '中性', icon: '😐' },
    mixed: { label: '混合', icon: '🤔' },
  };

  const { label, icon } = sentimentMap[sentiment] || sentimentMap.neutral;

  return (
    <span className={`ai-sentiment-tag ${sentiment}`} title={score !== undefined ? `情感分数: ${score}` : undefined}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

// AI 综合信息行
interface AIMetaRowProps {
  qualityScore?: number;
  category?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore?: number;
}

export function AIMetaRow({ qualityScore, category, sentiment, sentimentScore }: AIMetaRowProps) {
  return (
    <div className="ai-meta-row">
      <AIQualityBadge score={qualityScore} />
      <AICategoryTag category={category} />
      <AISentimentTag sentiment={sentiment} score={sentimentScore} />
    </div>
  );
}
