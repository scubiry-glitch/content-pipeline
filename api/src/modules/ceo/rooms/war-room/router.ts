// War Room · 团队房间路由
// /api/v1/ceo/war-room/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { getWarRoomDashboard, getFormationSnapshot, listFormationGaps } from './service.js';
import { listSparks } from './sparks-service.js';

export function createWarRoomRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function warRoomRoutes(fastify: FastifyInstance) {
    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getWarRoomDashboard(engine.deps, scopeId);
    });

    fastify.get('/formation', async (request) => {
      const { scopeId, weekStart } = (request.query ?? {}) as {
        scopeId?: string;
        weekStart?: string;
      };
      return getFormationSnapshot(engine.deps, { scopeId, weekStart });
    });

    fastify.get('/gaps', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return listFormationGaps(engine.deps, scopeId);
    });

    fastify.get('/sparks', async (request) => {
      const q = (request.query ?? {}) as { seed?: string; limit?: string; scopes?: string };
      const seed = q.seed ? Number(q.seed) : 0;
      const limit = q.limit ? Number(q.limit) : 4;
      const scopeIds = q.scopes
        ? q.scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      return listSparks(engine.deps, { seed, limit, scopeIds });
    });
  };
}
