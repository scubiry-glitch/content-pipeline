// Situation · 各方房间路由

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { ceoWorkspaceGuard } from '../../workspaceGuard.js';
import {
  listStakeholders,
  listSignals,
  getRubricMatrix,
  getSituationDashboard,
  listBlindspots,
  listObservers,
  getHorizon,
  createStakeholder,
  updateStakeholder,
  deleteStakeholder,
  createSignal,
} from './service.js';

export function createSituationRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function situationRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', ceoWorkspaceGuard);

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

    // ─── 输入接入层 (Phase 1) ─────────────────────────────────
    fastify.post('/stakeholders', async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await createStakeholder(engine.deps, body);
      if (!r.ok) { reply.code(400); }
      return r;
    });

    fastify.patch('/stakeholders/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await updateStakeholder(engine.deps, id, body);
      if (!r.ok) { reply.code(r.error === 'not found' ? 404 : 400); }
      return r;
    });

    fastify.delete('/stakeholders/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const r = await deleteStakeholder(engine.deps, id);
      if (!r.ok) { reply.code(404); }
      return r;
    });

    fastify.post('/signals', async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await createSignal(engine.deps, body);
      if (!r.ok) { reply.code(400); }
      return r;
    });
  };
}
