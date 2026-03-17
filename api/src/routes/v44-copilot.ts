// v4.4 Copilot AI助手路由
import { FastifyInstance } from 'fastify';
import {
  copilotSessionService,
  copilotMessageService,
  copilotSkillService,
  quickActionService
} from '../services/copilotService.js';
import { authenticate } from '../middleware/auth.js';

export async function v44CopilotRoutes(fastify: FastifyInstance) {
  // ============ 会话管理 ============

  // 创建会话
  fastify.post('/sessions', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.userId || !data.sessionType) {
      reply.status(400);
      return { error: 'Missing required fields: userId, sessionType' };
    }

    const session = await copilotSessionService.createSession({
      userId: data.userId,
      sessionType: data.sessionType,
      title: data.title,
      contextId: data.contextId,
      contextType: data.contextType,
      config: data.config
    });

    reply.status(201);
    return session;
  });

  // 获取用户会话列表
  fastify.get('/sessions', { preHandler: authenticate }, async (request) => {
    const { userId, status } = request.query as { userId: string; status?: string };

    if (!userId) {
      return { error: 'Missing required query parameter: userId' };
    }

    const sessions = await copilotSessionService.getUserSessions(userId, status);
    return { items: sessions };
  });

  // 获取会话详情
  fastify.get('/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await copilotSessionService.getSessionById(id);

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return session;
  });

  // 更新会话
  fastify.patch('/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as any;

    const session = await copilotSessionService.updateSession(id, updates);

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return session;
  });

  // 归档会话
  fastify.post('/sessions/:id/archive', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await copilotSessionService.archiveSession(id);

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return session;
  });

  // 删除会话
  fastify.delete('/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await copilotSessionService.deleteSession(id);

    if (!deleted) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    reply.status(204);
    return;
  });

  // ============ 消息管理 ============

  // 发送消息
  fastify.post('/sessions/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { content, contentType, skillName, context } = request.body as any;

    if (!content) {
      reply.status(400);
      return { error: 'Missing required field: content' };
    }

    const result = await copilotMessageService.sendMessage(id, {
      content,
      contentType,
      skillName
    }, context);

    reply.status(201);
    return result;
  });

  // 获取会话消息
  fastify.get('/sessions/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };

    const session = await copilotSessionService.getSessionById(id);
    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    const messages = await copilotMessageService.getSessionMessages(
      id,
      limit ? parseInt(limit) : 50
    );

    return { items: messages };
  });

  // 添加消息反馈
  fastify.post('/messages/:id/feedback', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rating, comment } = request.body as any;

    if (!rating || rating < 1 || rating > 5) {
      reply.status(400);
      return { error: 'Invalid rating, must be 1-5' };
    }

    const updated = await copilotMessageService.addFeedback(id, rating, comment);

    if (!updated) {
      reply.status(404);
      return { error: 'Message not found' };
    }

    reply.status(204);
    return;
  });

  // ============ 技能管理 ============

  // 获取所有技能
  fastify.get('/skills', { preHandler: authenticate }, async (request) => {
    const { category } = request.query as { category?: string };
    const skills = await copilotSkillService.getAllSkills(category);
    return { items: skills };
  });

  // 获取技能详情
  fastify.get('/skills/:name', { preHandler: authenticate }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const skill = await copilotSkillService.getSkillByName(name);

    if (!skill) {
      reply.status(404);
      return { error: 'Skill not found' };
    }

    return skill;
  });

  // 创建技能
  fastify.post('/skills', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.name || !data.displayName || !data.category || !data.systemPrompt) {
      reply.status(400);
      return { error: 'Missing required fields: name, displayName, category, systemPrompt' };
    }

    try {
      const skill = await copilotSkillService.createSkill({
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        category: data.category,
        systemPrompt: data.systemPrompt,
        tools: data.tools,
        triggers: data.triggers,
        createdBy: data.createdBy || 'user'
      });

      reply.status(201);
      return skill;
    } catch (error: any) {
      reply.status(400);
      return { error: error.message };
    }
  });

  // 更新技能
  fastify.patch('/skills/:name', { preHandler: authenticate }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const updates = request.body as any;

    const skill = await copilotSkillService.updateSkill(name, updates);

    if (!skill) {
      reply.status(404);
      return { error: 'Skill not found or is builtin' };
    }

    return skill;
  });

  // 删除技能
  fastify.delete('/skills/:name', { preHandler: authenticate }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const deleted = await copilotSkillService.deleteSkill(name);

    if (!deleted) {
      reply.status(404);
      return { error: 'Skill not found or is builtin' };
    }

    reply.status(204);
    return;
  });

  // 检测适用技能
  fastify.post('/skills/detect', { preHandler: authenticate }, async (request) => {
    const { content } = request.body as any;

    if (!content) {
      return { error: 'Missing required field: content' };
    }

    const skills = await copilotSkillService.detectSkills(content);
    return { items: skills };
  });

  // ============ 快捷指令 ============

  // 获取快捷指令列表
  fastify.get('/quick-actions', { preHandler: authenticate }, async () => {
    const actions = quickActionService.getQuickActions();
    return { items: actions };
  });

  // 执行快捷指令
  fastify.post('/quick-actions/:id/execute', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { content, userId } = request.body as any;

    if (!content || !userId) {
      reply.status(400);
      return { error: 'Missing required fields: content, userId' };
    }

    try {
      const result = await quickActionService.executeQuickAction(
        id,
        content,
        copilotSessionService,
        copilotMessageService,
        userId
      );

      reply.status(201);
      return result;
    } catch (error: any) {
      reply.status(400);
      return { error: error.message };
    }
  });
}
