// Balcony · 个人房间路由
// /api/v1/ceo/balcony/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import {
  getBalconyDashboard,
  listReflections,
  upsertReflection,
  getTimeRoi,
  getRoiTrend,
  getReflectionsHistory,
  getSilenceSignals,
  getEchos,
  getSelfPromises,
} from './service.js';

export function createBalconyRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function balconyRoutes(fastify: FastifyInstance) {
    fastify.get('/dashboard', async (request) => {
      const { userId } = (request.query ?? {}) as { userId?: string };
      return getBalconyDashboard(engine.deps, userId);
    });

    fastify.get('/reflections', async (request) => {
      const { userId, weekStart } = (request.query ?? {}) as { userId?: string; weekStart?: string };
      return listReflections(engine.deps, { userId, weekStart });
    });

    fastify.post('/reflections', async (request) => {
      const body = (request.body ?? {}) as Record<string, any>;
      return upsertReflection(engine.deps, body);
    });

    fastify.get('/roi', async (request) => {
      const { userId, weekStart } = (request.query ?? {}) as { userId?: string; weekStart?: string };
      return getTimeRoi(engine.deps, { userId, weekStart });
    });

    // ─── samples-s 对齐：drawer 6 d-block 对应 5 个新 endpoint ───
    fastify.get('/roi-trend', async (request) => {
      const q = (request.query ?? {}) as { userId?: string; weeks?: string };
      return getRoiTrend(engine.deps, {
        userId: q.userId,
        weeks: q.weeks ? Number(q.weeks) : 8,
      });
    });

    fastify.get('/reflections-history', async (request) => {
      const q = (request.query ?? {}) as { userId?: string; weeks?: string };
      return getReflectionsHistory(engine.deps, {
        userId: q.userId,
        weeks: q.weeks ? Number(q.weeks) : 12,
      });
    });

    fastify.get('/silence-signals', async (request) => {
      const q = (request.query ?? {}) as { days?: string };
      return getSilenceSignals(engine.deps, { days: q.days ? Number(q.days) : 30 });
    });

    fastify.get('/echos', async (request) => {
      const q = (request.query ?? {}) as { weeks?: string };
      return getEchos(engine.deps, { weeks: q.weeks ? Number(q.weeks) : 6 });
    });

    fastify.get('/self-promises', async (request) => {
      const q = (request.query ?? {}) as { userId?: string };
      return getSelfPromises(engine.deps, { userId: q.userId });
    });
  };
}
