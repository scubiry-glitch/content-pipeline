// Meeting Notes — Standalone 服务器（PR1 骨架，PR5 补齐）
// 独立部署时：createStandaloneServer({port, dbConnectionString, ...}).start()

import type { StandaloneConfig } from './types.js';

export interface StandaloneHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * PR1: 仅声明接口并抛 not-implemented；PR5 会补齐：
 *   - 内嵌 pg Pool + LLM 客户端
 *   - Fastify + createRouter(engine) 挂到 /api/v1/meeting-notes
 *   - /healthz + /readyz
 *   - scheduler 启动
 */
export async function createStandalone(_config: StandaloneConfig): Promise<StandaloneHandle> {
  return {
    async start() {
      throw new Error('[MeetingNotes] Standalone server not implemented yet (PR5)');
    },
    async stop() {
      /* noop */
    },
  };
}
