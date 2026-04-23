// Meeting Notes — Standalone 服务器（PR5）
//
// 独立部署入口：
//   import { createStandaloneServer } from '@content-pipeline/meeting-notes';
//   await createStandaloneServer({
//     port: 8787,
//     dbConnectionString: 'postgres://...',
//     llm: { provider: 'claude', apiKey: '...' },
//     expertServiceUrl: 'http://expert-library:4000',   // 可选
//   }).then(s => s.start());
//
// 实现：
//   1. pg Pool + DatabaseAdapter
//   2. 轻量 LLMAdapter (调用 stub 或通过 expertServiceUrl 远程)
//   3. experts/expertApplication 通过 remoteInvoker 调远端服务；未配置时 no-op
//   4. Fastify 挂 /api/v1/meeting-notes/* + /healthz + /readyz
//   5. scheduler 启动

import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';
import { createMeetingNotesEngine } from './index.js';
import { createRouter } from './router.js';
import { startMeetingNotesScheduler } from './scheduler.js';
import type {
  StandaloneConfig,
  MeetingNotesDeps,
  LLMAdapter,
  LLMOptions,
  ExpertsAdapter,
  ExpertApplicationAdapter,
  AssetsAiAdapter,
  DatabaseAdapter,
} from './types.js';
import { LocalEventBus } from './adapters/local-event-bus.js';
import { PostgresTextSearch } from './adapters/postgres-text-search.js';

export interface StandaloneHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ---------- LLM: 优先走 expertServiceUrl，否则 stub ----------
function createRemoteLLMAdapter(url: string): LLMAdapter {
  return {
    async complete(prompt: string, options?: LLMOptions): Promise<string> {
      const r = await fetch(`${url}/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, options }),
      });
      if (!r.ok) throw new Error(`remote llm ${r.status}`);
      const j = await r.json() as { content?: string };
      return j.content ?? '';
    },
    async completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string> {
      const r = await fetch(`${url}/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, userPrompt, options }),
      });
      if (!r.ok) throw new Error(`remote llm ${r.status}`);
      const j = await r.json() as { content?: string };
      return j.content ?? '';
    },
  };
}

function createStubLLMAdapter(): LLMAdapter {
  return {
    async complete() { return ''; },
    async completeWithSystem() { return ''; },
  };
}

function createStubExpertsAdapter(): ExpertsAdapter {
  return {
    async invoke() { return { output_sections: {} }; },
  };
}

// 默认 expert-application：不懂 meetingKind 就返回 null（LLM 直接走 stub）
function createDefaultExpertApplication(): ExpertApplicationAdapter {
  return {
    resolveForMeetingKind: () => null,
    shouldSkipExpertAnalysis: (kind) => kind === 'internal_ops',
  };
}

function createStubAssetsAi(): AssetsAiAdapter {
  return {
    async parseMeeting(assetId) { return { assetId }; },
  };
}

function makeDbAdapter(pool: pg.Pool): DatabaseAdapter {
  return {
    async query(sql, params) {
      const r = await pool.query(sql, params);
      return { rows: r.rows };
    },
  };
}

export async function createStandalone(config: StandaloneConfig): Promise<StandaloneHandle> {
  const pool = new pg.Pool({ connectionString: config.dbConnectionString });

  const deps: MeetingNotesDeps = {
    db: makeDbAdapter(pool),
    llm: config.expertServiceUrl
      ? createRemoteLLMAdapter(config.expertServiceUrl)
      : createStubLLMAdapter(),
    embedding: {
      async embed() { return []; },
      async embedBatch(ts) { return ts.map(() => []); },
    },
    experts: createStubExpertsAdapter(),
    expertApplication: createDefaultExpertApplication(),
    assetsAi: createStubAssetsAi(),
    eventBus: new LocalEventBus(),
    textSearch: new PostgresTextSearch({
      async query(sql, params) { const r = await pool.query(sql, params); return { rows: r.rows }; },
    }),
  };

  const engine = createMeetingNotesEngine(deps, {
    runConcurrency: 2,
    enableScheduler: !config.disableAutoRun,
  });

  const app = Fastify({ logger: { level: 'info' } });
  await app.register(cors, { origin: true, credentials: true });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async () => {
    try {
      await pool.query('SELECT 1');
      return { ok: true, db: 'up' };
    } catch (e) {
      return { ok: false, db: 'down', error: (e as Error).message };
    }
  });

  await app.register(createRouter(engine), { prefix: '/api/v1/meeting-notes' });

  const scheduler = startMeetingNotesScheduler(engine);

  return {
    async start() {
      await app.listen({ port: config.port, host: '0.0.0.0' });
      if (!config.disableAutoRun) await scheduler.start();
      console.log(`[meeting-notes] standalone listening on :${config.port}`);
    },
    async stop() {
      await scheduler.stop();
      await app.close();
      await pool.end();
    },
  };
}
