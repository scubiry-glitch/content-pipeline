// v4.1 智能流水线编排路由
import { FastifyInstance } from 'fastify';
import { orchestratorEngine, taskScheduler } from '../services/orchestratorService.js';
import { authenticate } from '../middleware/auth.js';

export async function v41OrchestratorRoutes(fastify: FastifyInstance) {
  // 处理工作流
  fastify.post('/process', { preHandler: authenticate }, async (request) => {
    const context = request.body as any;
    const result = await orchestratorEngine.processWorkflow(context);
    return result;
  });

  // 获取规则列表
  fastify.get('/rules', { preHandler: authenticate }, async () => {
    const rules = await orchestratorEngine.getActiveRules();
    return { items: rules };
  });

  // 获取任务队列
  fastify.get('/queue', { preHandler: authenticate }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const tasks = await taskScheduler.getPendingTasks(limit ? parseInt(limit) : 10);
    return { items: tasks };
  });

  // 添加任务到队列
  fastify.post('/queue', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, taskType, stage, priority, dueTime } = request.body as any;

    const task = await taskScheduler.enqueueTask(
      taskId, taskType, stage, priority,
      dueTime ? new Date(dueTime) : undefined
    );

    reply.status(201);
    return task;
  });
}
