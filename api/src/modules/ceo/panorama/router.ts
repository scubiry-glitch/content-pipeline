// Panorama · 全景画板路由
// /api/v1/ceo/panorama/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../CeoEngine.js';
import { currentWorkspaceId } from '../../../db/repos/withWorkspace.js';
import { ceoWorkspaceGuard } from '../workspaceGuard.js';
import { getPanoramaData } from './service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPanoramaRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function panoramaRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', ceoWorkspaceGuard);

    fastify.get('/', async (request) => {
      const q = (request.query ?? {}) as { scopeId?: string; scopes?: string };
      const ids: string[] = [];
      if (typeof q.scopes === 'string' && q.scopes.length > 0) {
        for (const s of q.scopes.split(',')) {
          const t = s.trim();
          if (UUID_RE.test(t)) ids.push(t);
        }
      }
      if (typeof q.scopeId === 'string' && UUID_RE.test(q.scopeId) && !ids.includes(q.scopeId)) {
        ids.push(q.scopeId);
      }
      return getPanoramaData(engine.deps, ids.length > 0 ? ids : undefined, currentWorkspaceId(request));
    });
  };
}
