// Tower · 协调房间路由
// /api/v1/ceo/tower/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { getTowerDashboard, listCommitmentsByStatus, listBlockers, getRhythmPulse } from './service.js';
import { getTeamHeatmap, getPersonalRhythm } from './heatmap-service.js';

export function createTowerRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function towerRoutes(fastify: FastifyInstance) {
    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getTowerDashboard(engine.deps, scopeId);
    });

    fastify.get('/commitments', async (request) => {
      const { scopeId, status } = (request.query ?? {}) as { scopeId?: string; status?: string };
      return listCommitmentsByStatus(engine.deps, { scopeId, status });
    });

    fastify.get('/blockers', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return listBlockers(engine.deps, scopeId);
    });

    fastify.get('/pulse', async (request) => {
      const { scopeId, weeks } = (request.query ?? {}) as { scopeId?: string; weeks?: string };
      return getRhythmPulse(engine.deps, { scopeId, weeks: weeks ? Number(weeks) : 8 });
    });

    fastify.get('/heatmap', async (request) => {
      const q = (request.query ?? {}) as { scopes?: string; weekStart?: string };
      const scopeIds = q.scopes ? q.scopes.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      return getTeamHeatmap(engine.deps, { scopeIds, weekStart: q.weekStart });
    });

    fastify.get('/personal-rhythm', async (request) => {
      const q = (request.query ?? {}) as { userId?: string; weekStart?: string };
      return getPersonalRhythm(engine.deps, { userId: q.userId, weekStart: q.weekStart });
    });
  };
}
