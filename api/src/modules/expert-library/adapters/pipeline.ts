// Pipeline Adapter — 桥接 pipeline 已有服务到 Expert Library 模块
// 嵌入式部署时使用

import type { DatabaseAdapter, LLMAdapter, LLMOptions, FileParserAdapter, ParsedDocument, ExpertLibraryDeps } from '../types.js';

/**
 * 从 pipeline 的 db/connection 创建 DatabaseAdapter
 */
export function createPipelineDBAdapter(queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>): DatabaseAdapter {
  return { query: queryFn };
}

/**
 * 从 pipeline 的 llm.generate 创建 LLMAdapter
 */
export function createPipelineLLMAdapter(
  generateFn: (prompt: string, taskType?: string, options?: any) => Promise<{ content: string }>
): LLMAdapter {
  return {
    async complete(prompt: string, options?: LLMOptions): Promise<string> {
      const result = await generateFn(prompt, 'expert_library', {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        model: options?.model,
      });
      return result.content;
    },
    async completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string> {
      const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
      const result = await generateFn(combinedPrompt, 'expert_library', {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        model: options?.model,
      });
      return result.content;
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
 *   import { generate } from '../../services/llm.js';
 *   const deps = createPipelineDeps(query, generate);
 *   const engine = createExpertEngine(deps);
 */
export function createPipelineDeps(
  queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
  generateFn: (prompt: string, taskType?: string, options?: any) => Promise<{ content: string }>,
  fileParserFn?: (filePath: string) => Promise<{ text: string; metadata?: Record<string, any> }>,
  embedFn?: (text: string) => Promise<number[]>
): ExpertLibraryDeps {
  const llm = createPipelineLLMAdapter(generateFn);
  if (embedFn) {
    llm.embed = embedFn;
  }
  return {
    db: createPipelineDBAdapter(queryFn),
    llm,
    fileParser: fileParserFn ? createPipelineFileParserAdapter(fileParserFn) : undefined,
  };
}
