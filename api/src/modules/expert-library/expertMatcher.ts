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
   * Phase 4 升级：
   *   - calculateMatchScore 新增 mentalModels.applicationContext 匹配（+0-30）
   *   - domainExperts 选取改为"相关度 top N + 认知互补"两步走
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
    // Phase 4: 先取相关度 top N（N=6）做候选池，再用认知互补挑 3
    const candidates = scoredDomain.filter(s => s.matchScore > 0).slice(0, 6);
    const topDomain = this.selectComplementarySet(candidates, 3);

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
      matchReasons.push(`基于主题「${topic}」匹配了 ${topDomain.length} 位领域专家（认知互补优先）`);
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
   * Phase 4: 认知互补选择
   * 从候选池中挑出 count 个专家，最大化 mentalModel 多样性
   *
   * 贪心算法：先选相关度最高的，然后每次从剩余候选中选一个与已选集合
   * "mental model 重叠度最低"的，避免同质化匹配。
   *
   * 对于没有 mentalModels 的旧专家（如 E 系列），退化为按相关度直接选。
   */
  private selectComplementarySet<T extends { expert: ExpertProfile; matchScore: number; matchReason: string }>(
    candidates: T[],
    count: number,
  ): T[] {
    if (candidates.length === 0) return [];
    if (candidates.length <= count) return candidates;

    const selected: T[] = [];
    const remaining = [...candidates];

    // 第 1 位：相关度最高的
    selected.push(remaining.shift()!);

    while (selected.length < count && remaining.length > 0) {
      // 已选集合中的所有 mental model 名称
      const selectedModels = new Set<string>();
      for (const s of selected) {
        const models = s.expert.persona.cognition?.mentalModels ?? [];
        for (const m of models) selectedModels.add(m.name);
      }

      // 对每个候选算一个综合分：相关度（主）+ 认知新颖度（次）
      // 新颖度 = 该候选的 mentalModels 中有多少是已选集合里没有的
      let best: { idx: number; combined: number } | null = null;
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const candModels = cand.expert.persona.cognition?.mentalModels ?? [];
        const novelCount = candModels.filter(m => !selectedModels.has(m.name)).length;
        // 权重：相关度 0.6，认知新颖度 0.4（按 10 分满分归一化）
        const combined = cand.matchScore * 0.6 + novelCount * 10 * 0.4;
        if (!best || combined > best.combined) {
          best = { idx: i, combined };
        }
      }

      if (!best) break;
      selected.push(remaining.splice(best.idx, 1)[0]);
    }

    return selected;
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

    // 6. Phase 4: Mental model applicationContext 匹配 (0-30分)
    //    借助 nuwa 增强字段，判断专家的心智模型是否适用于当前主题
    const mentalModels = expert.persona.cognition?.mentalModels;
    if (mentalModels && mentalModels.length > 0) {
      const mmMatches: string[] = [];
      for (const m of mentalModels) {
        const contextLower = (m.applicationContext || '').toLowerCase();
        // 主题词 vs applicationContext
        for (const w of topicWords) {
          if (contextLower.includes(w)) {
            if (!mmMatches.includes(m.name)) mmMatches.push(m.name);
          }
        }
        // 主题整体 vs applicationContext
        if (contextLower && topicLower.includes(contextLower.slice(0, 6))) {
          if (!mmMatches.includes(m.name)) mmMatches.push(m.name);
        }
      }
      if (mmMatches.length > 0) {
        const mmScore = Math.min(30, mmMatches.length * 10);
        score += mmScore;
        reasons.push(`心智模型可套用: ${mmMatches.slice(0, 2).join('、')}`);
      }
    }

    return {
      score: Math.min(130, score),  // 因新增 mentalModels 维度，上限拉到 130
      reason: reasons.join('；') || '通用匹配',
    };
  }
}
