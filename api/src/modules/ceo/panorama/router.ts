// Panorama · 全景画板路由
// /api/v1/ceo/panorama/*

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from '../CeoEngine.js';
import { getPanoramaData } from './service.js';

export function createPanoramaRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function panoramaRoutes(fastify: FastifyInstance) {
    fastify.get('/', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return getPanoramaData(engine.deps, scopeId);
    });
  };
}
