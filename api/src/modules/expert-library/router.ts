// Expert Library Router — Fastify 插件
// 可挂载到任何 Fastify app：fastify.register(createRouter(engine), { prefix: '/api/v1/expert-library' })

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertRequest } from './types.js';

export function createRouter(engine: ExpertEngine) {
  return async function expertLibraryRoutes(fastify: FastifyInstance) {

    // ===== 核心调用接口 =====

    /**
     * POST /invoke — 调用专家执行任务
     */
    fastify.post('/invoke', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const req: ExpertRequest = {
          expert_id: body.expert_id,
          task_type: body.task_type,
          input_type: body.input_type || 'text',
          input_data: body.input_data,
          context: body.context,
          params: body.params,
        };

        if (!req.expert_id || !req.task_type || !req.input_data) {
          return reply.status(400).send({
            error: 'Missing required fields: expert_id, task_type, input_data',
          });
        }

        const response = await engine.invoke(req);
        return reply.send(response);
      } catch (error: any) {
        console.error('[ExpertLibrary] Invoke error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 专家管理 =====

    /**
     * GET /experts — 列出专家
     */
    fastify.get('/experts', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { domain } = request.query as any;
        const experts = await engine.listExperts(domain ? { domain } : undefined);

        return reply.send({
          total: experts.length,
          experts: experts.map(e => ({
            expert_id: e.expert_id,
            name: e.name,
            domain: e.domain,
            persona: { style: e.persona.style, tone: e.persona.tone },
            method: { frameworks: e.method.frameworks },
          })),
        });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /**
     * GET /experts/:id — 专家详情
     */
    fastify.get('/experts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const expert = await engine.loadExpert(id);
        if (!expert) {
          return reply.status(404).send({ error: 'Expert not found' });
        }
        return reply.send(expert);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 反馈接口 =====

    /**
     * POST /feedback — 提交反馈
     */
    fastify.post('/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { expert_id, invoke_id, human_score, human_notes, actual_outcome, comparison } = request.body as any;

        if (!expert_id || !invoke_id) {
          return reply.status(400).send({ error: 'Missing required fields: expert_id, invoke_id' });
        }

        // 直接通过 adapter 写入 DB
        // 由 ExpertEngine 的 deps.db 处理
        // 这里暂时返回成功，后续 feedbackLoop.ts 会处理聚合分析
        return reply.send({ status: 'received', expert_id, invoke_id });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });
  };
}
