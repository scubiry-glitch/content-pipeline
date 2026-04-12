// Zep 可选增强适配器 — 提供降级接口
// 有 Zep 时返回增强数据, 无 Zep 时返回 null (调用方用本地数据)

import {
  isZepEnabled,
  searchGraph,
  searchGraphNodes,
  getEntityEdges,
  getMemoryContext,
  type ZepSearchResult,
} from './zepClient.js';

/** 系统级 Zep User ID (所有内容库数据共用一个 graph) */
const SYSTEM_USER = 'content-pipeline-system';

// ============================================================
// 增强接口 — 调用方用 ?? 降级
// ============================================================

export interface ZepEnhancedRelations {
  /** Zep 发现的关系 (可能包含 N 跳) */
  relations: Array<{
    source: string;
    target: string;
    fact: string;
    validAt?: string;
    invalidAt?: string;
  }>;
  /** 来源标记 */
  source: 'zep';
}

export interface ZepEnhancedContradictions {
  /** Zep 检测到的时间性矛盾 (valid_at 窗口重叠) */
  temporalConflicts: Array<{
    fact: string;
    validAt?: string;
    invalidAt?: string;
    source: string;
    target: string;
  }>;
  source: 'zep';
}

/** 增强实体图谱: 获取 N 跳关系 */
export async function enhanceEntityGraph(
  entityName: string,
  maxFacts = 20
): Promise<ZepEnhancedRelations | null> {
  if (!isZepEnabled()) return null;
  try {
    const result = await getEntityEdges(SYSTEM_USER, entityName, maxFacts);
    if (!result?.facts?.length) return null;
    return {
      relations: result.facts.map(f => ({
        source: f.source_node?.name || '',
        target: f.target_node?.name || '',
        fact: f.fact || f.name || '',
        validAt: f.valid_at,
        invalidAt: f.invalid_at,
      })),
      source: 'zep',
    };
  } catch (err) {
    console.warn('[ZepAdapter] enhanceEntityGraph failed:', err);
    return null;
  }
}

/** 增强矛盾检测: 查找时间性矛盾 */
export async function enhanceContradictions(
  subject: string,
  limit = 10
): Promise<ZepEnhancedContradictions | null> {
  if (!isZepEnabled()) return null;
  try {
    const result = await searchGraph({
      userId: SYSTEM_USER,
      query: subject,
      scope: 'edges',
      maxFacts: limit * 2,
    });
    if (!result?.facts?.length) return null;

    // 检测时间窗口重叠的矛盾
    const conflicts: ZepEnhancedContradictions['temporalConflicts'] = [];
    const facts = result.facts;
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const a = facts[i];
        const b = facts[j];
        // 同一对实体，不同事实内容, 且有一方已失效
        if (a.source_node?.name === b.source_node?.name
          && a.target_node?.name === b.target_node?.name
          && a.fact !== b.fact
          && (a.invalid_at || b.invalid_at)) {
          conflicts.push({
            fact: `${a.fact} ↔ ${b.fact}`,
            validAt: a.valid_at,
            invalidAt: a.invalid_at || b.invalid_at,
            source: a.source_node?.name || '',
            target: a.target_node?.name || '',
          });
        }
      }
    }

    return conflicts.length > 0 ? { temporalConflicts: conflicts, source: 'zep' } : null;
  } catch (err) {
    console.warn('[ZepAdapter] enhanceContradictions failed:', err);
    return null;
  }
}

/** 增强观点演化: 获取事实的时间版本链 */
export async function enhanceBeliefTimeline(
  proposition: string,
  limit = 20
): Promise<Array<{ fact: string; validAt?: string; invalidAt?: string }> | null> {
  if (!isZepEnabled()) return null;
  try {
    const result = await searchGraph({
      userId: SYSTEM_USER,
      query: proposition,
      scope: 'edges',
      maxFacts: limit,
    });
    if (!result?.facts?.length) return null;
    return result.facts
      .filter(f => f.valid_at || f.invalid_at)
      .map(f => ({ fact: f.fact || f.name, validAt: f.valid_at, invalidAt: f.invalid_at }))
      .sort((a, b) => (a.validAt || '').localeCompare(b.validAt || ''));
  } catch (err) {
    console.warn('[ZepAdapter] enhanceBeliefTimeline failed:', err);
    return null;
  }
}

/** 增强跨域关联: Zep 图遍历发现远距离关系 */
export async function enhanceCrossDomain(
  entityName: string,
  limit = 15
): Promise<ZepEnhancedRelations | null> {
  if (!isZepEnabled()) return null;
  try {
    // Zep graph search 天然支持 N 跳, 可以发现远距离关联
    const result = await searchGraph({
      userId: SYSTEM_USER,
      query: `cross-domain connections of ${entityName}`,
      scope: 'edges',
      maxFacts: limit,
    });
    if (!result?.facts?.length) return null;
    return {
      relations: result.facts
        .filter(f => f.source_node?.name !== f.target_node?.name)
        .map(f => ({
          source: f.source_node?.name || '',
          target: f.target_node?.name || '',
          fact: f.fact || f.name || '',
          validAt: f.valid_at,
          invalidAt: f.invalid_at,
        })),
      source: 'zep',
    };
  } catch (err) {
    console.warn('[ZepAdapter] enhanceCrossDomain failed:', err);
    return null;
  }
}

/** Zep 状态检查 (供前端 pipeline 页面显示) */
export async function getZepStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  graphUserId: string;
}> {
  if (!isZepEnabled()) {
    return { enabled: false, connected: false, graphUserId: '' };
  }
  try {
    const result = await searchGraphNodes(SYSTEM_USER, 'test', 1);
    return { enabled: true, connected: result !== null, graphUserId: SYSTEM_USER };
  } catch {
    return { enabled: true, connected: false, graphUserId: SYSTEM_USER };
  }
}
