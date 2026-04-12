// Content Library v7.2 — Louvain 社区发现
// 受 nashsu/llm_wiki 启发: 自动发现实体的自然簇，辅助议题推荐分组
//
// 实现: 从 content_facts 构建实体共现图 → graphology + louvain → 写回 community_id
// 不依赖外部 graphology: 用纯 JS 实现的简化 Louvain (避免新依赖)

import type { DatabaseAdapter } from '../types.js';

export interface CommunityResult {
  totalEntities: number;
  totalEdges: number;
  communities: number;
  avgCohesion: number;
  details: Array<{
    communityId: string;
    memberCount: number;
    cohesion: number;
    topMembers: string[];
  }>;
}

/**
 * 简化 Louvain: 纯 JS 实现，不引入 graphology 依赖。
 * 对于 < 5000 节点的规模足够，避免增加 npm 依赖。
 */
function runLouvain(
  nodes: string[],
  edges: Array<{ from: string; to: string; weight: number }>
): Map<string, string> {
  // 初始: 每个节点自成一社区
  const community = new Map<string, string>();
  for (const n of nodes) community.set(n, n);

  // 构建邻接表
  const adj = new Map<string, Map<string, number>>();
  let totalWeight = 0;
  for (const n of nodes) adj.set(n, new Map());
  for (const e of edges) {
    adj.get(e.from)?.set(e.to, (adj.get(e.from)?.get(e.to) || 0) + e.weight);
    adj.get(e.to)?.set(e.from, (adj.get(e.to)?.get(e.from) || 0) + e.weight);
    totalWeight += e.weight;
  }
  if (totalWeight === 0) return community;
  const m = totalWeight;

  // 节点度 (加权)
  const degree = new Map<string, number>();
  for (const n of nodes) {
    let d = 0;
    for (const w of (adj.get(n)?.values() || [])) d += w;
    degree.set(n, d);
  }

  // Phase 1: 局部移动 (简化版, 单轮)
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 10) {
    improved = false;
    iterations++;
    for (const node of nodes) {
      const currentComm = community.get(node)!;
      const neighbors = adj.get(node) || new Map();

      // 计算移到各邻居社区的 modularity gain
      let bestComm = currentComm;
      let bestGain = 0;

      const neighborComms = new Set<string>();
      for (const [nb] of neighbors) {
        neighborComms.add(community.get(nb)!);
      }

      for (const targetComm of neighborComms) {
        if (targetComm === currentComm) continue;

        // 简化 modularity gain 计算
        let sumIn = 0;  // node 与 targetComm 中成员的边权和
        let sumTot = 0; // targetComm 总度
        for (const [nb, w] of neighbors) {
          if (community.get(nb) === targetComm) sumIn += w;
        }
        for (const [n2, comm] of community) {
          if (comm === targetComm) sumTot += degree.get(n2) || 0;
        }

        const ki = degree.get(node) || 0;
        const gain = sumIn / m - (sumTot * ki) / (2 * m * m);

        if (gain > bestGain) {
          bestGain = gain;
          bestComm = targetComm;
        }
      }

      if (bestComm !== currentComm) {
        community.set(node, bestComm);
        improved = true;
      }
    }
  }

  // 重新编号社区 (0, 1, 2, ...)
  const commIds = new Set(community.values());
  const idMap = new Map<string, string>();
  let idx = 0;
  for (const c of commIds) {
    idMap.set(c, `c${idx++}`);
  }
  for (const [node, comm] of community) {
    community.set(node, idMap.get(comm)!);
  }

  return community;
}

/** 计算社区内聚度: 实际簇内边数 / 簇最大可能边数 */
function computeCohesion(
  members: string[],
  edges: Array<{ from: string; to: string; weight: number }>
): number {
  if (members.length < 2) return 1.0;
  const memberSet = new Set(members);
  let intraEdges = 0;
  for (const e of edges) {
    if (memberSet.has(e.from) && memberSet.has(e.to)) intraEdges++;
  }
  const maxEdges = members.length * (members.length - 1) / 2;
  return maxEdges > 0 ? intraEdges / maxEdges : 0;
}

export class CommunityDetector {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async recompute(): Promise<CommunityResult> {
    // 1. 加载所有实体
    const entityResult = await this.db.query(
      `SELECT id, canonical_name FROM content_entities ORDER BY created_at`
    );
    const entities = entityResult.rows as Array<{ id: string; canonical_name: string }>;
    if (entities.length === 0) {
      return { totalEntities: 0, totalEdges: 0, communities: 0, avgCohesion: 0, details: [] };
    }

    // 2. 构建共现边 (两实体在同一事实中共现)
    const edgeResult = await this.db.query(`
      SELECT cf1.subject AS from_name, cf1.object AS to_name, COUNT(*) AS weight
      FROM content_facts cf1
      WHERE cf1.is_current = true
      AND cf1.subject != cf1.object
      GROUP BY cf1.subject, cf1.object
      HAVING COUNT(*) >= 1
    `);

    const entityNames = entities.map(e => e.canonical_name);
    const nameSet = new Set(entityNames);
    const edges = (edgeResult.rows as Array<{ from_name: string; to_name: string; weight: string }>)
      .filter(r => nameSet.has(r.from_name) && nameSet.has(r.to_name))
      .map(r => ({ from: r.from_name, to: r.to_name, weight: Number(r.weight) || 1 }));

    // 3. 运行 Louvain
    const communityMap = runLouvain(entityNames, edges);

    // 4. 计算每社区内聚度
    const commGroups = new Map<string, string[]>();
    for (const [name, comm] of communityMap) {
      const list = commGroups.get(comm) || [];
      list.push(name);
      commGroups.set(comm, list);
    }

    const details: CommunityResult['details'] = [];
    for (const [commId, members] of commGroups) {
      const cohesion = computeCohesion(members, edges);
      details.push({
        communityId: commId,
        memberCount: members.length,
        cohesion: Math.round(cohesion * 1000) / 1000,
        topMembers: members.slice(0, 5),
      });
    }
    details.sort((a, b) => b.memberCount - a.memberCount);

    const avgCohesion = details.length > 0
      ? details.reduce((s, d) => s + d.cohesion, 0) / details.length
      : 0;

    // 5. 写回 DB
    const nameToId = new Map(entities.map(e => [e.canonical_name, e.id]));
    for (const [commId, members] of commGroups) {
      const cohesion = details.find(d => d.communityId === commId)?.cohesion || 0;
      const entityIds = members.map(m => nameToId.get(m)).filter(Boolean);
      if (entityIds.length > 0) {
        await this.db.query(
          `UPDATE content_entities SET community_id = $1, community_cohesion = $2
           WHERE id = ANY($3::uuid[])`,
          [commId, cohesion, entityIds]
        );
      }
    }

    return {
      totalEntities: entities.length,
      totalEdges: edges.length,
      communities: commGroups.size,
      avgCohesion: Math.round(avgCohesion * 1000) / 1000,
      details,
    };
  }
}
