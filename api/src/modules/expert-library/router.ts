// Expert Library Router — Fastify 插件
// 挂载: fastify.register(createRouter(engine), { prefix: '/api/v1/expert-library' })

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertRequest, OutlineReviewRequest } from './types.js';
import { submitFeedback, applyCalibration } from './feedbackLoop.js';
import { addKnowledgeSource, listKnowledgeSources, deleteKnowledgeSource } from './knowledgeService.js';
import { OutlineExpertReviewer } from './outlineReviewer.js';
import { DebateEngine } from './debateEngine.js';
import { ExpertMatcher } from './expertMatcher.js';
import { SchedulingService } from './schedulingService.js';
import { HotTopicExpertService } from './hotTopicExpertService.js';
import { AssetExpertService } from './assetExpertService.js';
import { seedDefaultBuiltinExpertsToDb, getBuiltinSyncManifest, syncBuiltinExpertItem } from './expertSeed.js';
import { researchAndGenerateProfile } from './researchService.js';
import {
  buildMentalModelGraph,
  findExpertsByModel,
  listSharedModels,
  listAllModels,
  type MentalModelGraphEntry,
} from './mentalModelGraph.js';
import { getExpertOverviewStats } from './statsService.js';

/** JSONB / 脏字符串兼容，避免 JSON.parse 抛错导致 GET /experts/full 500 */
function coerceJsonObject(val: unknown): Record<string, unknown> {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function createRouter(engine: ExpertEngine) {
  // Phase 8: mental model 图谱缓存 — lazy build + 可刷新
  let cachedMmGraph: Map<string, MentalModelGraphEntry> | null = null;
  let cachedMmGraphAt = 0;
  const MM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

  async function getMmGraph(): Promise<Map<string, MentalModelGraphEntry>> {
    const now = Date.now();
    if (cachedMmGraph && now - cachedMmGraphAt < MM_CACHE_TTL_MS) {
      return cachedMmGraph;
    }
    cachedMmGraph = await buildMentalModelGraph(engine);
    cachedMmGraphAt = now;
    return cachedMmGraph;
  }

  return async function expertLibraryRoutes(fastify: FastifyInstance) {

    // ===== 全景图统一统计 (供 /expert-library/panorama 页面) =====
    fastify.get('/stats/overview', async () => getExpertOverviewStats(engine.getDeps()));

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

    /** PATCH /experts/:id — 部分更新专家参数（持久化到 DB） */
    fastify.patch('/experts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const body = request.body as any;
        const patch: any = {};
        if (Array.isArray(body.signature_phrases)) patch.signature_phrases = body.signature_phrases;
        if (Array.isArray(body.anti_patterns)) patch.anti_patterns = body.anti_patterns;
        if (body.constraints && typeof body.constraints === 'object') patch.constraints = body.constraints;
        if (body.persona && typeof body.persona === 'object') patch.persona = body.persona;
        if (body.method && typeof body.method === 'object') patch.method = body.method;
        if (body.emm && typeof body.emm === 'object') patch.emm = body.emm;
        if (body.output_schema && typeof body.output_schema === 'object') patch.output_schema = body.output_schema;

        const ok = engine.updateExpert(id, patch);
        if (!ok) return reply.status(404).send({ error: 'Expert not found' });
        return reply.send({ status: 'updated', expert_id: id, updated_fields: Object.keys(patch) });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** PUT /experts/:id — 全量更新专家 profile（持久化） */
    fastify.put('/experts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const body = request.body as any;
        const profile = { ...body, expert_id: id };
        const ok = engine.updateExpert(id, profile);
        if (!ok) {
          // 新专家，创建
          await engine.createExpert(profile);
        }
        return reply.send({ status: 'saved', expert_id: id });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /experts — 创建新专家 */
    fastify.post('/experts', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        if (!body.expert_id || !body.name) {
          return reply.status(400).send({ error: 'Missing required fields: expert_id, name' });
        }
        await engine.createExpert(body);
        return reply.status(201).send({ status: 'created', expert_id: body.expert_id });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** DELETE /experts/:id — 软删除专家 */
    fastify.delete('/experts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const ok = await engine.deleteExpert(id);
        if (!ok) return reply.status(404).send({ error: 'Expert not found' });
        return reply.send({ status: 'deleted', expert_id: id });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /experts/full — 前端兼容的完整专家列表（含 display_metadata） */
    fastify.get('/experts/full', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { domain } = request.query as any;
        // 直接从 DB 查询含 display_metadata 的数据
        const result = await engine['deps'].db.query(
          `SELECT * FROM expert_profiles WHERE is_active = true ORDER BY name`
        );

        const experts = result.rows.map((row: any) => {
          const dm = coerceJsonObject(row.display_metadata);
          const persona = coerceJsonObject(row.persona);
          const method = coerceJsonObject(row.method);
          const emm = coerceJsonObject(row.emm);

          return {
            id: row.expert_id,
            name: row.name,
            code: dm.code || row.expert_id,
            level: dm.level || (row.expert_id.startsWith('S-') ? 'senior' : 'domain'),
            domainCode: dm.domainCode || row.expert_id.split('-')[0],
            domainName: dm.domainName || (Array.isArray(row.domain) ? row.domain[0] : ''),
            profile: dm.profile || {
              title: persona.tone || '',
              background: persona.tone || '',
              personality: persona.style || '',
            },
            philosophy: dm.philosophy || {
              core: persona.bias || [],
              quotes: row.signature_phrases || [],
            },
            achievements: dm.achievements || [],
            reviewDimensions: dm.reviewDimensions || emm?.critical_factors || [],
            status: dm.status || 'active',
            totalReviews: dm.totalReviews || 0,
            acceptanceRate: dm.acceptanceRate || 0,
            avgResponseTime: dm.avgResponseTime || 0,
            angle: dm.angle || undefined,
          };
        });

        // 前端 domain 过滤
        const filtered = domain
          ? experts.filter((e: any) => e.domainCode === domain || e.domainName === domain)
          : experts;

        return reply.send({ total: filtered.length, experts: filtered });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /admin/sync-builtins — 手动将内置专家同步到数据库（需 X-API-Key） */
    fastify.post(
      '/admin/sync-builtins',
      { preHandler: authenticate },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
          const stats = await seedDefaultBuiltinExpertsToDb(engine.getDeps());
          return reply.send({ ok: true, ...stats });
        } catch (error: any) {
          console.error('[ExpertLibrary] sync-builtins error:', error);
          return reply.status(500).send({ ok: false, error: error.message });
        }
      }
    );

    /** GET /admin/sync-builtins/manifest — 内置专家同步顺序列表（供前端逐项同步与进度） */
    fastify.get(
      '/admin/sync-builtins/manifest',
      { preHandler: authenticate },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
          const m = await getBuiltinSyncManifest();
          return reply.send(m);
        } catch (error: any) {
          console.error('[ExpertLibrary] sync-builtins manifest error:', error);
          return reply.status(500).send({ error: error.message });
        }
      }
    );

    /** POST /admin/sync-builtins/item — 同步单个内置专家；重复时先发无 duplicate_resolution，返回 duplicate_pending */
    fastify.post(
      '/admin/sync-builtins/item',
      { preHandler: authenticate },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const { expert_id, duplicate_resolution } = request.body as {
            expert_id?: string;
            duplicate_resolution?: 'skip' | 'overwrite';
          };
          if (!expert_id || typeof expert_id !== 'string') {
            return reply.status(400).send({ ok: false, error: '缺少 expert_id' });
          }
          if (
            duplicate_resolution !== undefined &&
            duplicate_resolution !== 'skip' &&
            duplicate_resolution !== 'overwrite'
          ) {
            return reply.status(400).send({ ok: false, error: 'duplicate_resolution 须为 skip 或 overwrite' });
          }
          const result = await syncBuiltinExpertItem(engine.getDeps(), expert_id, duplicate_resolution);
          if (!result.ok) {
            return reply.status(400).send({ ok: false, error: result.error });
          }
          return reply.send({ ok: true, status: result.status, expert_id: result.expert_id, name: result.name });
        } catch (error: any) {
          console.error('[ExpertLibrary] sync-builtins item error:', error);
          return reply.status(500).send({ ok: false, error: error.message });
        }
      }
    );
    /** POST /experts/research-generate — 6 Agent 并行调研 + 三重验证 + Profile 生成 */
    fastify.post(
      '/experts/research-generate',
      { preHandler: authenticate },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const { name, domain, expert_id, title, background, depth } = request.body as {
            name?: string;
            domain?: string;
            expert_id?: string;
            title?: string;
            background?: string;
            depth?: 'quick' | 'standard' | 'deep';
          };
          if (!name || !domain) {
            return reply.status(400).send({ ok: false, error: '缺少必填字段: name, domain' });
          }
          const result = await researchAndGenerateProfile(
            { name, domain, expertId: expert_id, title, background, depth },
            engine.getDeps()
          );
          return reply.send({ ok: true, ...result });
        } catch (error: any) {
          console.error('[ExpertLibrary] research-generate error:', error);
          return reply.status(500).send({ ok: false, error: error.message });
        }
      }
    );

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

    /** GET /experts/:id/invocations — 调用历史（分页） */
    fastify.get('/experts/:id/invocations', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { limit = '20', offset = '0' } = request.query as any;
        const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const off = Math.max(0, parseInt(offset) || 0);

        const result = await engine['deps'].db.query(
          `SELECT id, expert_id, task_type, input_type, input_summary,
                  output_sections, confidence, created_at
           FROM expert_invocations
           WHERE expert_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [id, lim, off]
        );

        const countRes = await engine['deps'].db.query(
          `SELECT COUNT(*) as cnt FROM expert_invocations WHERE expert_id = $1`,
          [id]
        );
        const total = parseInt(countRes.rows[0]?.cnt || '0');

        return reply.send({
          expert_id: id,
          total,
          limit: lim,
          offset: off,
          invocations: result.rows.map((row: any) => ({
            invoke_id: row.id,
            task_type: row.task_type,
            input_type: row.input_type,
            input_summary: row.input_summary,
            output_sections: typeof row.output_sections === 'string'
              ? JSON.parse(row.output_sections) : row.output_sections,
            confidence: row.confidence,
            created_at: row.created_at,
          })),
        });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /experts/:id/feedback-history — 反馈历史（分页） */
    fastify.get('/experts/:id/feedback-history', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { limit = '20', offset = '0' } = request.query as any;
        const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const off = Math.max(0, parseInt(offset) || 0);

        const result = await engine['deps'].db.query(
          `SELECT id, expert_id, invoke_id, human_score, human_notes,
                  rubric_scores, actual_outcome, comparison, created_at
           FROM expert_feedback
           WHERE expert_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [id, lim, off]
        );

        const countRes = await engine['deps'].db.query(
          `SELECT COUNT(*) as cnt FROM expert_feedback WHERE expert_id = $1`,
          [id]
        );
        const total = parseInt(countRes.rows[0]?.cnt || '0');

        return reply.send({
          expert_id: id,
          total,
          limit: lim,
          offset: off,
          feedback: result.rows.map((row: any) => ({
            feedback_id: row.id,
            invoke_id: row.invoke_id,
            human_score: row.human_score,
            human_notes: row.human_notes,
            rubric_scores: typeof row.rubric_scores === 'string'
              ? JSON.parse(row.rubric_scores) : row.rubric_scores,
            actual_outcome: typeof row.actual_outcome === 'string'
              ? JSON.parse(row.actual_outcome) : row.actual_outcome,
            created_at: row.created_at,
          })),
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

    // ===== 专家匹配接口 =====

    /** POST /match — 根据任务信息匹配专家 */
    fastify.post('/match', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { topic, industry, taskType, importance } = request.body as any;

        if (!topic) {
          return reply.status(400).send({ error: 'Missing required field: topic' });
        }

        const matcher = new ExpertMatcher(engine, engine['deps']);
        const result = await matcher.match({ topic, industry, taskType, importance });
        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Match error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 大纲评审接口 =====

    /** POST /review-outline — 触发专家评审大纲 */
    fastify.post('/review-outline', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId, topic, outline, expertIds, autoRevise } = request.body as any;

        if (!taskId || !topic || !outline) {
          return reply.status(400).send({
            error: 'Missing required fields: taskId, topic, outline',
          });
        }

        const reviewer = new OutlineExpertReviewer(engine, engine['deps']);
        const result = await reviewer.reviewOutline({
          taskId,
          topic,
          outline,
          expertIds,
          autoRevise: autoRevise ?? true,
        });

        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Outline review error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 反馈接口 =====

    /** POST /feedback — 提交反馈（Phase 6 支持 rubric_scores） */
    fastify.post('/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          expert_id, invoke_id, human_score, human_notes, actual_outcome, comparison, rubric_scores,
        } = request.body as any;

        if (!expert_id || !invoke_id) {
          return reply.status(400).send({ error: 'Missing required fields: expert_id, invoke_id' });
        }

        // Phase 6: 校验 rubric_scores 格式（可选 Record<string, 1-5>）
        let cleanedRubricScores: Record<string, number> | undefined;
        if (rubric_scores && typeof rubric_scores === 'object' && !Array.isArray(rubric_scores)) {
          cleanedRubricScores = {};
          for (const [dim, val] of Object.entries(rubric_scores)) {
            const num = Number(val);
            if (Number.isFinite(num) && num >= 1 && num <= 5) {
              cleanedRubricScores[dim] = Math.round(num);
            }
          }
          if (Object.keys(cleanedRubricScores).length === 0) cleanedRubricScores = undefined;
        }

        await submitFeedback(
          {
            expert_id,
            invoke_id,
            human_score,
            human_notes,
            actual_outcome,
            comparison,
            rubric_scores: cleanedRubricScores,
          },
          engine['deps']
        );

        return reply.send({ status: 'received', expert_id, invoke_id });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 辩论接口 =====

    /** POST /debate — 多专家协作辩论 */
    fastify.post('/debate', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { topic, content, expertIds, rounds, temperature, context } = request.body as any;

        if (!topic || !content || !expertIds || !Array.isArray(expertIds) || expertIds.length < 2) {
          return reply.status(400).send({
            error: 'Missing required fields: topic, content, expertIds (array of 2-4 expert IDs)',
          });
        }

        const debateEngine = new DebateEngine(engine, engine['deps']);
        const result = await debateEngine.debate({ topic, content, expertIds, rounds, temperature, context });
        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Debate error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /debates — 辩论历史列表（?include_hidden=true 显示已隐藏的） */
    fastify.get('/debates', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { limit, include_hidden } = request.query as any;
        const debateEngine = new DebateEngine(engine, engine['deps']);
        const debates = await debateEngine.listDebates(
          parseInt(limit) || 20,
          include_hidden === 'true',
        );
        return reply.send({ total: debates.length, debates });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /debates/:id — 辩论详情 */
    fastify.get('/debates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const debateEngine = new DebateEngine(engine, engine['deps']);
        const result = await debateEngine.getDebate(id);
        if (!result) return reply.status(404).send({ error: 'Debate not found' });
        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** PATCH /debates/:id/hide — 隐藏/取消隐藏辩论 */
    fastify.patch('/debates/:id/hide', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { hidden } = request.body as { hidden?: boolean };
        const isHidden = hidden !== false;
        await engine['deps'].db.query(
          `UPDATE expert_invocations SET is_hidden = $1 WHERE id = $2 AND task_type = 'debate'`,
          [isHidden, id]
        );
        return reply.send({ ok: true, id, is_hidden: isHidden });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** PATCH /debates/:id/rate — 辩论打分（1-5），同时反馈给参与专家的 feedbackLoop */
    fastify.patch('/debates/:id/rate', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { rating } = request.body as { rating?: number };
        if (!rating || rating < 1 || rating > 5) {
          return reply.status(400).send({ error: 'rating must be 1-5' });
        }
        const score = Math.round(rating);

        // 更新辩论记录的 user_rating
        await engine['deps'].db.query(
          `UPDATE expert_invocations SET user_rating = $1, rated_at = NOW() WHERE id = $2 AND task_type = 'debate'`,
          [score, id]
        );

        // 从辩论记录中提取参与专家，将评分反馈给每位专家的 feedbackLoop
        try {
          const debateRow = await engine['deps'].db.query(
            `SELECT expert_id, params FROM expert_invocations WHERE id = $1 AND task_type = 'debate'`,
            [id]
          );
          if (debateRow.rows.length > 0) {
            const row = debateRow.rows[0];
            const params = typeof row.params === 'string' ? JSON.parse(row.params) : (row.params || {});
            const expertIds: string[] = params.expertIds || [row.expert_id];
            for (const eid of expertIds) {
              await submitFeedback(
                {
                  expert_id: eid,
                  invoke_id: id,
                  human_score: score,
                  human_notes: `辩论评分 ${score}/5`,
                },
                engine['deps']
              ).catch(err => console.warn(`[Debate rate] feedback for ${eid} failed:`, err));
            }
          }
        } catch (fbErr) {
          console.warn('[Debate rate] feedback submission failed:', fbErr);
        }

        return reply.send({ ok: true, id, rating: score });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 校准接口 =====

    /** POST /calibrate/:id — 应用反馈校准，更新专家权重 */
    fastify.post('/calibrate/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const result = await applyCalibration(id, engine['deps']);
        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Calibration error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 调度接口 =====

    /** GET /scheduling/workloads — 获取全部专家工作量 */
    fastify.get('/scheduling/workloads', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const scheduler = new SchedulingService(engine, engine['deps']);
        const workloads = await scheduler.getAllWorkloads();
        return reply.send({ total: workloads.length, workloads });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /scheduling/workload/:id — 获取单个专家工作量 */
    fastify.get('/scheduling/workload/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const scheduler = new SchedulingService(engine, engine['deps']);
        const workload = await scheduler.getWorkload(id);
        if (!workload) return reply.status(404).send({ error: 'Expert not found' });
        return reply.send(workload);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /scheduling/assign — 分配任务给专家 */
    fastify.post('/scheduling/assign', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { expertId, taskId, role, deadline } = request.body as any;
        if (!expertId || !taskId) {
          return reply.status(400).send({ error: 'Missing required fields: expertId, taskId' });
        }
        const scheduler = new SchedulingService(engine, engine['deps']);
        const result = await scheduler.assignTask(expertId, taskId, role || 'reviewer', deadline);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /scheduling/complete — 标记任务完成 */
    fastify.post('/scheduling/complete', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { expertId, taskId } = request.body as any;
        if (!expertId || !taskId) {
          return reply.status(400).send({ error: 'Missing required fields: expertId, taskId' });
        }
        const scheduler = new SchedulingService(engine, engine['deps']);
        await scheduler.completeTask(expertId, taskId);
        return reply.send({ status: 'completed' });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /scheduling/available — 获取可用专家 */
    fastify.get('/scheduling/available', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { domain } = request.query as any;
        const scheduler = new SchedulingService(engine, engine['deps']);
        const available = await scheduler.getAvailableExperts(domain);
        return reply.send({
          total: available.length,
          experts: available.map(a => ({
            expert_id: a.expert.expert_id,
            name: a.expert.name,
            domain: a.expert.domain,
            activeTaskCount: a.workload.activeTaskCount,
            availability: a.workload.availability,
          })),
        });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** PUT /scheduling/availability/:id — 更新专家可用状态 */
    fastify.put('/scheduling/availability/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as any;
        const { status } = request.body as any;
        if (!['available', 'busy', 'unavailable'].includes(status)) {
          return reply.status(400).send({ error: 'Invalid status. Must be: available, busy, unavailable' });
        }
        const scheduler = new SchedulingService(engine, engine['deps']);
        await scheduler.updateAvailability(id, status);
        return reply.send({ expertId: id, availability: status });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /scheduling/recommend — 基于主题推荐专家 */
    fastify.post('/scheduling/recommend', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { topic, limit } = request.body as any;
        if (!topic) {
          return reply.status(400).send({ error: 'Missing required field: topic' });
        }
        const scheduler = new SchedulingService(engine, engine['deps']);
        const recommendations = await scheduler.recommendExperts(topic, parseInt(limit) || 3);
        return reply.send({
          total: recommendations.length,
          recommendations: recommendations.map(r => ({
            expert_id: r.expert.expert_id,
            name: r.expert.name,
            domain: r.expert.domain,
            matchScore: r.matchScore,
            activeTaskCount: r.workload.activeTaskCount,
            availability: r.workload.availability,
          })),
        });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 热点话题专家观点接口 =====

    /** POST /hot-topic-perspectives — 为热点生成专家观点 */
    fastify.post('/hot-topic-perspectives', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { topicId, topicTitle, topicContent, expertIds } = request.body as any;
        if (!topicId || !topicTitle) {
          return reply.status(400).send({ error: 'Missing required fields: topicId, topicTitle' });
        }
        const service = new HotTopicExpertService(engine, engine['deps']);
        const result = await service.generatePerspectives(topicId, topicTitle, topicContent, expertIds);
        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Hot topic perspectives error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /hot-topic-perspectives/:topicId — 获取热点的专家观点 */
    fastify.get('/hot-topic-perspectives/:topicId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { topicId } = request.params as any;
        const service = new HotTopicExpertService(engine, engine['deps']);
        const result = await service.getPerspectives(topicId);
        if (!result) return reply.status(404).send({ error: 'No perspectives found' });
        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== 素材专家标注接口 =====

    /** POST /asset-annotations — 生成素材专家标注 */
    fastify.post('/asset-annotations', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { assetId, assetTitle, assetContent, assetTags, expertIds } = request.body as any;
        if (!assetId || !assetTitle || !assetContent) {
          return reply.status(400).send({ error: 'Missing required fields: assetId, assetTitle, assetContent' });
        }
        const service = new AssetExpertService(engine, engine['deps']);
        const result = await service.annotateAsset(assetId, assetTitle, assetContent, assetTags, expertIds);
        return reply.send(result);
      } catch (error: any) {
        console.error('[ExpertLibrary] Asset annotation error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /asset-annotations/:assetId — 获取素材标注 */
    fastify.get('/asset-annotations/:assetId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { assetId } = request.params as any;
        const service = new AssetExpertService(engine, engine['deps']);
        const result = await service.getAnnotations(assetId);
        if (!result) return reply.status(404).send({ error: 'No annotations found' });
        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /asset-credibility — 素材可信度评估 */
    fastify.post('/asset-credibility', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { assetId, assetTitle, assetContent, expertIds } = request.body as any;
        if (!assetId || !assetTitle || !assetContent) {
          return reply.status(400).send({ error: 'Missing required fields: assetId, assetTitle, assetContent' });
        }
        const service = new AssetExpertService(engine, engine['deps']);
        const result = await service.assessCredibility(assetId, assetTitle, assetContent, expertIds);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ===== Phase 8: Mental Model Graph 接口 =====

    /** GET /mental-models — 列出所有心智模型（查询参数 ?shared=true 仅返回共享） */
    fastify.get('/mental-models', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { shared } = request.query as { shared?: string };
        const graph = await getMmGraph();
        const models = shared === 'true' ? listSharedModels(graph) : listAllModels(graph);
        return reply.send({
          total: models.length,
          shared_count: listSharedModels(graph).length,
          models: models.map(m => ({
            name: m.name,
            expertCount: m.expertCount,
            isShared: m.isShared,
            experts: m.experts.map(e => ({ expert_id: e.expert_id, name: e.expert_name })),
          })),
        });
      } catch (error: any) {
        console.error('[ExpertLibrary] /mental-models error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    /** POST /mental-models/refresh — 强制重建图谱缓存（专家 profile 更新后调用） */
    fastify.post('/mental-models/refresh', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        cachedMmGraph = null;
        cachedMmGraphAt = 0;
        const graph = await getMmGraph();
        return reply.send({ ok: true, total: graph.size });
      } catch (error: any) {
        return reply.status(500).send({ ok: false, error: error.message });
      }
    });

    /** GET /mental-models/catalog — 必须在 /:name 之前，否则 Fastify 把 `catalog` 当成 name */
    fastify.get('/mental-models/catalog', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const graph = await getMmGraph();
        const all = listAllModels(graph);
        // 收集所有专家作为目录 header
        const expertSet = new Set<string>();
        const experts: Array<{ expert_id: string; name: string }> = [];
        for (const entry of all) {
          for (const e of entry.experts) {
            if (!expertSet.has(e.expert_id)) {
              expertSet.add(e.expert_id);
              experts.push({ expert_id: e.expert_id, name: e.expert_name });
            }
          }
        }

        return reply.send({
          generatedAt: new Date().toISOString(),
          totalModels: all.length,
          sharedCount: all.filter(m => m.isShared).length,
          expertCount: expertSet.size,
          experts,
          models: all.map(m => ({
            name: m.name,
            expertCount: m.expertCount,
            isShared: m.isShared,
            variants: m.experts,  // 完整字段，含 evidence/context/failureCondition
          })),
        });
      } catch (error: any) {
        console.error('[ExpertLibrary] /mental-models/catalog error:', error);
        return reply.status(500).send({ error: error.message });
      }
    });

    /** GET /mental-models/:name — 查询某个心智模型的所有使用专家详情 */
    fastify.get('/mental-models/:name', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { name } = request.params as { name: string };
        const graph = await getMmGraph();
        const entry = findExpertsByModel(graph, decodeURIComponent(name));
        if (!entry) {
          return reply.status(404).send({ error: `Mental model not found: ${name}` });
        }
        return reply.send(entry);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });
  };
}
