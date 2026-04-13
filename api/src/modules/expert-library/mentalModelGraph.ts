// Mental Model Graph — 跨专家 mentalModel 共享索引 (Phase 8)
// 把分散在各个 ExpertProfile 里的 mentalModels 聚合为 Map<modelName, entry>
// 支持反向查询："哪些专家提到了'飞轮效应'"，以及用于下游 mental model catalog (Phase 10)

import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertProfile, MentalModel } from './types.js';

export interface MentalModelGraphEntry {
  /** 模型名称（唯一 key）*/
  name: string;
  /** 提及此模型的专家汇总 */
  experts: Array<{
    expert_id: string;
    expert_name: string;
    summary: string;
    evidence: string[];
    applicationContext: string;
    failureCondition: string;
  }>;
  /** 该模型被多少位专家提及 */
  expertCount: number;
  /** 是否跨多位专家共享（>=2）*/
  isShared: boolean;
}

/**
 * 构建全局 mental model 图谱
 *
 * 实现说明：
 * - 调用 engine.listExperts() 拉取所有专家
 * - 遍历每个专家的 persona.cognition.mentalModels
 * - 按 name 聚合
 * - 同 name 不同细节也会合并到同一个 entry 下
 *
 * 性能：O(专家数 × 每位专家心智模型数)，在 ~30 位专家下可忽略
 *
 * 注意：本函数每次调用都重新扫描，由调用方负责缓存。
 * router.ts 中的端点应该在 engine 初始化后构建一次并缓存。
 */
export async function buildMentalModelGraph(
  engine: ExpertEngine,
): Promise<Map<string, MentalModelGraphEntry>> {
  const allExperts = await engine.listExperts();
  const graph = new Map<string, MentalModelGraphEntry>();

  for (const expert of allExperts) {
    const models = expert.persona.cognition?.mentalModels;
    if (!models || models.length === 0) continue;

    for (const m of models) {
      const normalized = normalizeName(m.name);
      if (!normalized) continue;

      let entry = graph.get(normalized);
      if (!entry) {
        entry = {
          name: m.name,
          experts: [],
          expertCount: 0,
          isShared: false,
        };
        graph.set(normalized, entry);
      }

      entry.experts.push({
        expert_id: expert.expert_id,
        expert_name: expert.name,
        summary: m.summary,
        evidence: [...m.evidence],
        applicationContext: m.applicationContext,
        failureCondition: m.failureCondition,
      });
      entry.expertCount = entry.experts.length;
      entry.isShared = entry.expertCount >= 2;
    }
  }

  return graph;
}

/**
 * 根据模型名查找相关专家（精确匹配，大小写敏感但空格不敏感）
 */
export function findExpertsByModel(
  graph: Map<string, MentalModelGraphEntry>,
  modelName: string,
): MentalModelGraphEntry | undefined {
  const normalized = normalizeName(modelName);
  return graph.get(normalized);
}

/**
 * 列出所有被 >=2 位专家共享的模型（即 isShared=true 的 entries）
 * 按被引用次数降序
 */
export function listSharedModels(
  graph: Map<string, MentalModelGraphEntry>,
): MentalModelGraphEntry[] {
  return Array.from(graph.values())
    .filter(e => e.isShared)
    .sort((a, b) => b.expertCount - a.expertCount);
}

/**
 * 列出所有模型（含独有和共享）
 */
export function listAllModels(
  graph: Map<string, MentalModelGraphEntry>,
): MentalModelGraphEntry[] {
  return Array.from(graph.values()).sort((a, b) => b.expertCount - a.expertCount);
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, '');
}
