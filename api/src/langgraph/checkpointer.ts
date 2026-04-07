// LangGraph PostgreSQL Checkpointer
// 复用现有 pg 连接池实现状态持久化

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { MemorySaver } from '@langchain/langgraph';
import { createPool } from '../db/connection.js';

let checkpointerInstance: PostgresSaver | MemorySaver | null = null;

/**
 * 获取 LangGraph checkpointer 实例
 * 优先使用 PostgreSQL，失败时回退到内存模式
 */
export async function getCheckpointer(): Promise<PostgresSaver | MemorySaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  try {
    const pool = createPool();
    const connString = process.env.DATABASE_URL || buildConnectionString();

    if (connString) {
      const pgSaver = PostgresSaver.fromConnString(connString);
      await pgSaver.setup();
      checkpointerInstance = pgSaver;
      console.log('[LangGraph] PostgreSQL checkpointer initialized');
      return checkpointerInstance;
    }
  } catch (error) {
    console.warn('[LangGraph] PostgreSQL checkpointer failed, falling back to MemorySaver:', error);
  }

  // Fallback to in-memory (开发/测试用)
  checkpointerInstance = new MemorySaver();
  console.log('[LangGraph] Using in-memory checkpointer (fallback)');
  return checkpointerInstance;
}

function buildConnectionString(): string | null {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || process.env.DB_DATABASE;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!host || !database || !user) return null;

  return `postgresql://${user}:${password || ''}@${host}:${port}/${database}`;
}

/**
 * 重置 checkpointer（测试用）
 */
export function resetCheckpointer(): void {
  checkpointerInstance = null;
}
