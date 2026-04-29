// v3.4 热点追踪服务 - HotTopicService
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface HotTopic {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  hotScore: number;
  trend: 'up' | 'stable' | 'down';
  sentiment: 'positive' | 'neutral' | 'negative';
  relatedReports: string[];
  publishedAt: Date;
  createdAt: Date;
}

export interface HotTopicFilters {
  trend?: 'up' | 'stable' | 'down';
  limit?: number;
  followedBy?: string;
  workspaceId?: string;
}

export class HotTopicService {
  // 获取热点列表
  async getHotTopics(filters: HotTopicFilters = {}): Promise<HotTopic[]> {
    const { trend, limit = 20, followedBy, workspaceId } = filters;

    let sql = `
      SELECT ht.*,
             array_agg(r.report_id) FILTER (WHERE r.report_id IS NOT NULL) as related_reports
      FROM hot_topics ht
      LEFT JOIN report_hot_topic_relations r ON ht.id = r.hot_topic_id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`(ht.workspace_id = $${params.length} OR ht.workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
    }

    if (trend) {
      params.push(trend);
      conditions.push(`ht.trend = $${params.length}`);
    }

    if (followedBy) {
      params.push(followedBy);
      sql += ` JOIN user_hot_topic_follows f ON ht.id = f.hot_topic_id AND f.user_id = $${params.length}`;
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` GROUP BY ht.id ORDER BY ht.hot_score DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(row => this.formatHotTopic(row));
  }

  // 获取热点详情
  async getHotTopic(id: string): Promise<HotTopic | null> {
    const result = await query(
      `SELECT ht.*,
              array_agg(r.report_id) FILTER (WHERE r.report_id IS NOT NULL) as related_reports
       FROM hot_topics ht
       LEFT JOIN report_hot_topic_relations r ON ht.id = r.hot_topic_id
       WHERE ht.id = $1
       GROUP BY ht.id`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.formatHotTopic(result.rows[0]);
  }

  // 创建或更新热点
  async upsertHotTopic(data: {
    title: string;
    source: string;
    sourceUrl: string;
    hotScore: number;
    trend: 'up' | 'stable' | 'down';
    sentiment: 'positive' | 'neutral' | 'negative';
    publishedAt: Date;
  }): Promise<HotTopic> {
    // 检查是否已存在相同标题的热点
    const existing = await query(
      `SELECT id FROM hot_topics WHERE title = $1 AND source = $2`,
      [data.title, data.source]
    );

    if (existing.rows.length > 0) {
      // 更新现有热点
      const result = await query(
        `UPDATE hot_topics SET
          hot_score = $2,
          trend = $3,
          sentiment = $4,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [existing.rows[0].id, data.hotScore, data.trend, data.sentiment]
      );
      return this.formatHotTopic(result.rows[0]);
    }

    // 创建新热点
    const id = uuidv4();
    const result = await query(
      `INSERT INTO hot_topics (id, title, source, source_url, hot_score, trend, sentiment, published_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [id, data.title, data.source, data.sourceUrl, data.hotScore, data.trend, data.sentiment, data.publishedAt]
    );
    return this.formatHotTopic(result.rows[0]);
  }

  // 关注热点
  async followTopic(userId: string, topicId: string): Promise<void> {
    await query(
      `INSERT INTO user_hot_topic_follows (user_id, hot_topic_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, hot_topic_id) DO NOTHING`,
      [userId, topicId]
    );
  }

  // 取消关注
  async unfollowTopic(userId: string, topicId: string): Promise<void> {
    await query(
      `DELETE FROM user_hot_topic_follows WHERE user_id = $1 AND hot_topic_id = $2`,
      [userId, topicId]
    );
  }

  // 检查是否关注
  async isFollowing(userId: string, topicId: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM user_hot_topic_follows WHERE user_id = $1 AND hot_topic_id = $2`,
      [userId, topicId]
    );
    return result.rows.length > 0;
  }

  // 关联研报与热点
  async linkReportToHotTopic(reportId: string, hotTopicId: string, matchScore: number): Promise<void> {
    await query(
      `INSERT INTO report_hot_topic_relations (report_id, hot_topic_id, match_score, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (report_id, hot_topic_id) DO UPDATE SET match_score = $3`,
      [reportId, hotTopicId, matchScore]
    );
  }

  // 获取趋势数据
  async getTrendData(hotTopicId: string, days: number = 7): Promise<any[]> {
    // 模拟趋势数据（实际应从历史记录表查询）
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        score: Math.floor(Math.random() * 40) + 60 // 模拟数据
      });
    }
    return data;
  }

  // 从 RSS 数据获取热点话题 (read 模式: 包含 is_shared workspace 行)
  async getHotTopicsFromRss(limit: number = 10, workspaceId?: string): Promise<any[]> {
    const wsClause = workspaceId
      ? ' AND (workspace_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))'
      : '';
    const params = workspaceId ? [limit, workspaceId] : [limit];
    const result = await query(
      `SELECT
        id,
        title,
        source_name as source,
        link as source_url,
        hot_score,
        trend,
        sentiment,
        summary,
        tags,
        published_at,
        created_at
      FROM rss_items
      WHERE (is_deleted = false OR is_deleted IS NULL)
        AND hot_score > 0${wsClause}
      ORDER BY hot_score DESC, published_at DESC
      LIMIT $1`,
      params
    );

    return result.rows.map(row => ({
      id: `rss-${row.id}`,
      title: row.title,
      source: row.source,
      sourceUrl: row.source_url,
      hotScore: row.hot_score,
      trend: row.trend || 'stable',
      sentiment: row.sentiment || 'neutral',
      summary: row.summary || '',
      tags: Array.isArray(row.tags) ? row.tags : (row.tags ? JSON.parse(row.tags) : []),
      publishedAt: row.published_at,
      createdAt: row.created_at
    }));
  }

  // 格式化热点数据
  private formatHotTopic(row: any): HotTopic {
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      sourceUrl: row.source_url,
      hotScore: row.hot_score,
      trend: row.trend,
      sentiment: row.sentiment,
      relatedReports: row.related_reports || [],
      publishedAt: row.published_at,
      createdAt: row.created_at
    };
  }
}

export const hotTopicService = new HotTopicService();
