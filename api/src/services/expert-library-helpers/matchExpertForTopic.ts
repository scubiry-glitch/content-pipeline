// 三个调用点共用: Round 1 orchestrator / Round 2 factExtractor / Round 2 synthesizeInsightsDeep
// 按 topic 找最匹配的一组 CDT 专家

import type { ExpertProfile } from '../../modules/expert-library/types.js';
import { getExpertEngine } from '../../modules/expert-library/singleton.js';
import { ExpertMatcher } from '../../modules/expert-library/expertMatcher.js';

export interface MatchExpertResult {
  primaryExpert?: ExpertProfile;
  complementaryExperts: ExpertProfile[];
  seniorExpert?: ExpertProfile;
  matchReasons: string[];
}

/**
 * 按 topic 找专家集合。全部失败时返回空结果（不抛错）。
 */
export async function matchExpertForTopic(
  topic: string,
  options: {
    industry?: string;
    taskType?: string;
    importance?: number;
    expertId?: string;              // 显式指定则跳过匹配
  } = {},
): Promise<MatchExpertResult> {
  const expertEngine = getExpertEngine();
  if (!expertEngine) {
    return { complementaryExperts: [], matchReasons: ['ExpertEngine not initialized'] };
  }

  // 显式指定 expertId → 加载这一位
  if (options.expertId) {
    try {
      const expert = await expertEngine.loadExpert(options.expertId);
      if (expert) {
        return {
          primaryExpert: expert,
          complementaryExperts: [],
          matchReasons: [`explicit expert_id=${options.expertId}`],
        };
      }
    } catch {
      // fall through to matcher
    }
  }

  if (!topic) {
    return { complementaryExperts: [], matchReasons: ['empty topic'] };
  }

  try {
    const matcher = new ExpertMatcher(expertEngine, expertEngine.getDeps());
    const result = await matcher.match({
      topic,
      industry: options.industry,
      taskType: options.taskType || 'analysis',
      importance: options.importance ?? 0.5,
    });

    const primaryExpert = result.seniorExpert?.expert ?? result.domainExperts[0]?.expert;
    const complementaryExperts = result.domainExperts.slice(1).map((d) => d.expert);

    return {
      primaryExpert,
      complementaryExperts,
      seniorExpert: result.seniorExpert?.expert,
      matchReasons: result.matchReasons,
    };
  } catch (err) {
    return {
      complementaryExperts: [],
      matchReasons: [`matcher failed: ${(err as Error).message}`],
    };
  }
}
