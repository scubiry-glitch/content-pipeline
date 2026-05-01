// Boardroom · 董事会房间路由
// /api/v1/ceo/boardroom/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import {
  listDirectors,
  listConcerns,
  getBoardroomDashboard,
  listBriefs,
  listPromises,
  listRebuttals,
} from './service.js';

export function createBoardroomRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function boardroomRoutes(fastify: FastifyInstance) {
    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getBoardroomDashboard(engine.deps, scopeId);
    });

    fastify.get('/directors', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return listDirectors(engine.deps, { scopeId });
    });

    fastify.get('/concerns', async (request) => {
      const { directorId, status } = (request.query ?? {}) as {
        directorId?: string;
        status?: string;
      };
      return listConcerns(engine.deps, { directorId, status });
    });

    fastify.get('/briefs', async (request) => {
      const { scopeId, session } = (request.query ?? {}) as { scopeId?: string; session?: string };
      return listBriefs(engine.deps, { scopeId, session });
    });

    fastify.get('/promises', async (request) => {
      const { briefId } = (request.query ?? {}) as { briefId?: string };
      return listPromises(engine.deps, { briefId });
    });

    fastify.get('/rebuttals', async (request) => {
      const { briefId, scopeId } = (request.query ?? {}) as { briefId?: string; scopeId?: string };
      return listRebuttals(engine.deps, { briefId, scopeId });
    });
  };
}
