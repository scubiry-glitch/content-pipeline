// 内容生产流水线 API Server (MVP)
// 技术栈: Fastify + TypeScript + PostgreSQL + BullMQ

// 首先加载环境变量，确保在所有模块导入前完成
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 仅用 cwd 解析 .env，使 `tsc` 产出的 CommonJS 可被 `node dist/server.js` / PM2 正常运行
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'api', '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(process.cwd(), '..', 'api', '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('[Server] Loaded environment from:', envPath);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('[Server] Warning: .env file not found, using environment variables');
  dotenv.config(); // 尝试默认路径
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { productionRoutes } from './routes/production.js';
import { assetRoutes } from './routes/assets.js';
import { outputRoutes } from './routes/outputs.js';
import { rssRoutes } from './routes/rss.js';
import { meetingNotesRoutes } from './routes/meetingNotes.js';
import { recommendationRoutes } from './routes/recommendation.js';
import { archiveRoutes } from './routes/archive.js';
import { researchRoutes } from './routes/research.js';
import { reportRoutes } from './routes/reports.js';
import { v34ReportRoutes } from './routes/v34-reports.js';
import { v34HotTopicRoutes } from './routes/v34-hot-topics.js';
import { v34AssetRoutes } from './routes/v34-assets.js';
import { v40ComplianceRoutes } from './routes/v40-compliance.js';
import { v41OrchestratorRoutes } from './routes/v41-orchestrator.js';
import { v42Stage3Routes } from './routes/v42-stage3.js';
import { v43PredictionRoutes } from './routes/v43-prediction.js';
import { v44CopilotRoutes } from './routes/v44-copilot.js';
import { v45I18nRoutes } from './routes/v45-i18n.js';
import communityTopicRoutes from './routes/communityTopics.js';
import streamingOutlineRoutes from './routes/streamingOutline.js';
import { streamingBlueTeamRoutes } from './routes/streamingBlueTeam.js';
import { streamingSequentialRoutes } from './routes/streamingSequential.js';
import { expertRoutes } from './routes/experts.js';
import { createExpertEngine, createRouter as createExpertLibraryRouter } from './modules/expert-library/index.js';
import { createPipelineDeps } from './modules/expert-library/adapters/pipeline.js';
import { initExpertEngineSingleton } from './modules/expert-library/singleton.js';
import { createContentLibraryEngine, createRouter as createContentLibraryRouter } from './modules/content-library/index.js';
import { createContentLibraryPipelineDeps } from './modules/content-library/adapters/pipeline.js';
import { initContentLibraryEngineSingleton } from './modules/content-library/singleton.js';
import { query } from './db/connection.js';
import { generateEmbedding } from './services/llm.js';
import { sentimentRoutes } from './routes/sentiment.js';
import { favoritesRoutes } from './routes/favorites.js';
import { publicAPIRoutes } from './routes/public-api.js';
import { llmRoutes } from './routes/llm.js';
import { langgraphRoutes } from './routes/langgraph.js';
import { aiProcessingRoutes } from './routes/ai-processing.js';
import { assetsAIProcessingRoutes } from './routes/assets-ai-processing.js';
import { taxonomyRoutes } from './routes/taxonomy.js';
import { ensureTaxonomySchema, sync as taxonomySync } from './services/taxonomyService.js';
import { setupAuth } from './middleware/auth.js';
// RSS 自动采集已整合到 rssCollector.ts，不再使用 rssCrawler.js
import { errorHandler } from './middleware/errorHandler.js';
import { getDirectoryWatcherService } from './services/directoryWatcher.js';
import { initLLMRouter, isClaudeCodeEnvironment } from './providers/index.js';
import { initDatabase } from './db/connection.js';
import { printAPICheckReport, validateRequiredConfig } from './services/apiCheck.js';

async function main() {
  // 打印 API 配置检查报告
  printAPICheckReport();

  // 验证必需的配置
  validateRequiredConfig();

  // Initialize LLM Router
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const inClaudeCode = isClaudeCodeEnvironment();

  const kimiApiKey = process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);

  // 初始化 LLM Router（如果没有配置 API Key 会抛出错误）
  initLLMRouter({
    kimiApiKey,
    claudeApiKey: claudeApiKey?.startsWith('sk-kimi') ? undefined : claudeApiKey,
    openaiApiKey,
    useClaudeCode: inClaudeCode && !claudeApiKey,
  });
  console.log('✓ LLM Router initialized');

  let resolveDbReady!: () => void;
  const dbReadyPromise = new Promise<void>((resolve) => {
    resolveDbReady = resolve;
  });

  const fastify = Fastify({
    logger: {
      level: 'info'
    }
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB
    }
  });

  // Setup authentication
  setupAuth(fastify);

  fastify.addHook('onRequest', async (request, _reply) => {
    const url = request.raw.url || '';
    if (url === '/health' || url.startsWith('/health?')) return;
    await dbReadyPromise;
  });

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
  await fastify.register(rssRoutes, { prefix: '/api/v1/quality' });
  await fastify.register(meetingNotesRoutes, { prefix: '/api/v1/quality' });
  await fastify.register(recommendationRoutes, { prefix: '/api/v1/recommendations' });
  await fastify.register(archiveRoutes, { prefix: '/api/v1/archive' });
  await fastify.register(researchRoutes, { prefix: '/api/v1/research' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/reports' });

  // v3.4 内容质量输入体系路由
  await fastify.register(v34ReportRoutes, { prefix: '/api/v1/quality/reports' });
  await fastify.register(v34HotTopicRoutes, { prefix: '/api/v1/quality/hot-topics' });
  await fastify.register(v34AssetRoutes, { prefix: '/api/v1/quality/assets' });
  
  // 社区话题抓取与归并路由 (v5.1)
  await fastify.register(communityTopicRoutes, { prefix: '/api/v1/quality/community' });
  
  // 流式大纲生成路由 (v5.1)
  await fastify.register(streamingOutlineRoutes, { prefix: '/api/v1/planning' });
  
  // 流式蓝军评审路由 (v5.2) - 实时 SSE 推送
  await fastify.register(streamingBlueTeamRoutes, { prefix: '/api/v1/streaming/blue-team' });
  
  // 流式串行评审路由 (v5.2) - 实时 SSE 推送
  await fastify.register(streamingSequentialRoutes, { prefix: '/api/v1/streaming/sequential' });

  // v4.0 智能审核与合规路由
  await fastify.register(v40ComplianceRoutes, { prefix: '/api/v1/compliance' });

  // v4.1 智能流水线编排路由
  await fastify.register(v41OrchestratorRoutes, { prefix: '/api/v1/orchestrator' });

  // v4.2 Stage 3 文稿生成增强路由
  await fastify.register(v42Stage3Routes, { prefix: '/api/v1/stage3' });

  // v4.3 内容表现预测路由
  await fastify.register(v43PredictionRoutes, { prefix: '/api/v1/prediction' });

  // v4.4 Copilot AI助手路由
  await fastify.register(v44CopilotRoutes, { prefix: '/api/v1/copilot' });

  // v4.5 国际化 (i18n) 路由
  await fastify.register(v45I18nRoutes, { prefix: '/api/v1/i18n' });

  // 专家库路由 (v2.0) — 旧版 keyword matching
  await fastify.register(expertRoutes, { prefix: '/api/v1/experts' });

  // Expert Library 独立模块 (v3.0) — Cognitive Digital Twin（DB 播种推迟到 initDatabase 完成之后，避免与迁移竞态）
  const expertLibraryDeps = createPipelineDeps(query, undefined, undefined, generateEmbedding);
  const expertEngine = await createExpertEngine(expertLibraryDeps);
  initExpertEngineSingleton(expertEngine);
  await fastify.register(createExpertLibraryRouter(expertEngine), { prefix: '/api/v1/expert-library' });

  // Content Library 独立模块 (v7.0) — 结构化记忆与层级检索
  const contentLibraryEngine = createContentLibraryEngine(
    createContentLibraryPipelineDeps(query, undefined, generateEmbedding)
  );
  initContentLibraryEngineSingleton(contentLibraryEngine);
  await fastify.register(createContentLibraryRouter(contentLibraryEngine), { prefix: '/api/v1/content-library' });

  // 收藏路由 (v5.1.1)
  await fastify.register(favoritesRoutes, { prefix: '/api/v1/favorites' });

  // 情感分析路由 (v2.2)
  await fastify.register(sentimentRoutes, { prefix: '/api/v1/sentiment' });
  await fastify.register(sentimentRoutes, { prefix: '/api/v1/quality/sentiment' });

  // Public API routes (v3.0)
  await fastify.register(publicAPIRoutes, { prefix: '/api/v3' });

  // Dashboard LLM 路由
  await fastify.register(llmRoutes, { prefix: '/api/llm' });
  
  // LangGraph 流水线路由 (独立模块)
  await fastify.register(langgraphRoutes, { prefix: '/api/v1/langgraph' });

  // v6.1: AI 批量处理路由 (RSS)
  await fastify.register(aiProcessingRoutes, { prefix: '/api/v1/ai' });
  
  // v6.2: Assets AI 批量处理路由
  await fastify.register(assetsAIProcessingRoutes, { prefix: '/api/v1/ai/assets' });

  // 统一领域 taxonomy 路由（/assets + /content-library + /expert-library 共用）
  await fastify.register(taxonomyRoutes, { prefix: '/api/v1/taxonomy' });

  fastify.setErrorHandler(errorHandler);

  fastify.setNotFoundHandler(async (request, reply) => {
    reply.status(404);
    return {
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      code: 'ROUTE_NOT_FOUND'
    };
  });

  const PORT = parseInt(process.env.PORT || '3006', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 Content Pipeline API running at http://${HOST}:${PORT}`);
    console.log(`📚 Health Check: http://${HOST}:${PORT}/health`);

    try {
      if (process.env.DATABASE_URL || process.env.DB_HOST) {
        console.log('[Server] Running database migrations / schema setup…');
        await initDatabase();
        console.log('✓ Database connected');

        try {
          await ensureTaxonomySchema();
          const { upserted } = await taxonomySync('boot');
          console.log(`🏷  Taxonomy ready (${upserted} nodes seeded/updated)`);
        } catch (err) {
          console.warn('[Server] Taxonomy bootstrap skipped:', (err as Error).message);
        }
      }
    } catch (e) {
      console.error('[Server] Database init failed:', e);
      process.exit(1);
    }
    resolveDbReady();

    // Initialize directory watcher service
    const watcherService = getDirectoryWatcherService();
    await watcherService.initialize();

    // 启动热度分数定时更新任务（每30分钟）
    const { startHotScoreScheduler } = await import('./services/hotScoreScheduler.js');
    startHotScoreScheduler('*/30 * * * *'); // 每30分钟更新一次
    
    console.log('⏰ 热度分数定时更新已启动（每30分钟）');

    // v6.1: 启动 RSS AI 批量处理定时任务
    const { aiScheduler } = await import('./services/ai/scheduler.js');
    aiScheduler.start();
    console.log('🤖 RSS AI 批量处理定时任务已启动（每15分钟）');
    
    // v6.2: 启动 Assets AI 批量处理定时任务
    const { assetsAIScheduler } = await import('./services/assets-ai/scheduler.js');
    assetsAIScheduler.start();
    console.log('📄 Assets AI 批量处理定时任务已启动（每30分钟）');

    // v7.6: 启动会议纪要采集定时任务（按每个 source.scheduleCron 独立调度）
    try {
      const { MeetingNoteChannelService } = await import('./services/meetingNoteChannel.js');
      const { getMeetingNoteScheduler } = await import('./services/meetingNoteScheduler.js');
      const mnSvc = new MeetingNoteChannelService();
      const mnSched = getMeetingNoteScheduler(mnSvc);
      mnSvc.setOnSourceChanged(() => mnSched.reload());
      await mnSched.start();
      console.log(`🎙️ 会议纪要定时采集已启动（活跃 ${mnSched.activeCount} 个源，跳过 ${mnSched.skipped.length}）`);
    } catch (err) {
      console.warn('🎙️ 会议纪要调度器启动失败（不影响其他服务）:', (err as Error).message);
    }

    // v7.0: 启动内容库定时任务（信息增量报告 + 保鲜度检查）
    const { startContentLibraryScheduler } = await import('./modules/content-library/scheduler.js');
    startContentLibraryScheduler(contentLibraryEngine, undefined, {
      deltaReportInterval: 6 * 60 * 60 * 1000,     // 每6小时生成增量报告
      freshnessCheckInterval: 24 * 60 * 60 * 1000,  // 每24小时检查保鲜度
      factMaxAgeDays: 90,
    });
    console.log('📚 内容库定时任务已启动（增量报告每6h，保鲜度每24h）');

    // RSS 自动采集已整合，可通过 /api/v1/quality/rss-sources/crawl 接口手动触发
    // 或配置定时任务调用 collectAllFeeds()
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
