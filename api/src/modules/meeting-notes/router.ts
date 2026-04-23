// Meeting Notes — Fastify 路由适配层
// PR1: /health + 模块自检
// PR2: /sources/*（ingest 路由）— 同内容也在 /api/v1/quality/meeting-note-sources/* alias

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';
import { meetingNotesRoutes as ingestRoutes } from './ingest/routes.js';

export function createRouter(engine: MeetingNotesEngine): FastifyPluginAsync {
  return async function meetingNotesRouter(fastify: FastifyInstance) {
    // --------------------------------------------------------
    // Health & module info
    // --------------------------------------------------------
    fastify.get('/health', async () => engine.health());

    fastify.get('/', async () => ({
      module: 'meeting-notes',
      version: '0.2.0-ingest',
      status: 'ingest-absorbed',
      endpoints: {
        health: 'GET /health',
        sources: 'GET|POST /sources, PUT|DELETE /sources/:id, POST /sources/:id/upload, ...',
        // PR3+
        parse: 'POST /ingest/parse (TBD)',
        meetings: 'GET /meetings/:id/axes (TBD)',
        runs: 'POST /runs (TBD)',
        scopes: 'GET /scopes (TBD)',
      },
    }));

    // --------------------------------------------------------
    // Ingest routes (PR2) — 挂到 /sources/* 子路径
    // 通过 pathPrefix: '/sources' 复用同一插件；老 alias
    // /api/v1/quality/meeting-note-sources/* 继续由 server.ts 单独挂载（shim）
    // --------------------------------------------------------
    await fastify.register(ingestRoutes, { pathPrefix: '/sources' });
  };
}
