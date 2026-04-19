// Pipeline Adapter — 桥接 pipeline 已有服务到 Expert Library 模块
// 嵌入式部署时使用

import { getLLMRouter } from '../../../providers/index.js';
import type { GenerationParams } from '../../../types/index.js';
import type { DatabaseAdapter, LLMAdapter, LLMOptions, FileParserAdapter, ParsedDocument, ExpertLibraryDeps } from '../types.js';

function expertLibraryRouterParams(
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

/**
 * 从 pipeline 的 db/connection 创建 DatabaseAdapter
 */
export function createPipelineDBAdapter(queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>): DatabaseAdapter {
  return { query: queryFn };
}

/**
 * 专家库 LLM：统一走 LLMRouter（expert_library → 火山优先，失败则 SiliconFlow 等路由规则）。
 * 须在进程内已执行 initLLMRouter() 之后使用。
 */
export function createPipelineLLMAdapter(): LLMAdapter {
  return {
    async complete(prompt: string, options?: LLMOptions): Promise<string> {
      const router = getLLMRouter();
      const result = await router.generate(
        prompt,
        'expert_library',
        expertLibraryRouterParams(options)
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
        'expert_library',
        expertLibraryRouterParams(options, systemPrompt)
      );
      return result.content;
    },
    async completeWithSystemDetailed(
      systemPrompt: string,
      userPrompt: string,
      options?: LLMOptions
    ): Promise<{ content: string; reasoning?: string }> {
      const router = getLLMRouter();
      const result = await router.generate(
        userPrompt,
        'expert_library',
        expertLibraryRouterParams(options, systemPrompt)
      );
      return { content: result.content, reasoning: result.reasoning };
    },
  };
}

/**
 * 从 pipeline 的 fileParser 创建 FileParserAdapter
 */
export function createPipelineFileParserAdapter(
  parseFn: (filePath: string) => Promise<{ text: string; metadata?: Record<string, any> }>
): FileParserAdapter {
  return {
    async parse(filePath: string): Promise<ParsedDocument> {
      const result = await parseFn(filePath);
      return {
        text: result.text,
        metadata: result.metadata,
      };
    },
  };
}

/**
 * 一键创建 pipeline 环境的全部依赖
 * 用法:
 *   import { query } from '../../db/connection.js';
 *   const deps = createPipelineDeps(query, undefined, undefined, generateEmbedding);
 *   const engine = await createExpertEngine(deps);
 *
 * @param _legacyGenerate 已废弃；专家库 LLM 固定使用 initLLMRouter 注册的 LLMRouter
 */
export function createPipelineDeps(
  queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
  _legacyGenerate?: (prompt: string, taskType?: string, options?: any) => Promise<{ content: string }>,
  fileParserFn?: (filePath: string) => Promise<{ text: string; metadata?: Record<string, any> }>,
  embedFn?: (text: string) => Promise<number[]>
): ExpertLibraryDeps {
  void _legacyGenerate;
  const llm = createPipelineLLMAdapter();
  if (embedFn) {
    llm.embed = embedFn;
  }
  return {
    db: createPipelineDBAdapter(queryFn),
    llm,
    fileParser: fileParserFn ? createPipelineFileParserAdapter(fileParserFn) : undefined,
  };
}
