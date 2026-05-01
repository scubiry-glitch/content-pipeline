// CEO Module — Fastify 路由 (薄层)
// 子路由按房间 + 全局 (panorama / brain) 拆分

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from './CeoEngine.js';
import { createCompassRouter } from './rooms/compass/router.js';
import { createBoardroomRouter } from './rooms/boardroom/router.js';
import { createTowerRouter } from './rooms/tower/router.js';
import { createWarRoomRouter } from './rooms/war-room/router.js';
import { createSituationRouter } from './rooms/situation/router.js';
import { createBalconyRouter } from './rooms/balcony/router.js';
import { createPanoramaRouter } from './panorama/router.js';
import { createBrainRouter } from './brain/router.js';
import { createPeopleAgentsRouter } from './rooms/people-agents/router.js';

export function createRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function ceoRoutes(fastify: FastifyInstance) {
    fastify.get('/health', async () => engine.health());

    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return engine.buildDashboard(scopeId);
    });

    // 房间子路由
    await fastify.register(createCompassRouter(engine), { prefix: '/compass' });
    await fastify.register(createBoardroomRouter(engine), { prefix: '/boardroom' });
    await fastify.register(createTowerRouter(engine), { prefix: '/tower' });
    await fastify.register(createWarRoomRouter(engine), { prefix: '/war-room' });
    await fastify.register(createSituationRouter(engine), { prefix: '/situation' });
    await fastify.register(createBalconyRouter(engine), { prefix: '/balcony' });
    await fastify.register(createPanoramaRouter(engine), { prefix: '/panorama' });
    await fastify.register(createBrainRouter(engine), { prefix: '/brain' });
    await fastify.register(createPeopleAgentsRouter(engine), { prefix: '/people' });

    // PR12 — 5 组加工接生成中心：手动入队接口
    fastify.post('/runs/enqueue', async (request) => {
      const body = (request.body ?? {}) as Record<string, any>;
      const axis = body.axis as 'g1' | 'g2' | 'g3' | 'g4' | 'g5';
      if (!['g1', 'g2', 'g3', 'g4', 'g5'].includes(axis)) {
        return { ok: false, error: 'axis must be one of g1..g5' };
      }
      return engine.enqueueRun({
        axis,
        scopeKind: body.scopeKind,
        scopeId: body.scopeId,
        metadata: body.metadata,
      });
    });
  };
}
