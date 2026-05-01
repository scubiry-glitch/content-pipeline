// CEO 模块 LLM Adapter 接口 + 实现
//
// 设计目的：g3/g4 加工任务需要 LLM 调用，但 mn 的 claudeCliRunner 内部紧耦合
// 会议纪要的 axis prompt 模板。CEO 不直接 import 它，而是定义一个最小适配器接口，
// 由 server.ts 注入实现。
//
// 当前提供两种实现:
//   - NullCeoLLMAdapter: stub，逼 handler 走兜底分支
//   - createServiceLLMCeoAdapter: 复用 services/llm.ts (Claude/Kimi/OpenAI 自动路由)，
//     是生产路径。

import type {
  CeoLLMAdapter,
  CeoLLMInvokeInput,
  CeoLLMInvokeResult,
} from '../types.js';

export type { CeoLLMAdapter, CeoLLMInvokeInput, CeoLLMInvokeResult } from '../types.js';

/** Null stub — 默认实现，所有调用都标 unavailable */
export class NullCeoLLMAdapter implements CeoLLMAdapter {
  async invoke(_input: CeoLLMInvokeInput): Promise<CeoLLMInvokeResult> {
    throw new Error('[CeoLLMAdapter] not configured. Inject real adapter via createCeoEngine deps.');
  }

  isAvailable(): boolean {
    return false;
  }
}

/** services/llm.ts 注入接口 (避免在 modules/ceo/ 直接 import 上层) */
export interface ServiceLLMHandle {
  hasAvailable: () => boolean;
  available: () => { kimi: boolean; claude: boolean; openai: boolean };
  generateWithClaude: (
    prompt: string,
    opts: { systemPrompt?: string; maxTokens?: number; temperature?: number; responseFormat?: 'json' | 'text' },
  ) => Promise<{ content: string; model: string; usage?: { inputTokens: number; outputTokens: number } }>;
  generateWithKimi?: (
    prompt: string,
    opts: { systemPrompt?: string; maxTokens?: number; temperature?: number; responseFormat?: 'json' | 'text' },
  ) => Promise<{ content: string; model: string; usage?: { inputTokens: number; outputTokens: number } }>;
  generateWithOpenAI?: (
    prompt: string,
    opts: { systemPrompt?: string; maxTokens?: number; temperature?: number; responseFormat?: 'json' | 'text' },
  ) => Promise<{ content: string; model: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

/**
 * 用 services/llm.ts 包装出 CeoLLMAdapter
 * 优先级: Claude > Kimi > OpenAI
 *
 * 用法 (server.ts):
 *   import * as llmService from './services/llm.js';
 *   import { createServiceLLMCeoAdapter } from './modules/ceo/adapters/llm.js';
 *
 *   const ceoLlm = createServiceLLMCeoAdapter({
 *     hasAvailable: llmService.hasAvailableLLM,
 *     available: llmService.getAvailableLLMs,
 *     generateWithClaude: llmService.generateWithClaude,
 *     generateWithKimi: llmService.generateWithKimi,
 *     generateWithOpenAI: llmService.generateWithOpenAI,
 *   });
 */
export function createServiceLLMCeoAdapter(handle: ServiceLLMHandle): CeoLLMAdapter {
  return {
    isAvailable() {
      return handle.hasAvailable();
    },

    async invoke(input: CeoLLMInvokeInput): Promise<CeoLLMInvokeResult> {
      const t0 = Date.now();
      const opts = {
        systemPrompt: input.system,
        maxTokens: input.maxTokens ?? 800,
        temperature: input.temperature ?? 0.7,
        responseFormat: input.responseFormat ?? 'text',
      };

      const avail = handle.available();
      let result: { content: string; model: string; usage?: { inputTokens: number; outputTokens: number } };
      let modelUsed = '';

      if (avail.claude) {
        result = await handle.generateWithClaude(input.prompt, opts);
        modelUsed = result.model;
      } else if (avail.kimi && handle.generateWithKimi) {
        result = await handle.generateWithKimi(input.prompt, opts);
        modelUsed = result.model;
      } else if (avail.openai && handle.generateWithOpenAI) {
        result = await handle.generateWithOpenAI(input.prompt, opts);
        modelUsed = result.model;
      } else {
        throw new Error('[CeoLLM] no provider available');
      }

      const durationMs = Date.now() - t0;
      const tokensIn = result.usage?.inputTokens ?? 0;
      const tokensOut = result.usage?.outputTokens ?? 0;

      // 轻量日志：任务标签 + 模型 + token + 耗时（避免泄露 prompt 内容）
      console.log(
        `[CeoLLM] ${input.taskTag ?? '?'} · ${modelUsed} · in=${tokensIn} out=${tokensOut} ${durationMs}ms`,
      );

      return {
        text: result.content,
        tokensIn,
        tokensOut,
        durationMs,
        model: modelUsed,
      };
    },
  };
}

/** @deprecated 用 createServiceLLMCeoAdapter 代替 */
export function createClaudeCliCeoLLMAdapter(_deps: {
  runClaudeCli?: (...args: any[]) => any;
}): CeoLLMAdapter {
  return new NullCeoLLMAdapter();
}
