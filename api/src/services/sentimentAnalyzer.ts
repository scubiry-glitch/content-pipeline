// v2.2 情感分析服务 - Sentiment Analyzer
// SA-001 ~ SA-005: 情感分析增强

import { query } from '../db/connection.js';

export interface SentimentResult {
  polarity: 'positive' | 'negative' | 'neutral';
  intensity: number; // 0-100
  confidence: number; // 0-1
  keywords: string[];
  aspects: Record<string, SentimentResult>;
}

export interface TopicSentiment {
  topicId: string;
  topicTitle: string;
  overall: number; // -100 to 100
  confidence: number;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  trend: 'rising' | 'stable' | 'falling';
  sourceCount: number;
  analyzedAt: Date;
}

export interface MarketSentimentIndex {
  value: number; // 0-100, 50为中性
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  change24h: number;
  change7d: number;
  components: {
    newsSentiment: number;
    socialSentiment: number;
    expertSentiment: number;
  };
  calculatedAt: Date;
}

// 情感词典（简化版）
const SENTIMENT_DICT = {
  positive: [
    '利好', '上涨', '增长', '突破', '创新高', '强劲', '乐观', '看好',
    '推荐', '买入', '增持', '优质', '领先', '优势', '机遇', '红利',
    '繁荣', '复苏', '回暖', '改善', '提升', '成功', '胜利', 'positive',
    'growth', 'profit', 'gain', 'boom', 'recovery', 'strong', 'optimistic'
  ],
  negative: [
    '利空', '下跌', '下滑', '跌破', '创新低', '疲软', '悲观', '看空',
    '减持', '卖出', '回避', '风险', '危机', '衰退', '萎缩', '亏损',
    '暴雷', '违约', '破产', '裁员', '下降', '恶化', '失败', 'negative',
    'loss', 'decline', 'crash', 'recession', 'weak', 'pessimistic', 'bearish'
  ],
  intensifiers: [
    '大幅', '剧烈', '严重', '极度', '非常', '明显', '显著', '迅速',
    '大幅', '巨大', '强劲', '强烈', '迅速', '急剧', 'rapidly', 'sharply'
  ],
  diminishers: [
    '略微', '轻微', '稍有', '小幅', '略有', '轻微', 'somewhat', 'slightly'
  ]
};

/**
 * 分析文本情感 (SA-001, SA-002)
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return {
      polarity: 'neutral',
      intensity: 0,
      confidence: 0,
      keywords: [],
      aspects: {}
    };
  }

  const textLower = text.toLowerCase();
  const words = text.split(/[\s,，。！？;；]/);

  let positiveScore = 0;
  let negativeScore = 0;
  let intensityMultiplier = 1;
  const keywords: string[] = [];

  // 分析每个词
  for (const word of words) {
    const wordLower = word.toLowerCase().trim();
    if (!wordLower) continue;

    // 检查正向词
    if (SENTIMENT_DICT.positive.some(w => wordLower.includes(w))) {
      positiveScore++;
      keywords.push(word);
    }

    // 检查负向词
    if (SENTIMENT_DICT.negative.some(w => wordLower.includes(w))) {
      negativeScore++;
      keywords.push(word);
    }

    // 检查强度词
    if (SENTIMENT_DICT.intensifiers.some(w => wordLower.includes(w))) {
      intensityMultiplier = Math.min(intensityMultiplier + 0.3, 2);
    }

    // 检查弱化词
    if (SENTIMENT_DICT.diminishers.some(w => wordLower.includes(w))) {
      intensityMultiplier = Math.max(intensityMultiplier - 0.2, 0.5);
    }
  }

  // 计算极性
  let polarity: 'positive' | 'negative' | 'neutral';
  const totalScore = positiveScore + negativeScore;

  if (totalScore === 0) {
    polarity = 'neutral';
  } else if (positiveScore > negativeScore * 1.5) {
    polarity = 'positive';
  } else if (negativeScore > positiveScore * 1.5) {
    polarity = 'negative';
  } else {
    polarity = 'neutral';
  }

  // 计算强度 (0-100)
  const rawIntensity = Math.min((positiveScore + negativeScore) * 10 * intensityMultiplier, 100);
  const intensity = Math.round(rawIntensity);

  // 计算置信度
  const confidence = Math.min(totalScore * 0.1 + 0.3, 0.95);

  return {
    polarity,
    intensity,
    confidence,
    keywords: Array.from(new Set(keywords)),
    aspects: {} // 简化版暂不分析细粒度aspect
  };
}

/**
 * 批量分析多条内容 (SA-001)
 */
export async function batchAnalyzeSentiment(
  contents: Array<{ id: string; text: string; source: string }>
): Promise<Map<string, SentimentResult>> {
  const results = new Map<string, SentimentResult>();

  for (const item of contents) {
    const sentiment = analyzeSentiment(item.text);
    results.set(item.id, sentiment);

    // 保存到数据库
    await saveSentimentResult(item.id, item.source, sentiment);
  }

  return results;
}

/**
 * 分析话题整体情感 (SA-003)
 */
export async function analyzeTopicSentiment(topicId: string): Promise<TopicSentiment | null> {
  // 获取话题相关文章的情感分析结果
  const result = await query(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN polarity = 'positive' THEN 1 END) as positive_count,
      COUNT(CASE WHEN polarity = 'negative' THEN 1 END) as negative_count,
      COUNT(CASE WHEN polarity = 'neutral' THEN 1 END) as neutral_count,
      AVG(intensity) as avg_intensity,
      MAX(analyzed_at) as latest
    FROM sentiment_analysis
    WHERE topic_id = $1
      AND analyzed_at > NOW() - INTERVAL '7 days'`,
    [topicId]
  );

  if (result.rows.length === 0 || result.rows[0].total === '0') {
    return null;
  }

  const row = result.rows[0];
  const total = parseInt(row.total);
  const positive = parseInt(row.positive_count);
  const negative = parseInt(row.negative_count);
  const neutral = parseInt(row.neutral_count);

  // 计算整体情感分数 (-100 to 100)
  const overall = Math.round((positive - negative) / total * 100);

  // 判断趋势
  const trendResult = await query(
    `SELECT polarity
     FROM sentiment_analysis
     WHERE topic_id = $1
     ORDER BY analyzed_at DESC
     LIMIT 10`,
    [topicId]
  );

  let trend: 'rising' | 'stable' | 'falling' = 'stable';
  if (trendResult.rows.length >= 5) {
    const recent5 = trendResult.rows.slice(0, 5);
    const older5 = trendResult.rows.slice(5, 10);

    const recentPositive = recent5.filter(r => r.polarity === 'positive').length;
    const olderPositive = older5.filter(r => r.polarity === 'positive').length;

    if (recentPositive > olderPositive + 1) {
      trend = 'rising';
    } else if (recentPositive < olderPositive - 1) {
      trend = 'falling';
    }
  }

  // 获取话题标题
  const topicResult = await query(
    `SELECT title FROM hot_topics WHERE id = $1`,
    [topicId]
  );

  return {
    topicId,
    topicTitle: topicResult.rows[0]?.title || 'Unknown',
    overall,
    confidence: Math.min(total * 0.02, 0.9),
    distribution: {
      positive: Math.round(positive / total * 100),
      neutral: Math.round(neutral / total * 100),
      negative: Math.round(negative / total * 100)
    },
    trend,
    sourceCount: total,
    analyzedAt: new Date()
  };
}

/**
 * 计算市场情绪指数 MSI (SA-003)
 */
export async function calculateMSI(): Promise<MarketSentimentIndex> {
  // 获取最近24小时的新闻情感
  const newsResult = await query(
    `SELECT
      AVG(CASE
        WHEN polarity = 'positive' THEN intensity
        WHEN polarity = 'negative' THEN -intensity
        ELSE 0
      END) as avg_sentiment
    FROM sentiment_analysis
    WHERE source_type = 'rss'
      AND analyzed_at > NOW() - INTERVAL '24 hours'`,
    []
  );

  const newsSentiment = parseFloat(newsResult.rows[0]?.avg_sentiment) || 0;

  // 计算MSI (0-100, 50为中性)
  const rawMSI = 50 + (newsSentiment * 0.5);
  const msiValue = Math.max(0, Math.min(100, Math.round(rawMSI)));

  // 确定情绪等级
  let level: MarketSentimentIndex['level'];
  if (msiValue <= 20) level = 'extreme_fear';
  else if (msiValue <= 40) level = 'fear';
  else if (msiValue <= 60) level = 'neutral';
  else if (msiValue <= 80) level = 'greed';
  else level = 'extreme_greed';

  // 计算24小时变化
  const change24hResult = await query(
    `SELECT
      AVG(CASE
        WHEN polarity = 'positive' THEN intensity
        WHEN polarity = 'negative' THEN -intensity
        ELSE 0
      END) as avg_sentiment
    FROM sentiment_analysis
    WHERE source_type = 'rss'
      AND analyzed_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'`,
    []
  );

  const prevMSI = 50 + (parseFloat(change24hResult.rows[0]?.avg_sentiment) || 0) * 0.5;
  const change24h = Math.round(msiValue - prevMSI);

  // 计算7天变化
  const change7dResult = await query(
    `SELECT
      AVG(CASE
        WHEN polarity = 'positive' THEN intensity
        WHEN polarity = 'negative' THEN -intensity
        ELSE 0
      END) as avg_sentiment
    FROM sentiment_analysis
    WHERE source_type = 'rss'
      AND analyzed_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'`,
    []
  );

  const weekAgoMSI = 50 + (parseFloat(change7dResult.rows[0]?.avg_sentiment) || 0) * 0.5;
  const change7d = Math.round(msiValue - weekAgoMSI);

  return {
    value: msiValue,
    level,
    change24h,
    change7d,
    components: {
      newsSentiment: Math.round(50 + newsSentiment * 0.5),
      socialSentiment: 50, // 预留
      expertSentiment: 50  // 预留
    },
    calculatedAt: new Date()
  };
}

/**
 * 情绪异常预警 (SA-004)
 */
export async function checkSentimentAnomalies(): Promise<Array<{
  topicId: string;
  topicTitle: string;
  alertType: 'extreme_positive' | 'extreme_negative' | 'sudden_change';
  severity: 'high' | 'medium' | 'low';
  message: string;
}>> {
  const alerts: Array<{
    topicId: string;
    topicTitle: string;
    alertType: 'extreme_positive' | 'extreme_negative' | 'sudden_change';
    severity: 'high' | 'medium' | 'low';
    message: string;
  }> = [];

  // 检查极端情绪
  const extremeResult = await query(
    `SELECT
      topic_id,
      AVG(CASE
        WHEN polarity = 'positive' THEN intensity
        WHEN polarity = 'negative' THEN -intensity
        ELSE 0
      END) as avg_sentiment,
      COUNT(*) as count
    FROM sentiment_analysis
    WHERE analyzed_at > NOW() - INTERVAL '24 hours'
    GROUP BY topic_id
    HAVING COUNT(*) >= 5`,
    []
  );

  for (const row of extremeResult.rows) {
    const sentiment = parseFloat(row.avg_sentiment);
    const topicId = row.topic_id;

    // 获取话题标题
    const topicResult = await query(
      `SELECT title FROM hot_topics WHERE id = $1`,
      [topicId]
    );
    const topicTitle = topicResult.rows[0]?.title || 'Unknown';

    if (sentiment >= 70) {
      alerts.push({
        topicId,
        topicTitle,
        alertType: 'extreme_positive',
        severity: 'medium',
        message: `话题"${topicTitle}"出现极度乐观情绪 (强度: ${Math.round(sentiment)})`
      });
    } else if (sentiment <= -70) {
      alerts.push({
        topicId,
        topicTitle,
        alertType: 'extreme_negative',
        severity: 'high',
        message: `话题"${topicTitle}"出现极度悲观情绪 (强度: ${Math.round(Math.abs(sentiment))})`
      });
    }
  }

  return alerts;
}

/**
 * 获取情绪趋势数据 (SA-005)
 */
export async function getSentimentTrend(
  topicId: string,
  days: number = 7
): Promise<Array<{
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  overall: number;
}>> {
  const result = await query(
    `SELECT
      DATE(analyzed_at) as date,
      COUNT(CASE WHEN polarity = 'positive' THEN 1 END) as positive_count,
      COUNT(CASE WHEN polarity = 'negative' THEN 1 END) as negative_count,
      COUNT(CASE WHEN polarity = 'neutral' THEN 1 END) as neutral_count,
      AVG(CASE
        WHEN polarity = 'positive' THEN intensity
        WHEN polarity = 'negative' THEN -intensity
        ELSE 0
      END) as avg_sentiment
    FROM sentiment_analysis
    WHERE topic_id = $1
      AND analyzed_at > NOW() - INTERVAL '${days} days'
    GROUP BY DATE(analyzed_at)
    ORDER BY date`,
    [topicId]
  );

  return result.rows.map(row => {
    const total = parseInt(row.positive_count) + parseInt(row.negative_count) + parseInt(row.neutral_count);
    return {
      date: row.date,
      positive: parseInt(row.positive_count),
      negative: parseInt(row.negative_count),
      neutral: parseInt(row.neutral_count),
      overall: total > 0 ? Math.round(parseFloat(row.avg_sentiment)) : 0
    };
  });
}

/**
 * 保存情感分析结果到数据库
 */
async function saveSentimentResult(
  contentId: string,
  sourceType: string,
  sentiment: SentimentResult
): Promise<void> {
  await query(
    `INSERT INTO sentiment_analysis (
      content_id, source_type, polarity, intensity, confidence, keywords, analyzed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (content_id) DO UPDATE SET
      polarity = $3,
      intensity = $4,
      confidence = $5,
      keywords = $6,
      analyzed_at = NOW()`,
    [
      contentId,
      sourceType,
      sentiment.polarity,
      sentiment.intensity,
      sentiment.confidence,
      JSON.stringify(sentiment.keywords)
    ]
  );
}

/**
 * 情感分析服务主入口
 */
export const sentimentAnalyzer = {
  analyze: analyzeSentiment,
  batchAnalyze: batchAnalyzeSentiment,
  analyzeTopic: analyzeTopicSentiment,
  calculateMSI,
  checkAnomalies: checkSentimentAnomalies,
  getTrend: getSentimentTrend
};
