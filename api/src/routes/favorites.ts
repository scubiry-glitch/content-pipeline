// 收藏路由 - Favorites API
// 热点话题报告收藏管理

import { FastifyInstance } from 'fastify';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { currentWorkspaceId } from '../db/repos/withWorkspace.js';

export async function favoritesRoutes(fastify: FastifyInstance) {
  // 获取用户收藏列表 (按 user_id + workspace_id 双过滤)
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const userId = (request as any).user?.id || 'anonymous';
    const wsId = currentWorkspaceId(request);

    const wsClause = wsId
      ? ' AND (workspace_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))'
      : '';
    const params = wsId ? [userId, wsId] : [userId];
    const result = await query(
      `SELECT id, report_id as "reportId", topic_id as "topicId",
              topic_title as "topicTitle", report_data as "reportData",
              created_at as "createdAt"
       FROM favorite_reports
       WHERE user_id = $1${wsClause}
       ORDER BY created_at DESC`,
      params
    );

    return result.rows;
  });

  // 检查是否已收藏
  fastify.get('/check/:reportId', { preHandler: authenticate }, async (request) => {
    const { reportId } = request.params as any;
    const userId = (request as any).user?.id || 'anonymous';
    const wsId = currentWorkspaceId(request);

    const wsClause = wsId
      ? ' AND (workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))'
      : '';
    const params = wsId ? [userId, reportId, wsId] : [userId, reportId];
    const result = await query(
      `SELECT id FROM favorite_reports WHERE user_id = $1 AND report_id = $2${wsClause}`,
      params
    );

    return { isFavorite: result.rows.length > 0 };
  });

  // 添加收藏 (落到当前 ws)
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const { reportId, topicId, topicTitle, reportData } = request.body as any;
    const userId = (request as any).user?.id || 'anonymous';
    const wsId = currentWorkspaceId(request);

    if (!reportId || !topicId || !topicTitle) {
      reply.status(400);
      return { error: 'Missing required fields: reportId, topicId, topicTitle' };
    }

    try {
      // 注: ON CONFLICT 走的是 (user_id, report_id) UNIQUE 约束;
      // 同一用户在不同 ws 不能重复收藏同一 report (跨 ws 共享个人收藏列表语义).
      // 未来若要 per-ws 收藏, 需变更约束为 (user_id, report_id, workspace_id).
      const result = wsId
        ? await query(
            `INSERT INTO favorite_reports (user_id, report_id, topic_id, topic_title, report_data, workspace_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (user_id, report_id) DO UPDATE SET
               topic_title = EXCLUDED.topic_title,
               report_data = EXCLUDED.report_data,
               workspace_id = EXCLUDED.workspace_id,
               created_at = NOW()
             RETURNING id, report_id as "reportId", topic_id as "topicId",
                       topic_title as "topicTitle", report_data as "reportData",
                       created_at as "createdAt"`,
            [userId, reportId, topicId, topicTitle, JSON.stringify(reportData), wsId]
          )
        : await query(
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
    const wsId = currentWorkspaceId(request);

    const wsClause = wsId ? ' AND workspace_id = $3' : '';
    const params = wsId ? [userId, reportId, wsId] : [userId, reportId];
    const result = await query(
      `DELETE FROM favorite_reports WHERE user_id = $1 AND report_id = $2${wsClause} RETURNING id`,
      params
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
    const wsId = currentWorkspaceId(request);

    if (!Array.isArray(reportIds)) {
      return { favorites: {} };
    }

    const wsClause = wsId
      ? ' AND (workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))'
      : '';
    const params = wsId ? [userId, reportIds, wsId] : [userId, reportIds];
    const result = await query(
      `SELECT report_id as "reportId" FROM favorite_reports
       WHERE user_id = $1 AND report_id = ANY($2)${wsClause}`,
      params
    );

    const favorites = result.rows.reduce((acc, row) => {
      acc[row.reportId] = true;
      return acc;
    }, {} as Record<string, boolean>);

    return { favorites };
  });
}
