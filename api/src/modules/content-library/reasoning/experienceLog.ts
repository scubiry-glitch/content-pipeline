// Layer 4: 生产经验记录 (← Hindsight Agent Experiences)
// 记录内容生产中的素材+专家组合效果，用于推荐最佳组合

import type { DatabaseAdapter, ProductionExperience } from '../types.js';

export class ExperienceLog {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /** 记录一次内容生产经验 */
  async record(experience: Omit<ProductionExperience, 'id' | 'createdAt'>): Promise<ProductionExperience> {
    const result = await this.db.query(
      `INSERT INTO content_production_log
       (task_id, asset_ids, expert_ids, output_quality_score, human_feedback_score, combination_insight)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        experience.taskId,
        experience.assetIds,
        experience.expertIds,
        experience.outputQualityScore,
        experience.humanFeedbackScore || null,
        experience.combinationInsight || null,
      ]
    );

    return this.mapExperience(result.rows[0]);
  }

  /** 推荐最佳素材组合 — 基于历史高分经验 */
  async recommendCombination(taskType: string, domain?: string): Promise<{
    assetIds: string[];
    expertIds: string[];
    confidence: number;
    basedOnExperiences: number;
  }[]> {
    // 查询高质量生产经验
    const result = await this.db.query(`
      SELECT
        asset_ids,
        expert_ids,
        AVG(output_quality_score) as avg_quality,
        AVG(COALESCE(human_feedback_score, output_quality_score * 5)) as avg_feedback,
        COUNT(*) as experience_count
      FROM content_production_log
      WHERE output_quality_score >= 0.7
      GROUP BY asset_ids, expert_ids
      HAVING COUNT(*) >= 2
      ORDER BY AVG(output_quality_score) DESC
      LIMIT 5
    `, []);

    return result.rows.map((row: any) => ({
      assetIds: row.asset_ids || [],
      expertIds: row.expert_ids || [],
      confidence: Number(row.avg_quality),
      basedOnExperiences: Number(row.experience_count),
    }));
  }

  /** 获取某个任务的历史经验 */
  async getByTask(taskId: string): Promise<ProductionExperience[]> {
    const result = await this.db.query(
      'SELECT * FROM content_production_log WHERE task_id = $1 ORDER BY created_at DESC',
      [taskId]
    );
    return result.rows.map(this.mapExperience);
  }

  /** 获取最近的生产经验 */
  async getRecent(limit: number = 20): Promise<ProductionExperience[]> {
    const result = await this.db.query(
      'SELECT * FROM content_production_log ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(this.mapExperience);
  }

  private mapExperience(row: any): ProductionExperience {
    return {
      id: row.id,
      taskId: row.task_id,
      assetIds: row.asset_ids || [],
      expertIds: row.expert_ids || [],
      outputQualityScore: Number(row.output_quality_score),
      humanFeedbackScore: row.human_feedback_score ? Number(row.human_feedback_score) : undefined,
      combinationInsight: row.combination_insight,
      createdAt: new Date(row.created_at),
    };
  }
}
