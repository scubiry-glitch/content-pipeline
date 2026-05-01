// Situation · 各方房间路由

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import {
  listStakeholders,
  listSignals,
  getRubricMatrix,
  getSituationDashboard,
  listBlindspots,
  listObservers,
  getHorizon,
} from './service.js';

export function createSituationRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function situationRoutes(fastify: FastifyInstance) {
    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getSituationDashboard(engine.deps, scopeId);
    });

    fastify.get('/stakeholders', async (request) => {
      const { scopeId, kind } = (request.query ?? {}) as { scopeId?: string; kind?: string };
      return listStakeholders(engine.deps, { scopeId, kind });
    });

    fastify.get('/signals', async (request) => {
      const { stakeholderId } = (request.query ?? {}) as { stakeholderId?: string };
      return listSignals(engine.deps, { stakeholderId });
    });

    fastify.get('/rubric', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getRubricMatrix(engine.deps, scopeId);
    });

    // ─── samples-s 对齐 ─────────────────────────────────────────
    fastify.get('/blindspots', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return listBlindspots(engine.deps, scopeId);
    });

    fastify.get('/observers', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return listObservers(engine.deps, scopeId);
    });

    fastify.get('/horizon', async (request) => {
      const { scopeId, range } = (request.query ?? {}) as { scopeId?: string; range?: string };
      const r = range === 'mid' ? 'mid' : range === 'far' ? 'far' : 'near';
      return getHorizon(engine.deps, r, scopeId);
    });
  };
}
