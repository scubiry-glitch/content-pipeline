// Balcony · 个人房间路由
// /api/v1/ceo/balcony/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import {
  getBalconyDashboard,
  listReflections,
  upsertReflection,
  getTimeRoi,
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
  };
}
