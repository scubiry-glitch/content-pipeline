// War Room · 团队房间路由
// /api/v1/ceo/war-room/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { getWarRoomDashboard, getFormationSnapshot, listFormationGaps } from './service.js';

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
  };
}
