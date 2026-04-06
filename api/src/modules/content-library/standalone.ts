// Content Library — 独立部署入口
// 仅在独立微服务模式下使用
// 嵌入模式不需要此文件

import type { StandaloneConfig, ContentLibraryDeps } from './types.js';
import { ContentLibraryEngine } from './ContentLibraryEngine.js';
import { createRouter } from './router.js';
import { PostgresTextSearch } from './adapters/postgres-text-search.js';
import { LocalEventBus } from './adapters/local-event-bus.js';

export async function createStandalone(config: StandaloneConfig): Promise<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
}> {
  // 动态导入 Fastify（仅独立模式需要）
  const { default: Fastify } = await import('fastify');
  const fastify = Fastify({ logger: true });

  // 创建数据库适配器
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  const dbAdapter = {
    query: async (sql: string, params?: any[]) => pool.query(sql, params),
  };

  // 创建 LLM 适配器 (简化版 — 生产环境应使用完整实现)
  const llmAdapter = {
    complete: async (prompt: string) => {
      console.warn('[Standalone] LLM adapter: using placeholder. Configure a real LLM provider.');
      return '{}';
    },
    completeWithSystem: async (system: string, user: string) => {
      console.warn('[Standalone] LLM adapter: using placeholder. Configure a real LLM provider.');
      return '{}';
    },
  };

  // 创建 Embedding 适配器 (简化版)
  const embeddingAdapter = {
    embed: async (text: string) => {
      console.warn('[Standalone] Embedding adapter: using placeholder. Configure a real embedding provider.');
      return new Array(768).fill(0);
    },
    embedBatch: async (texts: string[]) => {
      return texts.map(() => new Array(768).fill(0));
    },
  };

  // 组装依赖
  const deps: ContentLibraryDeps = {
    db: dbAdapter,
    llm: llmAdapter,
    embedding: embeddingAdapter,
    textSearch: new PostgresTextSearch(dbAdapter),
    eventBus: new LocalEventBus(),
  };

  // 创建引擎
  const engine = new ContentLibraryEngine(deps);

  // 注册路由
  const router = createRouter(engine);
  await fastify.register(router, { prefix: '/api/v1/content-library' });

  // CORS (如果配置了)
  if (config.corsOrigins) {
    const { default: cors } = await import('@fastify/cors');
    await fastify.register(cors, { origin: config.corsOrigins });
  }

  // 健康检查
  fastify.get('/health', async () => ({ status: 'ok', module: 'content-library', version: '7.0.0' }));

  return {
    start: async () => {
      await fastify.listen({ port: config.port, host: config.host || '0.0.0.0' });
      console.log(`[ContentLibrary] Standalone server running on port ${config.port}`);
    },
    stop: async () => {
      await fastify.close();
      await pool.end();
      console.log('[ContentLibrary] Standalone server stopped');
    },
  };
}
