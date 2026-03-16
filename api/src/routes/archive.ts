// 任务归档路由 - Task Archive Routes
// FR-034 ~ FR-035: 任务删除、隐藏、回收站

import { FastifyInstance } from 'fastify';
import {
  softDeleteTask,
  batchSoftDelete,
  toggleTaskVisibility,
  batchToggleVisibility,
  restoreTask,
  permanentlyDeleteTask,
  getRecycleBinTasks,
  getHiddenTasks,
  cleanupExpiredTasks,
} from '../services/taskArchive.js';
import { authenticate } from '../middleware/auth.js';

export async function archiveRoutes(fastify: FastifyInstance) {
  // 软删除任务（移动到回收站）
  fastify.post('/:taskId/delete', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { reason } = request.body as any;
    const userId = (request as any).user?.id || 'user';

    try {
      const result = await softDeleteTask(taskId, userId, reason);
      return result;
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : 'Delete failed' };
    }
  });

  // 批量软删除
  fastify.post('/batch-delete', { preHandler: authenticate }, async (request) => {
    const { taskIds, reason } = request.body as any;
    const userId = (request as any).user?.id || 'user';

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return { error: 'taskIds must be a non-empty array' };
    }

    const result = await batchSoftDelete(taskIds, userId, reason);
    return result;
  });

  // 隐藏/取消隐藏任务
  fastify.post('/:taskId/hide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const userId = (request as any).user?.id || 'user';

    try {
      const result = await toggleTaskVisibility(taskId, true, userId);
      return result;
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : 'Hide failed' };
    }
  });

  fastify.post('/:taskId/unhide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const userId = (request as any).user?.id || 'user';

    try {
      const result = await toggleTaskVisibility(taskId, false, userId);
      return result;
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : 'Unhide failed' };
    }
  });

  // 批量隐藏/取消隐藏
  fastify.post('/batch-hide', { preHandler: authenticate }, async (request) => {
    const { taskIds } = request.body as any;
    const userId = (request as any).user?.id || 'user';

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return { error: 'taskIds must be a non-empty array' };
    }

    const result = await batchToggleVisibility(taskIds, true, userId);
    return result;
  });

  fastify.post('/batch-unhide', { preHandler: authenticate }, async (request) => {
    const { taskIds } = request.body as any;
    const userId = (request as any).user?.id || 'user';

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return { error: 'taskIds must be a non-empty array' };
    }

    const result = await batchToggleVisibility(taskIds, false, userId);
    return result;
  });

  // 从回收站恢复
  fastify.post('/:taskId/restore', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const userId = (request as any).user?.id || 'user';

    try {
      const result = await restoreTask(taskId, userId);
      return result;
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : 'Restore failed' };
    }
  });

  // 永久删除
  fastify.post('/:taskId/permanent-delete', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const userId = (request as any).user?.id || 'user';

    const { confirm } = request.body as any;
    if (!confirm) {
      reply.status(400);
      return { error: 'Must set confirm: true to permanently delete' };
    }

    try {
      const result = await permanentlyDeleteTask(taskId, userId);
      return result;
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : 'Delete failed' };
    }
  });

  // 获取回收站任务列表
  fastify.get('/recycle-bin', { preHandler: authenticate }, async (request) => {
    const { limit = '20', offset = '0' } = request.query as any;
    const userId = (request as any).user?.id;

    const result = await getRecycleBinTasks({
      limit: parseInt(limit),
      offset: parseInt(offset),
      userId,
    });

    return result;
  });

  // 获取隐藏任务列表
  fastify.get('/hidden', { preHandler: authenticate }, async (request) => {
    const { limit = '20', offset = '0' } = request.query as any;
    const userId = (request as any).user?.id;

    const result = await getHiddenTasks({
      limit: parseInt(limit),
      offset: parseInt(offset),
      userId,
    });

    return result;
  });

  // 管理员：清理过期任务
  fastify.post('/cleanup', { preHandler: authenticate }, async () => {
    const result = await cleanupExpiredTasks();
    return result;
  });
}