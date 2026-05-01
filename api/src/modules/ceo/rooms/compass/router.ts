// Compass · 方向房间路由
// /api/v1/ceo/compass/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { listStrategicLines, listStrategicEchos, getAttentionAlloc, getCompassDashboard, recomputeAlignment } from './service.js';
import { getProjectAtlas } from './atlas.js';

export function createCompassRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function compassRoutes(fastify: FastifyInstance) {
    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getCompassDashboard(engine.deps, scopeId);
    });

    fastify.get('/lines', async (request) => {
      const { scopeId, kind } = (request.query ?? {}) as { scopeId?: string; kind?: string };
      return listStrategicLines(engine.deps, { scopeId, kind });
    });

    fastify.get('/echos', async (request) => {
      const { lineId } = (request.query ?? {}) as { lineId?: string };
      return listStrategicEchos(engine.deps, { lineId });
    });

    fastify.get('/attention', async (request) => {
      const { scopeId, weekStart } = (request.query ?? {}) as { scopeId?: string; weekStart?: string };
      return getAttentionAlloc(engine.deps, { scopeId, weekStart });
    });

    fastify.post('/recompute', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return recomputeAlignment(engine.deps, scopeId);
    });

    // Project Atlas 子房间 — 项目星图 + 危险榜
    fastify.get('/atlas', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getProjectAtlas(engine.deps, scopeId);
    });
  };
}
