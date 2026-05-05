// longitudinal/decisionTreeBuilder.ts — 项目级决策 DAG 扁平化
//
// mn_decisions 通过 based_on_ids[] + superseded_by_id 形成 DAG
// 此 computer 为一个 scope 拿全部 decisions，拓扑排序后扁平写入 snapshot

import type { MeetingNotesDeps } from '../types.js';

interface TreeNode {
  id: string;
  parent: string | null;      // 单父（取 based_on_ids[0] 做主线）
  title: string;
  decided: boolean;
  meeting_id: string;
  date: string | null;
  current: boolean;
  superseded_by: string | null;
  pending: boolean;
}

export class DecisionTreeBuilder {
  constructor(private readonly deps: MeetingNotesDeps) {}

  async recomputeForScope(scopeId: string, runId?: string | null): Promise<{ nodes: number }> {
    const r = await this.deps.db.query(
      `SELECT
          d.id, d.title, d.based_on_ids, d.superseded_by_id, d.is_current,
          d.meeting_id, d.created_at AS date, d.confidence
        FROM mn_decisions d
        WHERE d.scope_id = $1
        ORDER BY d.created_at ASC`,
      [scopeId],
    );

    const rawNodes: TreeNode[] = r.rows.map((row: any) => {
      const basedOn: string[] = row.based_on_ids ?? [];
      return {
        id: row.id,
        parent: basedOn.length > 0 ? basedOn[0] : null,
        title: row.title,
        decided: true,
        meeting_id: row.meeting_id,
        date: row.date,
        current: !!row.is_current,
        superseded_by: row.superseded_by_id ?? null,
        pending: false,
      };
    });

    // Fallback：若所有节点都没有 based_on_ids，按时间顺序自动串线性链
    // 每条决策的 parent = 按时间排在前一条的决策（不管 meeting）
    const hasAnyParent = rawNodes.some((n) => n.parent !== null);
    const nodes: TreeNode[] = hasAnyParent
      ? rawNodes
      : rawNodes.map((n, i) => ({
          ...n,
          parent: i === 0 ? null : rawNodes[i - 1].id,
        }));

    // 找 root 候选：no parent
    const root = nodes.find((n) => n.parent === null) ?? nodes[0] ?? null;

    await this.deps.db.query(
      `INSERT INTO mn_decision_tree_snapshots
         (scope_id, root_decision_id, nodes, computed_at, last_updated_run_id)
       VALUES ($1, $2, $3::jsonb, NOW(), $4)`,
      [scopeId, root?.id ?? null, JSON.stringify(nodes), runId ?? null],
    );

    return { nodes: nodes.length };
  }

  async latestForScope(scopeId: string): Promise<{
    rootDecisionId: string | null;
    nodes: TreeNode[];
    computedAt: string;
  } | null> {
    const r = await this.deps.db.query(
      `SELECT root_decision_id, nodes, computed_at
         FROM mn_decision_tree_snapshots
         WHERE scope_id = $1
         ORDER BY computed_at DESC LIMIT 1`,
      [scopeId],
    );
    if (r.rows.length === 0) return null;
    return {
      rootDecisionId: r.rows[0].root_decision_id,
      nodes: r.rows[0].nodes ?? [],
      computedAt: r.rows[0].computed_at,
    };
  }
}
