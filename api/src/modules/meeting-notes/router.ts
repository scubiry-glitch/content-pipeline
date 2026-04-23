// Meeting Notes — Fastify 路由适配层（PR1 骨架）
// 仅暴露 /health，其余路由在 PR2-PR6 逐步补齐
// 注：/sources/* 兼容路由在 PR2 吸收 routes/meetingNotes.ts 时加入

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';

export function createRouter(engine: MeetingNotesEngine): FastifyPluginAsync {
  return async function meetingNotesRoutes(fastify: FastifyInstance) {
    // --------------------------------------------------------
    // Health & module info
    // --------------------------------------------------------
    fastify.get('/health', async () => engine.health());

    fastify.get('/', async () => ({
      module: 'meeting-notes',
      version: '0.1.0-scaffold',
      status: 'scaffold',
      endpoints: {
        health: 'GET /health',
        // PR2+
        parse: 'POST /ingest/parse (TBD)',
        meetings: 'GET /meetings/:id/axes (TBD)',
        runs: 'POST /runs (TBD)',
        scopes: 'GET /scopes (TBD)',
      },
    }));
  };
}
