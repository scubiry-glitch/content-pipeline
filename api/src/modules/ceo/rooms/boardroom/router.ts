// Boardroom · 董事会房间路由
// /api/v1/ceo/boardroom/*
//
// scope 多选支持: query.scopes=id1,id2,id3 → scopeIds: string[]
// 单 scope 兼容: query.scopeId=id → 包成单元素数组

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { ceoWorkspaceGuard } from '../../workspaceGuard.js';
import { currentWorkspaceId } from '../../../../db/repos/withWorkspace.js';
import {
  listDirectors,
  listConcerns,
  getBoardroomDashboard,
  listBriefs,
  listPromises,
  listRebuttals,
  createDirector,
  updateDirector,
  deleteDirector,
  createConcern,
  updateConcernStatus,
} from './service.js';
import { listAnnotations, generateAnnotation } from './annotations-service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseScopeIds(query: Record<string, unknown>): string[] | undefined {
  const arr: string[] = [];
  const raw = query.scopes;
  if (typeof raw === 'string' && raw.length > 0) {
    for (const s of raw.split(',')) {
      const t = s.trim();
      if (UUID_RE.test(t)) arr.push(t);
    }
  }
  // 单 scope 兼容
  const single = query.scopeId;
  if (typeof single === 'string' && UUID_RE.test(single) && !arr.includes(single)) {
    arr.push(single);
  }
  return arr.length > 0 ? arr : undefined;
}

export function createBoardroomRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function boardroomRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', ceoWorkspaceGuard);

    fastify.get('/dashboard', async (request) => {
      const wsId = currentWorkspaceId(request);
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return getBoardroomDashboard(engine.deps, wsId, scopeIds);
    });

    fastify.get('/directors', async (request) => {
      const wsId = currentWorkspaceId(request);
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listDirectors(engine.deps, wsId, { scopeIds });
    });

    fastify.get('/concerns', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { directorId, status } = (request.query ?? {}) as {
        directorId?: string;
        status?: string;
      };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listConcerns(engine.deps, wsId, { directorId, status, scopeIds });
    });

    fastify.get('/briefs', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { session } = (request.query ?? {}) as { session?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listBriefs(engine.deps, wsId, { scopeIds, session });
    });

    fastify.get('/promises', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { briefId } = (request.query ?? {}) as { briefId?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listPromises(engine.deps, wsId, { briefId, scopeIds });
    });

    fastify.get('/rebuttals', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { briefId } = (request.query ?? {}) as { briefId?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listRebuttals(engine.deps, wsId, { briefId, scopeIds });
    });

    // ─── 外脑批注 (③ AnnotationsList LLM-backed) ───
    fastify.get('/annotations', async (request) => {
      const wsId = currentWorkspaceId(request);
      const { briefId, limit } = (request.query ?? {}) as { briefId?: string; limit?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listAnnotations(engine.deps, wsId, {
        briefId,
        scopeIds,
        limit: limit ? Number(limit) : undefined,
      });
    });

    // ─── 输入接入层 (Phase 1) ─────────────────────────────────
    fastify.post('/directors', async (request, reply) => {
      const wsId = currentWorkspaceId(request);
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await createDirector(engine.deps, wsId, body);
      if (!r.ok) { reply.code(400); }
      return r;
    });

    fastify.patch('/directors/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await updateDirector(engine.deps, id, body);
      if (!r.ok) { reply.code(r.error === 'not found' ? 404 : 400); }
      return r;
    });

    fastify.delete('/directors/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const r = await deleteDirector(engine.deps, id);
      if (!r.ok) { reply.code(404); }
      return r;
    });

    fastify.post('/concerns', async (request, reply) => {
      const wsId = currentWorkspaceId(request);
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await createConcern(engine.deps, wsId, body);
      if (!r.ok) { reply.code(400); }
      return r;
    });

    fastify.patch('/concerns/:id/status', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as Record<string, any>;
      const r = await updateConcernStatus(engine.deps, id, body);
      if (!r.ok) { reply.code(r.error === 'not found' ? 404 : 400); }
      return r;
    });

    fastify.post('/annotations/generate', async (request, reply) => {
      const body = (request.body ?? {}) as {
        briefId?: string | null;
        scopeId?: string | null;
        expertId?: string;
        expertName?: string;
        contextHint?: string;
      };
      if (!body.expertId || !body.expertName) {
        reply.code(400);
        return { error: 'expertId and expertName required' };
      }
      try {
        return await generateAnnotation(engine.deps, {
          briefId: body.briefId ?? null,
          scopeId: body.scopeId ?? null,
          expertId: body.expertId,
          expertName: body.expertName,
          contextHint: body.contextHint,
        });
      } catch (e) {
        reply.code(500);
        return { error: (e as Error).message };
      }
    });
  };
}
