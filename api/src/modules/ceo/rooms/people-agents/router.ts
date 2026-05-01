// People Agents 路由
// /api/v1/ceo/people/:personId/{expert,bind-expert,invoke}

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../../CeoEngine.js';
import { getLink, bindExpert, invoke } from './service.js';

export function createPeopleAgentsRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function peopleAgentsRoutes(fastify: FastifyInstance) {
    fastify.get('/:personId/expert', async (request, reply) => {
      const { personId } = request.params as { personId: string };
      const link = await getLink(engine.deps, personId);
      if (!link) {
        reply.status(404);
        return { error: 'no link' };
      }
      return link;
    });

    fastify.post('/:personId/bind-expert', async (request, reply) => {
      const { personId } = request.params as { personId: string };
      const body = (request.body ?? {}) as Record<string, any>;
      const res = await bindExpert(engine.deps, personId, {
        expertId: body.expertId,
        overrides: body.overrides,
        taskType: body.taskType,
        createdBy: body.createdBy,
      });
      if (!res.ok) {
        reply.status(400);
        return { error: res.error };
      }
      return res.link;
    });

    fastify.post('/:personId/invoke', async (request, reply) => {
      const { personId } = request.params as { personId: string };
      const body = (request.body ?? {}) as Record<string, any>;
      const res = await invoke(engine.deps, personId, {
        question: body.question,
        taskType: body.taskType,
        depth: body.depth,
      });
      if (!res.ok) {
        reply.status(res.error === 'person 未绑定 expert' ? 404 : 400);
        return { error: res.error };
      }
      return res.result;
    });
  };
}
