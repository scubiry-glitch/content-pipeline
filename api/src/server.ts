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
import { getDirectoryWatcherService } from './services/directoryWatcher.js';
import { initLLMRouter, isClaudeCodeEnvironment } from './providers/index.js';
import { initDatabase } from './db/connection.js';

dotenv.config();

async function main() {
  // Initialize LLM Router
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const inClaudeCode = isClaudeCodeEnvironment();

  if (claudeApiKey || openaiApiKey || inClaudeCode) {
    initLLMRouter({
      claudeApiKey,
      openaiApiKey,
      useClaudeCode: inClaudeCode && !claudeApiKey,
    });
    console.log('✓ LLM Router initialized');
  } else {
    console.warn('⚠️ No LLM API keys found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY');
  }

  // Initialize Database
  if (process.env.DATABASE_URL || process.env.DB_HOST) {
    await initDatabase();
    console.log('✓ Database connected');
  }

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

    // Initialize directory watcher service
    const watcherService = getDirectoryWatcherService();
    await watcherService.initialize();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
