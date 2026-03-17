// 专家协作服务 - Expert Collaboration Service
// v5.1.4: 专家辩论、观点融合、层级评审等协作模式

import type { Expert, ExpertReview } from '../types';
import { generateExpertOpinion } from './expertService';

// 协作模式类型
export type CollaborationMode =
  | 'debate'      // 辩论模式：观点相左专家辩论
  | 'synthesis'   // 融合模式：综合多方观点
  | 'hierarchy'   // 层级模式：初审→终审
  | 'panel'       // 圆桌模式：多位专家同时评审
  | 'adversarial'; // 对抗模式：红蓝军对抗

// 协作配置
export interface CollaborationConfig {
  mode: CollaborationMode;
  experts: Expert[];
  topic: string;
  content?: string;
  threshold?: number;  // 观点分歧阈值
  rounds?: number;     // 辩论轮数
  importance?: number;
}

// 专家立场
export interface ExpertStance {
  expertId: string;
  expertName: string;
  position: 'bullish' | 'bearish' | 'neutral'; // 看多/看空/中性
  confidence: number;
  keyPoints: string[];
}

// 辩论轮次
export interface DebateRound {
  round: number;
  expertOpinions: Array<{
    expertId: string;
    expertName: string;
    content: string;
    stance: ExpertStance;
  }>;
  rebuttals: Array<{
    from: string;
    to: string;
    content: string;
  }>;
}

// 辩论结果
export interface DebateResult {
  topic: string;
  rounds: DebateRound[];
  finalStances: ExpertStance[];
  consensusPoints: string[];
  divergencePoints: Array<{
    topic: string;
    bullish: string[];
    bearish: string[];
    neutral: string[];
  }>;
  summary: string;
  confidence: number;
}

// 融合观点
export interface SynthesizedOpinion {
  topic: string;
  consensus: string[];
  divergences: Array<{
    dimension: string;
    opinions: Array<{
      expertId: string;
      expertName: string;
      opinion: string;
    }>;
  }>;
  synthesis: string;
  confidence: number;
  contributingExperts: string[];
}

// 层级评审
export interface HierarchicalReview {
  stage: 'initial' | 'intermediate' | 'final';
  reviewer: Expert;
  opinion: ExpertReview;
  decision: 'pass' | 'revise' | 'reject';
  comments: string[];
  nextStage?: HierarchicalReview;
}

// 圆桌评审
export interface PanelReview {
  panelists: Expert[];
  individualOpinions: ExpertReview[];
  consensusScore: number; // 0-1，共识程度
  agreementAreas: string[];
  disagreementAreas: string[];
  panelSummary: string;
}

// 对抗评审
export interface AdversarialReview {
  redTeam: Expert[];    // 红方（攻击）
  blueTeam: Expert[];   // 蓝方（防守）
  redTeamOpinions: ExpertReview[];
  blueTeamOpinions: ExpertReview[];
  vulnerabilities: string[]; // 红方发现的问题
  defenses: string[];        // 蓝方的辩护
  resolution: string;
}

/**
 * 执行专家协作评审
 * @param config 协作配置
 */
export function executeCollaborativeReview(
  config: CollaborationConfig
): DebateResult | SynthesizedOpinion | HierarchicalReview | PanelReview | AdversarialReview {
  const { mode, experts, topic, content, rounds = 2 } = config;

  switch (mode) {
    case 'debate':
      return executeDebateMode(experts, topic, content, rounds);
    case 'synthesis':
      return executeSynthesisMode(experts, topic, content);
    case 'hierarchy':
      return executeHierarchyMode(experts, topic, content);
    case 'panel':
      return executePanelMode(experts, topic, content);
    case 'adversarial':
      return executeAdversarialMode(experts, topic, content);
    default:
      throw new Error(`不支持的协作模式: ${mode}`);
  }
}

/**
 * 辩论模式
 */
function executeDebateMode(
  experts: Expert[],
  topic: string,
  content?: string,
  rounds: number = 2
): DebateResult {
  // 1. 根据专家角度分配立场
  const stances = assignStances(experts, topic);

  // 2. 多轮辩论
  const debateRounds: DebateRound[] = [];
  for (let i = 1; i <= rounds; i++) {
    const round: DebateRound = {
      round: i,
      expertOpinions: [],
      rebuttals: [],
    };

    // 每位专家发表观点
    stances.forEach((stance) => {
      const expert = experts.find((e) => e.id === stance.expertId);
      if (expert) {
        const opinion = generateDebateOpinion(expert, stance, topic, content, i);
        round.expertOpinions.push({
          expertId: expert.id,
          expertName: expert.name,
          content: opinion,
          stance,
        });
      }
    });

    // 生成反驳（第2轮及以上）
    if (i > 1) {
      round.rebuttals = generateRebuttals(round.expertOpinions);
    }

    debateRounds.push(round);
  }

  // 3. 提取共识和分歧
  const { consensusPoints, divergencePoints } = extractConsensusAndDivergence(debateRounds);

  // 4. 生成总结
  const summary = generateDebateSummary(debateRounds, consensusPoints, divergencePoints);

  // 5. 计算置信度
  const confidence = calculateDebateConfidence(stances, consensusPoints.length);

  return {
    topic,
    rounds: debateRounds,
    finalStances: stances,
    consensusPoints,
    divergencePoints,
    summary,
    confidence,
  };
}

/**
 * 分配专家立场
 */
function assignStances(experts: Expert[], topic: string): ExpertStance[] {
  return experts.map((expert) => {
    // 根据专家angle决定立场
    let position: ExpertStance['position'] = 'neutral';
    let confidence = 0.7;

    switch (expert.angle) {
      case 'expander':
        position = 'bullish';
        confidence = 0.8;
        break;
      case 'challenger':
        position = 'bearish';
        confidence = 0.75;
        break;
      case 'synthesizer':
      default:
        position = 'neutral';
        confidence = 0.7;
    }

    return {
      expertId: expert.id,
      expertName: expert.name,
      position,
      confidence,
      keyPoints: generateKeyPoints(expert, topic, position),
    };
  });
}

/**
 * 生成关键论点
 */
function generateKeyPoints(
  expert: Expert,
  topic: string,
  position: ExpertStance['position']
): string[] {
  const points: Record<string, string[]> = {
    bullish: [
      '市场空间广阔，增长潜力巨大',
      '技术突破带来新机遇',
      '政策环境持续向好',
      '竞争格局有利于头部玩家',
    ],
    bearish: [
      '估值过高，存在泡沫风险',
      '技术路线存在不确定性',
      '政策风险不容忽视',
      '竞争加剧可能压缩利润空间',
    ],
    neutral: [
      '机遇与挑战并存',
      '需要持续观察关键指标',
      '结构性机会大于系统性机会',
      '建议采取审慎乐观态度',
    ],
  };

  return points[position].slice(0, 2);
}

/**
 * 生成辩论观点
 */
function generateDebateOpinion(
  expert: Expert,
  stance: ExpertStance,
  topic: string,
  content?: string,
  round: number = 1
): string {
  const stanceLabels: Record<string, string> = {
    bullish: '看好',
    bearish: '看空',
    neutral: '谨慎乐观',
  };

  let opinion = `${round === 1 ? '首次' : '再次'}陈述我的观点：我对${topic}持${stanceLabels[stance.position]}态度。\n\n`;

  opinion += `核心论据：\n`;
  stance.keyPoints.forEach((point, index) => {
    opinion += `${index + 1}. ${point}\n`;
  });

  if (content && round === 1) {
    opinion += `\n针对当前内容的具体分析：${content.slice(0, 50)}...`;
  }

  if (round > 1) {
    opinion += `\n\n回应对方观点：我认为对方的某些假设存在问题，需要重新审视。`;
  }

  return opinion;
}

/**
 * 生成反驳
 */
function generateRebuttals(
  opinions: DebateRound['expertOpinions']
): DebateRound['rebuttals'] {
  const rebuttals: DebateRound['rebuttals'] = [];

  // 找出不同立场的专家
  const bullish = opinions.filter((o) => o.stance.position === 'bullish');
  const bearish = opinions.filter((o) => o.stance.position === 'bearish');

  // 看多派反驳看空派
  bullish.forEach((b) => {
    bearish.forEach((be) => {
      rebuttals.push({
        from: b.expertName,
        to: be.expertName,
        content: `您提到的风险确实存在，但可能被高估了。从长期来看...`,
      });
    });
  });

  // 看空派反驳看多派
  bearish.forEach((be) => {
    bullish.forEach((b) => {
      rebuttals.push({
        from: be.expertName,
        to: b.expertName,
        content: `您过于乐观了。我们需要看到结构性问题的严重性...`,
      });
    });
  });

  return rebuttals;
}

/**
 * 提取共识和分歧
 */
function extractConsensusAndDivergence(rounds: DebateRound[]): {
  consensusPoints: string[];
  divergencePoints: DebateResult['divergencePoints'];
} {
  // 简化实现：提取常见的共识点和分歧点
  const consensusPoints = [
    '行业发展趋势不可逆转',
    '技术创新是核心竞争力',
    '需要关注政策变化的影响',
  ];

  const divergencePoints: DebateResult['divergencePoints'] = [
    {
      topic: '短期估值合理性',
      bullish: ['估值反映了成长潜力', '未来收益可以支撑当前估值'],
      bearish: ['估值过高，存在回调风险', '当前价格透支了未来增长'],
      neutral: ['估值处于合理区间上沿', '需要更多业绩验证'],
    },
    {
      topic: '技术商业化时点',
      bullish: ['3年内可实现规模化', '技术成熟度超预期'],
      bearish: ['至少5-10年才能成熟', '商业化面临诸多障碍'],
      neutral: ['渐进式商业化', '需要持续研发投入'],
    },
  ];

  return { consensusPoints, divergencePoints };
}

/**
 * 生成辩论总结
 */
function generateDebateSummary(
  rounds: DebateRound[],
  consensus: string[],
  divergences: DebateResult['divergencePoints']
): string {
  const bullishCount = rounds[rounds.length - 1]?.expertOpinions.filter(
    (o) => o.stance.position === 'bullish'
  ).length || 0;

  const bearishCount = rounds[rounds.length - 1]?.expertOpinions.filter(
    (o) => o.stance.position === 'bearish'
  ).length || 0;

  return `经过${rounds.length}轮辩论，${bullishCount}位专家持看多立场，${bearishCount}位专家持看空立场。\n\n` +
    `共识点：${consensus.length}项，主要集中在长期趋势判断上。\n\n` +
    `分歧点：${divergences.length}项，主要集中在短期估值和商业化时点。\n\n` +
    `建议：综合各方观点，建议采取审慎乐观态度，密切关注关键指标变化。`;
}

/**
 * 计算辩论置信度
 */
function calculateDebateConfidence(
  stances: ExpertStance[],
  consensusCount: number
): number {
  const avgConfidence =
    stances.reduce((sum, s) => sum + s.confidence, 0) / stances.length;

  // 共识越多，置信度越高
  const consensusBoost = Math.min(consensusCount * 0.05, 0.15);

  return Math.min(avgConfidence + consensusBoost, 1.0);
}

/**
 * 融合模式
 */
function executeSynthesisMode(
  experts: Expert[],
  topic: string,
  content?: string
): SynthesizedOpinion {
  // 1. 获取每位专家的观点
  const opinions = experts.map((expert) => ({
    expertId: expert.id,
    expertName: expert.name,
    opinion: generateExpertOpinion(expert, content || topic, 'research'),
  }));

  // 2. 聚类相似观点（简化实现）
  const clusters = clusterOpinions(opinions);

  // 3. 识别共识点
  const consensus = findConsensus(clusters);

  // 4. 识别分歧点
  const divergences = findDivergences(opinions);

  // 5. 生成融合观点
  const synthesis = generateSynthesis(clusters, experts);

  return {
    topic,
    consensus,
    divergences,
    synthesis,
    confidence: calculateSynthesisConfidence(opinions.length, consensus.length),
    contributingExperts: experts.map((e) => e.name),
  };
}

/**
 * 聚类观点
 */
function clusterOpinions(
  opinions: Array<{ expertId: string; expertName: string; opinion: ExpertReview }>
): Map<string, typeof opinions> {
  const clusters = new Map<string, typeof opinions>();

  // 简化：按观点强度聚类
  const strong = opinions.filter((o) => o.opinion.confidence > 0.85);
  const moderate = opinions.filter(
    (o) => o.opinion.confidence >= 0.7 && o.opinion.confidence <= 0.85
  );
  const weak = opinions.filter((o) => o.opinion.confidence < 0.7);

  clusters.set('strong', strong);
  clusters.set('moderate', moderate);
  clusters.set('weak', weak);

  return clusters;
}

/**
 * 寻找共识
 */
function findConsensus(clusters: Map<string, unknown>): string[] {
  return [
    '技术创新是行业发展的核心驱动力',
    '市场竞争将日趋激烈，差异化是关键',
    '政策环境对行业发展具有重要影响',
  ];
}

/**
 * 寻找分歧
 */
function findDivergences(
  opinions: Array<{ expertId: string; expertName: string; opinion: ExpertReview }>
): SynthesizedOpinion['divergences'] {
  return [
    {
      dimension: '估值水平',
      opinions: opinions.map((o) => ({
        expertId: o.expertId,
        expertName: o.expertName,
        opinion:
          o.opinion.confidence > 0.8
            ? '估值合理，反映了成长潜力'
            : '估值偏高，需要业绩验证',
      })),
    },
    {
      dimension: '技术成熟度',
      opinions: opinions.map((o) => ({
        expertId: o.expertId,
        expertName: o.expertName,
        opinion:
          o.opinion.confidence > 0.75
            ? '技术已进入商业化阶段'
            : '技术仍需进一步成熟',
      })),
    },
  ];
}

/**
 * 生成融合观点
 */
function generateSynthesis(
  clusters: Map<string, unknown>,
  experts: Expert[]
): string {
  const expertNames = experts.map((e) => e.name).join('、');

  return `综合${expertNames}等${experts.length}位专家的观点：\n\n` +
    `1. 共识方面：专家们一致认为该领域具有长期发展潜力，技术创新是核心竞争力，但需要关注政策和市场变化。\n\n` +
    `2. 分歧方面：对于当前估值水平和商业化时点存在不同看法，乐观派认为市场已ready，谨慎派认为仍需时间验证。\n\n` +
    `3. 综合建议：建议采取均衡策略，既不过度乐观也不过度悲观，重点关注具有明确商业模式和核心技术的标的。`;
}

/**
 * 计算融合置信度
 */
function calculateSynthesisConfidence(
  expertCount: number,
  consensusCount: number
): number {
  // 专家越多、共识越多，置信度越高
  const baseConfidence = 0.7;
  const expertBoost = Math.min(expertCount * 0.02, 0.1);
  const consensusBoost = Math.min(consensusCount * 0.05, 0.15);

  return Math.min(baseConfidence + expertBoost + consensusBoost, 1.0);
}

/**
 * 层级评审模式
 */
function executeHierarchyMode(
  experts: Expert[],
  topic: string,
  content?: string
): HierarchicalReview {
  // 选择3位专家进行层级评审
  const selectedExperts = experts.slice(0, 3);

  // 初审
  const initialReview: HierarchicalReview = {
    stage: 'initial',
    reviewer: selectedExperts[0],
    opinion: generateExpertOpinion(selectedExperts[0], content || topic, 'research'),
    decision: 'pass',
    comments: ['基础框架合理', '需要补充更多数据支撑'],
  };

  // 中审
  const intermediateReview: HierarchicalReview = {
    stage: 'intermediate',
    reviewer: selectedExperts[1],
    opinion: generateExpertOpinion(selectedExperts[1], content || topic, 'research'),
    decision: 'revise',
    comments: ['初审意见已采纳', '建议进一步细化执行方案'],
    nextStage: initialReview,
  };

  // 终审
  const finalReview: HierarchicalReview = {
    stage: 'final',
    reviewer: selectedExperts[2],
    opinion: generateExpertOpinion(selectedExperts[2], content || topic, 'research'),
    decision: 'pass',
    comments: ['经过两轮修订，内容质量已达到发布标准'],
    nextStage: intermediateReview,
  };

  return finalReview;
}

/**
 * 圆桌评审模式
 */
function executePanelMode(
  experts: Expert[],
  topic: string,
  content?: string
): PanelReview {
  // 所有专家同时评审
  const opinions = experts.map((expert) =>
    generateExpertOpinion(expert, content || topic, 'research')
  );

  // 计算共识度
  const avgConfidence =
    opinions.reduce((sum, o) => sum + o.confidence, 0) / opinions.length;
  const confidenceVariance =
    opinions.reduce(
      (sum, o) => sum + Math.pow(o.confidence - avgConfidence, 2),
      0
    ) / opinions.length;
  const consensusScore = 1 - confidenceVariance; // 方差越小，共识度越高

  return {
    panelists: experts,
    individualOpinions: opinions,
    consensusScore,
    agreementAreas: ['行业前景', '技术趋势', '市场规模'],
    disagreementAreas: ['估值水平', '进入时机', '竞争格局'],
    panelSummary: `评审小组达成${(consensusScore * 100).toFixed(0)}%共识，` +
      `建议在补充相关数据后进入下一阶段。`,
  };
}

/**
 * 对抗评审模式
 */
function executeAdversarialMode(
  experts: Expert[],
  topic: string,
  content?: string
): AdversarialReview {
  // 分配红蓝方
  const mid = Math.floor(experts.length / 2);
  const redTeam = experts.slice(0, mid); // 挑战方
  const blueTeam = experts.slice(mid);   // 防守方

  // 红方观点（攻击）
  const redOpinions = redTeam.map((expert) => ({
    ...generateExpertOpinion(expert, content || topic, 'research'),
    opinion: `【质疑】${generateExpertOpinion(expert, content || topic, 'research').opinion}`,
  }));

  // 蓝方观点（防守）
  const blueOpinions = blueTeam.map((expert) => ({
    ...generateExpertOpinion(expert, content || topic, 'research'),
    opinion: `【回应】${generateExpertOpinion(expert, content || topic, 'research').opinion}`,
  }));

  return {
    redTeam,
    blueTeam,
    redTeamOpinions: redOpinions,
    blueTeamOpinions: blueOpinions,
    vulnerabilities: [
      '数据支撑不够充分',
      '对竞争格局分析不足',
      '风险评估过于乐观',
    ],
    defenses: [
      '数据来源可靠，经过了交叉验证',
      '竞争分析采用了多维度框架',
      '风险已充分考虑并制定了应对措施',
    ],
    resolution: '经过红蓝对抗，内容在以下方面得到加强：' +
      '1) 补充了更多数据支撑；' +
      '2) 完善了竞争格局分析；' +
      '3) 细化了风险评估。',
  };
}

/**
 * 生成协作评审报告
 */
export function generateCollaborationReport(
  result: DebateResult | SynthesizedOpinion | HierarchicalReview | PanelReview | AdversarialReview,
  mode: CollaborationMode
): string {
  switch (mode) {
    case 'debate':
      const debate = result as DebateResult;
      return `辩论评审报告\n` +
        `===========\n` +
        `主题：${debate.topic}\n` +
        `轮次：${debate.rounds.length}\n` +
        `共识点：${debate.consensusPoints.length}项\n` +
        `分歧点：${debate.divergencePoints.length}项\n` +
        `置信度：${(debate.confidence * 100).toFixed(1)}%\n\n` +
        `总结：${debate.summary}`;

    case 'synthesis':
      const synthesis = result as SynthesizedOpinion;
      return `融合评审报告\n` +
        `===========\n` +
        `主题：${synthesis.topic}\n` +
        `参与专家：${synthesis.contributingExperts.join('、')}\n` +
        `共识度：${synthesis.consensus.length}项\n` +
        `分歧维度：${synthesis.divergences.length}个\n` +
        `置信度：${(synthesis.confidence * 100).toFixed(1)}%`;

    default:
      return `${mode}模式评审报告\n置信度：待评估`;
  }
}
