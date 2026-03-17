// 收藏路由 - Favorites API
// 热点话题报告收藏管理

import { FastifyInstance } from 'fastify';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

export async function favoritesRoutes(fastify: FastifyInstance) {
  // 获取用户收藏列表
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const userId = (request as any).user?.id || 'anonymous';

    const result = await query(
      `SELECT id, report_id as "reportId", topic_id as "topicId",
              topic_title as "topicTitle", report_data as "reportData",
              created_at as "createdAt"
       FROM favorite_reports
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  });

  // 检查是否已收藏
  fastify.get('/check/:reportId', { preHandler: authenticate }, async (request) => {
    const { reportId } = request.params as any;
    const userId = (request as any).user?.id || 'anonymous';

    const result = await query(
      `SELECT id FROM favorite_reports WHERE user_id = $1 AND report_id = $2`,
      [userId, reportId]
    );

    return { isFavorite: result.rows.length > 0 };
  });

  // 添加收藏
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const { reportId, topicId, topicTitle, reportData } = request.body as any;
    const userId = (request as any).user?.id || 'anonymous';

    if (!reportId || !topicId || !topicTitle) {
      reply.status(400);
      return { error: 'Missing required fields: reportId, topicId, topicTitle' };
    }

    try {
      const result = await query(
        `INSERT INTO favorite_reports (user_id, report_id, topic_id, topic_title, report_data, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, report_id) DO UPDATE SET
           topic_title = EXCLUDED.topic_title,
           report_data = EXCLUDED.report_data,
           created_at = NOW()
         RETURNING id, report_id as "reportId", topic_id as "topicId",
                   topic_title as "topicTitle", report_data as "reportData",
                   created_at as "createdAt"`,
        [userId, reportId, topicId, topicTitle, JSON.stringify(reportData)]
      );

      reply.status(201);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to add favorite:', error);
      reply.status(500);
      return { error: 'Failed to add favorite' };
    }
  });

  // 取消收藏
  fastify.delete('/:reportId', { preHandler: authenticate }, async (request, reply) => {
    const { reportId } = request.params as any;
    const userId = (request as any).user?.id || 'anonymous';

    const result = await query(
      `DELETE FROM favorite_reports WHERE user_id = $1 AND report_id = $2 RETURNING id`,
      [userId, reportId]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Favorite not found' };
    }

    reply.status(204);
    return;
  });

  // 批量获取收藏状态
  fastify.post('/batch-check', { preHandler: authenticate }, async (request) => {
    const { reportIds } = request.body as any;
    const userId = (request as any).user?.id || 'anonymous';

    if (!Array.isArray(reportIds)) {
      return { favorites: {} };
    }

    const result = await query(
      `SELECT report_id as "reportId" FROM favorite_reports
       WHERE user_id = $1 AND report_id = ANY($2)`,
      [userId, reportIds]
    );

    const favorites = result.rows.reduce((acc, row) => {
      acc[row.reportId] = true;
      return acc;
    }, {} as Record<string, boolean>);

    return { favorites };
  });
}
