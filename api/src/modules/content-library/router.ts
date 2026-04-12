// Content Library — Fastify 路由适配层 (薄层)
// 仅做 HTTP ↔ Engine 转发，零业务逻辑

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ContentLibraryEngine } from './ContentLibraryEngine.js';

export function createRouter(engine: ContentLibraryEngine): FastifyPluginAsync {
  return async function contentLibraryRoutes(fastify: FastifyInstance) {

    // ============================================================
    // Layer 3: 混合检索
    // ============================================================

    fastify.post('/search', async (request, reply) => {
      const body = request.body as any;
      const result = await engine.search({
        query: body.query,
        mode: body.mode,
        tier: body.tier,
        limit: body.limit,
        rerankStrategy: body.rerankStrategy,
        domainFilter: body.domainFilter,
        entityFilter: body.entityFilter,
        dateRange: body.dateRange,
        minQualityScore: body.minQualityScore,
        includeExpertKnowledge: body.includeExpertKnowledge,
      });
      return result;
    });

    // ============================================================
    // Layer 2: 层级加载
    // ============================================================

    fastify.get('/assets/:assetId/tiered', async (request, reply) => {
      const { assetId } = request.params as any;
      const { level } = request.query as any;
      return engine.loadTiered(assetId, { level: level || 'L0' });
    });

    // ============================================================
    // Layer 1: 事实 & 实体
    // ============================================================

    fastify.post('/extract', async (request, reply) => {
      const body = request.body as any;
      return engine.extractFacts({
        content: body.content,
        assetId: body.assetId,
        sourceChunkIndex: body.sourceChunkIndex,
      });
    });

    // v7.1 T1.4: 手动触发回填 (两段式重新提取)
    fastify.post('/reextract', async (request, reply) => {
      const body = (request.body || {}) as any;
      return engine.reextractBatch({
        assetIds: Array.isArray(body.assetIds) ? body.assetIds : undefined,
        limit: body.limit ? parseInt(body.limit) : undefined,
        since: body.since,
        minConfidence: body.minConfidence ? parseFloat(body.minConfidence) : undefined,
        dryRun: body.dryRun === true || body.dryRun === 'true',
      });
    });

    fastify.get('/facts', async (request, reply) => {
      const query = request.query as any;
      return engine.queryFacts({
        subject: query.subject,
        predicate: query.predicate,
        domain: query.domain,
        currentOnly: query.currentOnly !== 'false',
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    fastify.get('/entities', async (request, reply) => {
      const query = request.query as any;
      return engine.queryEntities({
        search: query.search,
        entityType: query.entityType,
        domainId: query.domainId,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ============================================================
    // 产出物 API (15 类)
    // ============================================================

    // ① 议题推荐
    fastify.get('/topics/recommended', async (request, reply) => {
      const query = request.query as any;
      return engine.getTopicRecommendations({
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ② 趋势信号
    fastify.get('/trends/:entityId', async (request, reply) => {
      const { entityId } = request.params as any;
      return engine.getTrendSignals(entityId);
    });

    // ⑤ 关键事实
    fastify.get('/facts/key', async (request, reply) => {
      const query = request.query as any;
      return engine.getKeyFacts({
        subject: query.subject,
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑥ 实体关系图谱
    fastify.get('/entities/:entityId/graph', async (request, reply) => {
      const { entityId } = request.params as any;
      return engine.getEntityGraph(entityId);
    });

    // ⑦ 信息增量报告
    fastify.get('/delta', async (request, reply) => {
      const query = request.query as any;
      const since = query.since ? new Date(query.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return engine.getDeltaReport(since);
    });

    // ⑧ 事实保鲜度报告
    fastify.get('/freshness/stale', async (request, reply) => {
      const query = request.query as any;
      return engine.getStaleFacts({
        maxAgeDays: query.maxAgeDays ? parseInt(query.maxAgeDays) : undefined,
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑨ 知识卡片
    fastify.get('/cards/:entityId', async (request, reply) => {
      const { entityId } = request.params as any;
      return engine.getKnowledgeCard(entityId);
    });

    // ⑩ 认知综合
    fastify.post('/synthesize', async (request, reply) => {
      const body = request.body as any;
      return engine.synthesizeInsights({
        subjects: body.subjects,
        domain: body.domain,
        limit: body.limit,
      });
    });

    // ⑪ 素材组合推荐
    fastify.get('/recommendations/:taskType', async (request, reply) => {
      const { taskType } = request.params as any;
      const query = request.query as any;
      return engine.recommendMaterials({
        taskType,
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑫ 专家共识图
    fastify.get('/consensus/:topic', async (request, reply) => {
      const { topic } = request.params as any;
      const query = request.query as any;
      return engine.getExpertConsensus({
        topic,
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑬ 争议话题
    fastify.get('/contradictions', async (request, reply) => {
      const query = request.query as any;
      return engine.getContradictions({
        domain: query.domain,
        severity: query.severity,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑭ 观点演化
    fastify.get('/beliefs/:beliefId/timeline', async (request, reply) => {
      const { beliefId } = request.params as any;
      const query = request.query as any;
      return engine.getBeliefEvolution({
        beliefId,
        subject: query.subject,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑮ 跨领域关联
    fastify.get('/cross-domain/:entityId', async (request, reply) => {
      const { entityId } = request.params as any;
      const query = request.query as any;
      return engine.discoverCrossDomainInsights({
        entityId,
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ============================================================
    // v7.2: Task Purpose Docs 目标锚定
    // ============================================================

    fastify.put('/tasks/:taskId/purpose', async (request, reply) => {
      const { taskId } = request.params as any;
      const body = (request.body || {}) as any;
      if (!body.purposeText) {
        reply.code(400);
        return { error: 'purposeText is required' };
      }
      return engine.setTaskPurpose({
        taskId,
        purposeText: body.purposeText,
        goalEntities: Array.isArray(body.goalEntities) ? body.goalEntities : undefined,
      });
    });

    fastify.get('/tasks/:taskId/purpose', async (request, reply) => {
      const { taskId } = request.params as any;
      const result = await engine.getTaskPurpose(String(taskId));
      if (!result) {
        reply.code(404);
        return { error: 'No purpose doc found for this task' };
      }
      return result;
    });

    // ============================================================
    // v7.2: Louvain 社区发现
    // ============================================================

    fastify.post('/communities/recompute', async (request, reply) => {
      return engine.recomputeCommunities();
    });

    // ============================================================
    // v7.2: 持久化实体关系边表
    // ============================================================

    fastify.post('/relations/recompute', async (request, reply) => {
      return engine.recomputeEntityRelations();
    });

    // ============================================================
    // v7.1: Wiki 生成层 (Obsidian 兼容物化视图)
    // ============================================================

    // 生成 wiki
    fastify.post('/wiki/generate', async (request, reply) => {
      const body = (request.body || {}) as any;
      const wikiRoot = body.wikiRoot || process.env.CONTENT_LIBRARY_WIKI_ROOT || './data/content-wiki/default';
      return engine.wikiGenerator.generate({
        wikiRoot,
        domainFilter: body.domainFilter,
        maxEntities: body.maxEntities ? parseInt(body.maxEntities) : undefined,
        maxFactsPerEntity: body.maxFactsPerEntity ? parseInt(body.maxFactsPerEntity) : undefined,
      });
    });

    // 列出所有已生成的 wiki
    fastify.get('/wiki/list', async (request, reply) => {
      const query = request.query as any;
      const rootDir = query.rootDir || process.env.CONTENT_LIBRARY_WIKI_ROOT_DIR || './data/content-wiki';
      const wikis = await engine.wikiGenerator.listWikis(rootDir);
      return { rootDir, wikis };
    });

    // 列出 wiki 下的文件
    fastify.get('/wiki/files', async (request, reply) => {
      const query = request.query as any;
      const wikiRoot = query.wikiRoot;
      if (!wikiRoot) {
        reply.code(400);
        return { error: 'wikiRoot query parameter required' };
      }
      const files = await engine.wikiGenerator.listFiles(String(wikiRoot));
      return { wikiRoot, files };
    });

    // 读取单个 markdown 文件
    fastify.get('/wiki/preview', async (request, reply) => {
      const query = request.query as any;
      const wikiRoot = query.wikiRoot;
      const relPath = query.path;
      if (!wikiRoot || !relPath) {
        reply.code(400);
        return { error: 'wikiRoot and path query parameters required' };
      }
      const content = await engine.wikiGenerator.readMarkdown(String(wikiRoot), String(relPath));
      if (content === null) {
        reply.code(404);
        return { error: 'File not found' };
      }
      return { wikiRoot, path: relPath, content };
    });
  };
}
