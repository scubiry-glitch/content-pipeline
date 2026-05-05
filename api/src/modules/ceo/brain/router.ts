// Brain · 外脑图书馆路由
// /api/v1/ceo/brain/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../CeoEngine.js';
import { listCrossModuleTasks, getBrainOverview } from './tasks-service.js';
import { ceoWorkspaceGuard } from '../workspaceGuard.js';
import { currentWorkspaceId } from '../../../db/repos/withWorkspace.js';

export function createBrainRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function brainRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', ceoWorkspaceGuard);

    fastify.get('/overview', async (request) =>
      getBrainOverview(engine.deps, currentWorkspaceId(request)),
    );

    fastify.get('/tasks', async (request) => {
      const { state, module: moduleFilter, limit, ids } = (request.query ?? {}) as {
        state?: string;
        module?: string;
        limit?: string;
        ids?: string;
      };
      const idArr = ids
        ? ids.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      return listCrossModuleTasks(engine.deps, {
        state,
        module: moduleFilter,
        limit: limit ? Number(limit) : 30,
        ids: idArr,
        workspaceId: currentWorkspaceId(request),
      });
    });
  };
}
