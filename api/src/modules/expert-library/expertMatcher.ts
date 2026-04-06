// Expert Matcher — 任务-专家智能匹配
// 基于主题、行业、重要性匹配最合适的专家

import type { ExpertEngine } from './ExpertEngine.js';
import type {
  ExpertProfile,
  ExpertLibraryDeps,
  ExpertMatchRequest,
  ExpertMatchResult,
} from './types.js';

export class ExpertMatcher {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 根据任务信息匹配最合适的专家
   */
  async match(request: ExpertMatchRequest): Promise<ExpertMatchResult> {
    const { topic, industry, taskType, importance = 0.5 } = request;

    const allExperts = await this.engine.listExperts();
    if (allExperts.length === 0) {
      return { domainExperts: [], matchReasons: ['暂无可用专家'] };
    }

    // 分离领域专家和特级专家
    const domainExperts = allExperts.filter(e => e.expert_id.startsWith('E'));
    const seniorExperts = allExperts.filter(e => e.expert_id.startsWith('S'));

    // 匹配领域专家
    const scoredDomain = domainExperts.map(expert => {
      const { score, reason } = this.calculateMatchScore(expert, topic, industry, taskType);
      return { expert, matchScore: score, matchReason: reason };
    });

    scoredDomain.sort((a, b) => b.matchScore - a.matchScore);
    const topDomain = scoredDomain.filter(s => s.matchScore > 0).slice(0, 3);

    // 匹配特级专家（仅高重要性任务）
    let seniorMatch: ExpertMatchResult['seniorExpert'] | undefined;
    if (importance >= 0.8 && seniorExperts.length > 0) {
      const scoredSenior = seniorExperts.map(expert => {
        const { score, reason } = this.calculateMatchScore(expert, topic, industry, taskType);
        return { expert, matchScore: score, matchReason: reason };
      });
      scoredSenior.sort((a, b) => b.matchScore - a.matchScore);
      if (scoredSenior[0]?.matchScore > 0) {
        seniorMatch = scoredSenior[0];
      }
    }

    // 生成匹配原因说明
    const matchReasons: string[] = [];
    if (topDomain.length > 0) {
      matchReasons.push(`基于主题「${topic}」匹配了 ${topDomain.length} 位领域专家`);
    }
    if (seniorMatch) {
      matchReasons.push(`任务重要性 ${(importance * 100).toFixed(0)}%，推荐特级专家 ${seniorMatch.expert.name}`);
    }
    if (topDomain.length === 0 && !seniorMatch) {
      matchReasons.push('未找到高度匹配的专家，建议扩大搜索范围');
    }

    return {
      domainExperts: topDomain,
      seniorExpert: seniorMatch,
      matchReasons,
    };
  }

  /**
   * 计算专家与任务的匹配分数
   */
  private calculateMatchScore(
    expert: ExpertProfile,
    topic: string,
    industry?: string,
    taskType?: string
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];
    const topicLower = topic.toLowerCase();

    // 1. 领域匹配 (0-40分) — 双向匹配：主题包含领域 or 领域包含主题关键词
    const domainStr = expert.domain.join(' ').toLowerCase();
    const domainMatches: string[] = [];

    // 正向：专家领域词是否出现在主题中
    for (const d of expert.domain) {
      if (topicLower.includes(d.toLowerCase())) {
        domainMatches.push(d);
      }
    }
    // 反向：主题分词是否匹配领域
    const topicWords = topicLower.split(/[\s,，、/]+/).filter(w => w.length > 1);
    for (const w of topicWords) {
      if (domainStr.includes(w) && !domainMatches.includes(w)) {
        domainMatches.push(w);
      }
    }

    if (domainMatches.length > 0) {
      const domainScore = Math.min(40, domainMatches.length * 15);
      score += domainScore;
      reasons.push(`领域关键词匹配: ${domainMatches.join('、')}`);
    }

    // 2. 行业匹配 (0-20分)
    if (industry) {
      const industryLower = industry.toLowerCase();
      if (domainStr.includes(industryLower) || topicLower.includes(industryLower)) {
        score += 20;
        reasons.push(`行业匹配: ${industry}`);
      }
    }

    // 3. 分析框架相关性 (0-20分)
    const frameworkStr = expert.method.frameworks.join(' ').toLowerCase();
    const frameworkMatches = topicWords.filter(w => frameworkStr.includes(w));
    if (frameworkMatches.length > 0) {
      score += Math.min(20, frameworkMatches.length * 10);
      reasons.push(`方法论契合`);
    }

    // 4. 偏好匹配 (0-10分)
    const biasStr = expert.persona.bias.join(' ').toLowerCase();
    if (topicWords.some(w => biasStr.includes(w)) || expert.persona.bias.some(b => topicLower.includes(b.toLowerCase()))) {
      score += 10;
      reasons.push(`研究偏好匹配`);
    }

    // 5. 任务类型适配 (0-10分)
    if (taskType) {
      const hasEvalLens = !!expert.method.reviewLens;
      if (taskType === 'evaluation' && hasEvalLens) {
        score += 10;
        reasons.push(`具备评估审查能力`);
      } else if (taskType === 'analysis' && expert.method.reasoning) {
        score += 5;
      }
    }

    return {
      score: Math.min(100, score),
      reason: reasons.join('；') || '通用匹配',
    };
  }
}
