// 专家学习进化服务 - Expert Evolution Service
// v5.1.3: 专家能力动态调整和进化机制

import type { Expert } from '../types';

// 专家能力评分接口
export interface ExpertCapabilityScore {
  // 基础能力评分（静态）
  baseCapability: {
    expertise: number; // 专业深度 (0-1)
    influence: number; // 行业影响力 (0-1)
    trackRecord: number; // 历史战绩 (0-1)
  };

  // 动态表现评分
  dynamicPerformance: {
    acceptanceRate: number; // 观点采纳率 (0-1)
    predictionAccuracy: number; // 预测准确率 (0-1)
    userRating: number; // 用户评分 (0-5)
    responseQuality: number; // 响应质量 (0-1)
  };

  // 时效性评分
  temporalScore: {
    recencyDecay: number; // 时效衰减系数 (0-1)
    trendAlignment: number; // 趋势匹配度 (0-1)
    paradigmShift: number; // 范式转换适应 (0-1)
  };

  // 用户偏好匹配
  userPreference: {
    styleMatch: number; // 风格匹配度 (0-1)
    riskAlignment: number; // 风险偏好对齐 (0-1)
    domainRelevance: number; // 领域相关度 (0-1)
  };

  // 综合权重
  overallWeight: number;

  // 更新时间
  updatedAt: string;
}

// 专家反馈记录
export interface ExpertFeedbackRecord {
  id: string;
  expertId: string;
  taskId: string;
  action: 'accepted' | 'partial' | 'ignored';
  userRating?: number; // 1-5星
  feedback?: string;
  timestamp: string;
  domain: string;
  topicKeywords: string[];
}

// 预测记录（用于事后验证）
export interface ExpertPrediction {
  id: string;
  expertId: string;
  content: string;
  confidence: number;
  timeHorizon: 'short' | 'medium' | 'long'; // 短期/中期/长期
  predictedAt: string;
  verifiedAt?: string;
  actualOutcome?: 'correct' | 'partial' | 'incorrect';
  accuracyScore?: number;
}

// 权重配置
const WEIGHT_CONFIG = {
  baseCapability: 0.3,
  dynamicPerformance: 0.4,
  temporalScore: 0.2,
  userPreference: 0.1,
};

// 半衰期配置（天数）
const HALF_LIFE_DAYS = {
  achievement: 365, // 成功案例半衰期1年
  prediction: 180, // 预测记录半衰期6个月
  feedback: 90, // 反馈半衰期3个月
};

// 存储
const capabilityScores: Map<string, ExpertCapabilityScore> = new Map();
const feedbackRecords: ExpertFeedbackRecord[] = [];
const predictionRecords: ExpertPrediction[] = [];

/**
 * 初始化专家能力评分
 * @param expert 专家对象
 */
export function initExpertCapabilityScore(expert: Expert): ExpertCapabilityScore {
  const score: ExpertCapabilityScore = {
    baseCapability: {
      expertise: expert.level === 'senior' ? 0.9 : 0.75,
      influence: expert.level === 'senior' ? 0.85 : 0.7,
      trackRecord: expert.acceptanceRate || 0.7,
    },
    dynamicPerformance: {
      acceptanceRate: expert.acceptanceRate || 0.7,
      predictionAccuracy: 0.7,
      userRating: 4.0,
      responseQuality: 0.8,
    },
    temporalScore: {
      recencyDecay: 1.0,
      trendAlignment: 0.8,
      paradigmShift: 0.75,
    },
    userPreference: {
      styleMatch: 0.8,
      riskAlignment: 0.75,
      domainRelevance: 0.9,
    },
    overallWeight: 0.75,
    updatedAt: new Date().toISOString(),
  };

  // 计算综合权重
  score.overallWeight = calculateOverallWeight(score);
  capabilityScores.set(expert.id, score);

  return score;
}

/**
 * 计算综合权重
 * @param score 能力评分
 */
function calculateOverallWeight(score: ExpertCapabilityScore): number {
  const base =
    (score.baseCapability.expertise +
      score.baseCapability.influence +
      score.baseCapability.trackRecord) /
    3;

  const dynamic =
    (score.dynamicPerformance.acceptanceRate +
      score.dynamicPerformance.predictionAccuracy +
      score.dynamicPerformance.responseQuality) /
    3;

  const temporal =
    (score.temporalScore.recencyDecay +
      score.temporalScore.trendAlignment +
      score.temporalScore.paradigmShift) /
    3;

  const preference =
    (score.userPreference.styleMatch +
      score.userPreference.riskAlignment +
      score.userPreference.domainRelevance) /
    3;

  return (
    base * WEIGHT_CONFIG.baseCapability +
    dynamic * WEIGHT_CONFIG.dynamicPerformance +
    temporal * WEIGHT_CONFIG.temporalScore +
    preference * WEIGHT_CONFIG.userPreference
  );
}

/**
 * 记录用户反馈
 * @param feedback 反馈记录
 */
export function recordExpertFeedback(feedback: Omit<ExpertFeedbackRecord, 'id' | 'timestamp'>): ExpertFeedbackRecord {
  const record: ExpertFeedbackRecord = {
    ...feedback,
    id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  feedbackRecords.push(record);

  // 更新专家动态表现评分
  updateDynamicPerformance(record.expertId);

  return record;
}

/**
 * 更新动态表现评分
 * @param expertId 专家ID
 */
function updateDynamicPerformance(expertId: string): void {
  const expertFeedbacks = feedbackRecords.filter((f) => f.expertId === expertId);
  if (expertFeedbacks.length === 0) return;

  const score = capabilityScores.get(expertId);
  if (!score) return;

  // 计算采纳率
  const acceptedCount = expertFeedbacks.filter((f) => f.action === 'accepted').length;
  const partialCount = expertFeedbacks.filter((f) => f.action === 'partial').length;
  const totalCount = expertFeedbacks.length;

  score.dynamicPerformance.acceptanceRate =
    (acceptedCount + partialCount * 0.5) / totalCount;

  // 计算用户评分
  const ratings = expertFeedbacks
    .filter((f) => f.userRating !== undefined)
    .map((f) => f.userRating!);

  if (ratings.length > 0) {
    score.dynamicPerformance.userRating =
      ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  // 更新综合权重
  score.overallWeight = calculateOverallWeight(score);
  score.updatedAt = new Date().toISOString();
}

/**
 * 记录专家预测
 * @param prediction 预测记录
 */
export function recordExpertPrediction(
  prediction: Omit<ExpertPrediction, 'id' | 'predictedAt'>
): ExpertPrediction {
  const record: ExpertPrediction = {
    ...prediction,
    id: `prediction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    predictedAt: new Date().toISOString(),
  };

  predictionRecords.push(record);
  return record;
}

/**
 * 验证预测准确性
 * @param predictionId 预测ID
 * @param actualOutcome 实际结果
 * @param accuracyScore 准确性分数 (0-1)
 */
export function verifyPrediction(
  predictionId: string,
  actualOutcome: 'correct' | 'partial' | 'incorrect',
  accuracyScore?: number
): void {
  const prediction = predictionRecords.find((p) => p.id === predictionId);
  if (!prediction) return;

  prediction.verifiedAt = new Date().toISOString();
  prediction.actualOutcome = actualOutcome;
  prediction.accuracyScore = accuracyScore || (actualOutcome === 'correct' ? 1 : actualOutcome === 'partial' ? 0.5 : 0);

  // 更新专家预测准确率
  updatePredictionAccuracy(prediction.expertId);
}

/**
 * 更新预测准确率
 * @param expertId 专家ID
 */
function updatePredictionAccuracy(expertId: string): void {
  const expertPredictions = predictionRecords.filter(
    (p) => p.expertId === expertId && p.verifiedAt !== undefined
  );

  if (expertPredictions.length === 0) return;

  const score = capabilityScores.get(expertId);
  if (!score) return;

  // 加权平均（近期预测权重更高）
  let totalWeight = 0;
  let weightedAccuracy = 0;

  expertPredictions.forEach((p) => {
    const daysSince = (Date.now() - new Date(p.predictedAt).getTime()) / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-daysSince * Math.log(2) / HALF_LIFE_DAYS.prediction);

    weightedAccuracy += (p.accuracyScore || 0) * weight;
    totalWeight += weight;
  });

  score.dynamicPerformance.predictionAccuracy =
    totalWeight > 0 ? weightedAccuracy / totalWeight : 0.7;

  score.overallWeight = calculateOverallWeight(score);
  score.updatedAt = new Date().toISOString();
}

/**
 * 计算时效性衰减
 * @param date 日期
 * @param halfLife 半衰期天数
 */
function calculateRecencyDecay(date: string, halfLife: number): number {
  const daysSince = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-daysSince * Math.log(2) / halfLife);
}

/**
 * 更新时效性评分
 * @param expertId 专家ID
 * @param achievements 成功案例列表
 */
export function updateTemporalScore(
  expertId: string,
  achievements: Array<{ date: string }>
): void {
  const score = capabilityScores.get(expertId);
  if (!score) return;

  if (achievements.length > 0) {
    // 计算平均时效衰减
    const avgDecay =
      achievements.reduce((sum, a) => {
        return sum + calculateRecencyDecay(a.date, HALF_LIFE_DAYS.achievement);
      }, 0) / achievements.length;

    score.temporalScore.recencyDecay = avgDecay;
  }

  score.overallWeight = calculateOverallWeight(score);
  score.updatedAt = new Date().toISOString();
}

/**
 * 获取专家能力评分
 * @param expertId 专家ID
 */
export function getExpertCapabilityScore(expertId: string): ExpertCapabilityScore | undefined {
  return capabilityScores.get(expertId);
}

/**
 * 获取所有专家排名
 * @param sortBy 排序字段
 */
export function getExpertRankings(
  sortBy: 'overall' | 'acceptanceRate' | 'predictionAccuracy' | 'userRating' = 'overall'
): Array<{ expertId: string; score: number; rank: number }> {
  const rankings: Array<{ expertId: string; score: number }> = [];

  capabilityScores.forEach((score, expertId) => {
    let value: number;
    switch (sortBy) {
      case 'acceptanceRate':
        value = score.dynamicPerformance.acceptanceRate;
        break;
      case 'predictionAccuracy':
        value = score.dynamicPerformance.predictionAccuracy;
        break;
      case 'userRating':
        value = score.dynamicPerformance.userRating / 5; // 归一化到0-1
        break;
      case 'overall':
      default:
        value = score.overallWeight;
    }
    rankings.push({ expertId, score: value });
  });

  // 排序并添加排名
  return rankings
    .sort((a, b) => b.score - a.score)
    .map((r, index) => ({ ...r, rank: index + 1 }));
}

/**
 * 更新用户偏好匹配
 * @param expertId 专家ID
 * @param preferences 偏好配置
 */
export function updateUserPreference(
  expertId: string,
  preferences: Partial<ExpertCapabilityScore['userPreference']>
): void {
  const score = capabilityScores.get(expertId);
  if (!score) return;

  score.userPreference = { ...score.userPreference, ...preferences };
  score.overallWeight = calculateOverallWeight(score);
  score.updatedAt = new Date().toISOString();
}

/**
 * 定期重新计算所有专家权重
 * 建议每7天执行一次
 */
export function recalculateAllExpertWeights(): void {
  capabilityScores.forEach((score, expertId) => {
    // 重新计算时效性衰减
    score.temporalScore.recencyDecay *= 0.95; // 每周衰减5%

    // 重新计算综合权重
    score.overallWeight = calculateOverallWeight(score);
    score.updatedAt = new Date().toISOString();
  });

  console.log(`[v5.1.3] 已重新计算 ${capabilityScores.size} 位专家权重`);
}

/**
 * 获取专家进化报告
 * @param expertId 专家ID
 * @param days 时间范围（天数）
 */
export function getExpertEvolutionReport(
  expertId: string,
  days: number = 30
): {
  expertId: string;
  period: string;
  scoreChange: number;
  feedbackCount: number;
  acceptanceRate: number;
  trend: 'improving' | 'stable' | 'declining';
} {
  const score = capabilityScores.get(expertId);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentFeedbacks = feedbackRecords.filter(
    (f) => f.expertId === expertId && new Date(f.timestamp) >= cutoffDate
  );

  const acceptedCount = recentFeedbacks.filter((f) => f.action === 'accepted').length;
  const acceptanceRate =
    recentFeedbacks.length > 0 ? acceptedCount / recentFeedbacks.length : 0;

  // 计算趋势（简化版）
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (score) {
    if (acceptanceRate > score.dynamicPerformance.acceptanceRate + 0.1) {
      trend = 'improving';
    } else if (acceptanceRate < score.dynamicPerformance.acceptanceRate - 0.1) {
      trend = 'declining';
    }
  }

  return {
    expertId,
    period: `${days}天`,
    scoreChange: score ? acceptanceRate - score.dynamicPerformance.acceptanceRate : 0,
    feedbackCount: recentFeedbacks.length,
    acceptanceRate,
    trend,
  };
}

/**
 * 获取全局统计数据
 */
export function getGlobalEvolutionStats(): {
  totalExperts: number;
  totalFeedbacks: number;
  totalPredictions: number;
  verifiedPredictions: number;
  avgAcceptanceRate: number;
  avgUserRating: number;
} {
  let totalAcceptanceRate = 0;
  let totalUserRating = 0;
  let count = 0;

  capabilityScores.forEach((score) => {
    totalAcceptanceRate += score.dynamicPerformance.acceptanceRate;
    totalUserRating += score.dynamicPerformance.userRating;
    count++;
  });

  return {
    totalExperts: count,
    totalFeedbacks: feedbackRecords.length,
    totalPredictions: predictionRecords.length,
    verifiedPredictions: predictionRecords.filter((p) => p.verifiedAt).length,
    avgAcceptanceRate: count > 0 ? totalAcceptanceRate / count : 0,
    avgUserRating: count > 0 ? totalUserRating / count : 0,
  };
}
