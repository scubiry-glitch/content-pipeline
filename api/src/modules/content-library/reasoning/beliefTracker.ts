// Layer 4: 观点演化追踪 (← Hindsight Evolving Beliefs)
// Phase 3 实现 — 当前为存根

import type { DatabaseAdapter, ContentBelief, BeliefStance } from '../types.js';

export class BeliefTracker {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /** 更新信念状态 */
  async updateBelief(
    proposition: string,
    newStance: BeliefStance,
    reason: string,
    supportingFactIds?: string[],
    contradictingFactIds?: string[]
  ): Promise<ContentBelief> {
    // TODO: Phase 3 实现
    // 1. 查找或创建 content_beliefs 记录
    // 2. 更新 current_stance + confidence
    // 3. 追加 history 条目
    throw new Error('Phase 3 — BeliefTracker 尚未实现');
  }

  /** 查询信念时间线 */
  async getTimeline(beliefId: string): Promise<ContentBelief> {
    // TODO: Phase 3 实现
    throw new Error('Phase 3 — BeliefTracker 尚未实现');
  }
}
