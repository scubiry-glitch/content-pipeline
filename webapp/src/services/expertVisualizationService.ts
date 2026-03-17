// 专家可视化服务 - Expert Visualization Service
// v5.1.5: 思维导图、观点热力图、时间线对比等可视化组件

import type { Expert, ExpertReview } from '../types';

// ==================== 思维导图 ====================

export interface ThinkingMap {
  root: string;
  branches: Array<{
    dimension: string;
    analysis: string;
    conclusion: string;
    confidence: number;
    subBranches?: Array<{
      aspect: string;
      detail: string;
    }>;
  }>;
}

/**
 * 生成思维导图数据
 * @param expert 专家
 * @param topic 主题
 * @param opinion 观点内容
 */
export function generateThinkingMap(
  expert: Expert,
  topic: string,
  opinion: string
): ThinkingMap {
  const dimensions = expert.reviewDimensions.slice(0, 4);

  return {
    root: topic,
    branches: dimensions.map((dim, index) => ({
      dimension: dim,
      analysis: generateDimensionAnalysis(dim, opinion),
      conclusion: generateDimensionConclusion(dim),
      confidence: 0.7 + Math.random() * 0.25,
      subBranches: generateSubBranches(dim),
    })),
  };
}

function generateDimensionAnalysis(dimension: string, opinion: string): string {
  const analyses: Record<string, string> = {
    战略: '从长期战略视角分析，该方向符合行业发展趋势',
    市场: '市场规模测算显示潜在空间约为当前3-5倍',
    产品: '产品成熟度处于早期阶段，需要持续迭代',
    运营: '运营效率是关键变量，需要关注单位经济模型',
    技术: '技术路线基本可行，但仍有关键节点需要突破',
    财务: '财务模型健康，现金流状况良好',
  };
  return analyses[dimension] || `从${dimension}角度分析，存在机遇与挑战`;
}

function generateDimensionConclusion(dimension: string): string {
  const conclusions: Record<string, string> = {
    战略: '战略方向正确，建议继续投入',
    市场: '市场空间足够大，但需要差异化定位',
    产品: '产品需要更多用户验证',
    运营: '运营效率有提升空间',
    技术: '技术风险可控，建议持续投入研发',
    财务: '财务状况稳健，可以支撑扩张',
  };
  return conclusions[dimension] || `${dimension}方面需要持续关注`;
}

function generateSubBranches(dimension: string): Array<{ aspect: string; detail: string }> {
  const subBranches: Record<string, Array<{ aspect: string; detail: string }>> = {
    战略: [
      { aspect: '竞争格局', detail: '头部集中趋势明显' },
      { aspect: '进入壁垒', detail: '技术和资金壁垒较高' },
    ],
    市场: [
      { aspect: '用户画像', detail: '以25-35岁用户为主' },
      { aspect: '增长驱动', detail: '产品创新和渠道拓展' },
    ],
    产品: [
      { aspect: '核心功能', detail: '已覆盖主要使用场景' },
      { aspect: '用户体验', detail: '仍有优化空间' },
    ],
    技术: [
      { aspect: '技术架构', detail: '采用微服务架构' },
      { aspect: '技术债务', detail: '需要定期重构' },
    ],
  };
  return subBranches[dimension] || [{ aspect: '关键指标', detail: '需要持续监控' }];
}

// ==================== 观点热力图 ====================

export interface OpinionHeatmap {
  dimensions: string[];
  experts: Array<{
    id: string;
    name: string;
  }>;
  matrix: number[][]; // [expertIndex][dimensionIndex] = score (0-5)
}

/**
 * 生成观点热力图数据
 * @param experts 专家列表
 * @param dimensions 分析维度
 */
export function generateOpinionHeatmap(
  experts: Expert[],
  dimensions: string[]
): OpinionHeatmap {
  const matrix: number[][] = experts.map((expert) => {
    return dimensions.map((dim) => {
      // 基于专家在该维度的自信程度生成分数
      const hasDimension = expert.reviewDimensions.includes(dim);
      const baseScore = hasDimension ? 3 : 1;
      const randomVariation = Math.random() * 2;
      return Math.min(baseScore + randomVariation, 5);
    });
  });

  return {
    dimensions,
    experts: experts.map((e) => ({ id: e.id, name: e.name })),
    matrix,
  };
}

// ==================== 时间线对比 ====================

export interface TimelineComparison {
  events: Array<{
    date: string;
    expert: string;
    expertId: string;
    opinion: string;
    accuracy: number; // 0-1，事后验证准确率
    outcome?: 'correct' | 'partial' | 'incorrect';
  }>;
}

/**
 * 生成时间线对比数据
 * @param expertId 专家ID
 * @param months 时间范围（月）
 */
export function generateTimelineComparison(
  expertId: string,
  expertName: string,
  months: number = 6
): TimelineComparison {
  const events: TimelineComparison['events'] = [];
  const now = new Date();

  for (let i = 0; i < months; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);

    const outcomes: Array<'correct' | 'partial' | 'incorrect'> = ['correct', 'correct', 'partial', 'incorrect'];
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const accuracy = outcome === 'correct' ? 0.9 : outcome === 'partial' ? 0.6 : 0.3;

    events.push({
      date: date.toISOString().split('T')[0],
      expert: expertName,
      expertId,
      opinion: generateHistoricalOpinion(i),
      accuracy,
      outcome,
    });
  }

  return { events };
}

function generateHistoricalOpinion(index: number): string {
  const opinions = [
    '看好新能源赛道，认为光伏成本将持续下降',
    '建议关注储能领域的投资机会',
    '认为AI应用将在未来6个月内爆发',
    '提醒注意宏观政策变化的影响',
    '建议关注产业链上游的机会',
    '认为当前估值已反映大部分预期',
  ];
  return opinions[index % opinions.length];
}

// ==================== 专家能力雷达图 ====================

export interface ExpertRadar {
  dimensions: string[];
  scores: number[]; // 0-100
  benchmark: number[]; // 行业基准
  expertName: string;
}

/**
 * 生成专家能力雷达图数据
 * @param expert 专家
 */
export function generateExpertRadar(expert: Expert): ExpertRadar {
  const dimensions = ['专业深度', '预测准确', '观点独特', '响应速度', '用户满意', '领域覆盖'];

  const scores = [
    expert.level === 'senior' ? 90 : 75, // 专业深度
    Math.round((expert.acceptanceRate || 0.7) * 100), // 预测准确
    70 + Math.random() * 20, // 观点独特
    Math.round(100 - (expert.avgResponseTime / 48) * 100), // 响应速度
    Math.round((expert.acceptanceRate || 0.7) * 100), // 用户满意
    Math.min(expert.reviewDimensions.length * 15, 100), // 领域覆盖
  ];

  const benchmark = [70, 65, 60, 70, 68, 55]; // 行业基准

  return {
    dimensions,
    scores,
    benchmark,
    expertName: expert.name,
  };
}

// ==================== 观点分布热力图（立场分布） ====================

export interface StanceDistribution {
  topic: string;
  bullish: Array<{ expertId: string; name: string; strength: number }>;
  bearish: Array<{ expertId: string; name: string; strength: number }>;
  neutral: Array<{ expertId: string; name: string; strength: number }>;
  averageScore: number; // 0-5，平均立场
}

/**
 * 生成观点立场分布
 * @param experts 专家列表
 * @param topic 主题
 */
export function generateStanceDistribution(
  experts: Expert[],
  topic: string
): StanceDistribution {
  const bullish: StanceDistribution['bullish'] = [];
  const bearish: StanceDistribution['bearish'] = [];
  const neutral: StanceDistribution['neutral'] = [];

  let totalScore = 0;

  experts.forEach((expert) => {
    const score = 2 + Math.random() * 2; // 2-4随机分数
    totalScore += score;

    const entry = { expertId: expert.id, name: expert.name, strength: score };

    if (expert.angle === 'expander') {
      bullish.push({ ...entry, strength: 3.5 + Math.random() * 1.5 });
    } else if (expert.angle === 'challenger') {
      bearish.push({ ...entry, strength: 3.5 + Math.random() * 1.5 });
    } else {
      neutral.push(entry);
    }
  });

  return {
    topic,
    bullish,
    bearish,
    neutral,
    averageScore: totalScore / experts.length,
  };
}

// ==================== 评审质量仪表盘 ====================

export interface QualityDashboard {
  expertId: string;
  expertName: string;
  // 预测准确率趋势
  accuracyTrend: Array<{
    month: string;
    accuracy: number;
    benchmark: number;
  }>;
  // 分领域表现
  domainPerformance: Array<{
    domain: string;
    score: number;
    reviewCount: number;
  }>;
  // 差异化贡献
  differentiation: {
    uniqueness: number;
    insightDepth: number;
    contrarianWinRate: number;
    informationValue: number;
  };
  // 时效性价值
  temporalValue: {
    earlySignal: number; // 提前识别月数
    trendAccuracy: number;
    turningPoint: number;
  };
  // 用户反馈
  userFeedback: {
    rating: number;
    nps: number;
    repeatUsage: number;
  };
}

/**
 * 生成质量仪表盘数据
 * @param expert 专家
 */
export function generateQualityDashboard(expert: Expert): QualityDashboard {
  const now = new Date();
  const accuracyTrend: QualityDashboard['accuracyTrend'] = [];

  for (let i = 3; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    accuracyTrend.push({
      month: `${date.getMonth() + 1}月`,
      accuracy: 0.65 + Math.random() * 0.15,
      benchmark: 0.58,
    });
  }

  return {
    expertId: expert.id,
    expertName: expert.name,
    accuracyTrend,
    domainPerformance: [
      { domain: expert.domainName, score: 85, reviewCount: expert.totalReviews },
      { domain: '关联领域1', score: 62, reviewCount: Math.floor(expert.totalReviews * 0.3) },
      { domain: '关联领域2', score: 55, reviewCount: Math.floor(expert.totalReviews * 0.2) },
    ],
    differentiation: {
      uniqueness: 4.2,
      insightDepth: 4.8,
      contrarianWinRate: 0.68,
      informationValue: 4.5,
    },
    temporalValue: {
      earlySignal: 2.3,
      trendAccuracy: 0.78,
      turningPoint: 0.72,
    },
    userFeedback: {
      rating: 4.6,
      nps: 42,
      repeatUsage: 0.73,
    },
  };
}

// ==================== 协作评审可视化 ====================

export interface CollaborationVisual {
  mode: 'debate' | 'synthesis' | 'panel';
  participants: Array<{
    expertId: string;
    name: string;
    avatar?: string;
    stance: 'bullish' | 'bearish' | 'neutral';
  }>;
  consensusGraph: {
    nodes: Array<{ id: string; label: string; size: number }>;
    edges: Array<{ from: string; to: string; weight: number }>;
  };
  timeline: Array<{
    timestamp: string;
    event: string;
    expertId?: string;
  }>;
}

/**
 * 生成协作评审可视化数据
 * @param experts 参与专家
 * @param mode 协作模式
 */
export function generateCollaborationVisual(
  experts: Expert[],
  mode: 'debate' | 'synthesis' | 'panel'
): CollaborationVisual {
  const participants = experts.map((expert) => ({
    expertId: expert.id,
    name: expert.name,
    stance: (expert.angle === 'expander'
      ? 'bullish'
      : expert.angle === 'challenger'
      ? 'bearish'
      : 'neutral') as CollaborationVisual['participants'][0]['stance'],
  }));

  return {
    mode,
    participants,
    consensusGraph: {
      nodes: experts.map((e) => ({
        id: e.id,
        label: e.name,
        size: e.level === 'senior' ? 30 : 20,
      })),
      edges: generateConsensusEdges(experts),
    },
    timeline: [
      { timestamp: new Date().toISOString(), event: '评审开始' },
      { timestamp: new Date(Date.now() + 60000).toISOString(), event: '第一轮观点收集完成' },
      { timestamp: new Date(Date.now() + 120000).toISOString(), event: '共识分析完成' },
    ],
  };
}

function generateConsensusEdges(experts: Expert[]): Array<{ from: string; to: string; weight: number }> {
  const edges: Array<{ from: string; to: string; weight: number }> = [];

  for (let i = 0; i < experts.length; i++) {
    for (let j = i + 1; j < experts.length; j++) {
      edges.push({
        from: experts[i].id,
        to: experts[j].id,
        weight: 0.3 + Math.random() * 0.5,
      });
    }
  }

  return edges;
}

// ==================== 导出可视化数据 ====================

export interface VisualizationExport {
  type: 'thinking-map' | 'heatmap' | 'timeline' | 'radar' | 'dashboard';
  data: unknown;
  metadata: {
    generatedAt: string;
    expertCount: number;
    topic?: string;
  };
}

/**
 * 导出可视化数据（用于外部图表库）
 * @param type 可视化类型
 * @param data 数据
 */
export function exportVisualization(
  type: VisualizationExport['type'],
  data: unknown,
  topic?: string
): VisualizationExport {
  return {
    type,
    data,
    metadata: {
      generatedAt: new Date().toISOString(),
      expertCount: Array.isArray(data) ? data.length : 1,
      topic,
    },
  };
}
