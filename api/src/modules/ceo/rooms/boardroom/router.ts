// Boardroom · 董事会房间路由
// /api/v1/ceo/boardroom/*
//
// scope 多选支持: query.scopes=id1,id2,id3 → scopeIds: string[]
// 单 scope 兼容: query.scopeId=id → 包成单元素数组

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
    fastify.get('/dashboard', async (request) => {
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return getBoardroomDashboard(engine.deps, scopeIds);
    });

    fastify.get('/directors', async (request) => {
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listDirectors(engine.deps, { scopeIds });
    });

    fastify.get('/concerns', async (request) => {
      const { directorId, status } = (request.query ?? {}) as {
        directorId?: string;
        status?: string;
      };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listConcerns(engine.deps, { directorId, status, scopeIds });
    });

    fastify.get('/briefs', async (request) => {
      const { session } = (request.query ?? {}) as { session?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listBriefs(engine.deps, { scopeIds, session });
    });

    fastify.get('/promises', async (request) => {
      const { briefId } = (request.query ?? {}) as { briefId?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listPromises(engine.deps, { briefId, scopeIds });
    });

    fastify.get('/rebuttals', async (request) => {
      const { briefId } = (request.query ?? {}) as { briefId?: string };
      const scopeIds = parseScopeIds((request.query ?? {}) as Record<string, unknown>);
      return listRebuttals(engine.deps, { briefId, scopeIds });
    });
  };
}
