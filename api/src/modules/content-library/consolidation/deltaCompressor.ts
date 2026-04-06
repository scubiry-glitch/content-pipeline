// Layer 1: Delta 压缩 (← RetainDB delta compression)
// 新事实与既有事实比对，标记过时事实，维护版本链

import type { DatabaseAdapter, ContentFact } from '../types.js';

export class DeltaCompressor {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /**
   * 将新事实与既有事实比对:
   * - 如果是全新事实 → 直接返回
   * - 如果更新了既有事实 → 标记旧事实为 superseded，返回新事实
   * - 如果完全重复 → 跳过（提高 confidence 的除外）
   */
  async compress(
    fact: Omit<ContentFact, 'id' | 'createdAt'>
  ): Promise<Omit<ContentFact, 'id' | 'createdAt'>> {
    // 查找同 subject + predicate 的现有事实
    const existing = await this.db.query(
      `SELECT * FROM content_facts
       WHERE subject = $1 AND predicate = $2 AND is_current = true
       ORDER BY created_at DESC LIMIT 1`,
      [fact.subject, fact.predicate]
    );

    if (existing.rows.length === 0) {
      // 全新事实
      return fact;
    }

    const old = existing.rows[0];

    // 完全重复 — 同 object 且同上下文
    if (old.object === fact.object && this.sameContext(old.context, fact.context)) {
      // 如果新的置信度更高，更新置信度
      if (fact.confidence > Number(old.confidence)) {
        await this.db.query(
          'UPDATE content_facts SET confidence = $1 WHERE id = $2',
          [fact.confidence, old.id]
        );
      }
      // 返回标记为非新建（调用方可据此决定是否跳过存储）
      return { ...fact, isCurrent: true };
    }

    // Object 不同 — 标记旧事实为 superseded
    await this.db.query(
      'UPDATE content_facts SET is_current = false WHERE id = $1',
      [old.id]
    );

    // 返回新事实，稍后由引擎存储，并回填 superseded_by
    return { ...fact, isCurrent: true };
  }

  private sameContext(a: any, b: any): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    // 比较时间上下文即可（最关键的维度）
    return a.time === b.time;
  }
}
