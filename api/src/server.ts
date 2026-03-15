// 内容生产流水线 API Server (MVP)
// 技术栈: Fastify + TypeScript + PostgreSQL + BullMQ

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { productionRoutes } from './routes/production.js';
import { assetRoutes } from './routes/assets.js';
import { outputRoutes } from './routes/outputs.js';
import { setupAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

async function main() {
  const fastify = Fastify({
    logger: {
      level: 'info'
    }
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB
    }
  });

  // Setup authentication
  setupAuth(fastify);

  // Health check (public)
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'content-pipeline-api',
      version: '1.0.0-mvp',
      timestamp: new Date().toISOString()
    };
  });

  // API routes (v1)
  await fastify.register(productionRoutes, { prefix: '/api/v1/production' });
  await fastify.register(assetRoutes, { prefix: '/api/v1/assets' });
  await fastify.register(outputRoutes, { prefix: '/api/v1/outputs' });

  // Error handler
  fastify.setErrorHandler(errorHandler);

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.status(404);
    return {
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      code: 'ROUTE_NOT_FOUND'
    };
  });

  // Start server
  const PORT = parseInt(process.env.PORT || '3000');
  const HOST = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 Content Pipeline API running at http://${HOST}:${PORT}`);
    console.log(`📚 Health Check: http://${HOST}:${PORT}/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
