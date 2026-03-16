// v4.2 Stage 3 文稿生成增强路由
import { FastifyInstance } from 'fastify';
import {
  annotationService,
  versionService,
  chatSessionService,
  changeTrackingService
} from '../services/stage3Service.js';
import { authenticate } from '../middleware/auth.js';

export async function v42Stage3Routes(fastify: FastifyInstance) {
  // ============ 标注相关路由 ============

  // 创建标注
  fastify.post('/annotations', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.draftId || !data.type || data.startOffset === undefined || data.endOffset === undefined || !data.selectedText) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, type, startOffset, endOffset, selectedText' };
    }

    const annotation = await annotationService.createAnnotation({
      draftId: data.draftId,
      versionId: data.versionId,
      type: data.type,
      startOffset: data.startOffset,
      endOffset: data.endOffset,
      selectedText: data.selectedText,
      comment: data.comment,
      suggestion: data.suggestion,
      createdBy: data.createdBy || 'user'
    });

    reply.status(201);
    return annotation;
  });

  // 获取文稿标注列表
  fastify.get('/annotations', { preHandler: authenticate }, async (request) => {
    const { draftId, versionId } = request.query as { draftId: string; versionId?: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const annotations = await annotationService.getAnnotationsByDraft(draftId, versionId);
    return { items: annotations };
  });

  // 获取标注详情
  fastify.get('/annotations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const annotation = await annotationService.getAnnotationById(id);

    if (!annotation) {
      reply.status(404);
      return { error: 'Annotation not found' };
    }

    return annotation;
  });

  // 更新标注状态
  fastify.patch('/annotations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, comment, suggestion } = request.body as any;

    const annotation = await annotationService.updateAnnotationStatus(id, status, { comment, suggestion });

    if (!annotation) {
      reply.status(404);
      return { error: 'Annotation not found' };
    }

    return annotation;
  });

  // 删除标注
  fastify.delete('/annotations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await annotationService.deleteAnnotation(id);

    if (!deleted) {
      reply.status(404);
      return { error: 'Annotation not found' };
    }

    reply.status(204);
    return;
  });

  // 获取标注统计
  fastify.get('/annotations/stats', { preHandler: authenticate }, async (request) => {
    const { draftId } = request.query as { draftId: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const stats = await annotationService.getAnnotationStats(draftId);
    return stats;
  });

  // ============ 版本相关路由 ============

  // 创建版本
  fastify.post('/versions', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.draftId || !data.content) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, content' };
    }

    const version = await versionService.createVersion({
      draftId: data.draftId,
      name: data.name,
      content: data.content,
      createdBy: data.createdBy || 'user',
      autoSave: data.autoSave
    });

    reply.status(201);
    return version;
  });

  // 自动保存
  fastify.post('/versions/auto-save', { preHandler: authenticate }, async (request, reply) => {
    const { draftId, content, createdBy } = request.body as any;

    if (!draftId || !content) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, content' };
    }

    const version = await versionService.autoSave(draftId, content, createdBy || 'user');
    return version;
  });

  // 获取文稿版本列表
  fastify.get('/versions', { preHandler: authenticate }, async (request) => {
    const { draftId } = request.query as { draftId: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const versions = await versionService.getVersionsByDraft(draftId);
    return { items: versions };
  });

  // 获取版本详情
  fastify.get('/versions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const version = await versionService.getVersionById(id);

    if (!version) {
      reply.status(404);
      return { error: 'Version not found' };
    }

    return version;
  });

  // 删除版本
  fastify.delete('/versions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await versionService.deleteVersion(id);

    if (!deleted) {
      reply.status(404);
      return { error: 'Version not found' };
    }

    reply.status(204);
    return;
  });

  // 比较版本
  fastify.get('/versions/:id1/compare/:id2', { preHandler: authenticate }, async (request, reply) => {
    const { id1, id2 } = request.params as { id1: string; id2: string };
    const comparison = await versionService.compareVersions(id1, id2);

    if (!comparison) {
      reply.status(404);
      return { error: 'One or both versions not found' };
    }

    return comparison;
  });

  // ============ 对话会话相关路由 ============

  // 创建会话
  fastify.post('/chat-sessions', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.draftId) {
      reply.status(400);
      return { error: 'Missing required field: draftId' };
    }

    const session = await chatSessionService.createSession({
      draftId: data.draftId,
      versionId: data.versionId,
      contextRange: data.contextRange
    });

    reply.status(201);
    return session;
  });

  // 获取文稿会话列表
  fastify.get('/chat-sessions', { preHandler: authenticate }, async (request) => {
    const { draftId } = request.query as { draftId: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const sessions = await chatSessionService.getSessionsByDraft(draftId);
    return { items: sessions };
  });

  // 获取会话详情
  fastify.get('/chat-sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await chatSessionService.getSessionById(id);

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return session;
  });

  // 添加消息
  fastify.post('/chat-sessions/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role, content } = request.body as any;

    if (!role || !content) {
      reply.status(400);
      return { error: 'Missing required fields: role, content' };
    }

    const session = await chatSessionService.addMessage(id, { role, content });

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return session;
  });

  // 删除会话
  fastify.delete('/chat-sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await chatSessionService.deleteSession(id);

    if (!deleted) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    reply.status(204);
    return;
  });

  // ============ 修改历史相关路由 ============

  // 获取修改历史
  fastify.get('/change-logs', { preHandler: authenticate }, async (request) => {
    const { draftId, limit } = request.query as { draftId: string; limit?: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const logs = await changeTrackingService.getChangeLogs(
      draftId,
      limit ? parseInt(limit) : 50
    );
    return { items: logs };
  });

  // 获取修改详情
  fastify.get('/change-logs/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const log = await changeTrackingService.getChangeLogById(id);

    if (!log) {
      reply.status(404);
      return { error: 'Change log not found' };
    }

    return log;
  });

  // 记录修改
  fastify.post('/change-logs', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.draftId || !data.changeType || !data.changeSummary || !data.changedBy) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, changeType, changeSummary, changedBy' };
    }

    const log = await changeTrackingService.logChange({
      draftId: data.draftId,
      versionFrom: data.versionFrom,
      versionTo: data.versionTo,
      changeType: data.changeType,
      changeSummary: data.changeSummary,
      changesDetail: data.changesDetail,
      changedBy: data.changedBy
    });

    reply.status(201);
    return log;
  });
}
