// Content Library — Fastify 路由适配层 (薄层)
// 仅做 HTTP ↔ Engine 转发，零业务逻辑

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ContentLibraryEngine } from './ContentLibraryEngine.js';
import {
  startReextractJob,
  getReextractJob,
  cancelReextractJob,
  subscribeJob,
  listReextractJobs,
} from './reextractJob.js';
import {
  startSynthesisJob,
  getSynthesisJob,
  cancelSynthesisJob,
  subscribeSynthesisJob,
  listSynthesisJobs,
} from './synthesisJob.js';
import {
  startZepSyncJob,
  getZepSyncJob,
  cancelZepSyncJob,
  subscribeZepSyncJob,
  listZepSyncJobs,
} from './zepSyncJob.js';
import { resolveWikiRoot, resolveWorkspaceSlug, DEFAULT_WIKI_ROOT_ABS } from '../../lib/wikiRoot.js';
import { currentWorkspaceId } from '../../db/repos/withWorkspace.js';
import { dirname } from 'node:path';

export function createRouter(engine: ContentLibraryEngine): FastifyPluginAsync {
  return async function contentLibraryRoutes(fastify: FastifyInstance) {

    // ============================================================
    // v7.3: Pipeline 统一统计 (流水线可视化页面)
    // ============================================================

    fastify.get('/stats/overview', async () => engine.getOverviewStats());

    // ============================================================
    // v7.3: Zep 可选增强 API (无 Zep 时返回 null)
    // ============================================================

    fastify.get('/zep/status', async () => {
      try {
        const { getZepStatus } = await import('../../services/zep/index.js');
        return getZepStatus();
      } catch { return { enabled: false, connected: false, graphUserId: '' }; }
    });

    fastify.get('/zep/entities/:name/graph', async (request) => {
      const { name } = request.params as any;
      const q = request.query as any;
      try {
        const { enhanceEntityGraph } = await import('../../services/zep/index.js');
        return await enhanceEntityGraph(decodeURIComponent(name), q.limit ? parseInt(q.limit) : 20) || { relations: [], source: 'none' };
      } catch { return { relations: [], source: 'none' }; }
    });

    fastify.get('/zep/contradictions/:subject', async (request) => {
      const { subject } = request.params as any;
      try {
        const { enhanceContradictions } = await import('../../services/zep/index.js');
        return await enhanceContradictions(decodeURIComponent(subject)) || { temporalConflicts: [], source: 'none' };
      } catch { return { temporalConflicts: [], source: 'none' }; }
    });

    fastify.get('/zep/beliefs/:proposition/timeline', async (request) => {
      const { proposition } = request.params as any;
      try {
        const { enhanceBeliefTimeline } = await import('../../services/zep/index.js');
        return await enhanceBeliefTimeline(decodeURIComponent(proposition)) || [];
      } catch { return []; }
    });

    fastify.get('/zep/cross-domain/:entity', async (request) => {
      const { entity } = request.params as any;
      try {
        const { enhanceCrossDomain } = await import('../../services/zep/index.js');
        return await enhanceCrossDomain(decodeURIComponent(entity)) || { relations: [], source: 'none' };
      } catch { return { relations: [], source: 'none' }; }
    });

    // Zep 知识回填 — 历史事实批量同步
    fastify.post('/zep/sync/start', async (request) => {
      const body = (request.body || {}) as any;
      const db = (engine as any).deps.db;
      const jobId = startZepSyncJob(db, {
        limit: body.limit ? parseInt(body.limit) : undefined,
        batchSize: body.batchSize ? parseInt(body.batchSize) : 10,
        minConfidence: body.minConfidence ? parseFloat(body.minConfidence) : 0.5,
        forceResync: body.forceResync === true || body.forceResync === 'true',
        maxSyncAttempts: body.maxSyncAttempts ? parseInt(body.maxSyncAttempts, 10) : undefined,
      });
      return { jobId };
    });

    fastify.get('/zep/sync/jobs', async () => listZepSyncJobs());

    fastify.get('/zep/sync/jobs/:jobId', async (request) => {
      const { jobId } = request.params as any;
      return getZepSyncJob(String(jobId)) || { error: 'Job not found' };
    });

    fastify.delete('/zep/sync/jobs/:jobId', async (request) => {
      const { jobId } = request.params as any;
      return { cancelled: cancelZepSyncJob(String(jobId)) };
    });

    fastify.get('/zep/sync/jobs/:jobId/stream', async (request, reply) => {
      const { jobId } = request.params as any;
      const state = getZepSyncJob(String(jobId));
      if (!state) { reply.code(404); return { error: 'Job not found' }; }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);

      if (state.status !== 'running') { reply.raw.end(); return; }

      const unsub = subscribeZepSyncJob(String(jobId), (event, data) => {
        try {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          if (event === 'done') reply.raw.end();
        } catch { /* connection closed */ }
      });
      request.raw.on('close', () => unsub());
    });

    // ============================================================
    // 辅助查询: 下拉选项列表
    // ============================================================

    fastify.get('/dropdown/domains', async () => engine.listDomains());
    fastify.get('/dropdown/entities', async (request) => {
      const q = request.query as any;
      return engine.listEntitiesForDropdown(q.limit ? parseInt(q.limit) : 50);
    });
    fastify.get('/dropdown/beliefs', async () => engine.listBeliefSubjects());

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
    // 同步回填 (小量, 保留向后兼容)
    fastify.post('/reextract', async (request, reply) => {
      const body = (request.body || {}) as any;
      return engine.reextractBatch({
        assetIds: Array.isArray(body.assetIds) ? body.assetIds : undefined,
        limit: body.limit ? parseInt(body.limit) : undefined,
        since: body.since,
        minConfidence: body.minConfidence ? parseFloat(body.minConfidence) : undefined,
        dryRun: body.dryRun === true || body.dryRun === 'true',
        onlyUnprocessed: body.onlyUnprocessed !== false,
        source: body.source === 'rss' ? 'rss' : 'assets',
        minQualityScore: body.minQualityScore ? parseInt(body.minQualityScore) : undefined,
      });
    });

    // v7.2 G2: 异步回填 job (大量素材, SSE 进度推送)
    // v7.3: 支持 minQualityScore 过滤低质素材
    fastify.post('/reextract/start', async (request, reply) => {
      const body = (request.body || {}) as any;
      const jobId = startReextractJob(engine, {
        limit: body.limit ? parseInt(body.limit) : 100,
        since: body.since,
        minConfidence: body.minConfidence ? parseFloat(body.minConfidence) : undefined,
        onlyUnprocessed: body.onlyUnprocessed !== false,
        source: body.source === 'rss' ? 'rss' : 'assets',
        minQualityScore: body.minQualityScore ? parseInt(body.minQualityScore) : undefined,
        enableDeep: body.enableDeep === true,
        expertStrategy: body.expertStrategy,
      });
      return { jobId };
    });

    fastify.get('/reextract/jobs', async () => listReextractJobs());

    fastify.get('/reextract/jobs/:jobId', async (request) => {
      const { jobId } = request.params as any;
      const state = getReextractJob(String(jobId));
      if (!state) return { error: 'Job not found' };
      return state;
    });

    fastify.delete('/reextract/jobs/:jobId', async (request) => {
      const { jobId } = request.params as any;
      const cancelled = cancelReextractJob(String(jobId));
      return { cancelled };
    });

    /**
     * batch-ops 改进 #1: Step 3 质量面板
     *
     * 返回该 job 时间窗内新写入 content_facts 的质量分布：
     *   - confidence buckets: ≤0.5 / 0.5-0.7 / 0.7-0.9 / ≥0.9
     *   - 占位率：subject/predicate/object 含 'unknown' / 'n/a' / '' 的比例
     *   - 平均 confidence + 中位数
     *   - errorSamples 按 kind 聚合（来自 job state）
     * 让用户跑完 Step 3 一眼看出"产出质量是否值得进入 Step 4-6"。
     */
    /**
     * batch-ops 改进 #6: 低质量 fact 扫描器
     *
     * 扫 content_facts 找 confidence ≤ threshold 或含占位词的 fact，按 asset 聚合返回。
     * 让用户在重跑 reextract 前能看到"哪些资产里有几条低质量 fact"，决定是否重提。
     */
    fastify.get('/facts/low-quality', async (request) => {
      const q = request.query as { threshold?: string; placeholder?: string; limit?: string };
      const threshold = Math.min(0.95, Math.max(0, parseFloat(q.threshold ?? '0.5')));
      const includePlaceholder = q.placeholder !== 'false';
      const limit = Math.min(500, Math.max(1, parseInt(q.limit ?? '200', 10)));
      try {
        const r = await (engine as any).deps.db.query(
          `SELECT
             cf.asset_id,
             COALESCE(a.title, cf.asset_id) AS asset_title,
             COUNT(*)::int AS fact_count,
             ROUND(AVG(cf.confidence)::numeric, 3) AS avg_confidence,
             COUNT(*) FILTER (WHERE cf.confidence <= $1)::int AS low_conf_count,
             COUNT(*) FILTER (
               WHERE lower(cf.subject) IN ('unknown','n/a','','null')
                  OR lower(cf.predicate) IN ('unknown','n/a','','null')
                  OR lower(cf.object) IN ('unknown','n/a','','null')
             )::int AS placeholder_count,
             MAX(cf.created_at) AS last_extracted_at
           FROM content_facts cf
           LEFT JOIN assets a ON a.id = cf.asset_id
          WHERE cf.is_current = true
            AND cf.asset_id IS NOT NULL
            AND (
              cf.confidence <= $1
              ${includePlaceholder ? `OR lower(cf.subject) IN ('unknown','n/a','','null')
              OR lower(cf.predicate) IN ('unknown','n/a','','null')
              OR lower(cf.object) IN ('unknown','n/a','','null')` : ''}
            )
          GROUP BY cf.asset_id, a.title
          ORDER BY (placeholder_count + low_conf_count) DESC, fact_count DESC
          LIMIT $2`,
          [threshold, limit],
        );
        return {
          items: r.rows,
          threshold,
          totalAffectedAssets: r.rows.length,
          totalLowQualityFacts: r.rows.reduce((s: number, x: any) =>
            s + Number(x.low_conf_count) + Number(x.placeholder_count), 0),
        };
      } catch (e) {
        return { items: [], error: (e as Error).message, threshold, totalAffectedAssets: 0, totalLowQualityFacts: 0 };
      }
    });

    /**
     * batch-ops 改进 #6: 标记重提
     * 把指定 asset_ids 的 last_reextracted_at 设回 NULL（或删除该列），
     * 下次 reextract 跑 onlyUnprocessed=true 会自动包含它们。
     * 同时（可选）软删除已有的低质量 fact（is_current = false）。
     */
    fastify.post('/facts/mark-for-reextract', async (request, reply) => {
      const body = request.body as { assetIds?: string[]; softDeleteOldFacts?: boolean };
      const assetIds = (body?.assetIds ?? []).filter((x) => typeof x === 'string' && x.length > 0);
      if (assetIds.length === 0) {
        reply.status(400);
        return { error: 'assetIds required' };
      }
      try {
        const db = (engine as any).deps.db;
        // 清 last_reextracted_at（让 onlyUnprocessed=true 重新 pick）
        const cleared = await db.query(
          `UPDATE assets SET last_reextracted_at = NULL
            WHERE id = ANY($1::text[])`,
          [assetIds],
        ).catch(() => ({ rowCount: 0 }));
        let softDeleted = 0;
        if (body?.softDeleteOldFacts) {
          const r = await db.query(
            `UPDATE content_facts SET is_current = false
              WHERE asset_id = ANY($1::text[]) AND is_current = true`,
            [assetIds],
          );
          softDeleted = r.rowCount ?? 0;
        }
        return {
          ok: true,
          markedAssets: (cleared as any).rowCount ?? assetIds.length,
          softDeletedFacts: softDeleted,
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    });

    /**
     * batch-ops 改进 #5: Step 3 dry-run 预估
     * 不真跑，调 reextractBatch 的 dryRun 拿 total + tokenEstimate；
     * 加上 deep 模式倍数（~1.5x for extract deep）+ 平均处理速率得到耗时估算
     */
    fastify.get('/reextract/preview', async (request) => {
      const q = request.query as {
        limit?: string; source?: string;
        minQualityScore?: string; enableDeep?: string;
      };
      const limit = Math.min(500, Math.max(1, parseInt(q.limit ?? '50', 10)));
      try {
        const dry = await engine.reextractBatch({
          limit,
          dryRun: true,
          onlyUnprocessed: true,
          source: (q.source === 'rss' ? 'rss' : 'assets') as 'assets' | 'rss',
          minQualityScore: q.minQualityScore ? parseFloat(q.minQualityScore) : undefined,
          enableDeep: q.enableDeep === 'true',
        });
        const deepMultiplier = q.enableDeep === 'true' ? 1.5 : 1;
        // 单 asset 平均 LLM 调用 = 2 段 * (deep ? 3 : 2) 个 fact
        const llmCalls = Math.round((dry.processed + dry.skipped) * 2 * deepMultiplier);
        // 平均耗时 6s/asset (lite) / 9s (deep) — 经验值
        const etaSeconds = Math.round((dry.processed + dry.skipped) * (q.enableDeep === 'true' ? 9 : 6));
        return {
          target: dry.processed + dry.skipped,
          alreadyProcessed: dry.skipped,
          willProcess: dry.processed,
          filteredByQuality: dry.filteredByQuality ?? 0,
          tokenEstimate: dry.tokenEstimate,
          llmCallsEstimate: llmCalls,
          etaSeconds,
          deep: q.enableDeep === 'true',
        };
      } catch (e) {
        return { error: (e as Error).message, target: 0, willProcess: 0, tokenEstimate: 0, llmCallsEstimate: 0, etaSeconds: 0 };
      }
    });

    fastify.get('/reextract/jobs/:jobId/quality', async (request) => {
      const { jobId } = request.params as any;
      const state = getReextractJob(String(jobId));
      if (!state) return { error: 'Job not found' };

      const startedAt = state.startedAt;
      const completedAt = state.completedAt ?? new Date().toISOString();
      try {
        const r = await (engine as any).deps.db.query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE confidence <= 0.5)::int AS bucket_low,
             COUNT(*) FILTER (WHERE confidence > 0.5 AND confidence <= 0.7)::int AS bucket_mid,
             COUNT(*) FILTER (WHERE confidence > 0.7 AND confidence <= 0.9)::int AS bucket_high,
             COUNT(*) FILTER (WHERE confidence > 0.9)::int AS bucket_top,
             AVG(confidence)::numeric(4,3) AS avg_confidence,
             COUNT(*) FILTER (
               WHERE lower(subject) IN ('unknown', 'n/a', '', 'null')
                  OR lower(predicate) IN ('unknown', 'n/a', '', 'null')
                  OR lower(object) IN ('unknown', 'n/a', '', 'null')
             )::int AS placeholder_count,
             COUNT(*) FILTER (WHERE lower(subject) IN ('unknown','n/a','','null'))::int AS subject_placeholder,
             COUNT(*) FILTER (WHERE lower(predicate) IN ('unknown','n/a','','null'))::int AS predicate_placeholder,
             COUNT(*) FILTER (WHERE lower(object) IN ('unknown','n/a','','null'))::int AS object_placeholder
           FROM content_facts
          WHERE created_at >= $1::timestamptz
            AND created_at <= $2::timestamptz
            AND is_current = true`,
          [startedAt, completedAt],
        );
        const row = r.rows[0] ?? {};
        const total = Number(row.total ?? 0);

        // 按 errorSamples.kind 聚合
        const errorByKind: Record<string, number> = {};
        for (const s of (state.errorSamples ?? [])) {
          errorByKind[s.kind] = (errorByKind[s.kind] ?? 0) + 1;
        }

        // 质量分判定（前端可直接显示绿/黄/红）
        const avgConf = Number(row.avg_confidence ?? 0);
        const placeholderRate = total > 0 ? Number(row.placeholder_count) / total : 0;
        const highConfRate = total > 0
          ? (Number(row.bucket_high) + Number(row.bucket_top)) / total
          : 0;
        const verdict = (avgConf >= 0.7 && placeholderRate < 0.05 && highConfRate >= 0.5)
          ? 'good'
          : (avgConf >= 0.55 && placeholderRate < 0.15)
            ? 'fair' : 'poor';

        return {
          jobId: state.jobId,
          window: { startedAt, completedAt },
          totals: {
            facts: total,
            errors: state.errors,
            avgConfidence: avgConf,
            placeholderRate: Math.round(placeholderRate * 1000) / 10,  // %
            highConfRate: Math.round(highConfRate * 1000) / 10,
          },
          confidenceBuckets: [
            { range: '≤0.5', label: '低', count: Number(row.bucket_low ?? 0) },
            { range: '0.5–0.7', label: '中', count: Number(row.bucket_mid ?? 0) },
            { range: '0.7–0.9', label: '高', count: Number(row.bucket_high ?? 0) },
            { range: '>0.9', label: '极高', count: Number(row.bucket_top ?? 0) },
          ],
          placeholderByField: {
            subject: Number(row.subject_placeholder ?? 0),
            predicate: Number(row.predicate_placeholder ?? 0),
            object: Number(row.object_placeholder ?? 0),
          },
          errorByKind,
          verdict,
        };
      } catch (e) {
        request.log.warn({ jobId, err: e }, 'reextract quality stat failed');
        return {
          jobId: state.jobId,
          window: { startedAt, completedAt },
          totals: { facts: 0, errors: state.errors, avgConfidence: 0, placeholderRate: 0, highConfRate: 0 },
          confidenceBuckets: [],
          placeholderByField: { subject: 0, predicate: 0, object: 0 },
          errorByKind: {},
          verdict: 'poor',
          error: (e as Error).message,
        };
      }
    });

    // SSE 进度流
    fastify.get('/reextract/jobs/:jobId/stream', async (request, reply) => {
      const { jobId } = request.params as any;
      const state = getReextractJob(String(jobId));
      if (!state) {
        reply.code(404);
        return { error: 'Job not found' };
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // 立即发送当前状态
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);

      if (state.status !== 'running') {
        reply.raw.end();
        return;
      }

      const unsub = subscribeJob(String(jobId), (event, data) => {
        try {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          if (event === 'done') {
            reply.raw.end();
          }
        } catch { /* connection closed */ }
      });

      request.raw.on('close', () => {
        unsub();
      });
    });

    fastify.get('/facts', async (request, reply) => {
      const query = request.query as any;
      return engine.queryFactsPage({
        subject: query.subject,
        predicate: query.predicate,
        domain: query.domain,
        taxonomy_code: query.taxonomy_code,
        currentOnly: query.currentOnly !== 'false',
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset !== undefined ? parseInt(query.offset, 10) : undefined,
        page: query.page !== undefined ? parseInt(query.page, 10) : undefined,
      });
    });

    fastify.get('/entities', async (request, reply) => {
      const query = request.query as any;
      return engine.queryEntitiesPage({
        search: query.search,
        entityType: query.entityType,
        domainId: query.domainId,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset !== undefined ? parseInt(query.offset, 10) : undefined,
        page: query.page !== undefined ? parseInt(query.page, 10) : undefined,
      });
    });

    // ============================================================
    // 产出物 API (15 类)
    // ============================================================

    // ① 议题推荐
    fastify.get('/topics/recommended', async (request, reply) => {
      const query = request.query as any;
      const sortByRaw = String(query.sortBy || '');
      const sortBy =
        sortByRaw === 'time'
          ? 'time'
          : sortByRaw === 'narrative_at' || sortByRaw === 'narrative'
            ? 'narrative_at'
            : 'score';
      const topicOptions: any = {
        domain: query.domain,
        taxonomy_code: query.taxonomy_code,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset !== undefined ? parseInt(query.offset, 10) : undefined,
        page: query.page !== undefined ? parseInt(query.page, 10) : undefined,
        sortBy,
        sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc',
        enrich: query.enrich === 'true',
        hasNarrative: query.has_narrative === 'true' || query.hasNarrative === 'true',
        enableDeep: query.enableDeep === 'true' || query.enable_deep === 'true',
      };
      return engine.getTopicRecommendations(topicOptions);
    });

    // 手动触发 topic enrichment 生成并缓存（供 batch-ops 调用）
    fastify.post('/topics/enrich', async (request, reply) => {
      const query = request.query as any;
      const body = (request.body || {}) as any;
      const enableDeep = body.enableDeep === true || query.enableDeep === 'true';
      // v7.5: 场景化默认跟随 enableDeep;显式传 false 可关闭
      const enableSceneClassification =
        body.enableSceneClassification === false
          ? false
          : (body.enableSceneClassification === true || enableDeep);
      const sortByRawEnrich = String(query.sortBy || '');
      const sortByEnrich =
        sortByRawEnrich === 'time'
          ? 'time'
          : sortByRawEnrich === 'narrative_at' || sortByRawEnrich === 'narrative'
            ? 'narrative_at'
            : 'score';
      const topicOptions: any = {
        domain: query.domain,
        taxonomy_code: query.taxonomy_code,
        limit: query.limit ? parseInt(query.limit, 10) : 10,
        offset: query.offset !== undefined ? parseInt(query.offset, 10) : undefined,
        page: query.page !== undefined ? parseInt(query.page, 10) : undefined,
        sortBy: sortByEnrich,
        sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc',
        enrich: true,
        enableDeep,
        hasNarrative: query.has_narrative === 'true' || query.hasNarrative === 'true',
        skipNarrative: body.skipExisting === true || query.skip_existing === 'true',
        expertStrategy: body.expertStrategy,
        // v7.5
        enableSceneClassification,
        purpose: typeof body.purpose === 'string' ? body.purpose : undefined,
        userId: typeof body.userId === 'string' ? body.userId : undefined,
      };
      const result = await engine.getTopicRecommendations(topicOptions);
      const enriched = result.items.filter(t => t.narrative && t.narrative.trim() !== '');
      const scened = result.items.filter(t => t.scene);
      return reply.send({
        ok: true,
        total: result.total,
        pageItems: result.items.length,
        enriched: enriched.length,
        scened: scened.length,
        deep: enableDeep,
        scene_classified: enableSceneClassification,
      });
    });

    // 知识空白
    fastify.get('/gaps', async (request, reply) => {
      const query = request.query as any;
      const gapOptions: any = {
        domain: query.domain,
        taxonomy_code: query.taxonomy_code,
        limit: query.limit ? parseInt(query.limit) : 20,
        sortBy: query.sortBy === 'time' ? 'time' : 'default',
        sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc',
      };
      return engine.getKnowledgeGaps(gapOptions);
    });

    // ② 趋势信号
    fastify.get('/trends/:entityId', async (request, reply) => {
      const { entityId } = request.params as any;
      return engine.getTrendSignals(entityId);
    });

    // ============================================================
    // TAVILY 搜索补全 — 用于观点演化 / 趋势信号的外部证据获取
    // ============================================================

    fastify.post('/search/suggest', async (request, reply) => {
      const body = request.body as any;
      const subject = String(body?.subject || '').trim();
      const mode = body?.mode === 'trend' ? 'trend' : 'belief';
      const metric = body?.metric ? String(body.metric).trim() : '';
      const extra = body?.extraKeywords ? String(body.extraKeywords).trim() : '';
      const limit = Math.min(10, Math.max(1, Number(body?.limit) || 6));
      if (!subject) {
        reply.code(400);
        return { error: '缺少 subject' };
      }
      const query = mode === 'trend'
        ? [subject, metric, extra, '变化', '趋势'].filter(Boolean).join(' ')
        : [subject, extra, '最新', '观点', '演变'].filter(Boolean).join(' ');
      try {
        const { WebSearchService } = await import('../../services/webSearch.js');
        const svc = new WebSearchService();
        const results = await svc.search({ query, maxResults: limit });
        return {
          query,
          mode,
          results: results.map(r => ({
            title: r.title,
            snippet: r.snippet,
            url: r.url,
            source: r.source,
            publishedAt: r.publishedAt,
            relevance: r.relevance,
            credibility: r.credibility,
          })),
        };
      } catch (err: any) {
        reply.code(502);
        return { error: err?.message || 'search failed', query };
      }
    });

    fastify.post('/search/append', async (request, reply) => {
      const body = request.body as any;
      const subject = String(body?.subject || '').trim();
      const predicate = String(body?.predicate || '').trim();
      const mode = body?.mode === 'trend' ? 'trend' : 'belief';
      const items = Array.isArray(body?.items) ? body.items : [];
      if (!subject || !predicate) {
        reply.code(400);
        return { error: '缺少 subject 或 predicate' };
      }
      if (items.length === 0) {
        reply.code(400);
        return { error: 'items 为空' };
      }
      const sanitized = items
        .filter((it: any) => it && typeof it.url === 'string' && it.url)
        .map((it: any) => ({
          title: it.title ? String(it.title).slice(0, 500) : undefined,
          snippet: it.snippet ? String(it.snippet).slice(0, 1000) : undefined,
          url: String(it.url),
          publishedAt: it.publishedAt ? String(it.publishedAt) : undefined,
          value: it.value ? String(it.value).slice(0, 200) : undefined,
          sourceHost: it.source ? String(it.source).slice(0, 120) : undefined,
        }));
      const result = await engine.appendFactsFromSearch({
        subject,
        predicate,
        mode,
        domain: body?.domain ? String(body.domain) : undefined,
        items: sanitized,
      });
      return result;
    });

    // ⑤ 关键事实
    fastify.get('/facts/key', async (request, reply) => {
      const query = request.query as any;
      return engine.getKeyFacts({
        subject: query.subject,
        domain: query.domain,
        taxonomy_code: query.taxonomy_code,
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
        taxonomy_code: query.taxonomy_code,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑨ 知识卡片
    fastify.get('/cards/:entityId', async (request, reply) => {
      const { entityId } = request.params as any;
      return engine.getKnowledgeCard(entityId);
    });

    // ⑩ 认知综合（读缓存优先）
    fastify.post('/synthesize', async (request, reply) => {
      const body = request.body as any;
      return engine.synthesizeInsights({
        subjects: body.subjects,
        domain: body.domain,
        taxonomy_code: body.taxonomy_code,
        limit: body.limit,
        forceRefresh: body.forceRefresh === true,
      });
    });

    // ⑩ 认知综合预生成 — 启动异步 job
    fastify.post('/synthesize/pregenerate/start', async (request, reply) => {
      const body = (request.body || {}) as any;
      const jobId = startSynthesisJob(engine, {
        limit: body.limit ? parseInt(body.limit) : 50,
        domain: body.domain,
        overwrite: body.overwrite === true || body.overwrite === 'true',
        minFacts: body.minFacts ? parseInt(body.minFacts) : 3,
        enableDeep: body.enableDeep === true,
        expertStrategy: body.expertStrategy,
      });
      return { jobId };
    });

    fastify.get('/synthesize/pregenerate/jobs', async () => listSynthesisJobs());

    fastify.get('/synthesize/pregenerate/jobs/:jobId', async (request) => {
      const { jobId } = request.params as any;
      const state = getSynthesisJob(String(jobId));
      if (!state) return { error: 'Job not found' };
      return state;
    });

    fastify.delete('/synthesize/pregenerate/jobs/:jobId', async (request) => {
      const { jobId } = request.params as any;
      return { cancelled: cancelSynthesisJob(String(jobId)) };
    });

    // SSE 进度流
    fastify.get('/synthesize/pregenerate/jobs/:jobId/stream', async (request, reply) => {
      const { jobId } = request.params as any;
      const state = getSynthesisJob(String(jobId));
      if (!state) { reply.code(404); return { error: 'Job not found' }; }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);

      if (state.status !== 'running') { reply.raw.end(); return; }

      const unsub = subscribeSynthesisJob(String(jobId), (event, data) => {
        try {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          if (event === 'done') reply.raw.end();
        } catch { /* connection closed */ }
      });
      request.raw.on('close', () => unsub());
    });

    // 查询缓存状态（有多少条 synthesis 已生成）
    fastify.get('/synthesize/cache/stats', async () => {
      const result = await engine['deps'].db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE scope_type = 'entity') AS entities,
          COUNT(*) FILTER (WHERE scope_type = 'domain') AS domains,
          MIN(generated_at) AS oldest,
          MAX(generated_at) AS newest
        FROM content_synthesis_cache
      `);
      return result.rows[0] || { total: 0 };
    });

    // 查询缓存明细（支持时间排序 + 分页）
    fastify.get('/synthesize/cache', async (request) => {
      const query = request.query as any;
      return engine.querySynthesisCachePage({
        scopeType: query.scopeType === 'entity' || query.scopeType === 'domain' || query.scopeType === 'global'
          ? query.scopeType
          : undefined,
        search: query.search,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset !== undefined ? parseInt(query.offset, 10) : undefined,
        page: query.page !== undefined ? parseInt(query.page, 10) : undefined,
        sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc',
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
        taxonomy_code: query.taxonomy_code,
        domain: query.domain,
        limit: query.limit ? parseInt(query.limit) : undefined,
      });
    });

    // ⑬ 争议话题 (v7.5: enableDeepRecall 触发 L1+L2+L3 三层召回 + 张力分类)
    fastify.get('/contradictions', async (request, reply) => {
      const query = request.query as any;
      return engine.getContradictions({
        domain: query.domain,
        severity: query.severity,
        limit: query.limit ? parseInt(query.limit) : undefined,
        enableDeepRecall: query.enableDeepRecall === 'true',
        enableL3: query.enableL3 !== 'false',
      });
    });

    // POST /contradictions/recall — 深度张力图召回（供 batch-ops 4a 深度模式调用）
    fastify.post('/contradictions/recall', async (request, reply) => {
      const body = (request.body || {}) as any;
      const query = request.query as any;
      const tensions = await engine.getContradictions({
        domain: body.domain || query.domain,
        limit: body.limit ? parseInt(body.limit) : 100,
        enableDeepRecall: true,
        enableL3: body.enableL3 !== false,
      });
      const byType: Record<string, number> = {};
      const byLayer: Record<string, number> = {};
      for (const t of tensions as any[]) {
        const type = t.tensionType || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
        const layer = t.recallLayer || 'L1';
        byLayer[layer] = (byLayer[layer] || 0) + 1;
      }
      return reply.send({
        ok: true,
        total: tensions.length,
        byType,
        byLayer,
        items: tensions,
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

    // 从 content_facts 批量生成/更新 content_beliefs
    fastify.post('/beliefs/recompute', async (request, reply) => {
      const result = await engine['deps'].db.query(`
        INSERT INTO content_beliefs (proposition, current_stance, confidence, supporting_facts, contradicting_facts, last_updated)
        SELECT
          subject || ': ' || predicate AS proposition,
          CASE
            WHEN COUNT(DISTINCT object) > 1 THEN 'disputed'
            WHEN AVG(confidence) >= 0.85 THEN 'confirmed'
            WHEN AVG(confidence) >= 0.5 THEN 'evolving'
            ELSE 'disputed'
          END AS current_stance,
          AVG(confidence) AS confidence,
          ARRAY_AGG(id) FILTER (WHERE confidence >= 0.7) AS supporting_facts,
          ARRAY_AGG(id) FILTER (WHERE confidence < 0.5) AS contradicting_facts,
          NOW() AS last_updated
        FROM content_facts
        WHERE is_current = true
        GROUP BY subject, predicate
        HAVING COUNT(*) >= 1
        ON CONFLICT (proposition) DO UPDATE SET
          current_stance = EXCLUDED.current_stance,
          confidence = EXCLUDED.confidence,
          supporting_facts = EXCLUDED.supporting_facts,
          contradicting_facts = EXCLUDED.contradicting_facts,
          last_updated = NOW()
      `);
      const countResult = await engine['deps'].db.query(`SELECT COUNT(*) as total FROM content_beliefs`);
      return reply.send({ ok: true, total: Number(countResult.rows[0]?.total || 0) });
    });

    // ============================================================
    // v7.1: Wiki 生成层 (Obsidian 兼容物化视图)
    // ============================================================

    // 生成 wiki · wikiRoot 用 lib/wikiRoot 统一解析 (env: MN_CLAUDE_WIKI_ROOT > CONTENT_LIBRARY_WIKI_ROOT > WIKI_ROOT)
    fastify.post('/wiki/generate', async (request, reply) => {
      const body = (request.body || {}) as any;
      // body.wikiRoot 显式 override 优先 (兼容 admin 脚本); 否则按当前 ws 写到 data/content-wiki/<slug>
      const wsSlug = await resolveWorkspaceSlug(currentWorkspaceId(request));
      const wikiRoot = resolveWikiRoot({ override: body.wikiRoot, workspaceSlug: wsSlug });
      return engine.wikiGenerator.generate({
        wikiRoot,
        domainFilter: body.domainFilter,
        maxEntities: body.maxEntities ? parseInt(body.maxEntities) : undefined,
        maxFactsPerEntity: body.maxFactsPerEntity ? parseInt(body.maxFactsPerEntity) : undefined,
      });
    });

    // 列出所有已生成的 wiki · rootDir 是装多个 wiki 的父目录, 默认是 wikiRoot 的 parent
    fastify.get('/wiki/list', async (request, reply) => {
      const query = request.query as any;
      const rootDir = query.rootDir || process.env.CONTENT_LIBRARY_WIKI_ROOT_DIR || dirname(DEFAULT_WIKI_ROOT_ABS);
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
