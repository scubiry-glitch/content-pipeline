// Layer 4: 观点演化追踪 (← Hindsight Evolving Beliefs)
// 追踪命题的信念状态: confirmed → disputed → refuted

import type { DatabaseAdapter, ContentBelief, BeliefStance, BeliefHistoryEntry } from '../types.js';

export class BeliefTracker {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /** 创建或更新信念 */
  async updateBelief(
    proposition: string,
    newStance: BeliefStance,
    reason: string,
    supportingFactIds?: string[],
    contradictingFactIds?: string[]
  ): Promise<ContentBelief> {
    // 查找既有信念
    const existing = await this.db.query(
      'SELECT * FROM content_beliefs WHERE proposition = $1 LIMIT 1',
      [proposition]
    );

    if (existing.rows.length > 0) {
      return this.updateExisting(existing.rows[0], newStance, reason, supportingFactIds, contradictingFactIds);
    }

    return this.createNew(proposition, newStance, reason, supportingFactIds, contradictingFactIds);
  }

  /** 查询信念时间线 */
  async getTimeline(beliefId: string): Promise<ContentBelief> {
    const result = await this.db.query(
      'SELECT * FROM content_beliefs WHERE id = $1',
      [beliefId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Belief not found: ${beliefId}`);
    }

    return this.mapBelief(result.rows[0]);
  }

  /** 列出所有信念（按状态过滤） */
  async listBeliefs(options?: {
    stance?: BeliefStance;
    domain?: string;
    limit?: number;
  }): Promise<ContentBelief[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options?.stance) {
      conditions.push(`current_stance = $${paramIndex++}`);
      params.push(options.stance);
    }
    if (options?.domain) {
      conditions.push(`taxonomy_domain_id = $${paramIndex++}`);
      params.push(options.domain);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 50;

    const result = await this.db.query(
      `SELECT * FROM content_beliefs ${where} ORDER BY last_updated DESC LIMIT $${paramIndex}`,
      [...params, limit]
    );

    return result.rows.map(this.mapBelief);
  }

  /** 根据新事实自动更新相关信念 */
  async processNewFact(factId: string, subject: string, predicate: string, object: string): Promise<void> {
    // 找到包含此 subject 的信念
    const beliefs = await this.db.query(
      `SELECT * FROM content_beliefs WHERE proposition ILIKE $1`,
      [`%${subject}%`]
    );

    for (const belief of beliefs.rows) {
      // 检查新事实是支持还是矛盾
      const supportingCount = (belief.supporting_facts || []).length;
      const contradictingCount = (belief.contradicting_facts || []).length;

      // 简化逻辑：如果矛盾事实增多，转为 disputed
      if (contradictingCount > supportingCount && belief.current_stance === 'confirmed') {
        await this.updateExisting(
          belief, 'disputed',
          `新事实 "${subject} ${predicate} ${object}" 与既有认知冲突`,
          undefined, [factId]
        );
      }
    }
  }

  private async createNew(
    proposition: string,
    stance: BeliefStance,
    reason: string,
    supportingFactIds?: string[],
    contradictingFactIds?: string[]
  ): Promise<ContentBelief> {
    const history: BeliefHistoryEntry[] = [{
      stance,
      confidence: this.stanceToConfidence(stance),
      reason,
      timestamp: new Date(),
    }];

    const result = await this.db.query(
      `INSERT INTO content_beliefs (proposition, current_stance, confidence, supporting_facts, contradicting_facts, history)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        proposition, stance,
        this.stanceToConfidence(stance),
        supportingFactIds || [],
        contradictingFactIds || [],
        JSON.stringify(history),
      ]
    );

    return this.mapBelief(result.rows[0]);
  }

  private async updateExisting(
    row: any,
    newStance: BeliefStance,
    reason: string,
    supportingFactIds?: string[],
    contradictingFactIds?: string[]
  ): Promise<ContentBelief> {
    const existingHistory: BeliefHistoryEntry[] = row.history || [];
    existingHistory.push({
      stance: newStance,
      confidence: this.stanceToConfidence(newStance),
      reason,
      timestamp: new Date(),
    });

    const newSupporting = supportingFactIds
      ? [...(row.supporting_facts || []), ...supportingFactIds]
      : (row.supporting_facts || []);

    const newContradicting = contradictingFactIds
      ? [...(row.contradicting_facts || []), ...contradictingFactIds]
      : (row.contradicting_facts || []);

    const result = await this.db.query(
      `UPDATE content_beliefs SET
        current_stance = $1,
        confidence = $2,
        supporting_facts = $3,
        contradicting_facts = $4,
        history = $5,
        last_updated = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        newStance,
        this.stanceToConfidence(newStance),
        newSupporting,
        newContradicting,
        JSON.stringify(existingHistory),
        row.id,
      ]
    );

    return this.mapBelief(result.rows[0]);
  }

  private stanceToConfidence(stance: BeliefStance): number {
    switch (stance) {
      case 'confirmed': return 0.9;
      case 'evolving': return 0.5;
      case 'disputed': return 0.3;
      case 'refuted': return 0.1;
      default: return 0.5;
    }
  }

  private mapBelief(row: any): ContentBelief {
    return {
      id: row.id,
      proposition: row.proposition,
      currentStance: row.current_stance,
      confidence: Number(row.confidence),
      supportingFactIds: row.supporting_facts || [],
      contradictingFactIds: row.contradicting_facts || [],
      taxonomyDomainId: row.taxonomy_domain_id,
      lastUpdated: new Date(row.last_updated),
      history: row.history || [],
    };
  }
}
