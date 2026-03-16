// 交叉验证服务 - Cross Validation Service
// FR-015 ~ FR-016: 多来源数据交叉验证

import { getLLMRouter } from '../providers/index.js';

export interface DataPoint {
  id: string;
  metric: string;
  value: number;
  unit?: string;
  source: string;
  url?: string;
  publishedAt?: string;
  credibility: {
    level: string;
    score: number;
  };
}

export interface ValidationResult {
  metric: string;
  values: {
    dataId: string;
    value: number;
    source: string;
    credibility: number;
  }[];
  statistics: {
    min: number;
    max: number;
    mean: number;
    median: number;
    deviation: number;
    deviationPercent: number;
  };
  isConsistent: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  suggestedValue?: number;
  explanation: string;
}

export interface CrossValidationReport {
  validations: ValidationResult[];
  summary: {
    totalMetrics: number;
    consistentMetrics: number;
    inconsistentMetrics: number;
    highRiskCount: number;
  };
}

/**
 * 执行交叉验证
 * 对同一指标的多来源数据进行比对
 */
export async function validateDataPoints(
  dataPoints: DataPoint[]
): Promise<CrossValidationReport> {
  // 按指标分组
  const groupedByMetric = groupByMetric(dataPoints);

  const validations: ValidationResult[] = [];

  for (const [metric, points] of Object.entries(groupedByMetric)) {
    // 只验证有多个来源的指标
    if (points.length < 2) continue;

    const validation = await validateSingleMetric(metric, points);
    validations.push(validation);
  }

  // 生成汇总
  const summary = {
    totalMetrics: validations.length,
    consistentMetrics: validations.filter(v => v.isConsistent).length,
    inconsistentMetrics: validations.filter(v => !v.isConsistent).length,
    highRiskCount: validations.filter(v => v.riskLevel === 'high').length,
  };

  return {
    validations,
    summary,
  };
}

/**
 * 验证单个指标
 */
async function validateSingleMetric(
  metric: string,
  points: DataPoint[]
): Promise<ValidationResult> {
  // 提取数值
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = calculateMedian(values);

  // 计算偏差率
  const deviation = max - min;
  const deviationPercent = (deviation / mean) * 100;

  // 判断是否一致（偏差 > 10% 视为不一致）
  const isConsistent = deviationPercent <= 10;

  // 确定风险等级
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (deviationPercent > 30) riskLevel = 'high';
  else if (deviationPercent > 10) riskLevel = 'medium';

  // 计算建议值（加权平均，权重为可信度分数）
  const weightedSum = points.reduce((sum, p) => sum + p.value * p.credibility.score, 0);
  const weightSum = points.reduce((sum, p) => sum + p.credibility.score, 0);
  const suggestedValue = weightedSum / weightSum;

  // 生成解释
  const explanation = generateExplanation(metric, points, deviationPercent, isConsistent);

  return {
    metric,
    values: points.map(p => ({
      dataId: p.id,
      value: p.value,
      source: p.source,
      credibility: p.credibility.score,
    })),
    statistics: {
      min,
      max,
      mean,
      median,
      deviation,
      deviationPercent: Math.round(deviationPercent * 100) / 100,
    },
    isConsistent,
    riskLevel,
    suggestedValue: Math.round(suggestedValue * 100) / 100,
    explanation,
  };
}

/**
 * 按指标分组数据点
 */
function groupByMetric(dataPoints: DataPoint[]): Record<string, DataPoint[]> {
  const groups: Record<string, DataPoint[]> = {};

  for (const point of dataPoints) {
    // 标准化指标名称
    const normalizedMetric = normalizeMetricName(point.metric);

    if (!groups[normalizedMetric]) {
      groups[normalizedMetric] = [];
    }
    groups[normalizedMetric].push(point);
  }

  return groups;
}

/**
 * 标准化指标名称
 */
function normalizeMetricName(metric: string): string {
  // 简单的标准化处理
  return metric
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
    .replace(/(市场规模|市场容量|市场空间)/g, 'market_size')
    .replace(/(增长率|增速|同比增长)/g, 'growth_rate')
    .replace(/(收入|营收|销售额)/g, 'revenue')
    .replace(/(利润|净利润)/g, 'profit');
}

/**
 * 计算中位数
 */
function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 生成验证解释
 */
function generateExplanation(
  metric: string,
  points: DataPoint[],
  deviationPercent: number,
  isConsistent: boolean
): string {
  const sources = points.map(p => p.source).join('、');

  if (isConsistent) {
    return `✅ ${metric}在${points.length}个来源中数据一致，偏差${deviationPercent.toFixed(1)}%在可接受范围内。来源：${sources}`;
  }

  if (deviationPercent > 30) {
    return `⚠️ ${metric}数据存在较大分歧，偏差达${deviationPercent.toFixed(1)}%。建议核查原始数据来源。来源：${sources}`;
  }

  return `⚡ ${metric}数据略有差异，偏差${deviationPercent.toFixed(1)}%。建议以高可信度来源为准。来源：${sources}`;
}

/**
 * 快速验证单个数值是否合理
 */
export function quickValidate(
  value: number,
  metric: string,
  context?: string
): {
  isReasonable: boolean;
  confidence: 'high' | 'medium' | 'low';
  suggestions: string[];
} {
  const suggestions: string[] = [];
  let isReasonable = true;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  // 检查数值范围是否合理
  if (value < 0) {
    isReasonable = false;
    suggestions.push('数值为负数，请确认是否为同比变化率');
  }

  if (value > 100 && metric.includes('percent')) {
    isReasonable = false;
    suggestions.push('百分比数值超过100%，请确认单位是否正确');
  }

  // 根据上下文判断
  if (context) {
    if (context.includes('亿') && value < 10000) {
      suggestions.push('单位可能不一致，文本提到"亿"但数值较小');
    }
  }

  return {
    isReasonable,
    confidence,
    suggestions,
  };
}

/**
 * 获取验证摘要
 */
export function getValidationSummary(validations: ValidationResult[]): {
  total: number;
  passed: number;
  failed: number;
  highRisk: number;
  avgDeviation: number;
} {
  const total = validations.length;
  const passed = validations.filter(v => v.isConsistent).length;
  const failed = total - passed;
  const highRisk = validations.filter(v => v.riskLevel === 'high').length;
  const avgDeviation = validations.reduce((sum, v) => sum + v.statistics.deviationPercent, 0) / total || 0;

  return {
    total,
    passed,
    failed,
    highRisk,
    avgDeviation: Math.round(avgDeviation * 100) / 100,
  };
}