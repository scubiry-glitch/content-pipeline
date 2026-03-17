// 专家质量评估服务 - Expert Quality Service
// v5.1.6: 评审质量评估体系，包括预测准确率、差异化贡献度等指标

import type { Expert, ExpertReview } from '../types';

// 专家质量指标接口
export interface ExpertQualityMetrics {
  // 预测准确性
  predictionAccuracy: {
    overall: number;
    byDomain: Record<string, number>;
    byTimeHorizon: {
      shortTerm: number;   // 1个月内
      mediumTerm: number;  // 1-6个月
      longTerm: number;    // 6个月以上
    };
    calibrationScore: number; // 校准分数（预测置信度vs实际准确率）
  };

  // 差异化贡献度
  differentiationContribution: {
    uniqueness: number;        // 观点独特性（0-5）
    insightDepth: number;      // 洞察深度（0-5）
    contrarianAccuracy: number; // 反向观点准确率（0-1）
    informationValue: number;  // 信息增量价值（0-5）
  };

  // 时效性价值
  temporalValue: {
    earlySignal: number;       // 早期信号识别能力（提前月数）
    trendPersistence: number;  // 趋势持续性判断（0-1）
    turningPoint: number;      // 拐点预测能力（0-1）
  };

  // 可操作性
  actionability: {
    recommendationClarity: number;  // 建议清晰度（0-5）
    executionFeasibility: number;   // 可执行性（0-5）
    resultAchievability: number;    // 结果可达成度（0-5）
  };

  // 用户满意度
  userSatisfaction: {
    rating: number;        // 平均评分（0-5）
    NPS: number;           // 净推荐值（-100到100）
    repeatUsage: number;   // 重复使用率（0-1）
  };
}

// 预测验证记录
export interface PredictionVerification {
  id: string;
  expertId: string;
  prediction: string;
  confidence: number;
  timeHorizon: 'short' | 'medium' | 'long';
  domain: string;
  predictedAt: string;
  expectedOutcome: string;
  // 验证时填写
  verifiedAt?: string;
  actualOutcome?: string;
  accuracyScore?: number;
  isContrarian: boolean; // 是否为反向观点
}

// 质量报告
export interface QualityReport {
  expertId: string;
  expertName: string;
  generatedAt: string;
  period: {
    start: string;
    end: string;
  };
  metrics: ExpertQualityMetrics;
  rankings: {
    overall: number;
    byDomain: Record<string, number>;
  };
  trends: {
    accuracy: 'improving' | 'stable' | 'declining';
    satisfaction: 'improving' | 'stable' | 'declining';
    overall: 'improving' | 'stable' | 'declining';
  };
  recommendations: string[];
}

// 存储
const predictionVerifications: PredictionVerification[] = [];
const qualityMetrics: Map<string, ExpertQualityMetrics> = new Map();

/**
 * 初始化专家质量指标
 * @param expert 专家
 */
export function initExpertQualityMetrics(expert: Expert): ExpertQualityMetrics {
  const metrics: ExpertQualityMetrics = {
    predictionAccuracy: {
      overall: expert.acceptanceRate || 0.7,
      byDomain: { [expert.domainName]: expert.acceptanceRate || 0.75 },
      byTimeHorizon: {
        shortTerm: 0.75,
        mediumTerm: 0.7,
        longTerm: 0.65,
      },
      calibrationScore: 0.8,
    },
    differentiationContribution: {
      uniqueness: 3.5,
      insightDepth: 4.0,
      contrarianAccuracy: 0.6,
      informationValue: 4.0,
    },
    temporalValue: {
      earlySignal: 1.5,
      trendPersistence: 0.75,
      turningPoint: 0.7,
    },
    actionability: {
      recommendationClarity: 4.0,
      executionFeasibility: 3.8,
      resultAchievability: 3.5,
    },
    userSatisfaction: {
      rating: 4.0,
      NPS: 30,
      repeatUsage: 0.65,
    },
  };

  qualityMetrics.set(expert.id, metrics);
  return metrics;
}

/**
 * 记录预测（用于事后验证）
 * @param prediction 预测记录
 */
export function recordPrediction(
  prediction: Omit<PredictionVerification, 'id' | 'predictedAt'>
): PredictionVerification {
  const record: PredictionVerification = {
    ...prediction,
    id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    predictedAt: new Date().toISOString(),
  };

  predictionVerifications.push(record);
  return record;
}

/**
 * 验证预测准确性
 * @param predictionId 预测ID
 * @param actualOutcome 实际结果
 * @param accuracyScore 准确性分数 (0-1)
 */
export function verifyPredictionAccuracy(
  predictionId: string,
  actualOutcome: string,
  accuracyScore: number
): void {
  const prediction = predictionVerifications.find(p => p.id === predictionId);
  if (!prediction) return;

  prediction.verifiedAt = new Date().toISOString();
  prediction.actualOutcome = actualOutcome;
  prediction.accuracyScore = accuracyScore;

  // 更新专家质量指标
  updatePredictionAccuracyMetrics(prediction.expertId);
}

/**
 * 更新预测准确性指标
 * @param expertId 专家ID
 */
function updatePredictionAccuracyMetrics(expertId: string): void {
  const metrics = qualityMetrics.get(expertId);
  if (!metrics) return;

  const verifiedPredictions = predictionVerifications.filter(
    p => p.expertId === expertId && p.verifiedAt !== undefined
  );

  if (verifiedPredictions.length === 0) return;

  // 更新整体准确率
  const totalAccuracy = verifiedPredictions.reduce(
    (sum, p) => sum + (p.accuracyScore || 0), 0
  );
  metrics.predictionAccuracy.overall = totalAccuracy / verifiedPredictions.length;

  // 按时间维度更新
  const shortTerm = verifiedPredictions.filter(p => p.timeHorizon === 'short');
  const mediumTerm = verifiedPredictions.filter(p => p.timeHorizon === 'medium');
  const longTerm = verifiedPredictions.filter(p => p.timeHorizon === 'long');

  if (shortTerm.length > 0) {
    metrics.predictionAccuracy.byTimeHorizon.shortTerm =
      shortTerm.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / shortTerm.length;
  }
  if (mediumTerm.length > 0) {
    metrics.predictionAccuracy.byTimeHorizon.mediumTerm =
      mediumTerm.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / mediumTerm.length;
  }
  if (longTerm.length > 0) {
    metrics.predictionAccuracy.byTimeHorizon.longTerm =
      longTerm.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / longTerm.length;
  }

  // 按领域更新
  const byDomain: Record<string, number[]> = {};
  verifiedPredictions.forEach(p => {
    if (!byDomain[p.domain]) byDomain[p.domain] = [];
    byDomain[p.domain].push(p.accuracyScore || 0);
  });

  Object.entries(byDomain).forEach(([domain, scores]) => {
    metrics.predictionAccuracy.byDomain[domain] =
      scores.reduce((a, b) => a + b, 0) / scores.length;
  });

  // 更新反向观点准确率
  const contrarianPredictions = verifiedPredictions.filter(p => p.isContrarian);
  if (contrarianPredictions.length > 0) {
    metrics.differentiationContribution.contrarianAccuracy =
      contrarianPredictions.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) /
      contrarianPredictions.length;
  }

  // 计算校准分数（预测置信度vs实际准确率）
  const calibrationScores = verifiedPredictions.map(p => {
    const predicted = p.confidence;
    const actual = p.accuracyScore || 0;
    return 1 - Math.abs(predicted - actual); // 越接近1表示校准越好
  });
  metrics.predictionAccuracy.calibrationScore =
    calibrationScores.reduce((a, b) => a + b, 0) / calibrationScores.length;
}

/**
 * 更新差异化贡献度
 * @param expertId 专家ID
 * @param reviews 评审记录
 * @param allExpertReviews 所有专家的评审记录（用于比较独特性）
 */
export function updateDifferentiationMetrics(
  expertId: string,
  reviews: ExpertReview[],
  allExpertReviews: ExpertReview[]
): void {
  const metrics = qualityMetrics.get(expertId);
  if (!metrics) return;

  // 计算独特性（与其他专家观点的相似度）
  const uniqueness = calculateUniqueness(expertId, reviews, allExpertReviews);
  metrics.differentiationContribution.uniqueness = uniqueness;

  // 更新洞察深度（基于观点长度和复杂度）
  const avgDepth = reviews.reduce((sum, r) => {
    const complexity = r.opinion.length / 100 + r.suggestions.length;
    return sum + Math.min(complexity, 5);
  }, 0) / reviews.length;
  metrics.differentiationContribution.insightDepth = Math.min(avgDepth, 5);
}

/**
 * 计算观点独特性
 */
function calculateUniqueness(
  expertId: string,
  reviews: ExpertReview[],
  allExpertReviews: ExpertReview[]
): number {
  const otherReviews = allExpertReviews.filter(r => r.expertId !== expertId);
  if (otherReviews.length === 0) return 4; // 默认较高独特性

  // 简化：基于关键词重叠计算独特性
  const expertKeywords = extractKeywords(reviews.map(r => r.opinion).join(' '));
  const otherKeywords = extractKeywords(otherReviews.map(r => r.opinion).join(' '));

  const overlap = expertKeywords.filter(k => otherKeywords.includes(k)).length;
  const uniqueness = 1 - overlap / expertKeywords.length;

  return Math.min(uniqueness * 5, 5);
}

/**
 * 提取关键词（简化版）
 */
function extractKeywords(text: string): string[] {
  const words = text.split(/[\s,，。！？；：""''（）【】]+/);
  return [...new Set(words.filter(w => w.length >= 4))].slice(0, 20);
}

/**
 * 更新用户满意度指标
 * @param expertId 专家ID
 * @param ratings 用户评分列表
 * @param feedbacks 用户反馈列表
 */
export function updateSatisfactionMetrics(
  expertId: string,
  ratings: number[],
  feedbacks: Array<{ wouldRecommend: boolean; reused: boolean }>
): void {
  const metrics = qualityMetrics.get(expertId);
  if (!metrics) return;

  if (ratings.length > 0) {
    metrics.userSatisfaction.rating =
      ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  // 计算NPS
  const promoters = feedbacks.filter(f => f.wouldRecommend).length;
  const detractors = feedbacks.filter(f => !f.wouldRecommend).length;
  const total = feedbacks.length;
  if (total > 0) {
    metrics.userSatisfaction.NPS = ((promoters - detractors) / total) * 100;
  }

  // 计算重复使用率
  const reusedCount = feedbacks.filter(f => f.reused).length;
  if (total > 0) {
    metrics.userSatisfaction.repeatUsage = reusedCount / total;
  }
}

/**
 * 生成质量报告
 * @param expert 专家
 * @param days 时间范围（天数）
 */
export function generateQualityReport(
  expert: Expert,
  days: number = 30
): QualityReport {
  const metrics = qualityMetrics.get(expert.id);
  if (!metrics) {
    throw new Error(`专家 ${expert.id} 的质量指标未初始化`);
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // 计算趋势
  const trends = calculateTrends(expert.id, days);

  // 计算排名
  const rankings = calculateRankings(expert.id);

  // 生成建议
  const recommendations = generateRecommendations(metrics);

  return {
    expertId: expert.id,
    expertName: expert.name,
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    metrics,
    rankings,
    trends,
    recommendations,
  };
}

/**
 * 计算趋势
 */
function calculateTrends(
  expertId: string,
  days: number
): QualityReport['trends'] {
  // 简化：基于最近验证的预测计算趋势
  const recentPredictions = predictionVerifications.filter(
    p => p.expertId === expertId &&
    p.verifiedAt &&
    new Date(p.verifiedAt) >= new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  );

  if (recentPredictions.length < 3) {
    return { accuracy: 'stable', satisfaction: 'stable', overall: 'stable' };
  }

  const recentAccuracy = recentPredictions
    .slice(-3)
    .reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / 3;

  const olderAccuracy = recentPredictions
    .slice(0, -3)
    .reduce((sum, p) => sum + (p.accuracyScore || 0), 0) /
    Math.max(recentPredictions.length - 3, 1);

  const diff = recentAccuracy - olderAccuracy;

  return {
    accuracy: diff > 0.1 ? 'improving' : diff < -0.1 ? 'declining' : 'stable',
    satisfaction: 'stable', // 简化处理
    overall: diff > 0.05 ? 'improving' : diff < -0.05 ? 'declining' : 'stable',
  };
}

/**
 * 计算排名
 */
function calculateRankings(expertId: string): QualityReport['rankings'] {
  const allMetrics: Array<{ id: string; score: number }> = [];

  qualityMetrics.forEach((m, id) => {
    const score =
      m.predictionAccuracy.overall * 0.4 +
      m.differentiationContribution.insightDepth / 5 * 0.2 +
      m.userSatisfaction.rating / 5 * 0.2 +
      m.actionability.recommendationClarity / 5 * 0.2;
    allMetrics.push({ id, score });
  });

  allMetrics.sort((a, b) => b.score - a.score);

  const overall = allMetrics.findIndex(m => m.id === expertId) + 1;

  // 按领域排名
  const byDomain: Record<string, number> = {};
  const expertMetrics = qualityMetrics.get(expertId);
  if (expertMetrics) {
    Object.keys(expertMetrics.predictionAccuracy.byDomain).forEach(domain => {
      const domainScores: Array<{ id: string; score: number }> = [];
      qualityMetrics.forEach((m, id) => {
        domainScores.push({ id, score: m.predictionAccuracy.byDomain[domain] || 0 });
      });
      domainScores.sort((a, b) => b.score - a.score);
      byDomain[domain] = domainScores.findIndex(s => s.id === expertId) + 1;
    });
  }

  return { overall: overall || allMetrics.length, byDomain };
}

/**
 * 生成改进建议
 */
function generateRecommendations(metrics: ExpertQualityMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.predictionAccuracy.overall < 0.6) {
    recommendations.push('预测准确率有待提升，建议加强数据分析能力');
  }

  if (metrics.differentiationContribution.uniqueness < 3) {
    recommendations.push('观点独特性不足，建议增加差异化视角');
  }

  if (metrics.predictionAccuracy.calibrationScore < 0.7) {
    recommendations.push('预测置信度与实际准确率偏差较大，建议校准预测模型');
  }

  if (metrics.userSatisfaction.NPS < 20) {
    recommendations.push('用户满意度有待提升，建议关注用户反馈');
  }

  if (metrics.actionability.executionFeasibility < 3.5) {
    recommendations.push('建议的可执行性有待加强，建议提供更具体的操作步骤');
  }

  if (recommendations.length === 0) {
    recommendations.push('整体表现良好，建议保持当前水平');
  }

  return recommendations;
}

/**
 * 获取专家质量指标
 * @param expertId 专家ID
 */
export function getExpertQualityMetrics(expertId: string): ExpertQualityMetrics | undefined {
  return qualityMetrics.get(expertId);
}

/**
 * 获取全局质量统计
 */
export function getGlobalQualityStats(): {
  totalExperts: number;
  avgAccuracy: number;
  avgSatisfaction: number;
  topPerformers: string[];
  needImprovement: string[];
} {
  let totalAccuracy = 0;
  let totalSatisfaction = 0;
  let count = 0;

  const performers: Array<{ id: string; score: number }> = [];

  qualityMetrics.forEach((m, id) => {
    totalAccuracy += m.predictionAccuracy.overall;
    totalSatisfaction += m.userSatisfaction.rating;

    const score =
      m.predictionAccuracy.overall * 0.4 +
      m.userSatisfaction.rating / 5 * 0.3 +
      m.differentiationContribution.insightDepth / 5 * 0.3;

    performers.push({ id, score });
    count++;
  });

  performers.sort((a, b) => b.score - a.score);

  return {
    totalExperts: count,
    avgAccuracy: count > 0 ? totalAccuracy / count : 0,
    avgSatisfaction: count > 0 ? totalSatisfaction / count : 0,
    topPerformers: performers.slice(0, 5).map(p => p.id),
    needImprovement: performers.slice(-5).map(p => p.id),
  };
}

/**
 * 导出质量报告（CSV格式）
 * @param expertId 专家ID
 */
export function exportQualityReportCSV(expertId: string): string {
  const metrics = qualityMetrics.get(expertId);
  if (!metrics) return '';

  const lines = [
    '指标类别,指标名称,数值',
    `预测准确性,整体准确率,${(metrics.predictionAccuracy.overall * 100).toFixed(1)}%`,
    `预测准确性,短期准确率,${(metrics.predictionAccuracy.byTimeHorizon.shortTerm * 100).toFixed(1)}%`,
    `预测准确性,中期准确率,${(metrics.predictionAccuracy.byTimeHorizon.mediumTerm * 100).toFixed(1)}%`,
    `预测准确性,长期准确率,${(metrics.predictionAccuracy.byTimeHorizon.longTerm * 100).toFixed(1)}%`,
    `预测准确性,校准分数,${(metrics.predictionAccuracy.calibrationScore * 100).toFixed(1)}%`,
    `差异化贡献,独特性,${metrics.differentiationContribution.uniqueness.toFixed(1)}`,
    `差异化贡献,洞察深度,${metrics.differentiationContribution.insightDepth.toFixed(1)}`,
    `差异化贡献,反向观点胜率,${(metrics.differentiationContribution.contrarianAccuracy * 100).toFixed(1)}%`,
    `时效性价值,早期信号,${metrics.temporalValue.earlySignal.toFixed(1)}月`,
    `时效性价值,趋势判断,${(metrics.temporalValue.trendPersistence * 100).toFixed(1)}%`,
    `可操作性,建议清晰度,${metrics.actionability.recommendationClarity.toFixed(1)}`,
    `用户满意度,平均评分,${metrics.userSatisfaction.rating.toFixed(1)}`,
    `用户满意度,NPS,${metrics.userSatisfaction.NPS.toFixed(0)}`,
  ];

  return lines.join('\n');
}
