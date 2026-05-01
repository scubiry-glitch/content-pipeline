// CEO Module — Fastify 路由 (薄层)
// PR3 仅暴露 /health + /dashboard 占位；房间路由 PR4-PR9 各自补齐

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from './CeoEngine.js';

export function createRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function ceoRoutes(fastify: FastifyInstance) {
    fastify.get('/health', async () => engine.health());

    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return engine.buildDashboard(scopeId);
    });

    // PR4-PR12 在这里挂入子路由：
    //   await fastify.register(createCompassRouter(engine), { prefix: '/compass' });
    //   await fastify.register(createBoardroomRouter(engine), { prefix: '/boardroom' });
    //   ...
    //   await fastify.register(createBrainRouter(engine), { prefix: '/brain' });
  };
}
