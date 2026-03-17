// v4.0 智能审核与合规路由
import { FastifyInstance } from 'fastify';
import { complianceService, ComplianceConfig } from '../services/complianceService.js';
import { authenticate } from '../middleware/auth.js';

export async function v40ComplianceRoutes(fastify: FastifyInstance) {
  // 执行合规检查
  fastify.post('/check', { preHandler: authenticate }, async (request, reply) => {
    const { contentId, content, config } = request.body as {
      contentId: string;
      content: string;
      config?: Partial<ComplianceConfig>;
    };

    if (!contentId || !content) {
      reply.status(400);
      return { error: 'contentId and content are required' };
    }

    const result = await complianceService.checkContent(contentId, content, config);
    return result;
  });

  // 快速检查（不记录日志）
  fastify.post('/quick-check', { preHandler: authenticate }, async (request) => {
    const { content } = request.body as { content: string };

    if (!content) {
      return { error: 'content is required' };
    }

    const result = await complianceService.quickCheck(content);
    return result;
  });

  // 自动修复建议
  fastify.post('/fix', { preHandler: authenticate }, async (request) => {
    const { content, issues } = request.body as { content: string; issues: any[] };

    if (!content || !issues) {
      return { error: 'content and issues are required' };
    }

    const fixed = await complianceService.suggestFixes(content, issues);
    return { original: content, fixed, applied: fixed !== content };
  });

  // 获取规则列表
  fastify.get('/rules', { preHandler: authenticate }, async (request) => {
    const { category } = request.query as { category?: string };
    const rules = await complianceService.getRules(category);
    return { items: rules };
  });

  // 获取单条规则
  fastify.get('/rules/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const rule = await complianceService.getRule(id);

    if (!rule) {
      reply.status(404);
      return { error: 'Rule not found' };
    }

    return rule;
  });

  // 创建规则
  fastify.post('/rules', { preHandler: authenticate }, async (request, reply) => {
    const ruleData = request.body as any;

    try {
      const rule = await complianceService.addRule(ruleData);
      reply.status(201);
      return rule;
    } catch (error) {
      reply.status(400);
      return { error: (error as Error).message };
    }
  });

  // 更新规则
  fastify.put('/rules/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const updates = request.body as any;

    const rule = await complianceService.updateRule(id, updates);
    if (!rule) {
      reply.status(404);
      return { error: 'Rule not found' };
    }

    return rule;
  });

  // 删除规则
  fastify.delete('/rules/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const success = await complianceService.deleteRule(id);

    if (!success) {
      reply.status(404);
      return { error: 'Rule not found' };
    }

    return { success: true };
  });

  // 获取检测历史
  fastify.get('/history', { preHandler: authenticate }, async (request) => {
    const { contentId, limit } = request.query as { contentId?: string; limit?: string };
    const history = await complianceService.getCheckHistory(
      contentId,
      limit ? parseInt(limit) : 50
    );
    return { items: history };
  });
}
