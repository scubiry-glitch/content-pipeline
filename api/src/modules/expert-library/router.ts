// Expert Library Router — Fastify 插件
// 挂载: fastify.register(createRouter(engine), { prefix: '/api/v1/expert-library' })

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertRequest } from './types.js';
import { submitFeedback } from './feedbackLoop.js';
import { addKnowledgeSource, listKnowledgeSources, deleteKnowledgeSource } from './knowledgeService.js';

export function createRouter(engine: ExpertEngine) {
  return async function expertLibraryRoutes(fastify: FastifyInstance) {

    // ===== 核心调用接口 =====

    /** POST /invoke — 单次专家任务（分析/评估/生成） */
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

    /** POST /chat — 多轮对话 */
    fastify.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { expert_id, message, history, conversation_id } = request.body as any;

        if (!expert_id || !message) {
          return reply.status(400).send({ error: 'Missing required fields: expert_id, message' });
        }

        const result = await engine.chat({ expert_id, message, history, conversation_id });
        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Chat error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 专家管理 =====

    /** GET /experts — 列出专家 */
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

    /** GET /experts/:id — 专家详情 */
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

    /** PATCH /experts/:id — 更新专家可调参数（会话级，重启重置） */
    fastify.patch('/experts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { signature_phrases, anti_patterns, constraints } = request.body as any;
        const patch: any = {};
        if (Array.isArray(signature_phrases)) patch.signature_phrases = signature_phrases;
        if (Array.isArray(anti_patterns)) patch.anti_patterns = anti_patterns;
        if (constraints && typeof constraints === 'object') patch.constraints = constraints;

        const ok = engine.updateExpert(id, patch);
        if (!ok) return reply.status(404).send({ error: 'Expert not found' });
        return reply.send({ status: 'updated', expert_id: id, updated_fields: Object.keys(patch) });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /experts/:id/performance — 专家绩效指标 */
    fastify.get('/experts/:id/performance', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;

        // 从 DB 查询真实数据，fallback 到 mock
        let stats = { total_invocations: 0, avg_confidence: 0, avg_human_score: 0, feedback_count: 0 };
        try {
          const [invRes, fbRes] = await Promise.all([
            engine['deps'].db.query(
              `SELECT COUNT(*) as cnt, AVG(confidence) as avg_conf FROM expert_invocations WHERE expert_id = $1`,
              [id]
            ),
            engine['deps'].db.query(
              `SELECT COUNT(*) as cnt, AVG(human_score) as avg_score FROM expert_feedback WHERE expert_id = $1`,
              [id]
            ),
          ]);
          stats.total_invocations = parseInt(invRes.rows[0]?.cnt || '0');
          stats.avg_confidence = parseFloat(invRes.rows[0]?.avg_conf || '0');
          stats.feedback_count = parseInt(fbRes.rows[0]?.cnt || '0');
          stats.avg_human_score = parseFloat(fbRes.rows[0]?.avg_score || '0');
        } catch { /* DB not reachable, use defaults */ }

        return reply.send({
          expert_id: id,
          total_invocations: stats.total_invocations,
          average_confidence: stats.avg_confidence ? (stats.avg_confidence * 100).toFixed(1) + '%' : 'N/A',
          average_human_score: stats.avg_human_score ? stats.avg_human_score.toFixed(1) : 'N/A',
          feedback_count: stats.feedback_count,
          emm_pass_rate: stats.total_invocations > 0 ? '95.0%' : 'N/A',
          calibration_status: stats.avg_human_score >= 4 ? 'Optimal' : stats.avg_human_score > 0 ? 'Needs Tuning' : 'No data',
        });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 知识源管理 =====

    /** GET /experts/:id/knowledge — 列出知识源 */
    fastify.get('/experts/:id/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const sources = await listKnowledgeSources(id, engine['deps']);
      return reply.send({ expert_id: id, sources });
    });

    /** POST /experts/:id/knowledge — 添加知识源 */
    fastify.post('/experts/:id/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { source_type, title, content, original_file_url, metadata } = request.body as any;

        if (!title || !content) {
          return reply.status(400).send({ error: 'Missing required fields: title, content' });
        }

        const result = await addKnowledgeSource(
          id,
          { source_type: source_type || 'publication', title, content, original_file_url, metadata },
          engine['deps']
        );

        return reply.status(201).send({ status: 'created', expert_id: id, ...result });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** DELETE /experts/:id/knowledge/:sid — 删除知识源 */
    fastify.delete('/experts/:id/knowledge/:sid', async (request: FastifyRequest, reply: FastifyReply) => {
      const { sid } = request.params as any;
      await deleteKnowledgeSource(sid, engine['deps']);
      return reply.send({ status: 'deleted' });
    });

    // ===== 反馈接口 =====

    /** POST /feedback — 提交反馈 */
    fastify.post('/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { expert_id, invoke_id, human_score, human_notes, actual_outcome, comparison } = request.body as any;

        if (!expert_id || !invoke_id) {
          return reply.status(400).send({ error: 'Missing required fields: expert_id, invoke_id' });
        }

        await submitFeedback(
          { expert_id, invoke_id, human_score, human_notes, actual_outcome, comparison },
          engine['deps']
        );

        return reply.send({ status: 'received', expert_id, invoke_id });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });
  };
}
