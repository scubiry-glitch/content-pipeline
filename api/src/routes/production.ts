// 生产任务路由
// 核心流程: 创建任务 → 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProductionService } from '../services/production.js';
import { authenticate } from '../middleware/auth.js';

// Validation schemas
const createTaskSchema = z.object({
  topic: z.string().min(1).max(500),
  source_materials: z.array(z.string()).optional(),
  target_formats: z.array(z.enum(['markdown', 'html'])).default(['markdown'])
});

const approveTaskSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().optional()
});

export async function productionRoutes(fastify: FastifyInstance) {
  const productionService = new ProductionService();

  // Create production task
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const body = createTaskSchema.parse(request.body);

    const task = await productionService.createTask({
      topic: body.topic,
      sourceMaterials: body.source_materials || [],
      targetFormats: body.target_formats
    });

    reply.status(201);
    return task;
  });

  // List tasks
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { status, limit = '10', offset = '0' } = request.query as any;

    return await productionService.listTasks({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  });

  // Get task detail
  fastify.get('/:taskId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const task = await productionService.getTask(taskId);

    if (!task) {
      reply.status(404);
      return { error: 'Task not found', code: 'TASK_NOT_FOUND' };
    }

    return task;
  });

  // Manual approval endpoint
  fastify.post('/:taskId/approve', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = approveTaskSchema.parse(request.body);

    const result = await productionService.approveTask(taskId, {
      approved: body.approved,
      feedback: body.feedback
    });

    return result;
  });
}
