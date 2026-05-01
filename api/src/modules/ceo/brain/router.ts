// Brain · 外脑图书馆路由
// /api/v1/ceo/brain/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../CeoEngine.js';
import { listCrossModuleTasks, getBrainOverview } from './tasks-service.js';

export function createBrainRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function brainRoutes(fastify: FastifyInstance) {
    fastify.get('/overview', async () => getBrainOverview(engine.deps));

    fastify.get('/tasks', async (request) => {
      const { state, module: moduleFilter, limit } = (request.query ?? {}) as {
        state?: string;
        module?: string;
        limit?: string;
      };
      return listCrossModuleTasks(engine.deps, {
        state,
        module: moduleFilter,
        limit: limit ? Number(limit) : 30,
      });
    });
  };
}
