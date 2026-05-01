// Compass · 方向房间路由
// /api/v1/ceo/compass/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import {
  listStrategicLines,
  listStrategicEchos,
  getAttentionAlloc,
  getCompassDashboard,
  recomputeAlignment,
  getAstrolabe,
  getTimePie,
  getDriftRadar,
  getOnePager,
  getArchives,
} from './service.js';
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

    // ─── samples-s 对齐：5 个新 GET endpoint ───────────────────
    fastify.get('/astrolabe', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getAstrolabe(engine.deps, scopeId);
    });

    fastify.get('/time-pie', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getTimePie(engine.deps, scopeId);
    });

    fastify.get('/drift-radar', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getDriftRadar(engine.deps, scopeId);
    });

    fastify.get('/one-pager', async (request, reply) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      const data = await getOnePager(engine.deps, scopeId);
      if (!data) {
        reply.code(404);
        return { error: 'no-brief-available' };
      }
      return data;
    });

    fastify.get('/archives', async (request) => {
      const { scopeId, tab } = (request.query ?? {}) as { scopeId?: string; tab?: string };
      const t = tab === 'drift' ? 'drift' : 'main';
      return getArchives(engine.deps, t, scopeId);
    });
  };
}
