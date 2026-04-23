// Meeting Notes — Fastify 路由适配层
// PR1: /health + 模块自检
// PR2: /sources/*（ingest 路由）
// PR3: /ingest/parse + /meetings/:id/axes + /meetings/:id/detail + /compute/axis

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';
import { meetingNotesRoutes as ingestRoutes } from './ingest/routes.js';
import { authenticate } from '../../middleware/auth.js';

export function createRouter(engine: MeetingNotesEngine): FastifyPluginAsync {
  return async function meetingNotesRouter(fastify: FastifyInstance) {
    // --------------------------------------------------------
    // Health & module info
    // --------------------------------------------------------
    fastify.get('/health', async () => engine.health());

    fastify.get('/', async () => ({
      module: 'meeting-notes',
      version: '0.3.0-axes',
      status: 'axes-online',
      endpoints: {
        health: 'GET /health',
        sources: 'GET|POST /sources, PUT|DELETE /sources/:id, POST /sources/:id/upload, ...',
        parse: 'POST /ingest/parse { assetId }',
        meetingAxes: 'GET /meetings/:id/axes',
        meetingDetail: 'GET /meetings/:id/detail?view=A|B|C',
        computeAxis: 'POST /compute/axis { meetingId, axis, subDims?, replaceExisting? }',
        // PR4+
        runs: 'POST /runs (TBD PR4)',
        scopes: 'GET /scopes (TBD PR4)',
      },
    }));

    // --------------------------------------------------------
    // Ingest routes (PR2) — 挂到 /sources/* 子路径
    // --------------------------------------------------------
    await fastify.register(ingestRoutes, { pathPrefix: '/sources' });

    // --------------------------------------------------------
    // Parse (PR3) — 从 asset_id 触发解析
    // --------------------------------------------------------
    fastify.post('/ingest/parse', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as { assetId?: string };
      if (!body?.assetId) {
        reply.status(400);
        return { error: 'Bad Request', message: 'assetId is required' };
      }
      const result = await engine.parseMeeting(body.assetId);
      if (!result.ok) {
        reply.status(result.reason === 'asset-not-found' ? 404 : 400);
      }
      return result;
    });

    // --------------------------------------------------------
    // Axes read (PR3) — 四轴聚合
    // --------------------------------------------------------
    fastify.get('/meetings/:id/axes', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      return engine.getMeetingAxes(id);
    });

    fastify.get('/meetings/:id/detail', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = request.query as { view?: string };
      const view = q.view === 'B' || q.view === 'C' ? q.view : 'A';
      try {
        return await engine.getMeetingDetail(id, view as 'A' | 'B' | 'C');
      } catch (e) {
        reply.status(500);
        return { error: 'Internal Server Error', message: (e as Error).message };
      }
    });

    // --------------------------------------------------------
    // Compute axis (PR3) — 同步触发 axis 计算；PR4 runEngine 会包成异步 run
    // --------------------------------------------------------
    fastify.post('/compute/axis', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as {
        meetingId?: string;
        scope?: { kind: string; id?: string };
        axis?: string;
        subDims?: string[];
        replaceExisting?: boolean;
      };
      if (!body?.axis) {
        reply.status(400);
        return { error: 'Bad Request', message: 'axis is required' };
      }
      const result = await engine.computeAxis({
        meetingId: body.meetingId,
        scope: body.scope as any,
        axis: body.axis as any,
        subDims: body.subDims,
        replaceExisting: body.replaceExisting,
      });
      return result;
    });
  };
}
