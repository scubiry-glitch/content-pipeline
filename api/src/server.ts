// 内容生产流水线 API Server (MVP)
// 技术栈: Fastify + TypeScript + PostgreSQL + BullMQ

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { productionRoutes } from './routes/production.js';
import { assetRoutes } from './routes/assets.js';
import { outputRoutes } from './routes/outputs.js';
import { rssRoutes } from './routes/rss.js';
import { recommendationRoutes } from './routes/recommendation.js';
import { archiveRoutes } from './routes/archive.js';
import { researchRoutes } from './routes/research.js';
import { reportRoutes } from './routes/reports.js';
import { v34ReportRoutes } from './routes/v34-reports.js';
import { v34HotTopicRoutes } from './routes/v34-hot-topics.js';
import { v34AssetRoutes } from './routes/v34-assets.js';
import { v40ComplianceRoutes } from './routes/v40-compliance.js';
import { v41OrchestratorRoutes } from './routes/v41-orchestrator.js';
import { publicAPIRoutes } from './routes/public-api.js';
import { setupAuth } from './middleware/auth.js';
import { startRSSCron } from './services/rssCrawler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getDirectoryWatcherService } from './services/directoryWatcher.js';
import { initLLMRouter, isClaudeCodeEnvironment, MockProvider } from './providers/index.js';
import { initDatabase } from './db/connection.js';

dotenv.config();

async function main() {
  // Initialize LLM Router
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const inClaudeCode = isClaudeCodeEnvironment();

  const kimiApiKey = process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);

  if (kimiApiKey || (claudeApiKey && !claudeApiKey.startsWith('sk-kimi')) || openaiApiKey || inClaudeCode) {
    initLLMRouter({
      kimiApiKey,
      claudeApiKey: claudeApiKey?.startsWith('sk-kimi') ? undefined : claudeApiKey,
      openaiApiKey,
      useClaudeCode: inClaudeCode && !claudeApiKey,
    });
    console.log('✓ LLM Router initialized');
  } else {
    console.warn('⚠️ No LLM API keys found. Using MockProvider for development.');
    const router = initLLMRouter({});
    router.registerProvider(new MockProvider());
    console.log('✓ LLM Router initialized with MockProvider');
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
      version: '3.0.0',
      timestamp: new Date().toISOString()
    };
  });

  // API routes (v1)
  await fastify.register(productionRoutes, { prefix: '/api/v1/production' });
  await fastify.register(assetRoutes, { prefix: '/api/v1/assets' });
  await fastify.register(outputRoutes, { prefix: '/api/v1/outputs' });
  await fastify.register(rssRoutes, { prefix: '/api/v1/rss' });
  await fastify.register(recommendationRoutes, { prefix: '/api/v1/recommendations' });
  await fastify.register(archiveRoutes, { prefix: '/api/v1/archive' });
  await fastify.register(researchRoutes, { prefix: '/api/v1/research' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/reports' });

  // v3.4 内容质量输入体系路由
  await fastify.register(v34ReportRoutes, { prefix: '/api/v1/quality/reports' });
  await fastify.register(v34HotTopicRoutes, { prefix: '/api/v1/quality/hot-topics' });
  await fastify.register(v34AssetRoutes, { prefix: '/api/v1/quality/assets' });

  // v4.0 智能审核与合规路由
  await fastify.register(v40ComplianceRoutes, { prefix: '/api/v1/compliance' });

  // v4.1 智能流水线编排路由
  await fastify.register(v41OrchestratorRoutes, { prefix: '/api/v1/orchestrator' });

  // Public API routes (v3.0)
  await fastify.register(publicAPIRoutes, { prefix: '/api/v3' });

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

    // Start v3.4 RSS crawler
    startRSSCron(30); // 每30分钟抓取一次
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
