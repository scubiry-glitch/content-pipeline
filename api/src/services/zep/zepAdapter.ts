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

/** 将 Zep 返回的 facts 转为 relations（复用） */
function factsToRelations(
  facts: NonNullable<ZepSearchResult['facts']>
): ZepEnhancedRelations['relations'] {
  return facts
    .filter((f) => f.source_node?.name && f.target_node?.name && f.source_node.name !== f.target_node.name)
    .map((f) => ({
      source: f.source_node?.name || '',
      target: f.target_node?.name || '',
      fact: f.fact || f.name || '',
      validAt: f.valid_at,
      invalidAt: f.invalid_at,
    }));
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
      reranker: 'episode_mentions',
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
      reranker: 'episode_mentions',
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

/** 增强跨域关联: Zep 图遍历发现远距离关系
 *  回填内容为中文事实，英文 query「cross-domain connections of X」对中文实体几乎命中不了；
 *  与实体图谱页一致：优先 getEntityEdges(episode_mentions)，再尝试中文语义补充检索。
 */
export async function enhanceCrossDomain(
  entityName: string,
  limit = 15
): Promise<ZepEnhancedRelations | null> {
  if (!isZepEnabled()) return null;
  try {
    const primary = await getEntityEdges(SYSTEM_USER, entityName, limit);
    if (primary?.facts?.length) {
      return { relations: factsToRelations(primary.facts), source: 'zep' };
    }

    const fallback = await searchGraph({
      userId: SYSTEM_USER,
      query: `与「${entityName}」相关的事实、实体关联与跨领域关系`,
      scope: 'edges',
      maxFacts: limit,
      reranker: 'episode_mentions',
    });
    if (fallback?.facts?.length) {
      return { relations: factsToRelations(fallback.facts), source: 'zep' };
    }

    return null;
  } catch (err) {
    console.warn('[ZepAdapter] enhanceCrossDomain failed:', err);
    return null;
  }
}

/** Zep 状态检查 (供前端 pipeline 页面显示)
 *  用 GET /api/v2/users 检测 API Key 是否有效，不依赖系统用户是否存在
 */
export async function getZepStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  graphUserId: string;
  userExists?: boolean;
}> {
  if (!isZepEnabled()) {
    return { enabled: false, connected: false, graphUserId: '' };
  }

  const apiKey = process.env.ZEP_API_KEY!;
  const baseUrl = process.env.ZEP_BASE_URL || 'https://api.getzep.com';

  try {
    // 用列出用户接口验证 API Key 有效性 (不依赖系统用户存在)
    // 正确格式: Authorization: Api-Key (非 Bearer)
    // 正确端点: /api/v2/users-ordered (GET /users 返回 405)
    const res = await fetch(`${baseUrl}/api/v2/users-ordered?pageSize=1&pageNumber=1`, {
      headers: { 'Authorization': `Api-Key ${apiKey}` },
    });

    if (!res.ok) {
      console.warn(`[Zep] Auth check failed: ${res.status}`);
      return { enabled: true, connected: false, graphUserId: SYSTEM_USER };
    }

    // API Key 有效，额外检查系统用户是否存在 (不影响 connected 状态)
    const userRes = await fetch(`${baseUrl}/api/v2/users/${SYSTEM_USER}`, {
      headers: { 'Authorization': `Api-Key ${apiKey}` },
    });
    const userExists = userRes.ok;

    // 若系统用户不存在，自动创建
    if (!userExists) {
      await fetch(`${baseUrl}/api/v2/users`, {
        method: 'POST',
        headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: SYSTEM_USER, first_name: 'Content Pipeline System' }),
      }).catch(() => {/* 创建失败不影响状态 */});
    }

    return { enabled: true, connected: true, graphUserId: SYSTEM_USER, userExists };
  } catch (err) {
    console.warn('[Zep] Status check error:', err);
    return { enabled: true, connected: false, graphUserId: SYSTEM_USER };
  }
}
