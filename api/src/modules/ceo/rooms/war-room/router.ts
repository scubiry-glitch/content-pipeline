// War Room · 团队房间路由
// /api/v1/ceo/war-room/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { currentWorkspaceId } from '../../../../db/repos/withWorkspace.js';
import { ceoWorkspaceGuard } from '../../workspaceGuard.js';
import { getWarRoomDashboard, getFormationSnapshot, listFormationGaps } from './service.js';
import { listSparks } from './sparks-service.js';
import {
  listSandboxRuns,
  getSandboxRun,
  createSandboxRun,
  startSandboxRun,
} from './sandbox-service.js';

export function createWarRoomRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function warRoomRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', ceoWorkspaceGuard);

    fastify.get('/dashboard', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getWarRoomDashboard(engine.deps, wsId, scopeId);
    });

    fastify.get('/formation', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { scopeId, weekStart } = (request.query ?? {}) as {
        scopeId?: string;
        weekStart?: string;
      };
      return getFormationSnapshot(engine.deps, wsId, { scopeId, weekStart });
    });

    fastify.get('/gaps', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return listFormationGaps(engine.deps, wsId, scopeId);
    });

    fastify.get('/sparks', async (request) => {
      const wsId = currentWorkspaceId(request);
      const q = (request.query ?? {}) as { seed?: string; limit?: string; scopes?: string };
      const seed = q.seed ? Number(q.seed) : 0;
      const limit = q.limit ? Number(q.limit) : 4;
      const scopeIds = q.scopes
        ? q.scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      return listSparks(engine.deps, wsId, { seed, limit, scopeIds });
    });

    // ─── Sandbox 兵棋推演 ──────────────────────────────────────
    fastify.get('/sandbox', async (request) => {
      const wsId = currentWorkspaceId(request);
      const q = (request.query ?? {}) as { scopes?: string; status?: string; limit?: string };
      const scopeIds = q.scopes
        ? q.scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      return listSandboxRuns(engine.deps, wsId, {
        scopeIds,
        status: (q.status as any) ?? undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      });
    });

    fastify.get('/sandbox/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = await getSandboxRun(engine.deps, id);
      if (!item) {
        reply.code(404);
        return { error: 'sandbox-not-found' };
      }
      return item;
    });

    fastify.post('/sandbox', async (request, reply) => {
      const wsId = currentWorkspaceId(request);
      const body = (request.body ?? {}) as {
        topicText?: string;
        scopeId?: string | null;
        sourceSparkId?: string | null;
        seedBranches?: unknown;
      };
      if (!body.topicText || body.topicText.trim().length < 4) {
        reply.code(400);
        return { error: 'topicText-required' };
      }
      try {
        const created = await createSandboxRun(engine.deps, wsId, {
          topicText: body.topicText.trim(),
          scopeId: body.scopeId ?? null,
          sourceSparkId: body.sourceSparkId ?? null,
          seedBranches: body.seedBranches,
          createdBy: 'system',
        });
        return created;
      } catch (e) {
        reply.code(400);
        return { error: (e as Error).message };
      }
    });

    fastify.post('/sandbox/:id/run', async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        return await startSandboxRun(engine.deps, id);
      } catch (e) {
        const msg = (e as Error).message;
        const notFound = /not found/i.test(msg);
        reply.code(notFound ? 404 : 500);
        return { error: msg };
      }
    });
  };
}
