// crosslinks/crossAxisLinkResolver.ts — 轴间关联发现
//
// 原型 CrossAxisLink 组件例子：
//   · 人物轴 → 项目轴：某人 3 个挂名项目全亮红灯（at_risk commitments）
//   · 人物轴 → 知识轴：某人发言触发 4 次 anchoring_bias
//   · 项目轴 → 知识轴：某决策依赖未验证假设 × N
//
// PR4：用纯 SQL 规则 + 简单计数生成链接，不涉及 LLM
// PR5 可升级：embedding 相似度 + LLM 识别"跨维隐含关联"

import type { MeetingNotesDeps } from '../types.js';

export interface CrossAxisLink {
  id: string;
  sourceAxis: string;
  sourceItemType: string;
  sourceItemId: string;
  targetAxis: string;
  targetItemType: string;
  targetItemId: string;
  relationship: string;
  score: number;
  count: number;
}

export class CrossAxisLinkResolver {
  constructor(private readonly deps: MeetingNotesDeps) {}

  /**
   * 为单个 meeting / scope 重算所有跨轴链接。
   * scopeId null 表示全库（library）
   * 规则：SQL join + 计数，upsert 进 mn_cross_axis_links。
   */
  async recomputeForScope(
    scopeKind: 'library' | 'project' | 'client' | 'topic' | 'meeting',
    scopeId: string | null,
    runId?: string | null,
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    // ========== 规则 1：人物 → 项目
    // 某人承诺 at_risk/slipped → 指向其所在的项目中具体 decisions
    // （PR4 简化：只关联同 meeting 内的 decisions；scope 聚合由 PR5 优化）
    const r1 = await this.deps.db.query(
      `SELECT
         c.person_id  AS source_id,
         d.id         AS target_id,
         count(*)     AS cnt
       FROM mn_commitments c
       JOIN mn_decisions d ON d.meeting_id = c.meeting_id
       WHERE c.state IN ('at_risk','slipped')
         ${scopeId ? 'AND d.scope_id = $1' : ''}
       GROUP BY c.person_id, d.id`,
      scopeId ? [scopeId] : [],
    );
    for (const row of r1.rows) {
      const upsert = await this.upsert({
        source_axis: 'people',
        source_item_type: 'person',
        source_item_id: row.source_id,
        target_axis: 'projects',
        target_item_type: 'decision',
        target_item_id: row.target_id,
        relationship: 'at_risk_commitment_links_decision',
        score: Math.min(100, Number(row.cnt) * 10),
        count: Number(row.cnt),
        scope_id: scopeId,
        run_id: runId ?? null,
      });
      if (upsert === 'inserted') inserted++;
      else updated++;
    }

    // ========== 规则 2：人物 → 知识（偏误）
    // 某人被识别出认知偏误的次数
    const r2 = await this.deps.db.query(
      `SELECT
         b.by_person_id AS source_id,
         b.id           AS target_id,
         1              AS cnt,
         b.bias_type    AS bias
       FROM mn_cognitive_biases b
       WHERE b.by_person_id IS NOT NULL
         ${scopeId ? `AND b.meeting_id IN (
           SELECT meeting_id FROM mn_scope_members WHERE scope_id = $1
         )` : ''}`,
      scopeId ? [scopeId] : [],
    );
    for (const row of r2.rows) {
      const upsert = await this.upsert({
        source_axis: 'people',
        source_item_type: 'person',
        source_item_id: row.source_id,
        target_axis: 'knowledge',
        target_item_type: 'cognitive_bias',
        target_item_id: row.target_id,
        relationship: `bias:${row.bias}`,
        score: 50,
        count: 1,
        scope_id: scopeId,
        run_id: runId ?? null,
      });
      if (upsert === 'inserted') inserted++;
      else updated++;
    }

    // ========== 规则 3：项目 → 知识（判断 / 反事实）
    // 决策 → 可复用判断：同 meeting
    const r3 = await this.deps.db.query(
      `SELECT
         d.id AS source_id,
         j.id AS target_id
       FROM mn_decisions d
       JOIN mn_judgments j ON j.abstracted_from_meeting_id = d.meeting_id
       WHERE d.is_current = TRUE
         ${scopeId ? 'AND d.scope_id = $1' : ''}`,
      scopeId ? [scopeId] : [],
    );
    for (const row of r3.rows) {
      const upsert = await this.upsert({
        source_axis: 'projects',
        source_item_type: 'decision',
        source_item_id: row.source_id,
        target_axis: 'knowledge',
        target_item_type: 'judgment',
        target_item_id: row.target_id,
        relationship: 'decision_yields_judgment',
        score: 30,
        count: 1,
        scope_id: scopeId,
        run_id: runId ?? null,
      });
      if (upsert === 'inserted') inserted++;
      else updated++;
    }

    // ========== 规则 4：会议本身 → 项目（高决策质量 ↔ 清晰决策）
    // 会议 decision_quality.overall 与本 meeting 的决策数量关联
    // 仅 scope 级别（scope 下的 meetings 汇总）
    if (scopeKind !== 'meeting' && scopeId) {
      const r4 = await this.deps.db.query(
        `SELECT
           dq.meeting_id AS source_id,
           d.id          AS target_id
         FROM mn_decision_quality dq
         JOIN mn_decisions d ON d.meeting_id = dq.meeting_id
         WHERE dq.overall >= 0.7
           AND d.scope_id = $1`,
        [scopeId],
      );
      for (const row of r4.rows) {
        const upsert = await this.upsert({
          source_axis: 'meta',
          source_item_type: 'meeting_quality',
          source_item_id: row.source_id,
          target_axis: 'projects',
          target_item_type: 'decision',
          target_item_id: row.target_id,
          relationship: 'high_quality_meeting_produces_decision',
          score: 20,
          count: 1,
          scope_id: scopeId,
          run_id: runId ?? null,
        });
        if (upsert === 'inserted') inserted++;
        else updated++;
      }
    }

    return { inserted, updated };
  }

  async listBySource(
    sourceAxis: string,
    sourceItemId: string,
    limit = 50,
  ): Promise<CrossAxisLink[]> {
    const r = await this.deps.db.query(
      `SELECT * FROM mn_cross_axis_links
         WHERE source_axis = $1 AND source_item_id = $2
         ORDER BY score DESC LIMIT $3`,
      [sourceAxis, sourceItemId, limit],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      sourceAxis: row.source_axis,
      sourceItemType: row.source_item_type,
      sourceItemId: row.source_item_id,
      targetAxis: row.target_axis,
      targetItemType: row.target_item_type,
      targetItemId: row.target_item_id,
      relationship: row.relationship,
      score: Number(row.score),
      count: row.count,
    }));
  }

  private async upsert(args: {
    source_axis: string; source_item_type: string; source_item_id: string;
    target_axis: string; target_item_type: string; target_item_id: string;
    relationship: string;
    score: number; count: number;
    scope_id: string | null;
    run_id: string | null;
  }): Promise<'inserted' | 'updated'> {
    const r = await this.deps.db.query(
      `INSERT INTO mn_cross_axis_links
         (source_axis, source_item_type, source_item_id,
          target_axis, target_item_type, target_item_id,
          relationship, score, count, scope_id, last_computed_run_id, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (source_axis, source_item_id, target_axis, target_item_id, relationship)
       DO UPDATE SET
         score = EXCLUDED.score,
         count = mn_cross_axis_links.count + EXCLUDED.count,
         last_computed_run_id = EXCLUDED.last_computed_run_id,
         computed_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        args.source_axis, args.source_item_type, args.source_item_id,
        args.target_axis, args.target_item_type, args.target_item_id,
        args.relationship, args.score, args.count,
        args.scope_id, args.run_id,
      ],
    );
    return r.rows[0]?.inserted ? 'inserted' : 'updated';
  }
}
