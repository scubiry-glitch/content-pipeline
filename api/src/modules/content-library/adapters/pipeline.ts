// Pipeline Adapter — 桥接 pipeline 已有服务到 Content Library 模块
// 嵌入式部署时使用

import type {
  ContentLibraryDeps,
  DatabaseAdapter,
  LLMAdapter,
  LLMOptions,
  EmbeddingAdapter,
} from '../types.js';
import { PostgresTextSearch } from './postgres-text-search.js';
import { LocalEventBus } from './local-event-bus.js';

/**
 * 一键创建 pipeline 环境的全部依赖
 *
 * 用法:
 *   import { query } from '../../db/connection.js';
 *   import { generate, generateEmbedding } from '../../services/llm.js';
 *   const deps = createContentLibraryPipelineDeps(query, generate, generateEmbedding);
 *   const engine = createContentLibraryEngine(deps);
 */
export function createContentLibraryPipelineDeps(
  queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
  generateFn: (prompt: string, taskType?: string, options?: any) => Promise<{ content: string }>,
  embedFn?: (text: string) => Promise<number[]>
): ContentLibraryDeps {
  const db: DatabaseAdapter = { query: queryFn };

  const llm: LLMAdapter = {
    async complete(prompt: string, options?: LLMOptions): Promise<string> {
      const result = await generateFn(prompt, 'content_library', {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        model: options?.model,
      });
      return result.content;
    },
    async completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string> {
      const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
      const result = await generateFn(combinedPrompt, 'content_library', {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        model: options?.model,
      });
      return result.content;
    },
  };

  const embedding: EmbeddingAdapter = {
    async embed(text: string): Promise<number[]> {
      if (embedFn) return embedFn(text);
      return new Array(768).fill(0);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (embedFn) return Promise.all(texts.map(t => embedFn(t)));
      return texts.map(() => new Array(768).fill(0));
    },
  };

  return {
    db,
    llm,
    embedding,
    textSearch: new PostgresTextSearch(db),
    eventBus: new LocalEventBus(),
  };
}
