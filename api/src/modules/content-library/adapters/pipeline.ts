// Pipeline Adapter — 桥接 pipeline 已有服务到 Content Library 模块
// 嵌入式部署时使用

import { getLLMRouter } from '../../../providers/index.js';
import type { GenerationParams } from '../../../types/index.js';
import type {
  ContentLibraryDeps,
  DatabaseAdapter,
  LLMAdapter,
  LLMOptions,
  EmbeddingAdapter,
} from '../types.js';
import { PostgresTextSearch } from './postgres-text-search.js';
import { LocalEventBus } from './local-event-bus.js';

function contentLibraryRouterParams(
  options?: LLMOptions,
  systemPrompt?: string
): GenerationParams {
  const p: GenerationParams = {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    model: options?.model,
  };
  if (systemPrompt !== undefined && systemPrompt !== '') {
    p.systemPrompt = systemPrompt;
  }
  if (options?.responseFormat) {
    p.responseFormat = options.responseFormat;
  }
  return p;
}

/** 内容库表为 vector(768)；主站 embedding 多为 1536，需对齐维度 */
function coerceVec768(v: number[]): number[] {
  if (v.length === 768) return v;
  if (v.length > 768) return v.slice(0, 768);
  const out = v.slice();
  while (out.length < 768) out.push(0);
  return out;
}

/**
 * 一键创建 pipeline 环境的全部依赖
 *
 * 用法:
 *   import { query } from '../../db/connection.js';
 *   import { generateEmbedding } from '../../services/llm.js';
 *   // 须先 initLLMRouter（与 server.ts 相同）
 *   const deps = createContentLibraryPipelineDeps(query, undefined, generateEmbedding);
 *   const engine = createContentLibraryEngine(deps);
 *
 * @param _legacyGenerate 已废弃；内容库 LLM 固定使用 initLLMRouter 注册的 LLMRouter（task: content_library）
 */
export function createContentLibraryPipelineDeps(
  queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
  _legacyGenerate?: (prompt: string, taskType?: string, options?: any) => Promise<{ content: string }>,
  embedFn?: (text: string) => Promise<number[]>
): ContentLibraryDeps {
  void _legacyGenerate;
  const db: DatabaseAdapter = { query: queryFn };

  const llm: LLMAdapter = {
    async complete(prompt: string, options?: LLMOptions): Promise<string> {
      const router = getLLMRouter();
      const result = await router.generate(
        prompt,
        'content_library',
        contentLibraryRouterParams(options)
      );
      return result.content;
    },
    async completeWithSystem(
      systemPrompt: string,
      userPrompt: string,
      options?: LLMOptions
    ): Promise<string> {
      const router = getLLMRouter();
      const result = await router.generate(
        userPrompt,
        'content_library',
        contentLibraryRouterParams(options, systemPrompt)
      );
      return result.content;
    },
  };

  const embedding: EmbeddingAdapter = {
    async embed(text: string): Promise<number[]> {
      if (!embedFn) return new Array(768).fill(0);
      return coerceVec768(await embedFn(text));
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (!embedFn) return texts.map(() => new Array(768).fill(0));
      const rows = await Promise.all(texts.map((t) => embedFn(t)));
      return rows.map(coerceVec768);
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
