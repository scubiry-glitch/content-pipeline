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

// ─────────────────────────────────────────────────────────────
// claude CLI 直接 spawn 适配器
//
// 用 `claude -p --output-format json` 跑一次性 prompt，从 outer JSON 拿 result。
// 适合脚本场景（如 ceo:generate-real）—— 复用本地已登录的 claude CLI 而非另配
// ANTHROPIC_API_KEY / KIMI_API_KEY，且不会启动持久 session（每次 -p 独立）。
// ─────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';

interface ClaudeCliOptions {
  /** claude 可执行路径，默认 'claude' */
  binPath?: string;
  /** --model 参数，默认 undefined（用 claude 默认模型） */
  model?: string;
  /** 单次 spawn 超时毫秒，默认 300_000 (5 分钟)
   *  实测 4 scope × 10 并发时，rebuttal/spark/decisions-capture 这种 ≥2000 token
   *  的输出在 claude-cli 队列拥塞下偶尔超过 3 分钟。给到 5 分钟基本足够。 */
  timeoutMs?: number;
}

interface ClaudeCliOuterJson {
  result?: string;
  session_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  is_error?: boolean;
  num_turns?: number;
}

export function createClaudeCliCeoLLMAdapterV2(opts: ClaudeCliOptions = {}): CeoLLMAdapter {
  const binPath = opts.binPath ?? 'claude';
  const model = opts.model ?? '';
  const timeoutMs = opts.timeoutMs ?? 300_000;

  return {
    isAvailable() {
      return true;
    },
    async invoke(input: CeoLLMInvokeInput): Promise<CeoLLMInvokeResult> {
      const t0 = Date.now();
      const promptText = (input.system ? `${input.system}\n\n---\n\n` : '') + input.prompt;
      const args = ['-p', '--output-format', 'json', '--max-turns', '1'];
      if (model) args.push('--model', model);

      const proc = spawn(binPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, timeoutMs);

      proc.stdin.write(promptText);
      proc.stdin.end();

      const exitCode: number = await new Promise((resolve) => {
        proc.on('close', (code) => resolve(code ?? -1));
      });
      clearTimeout(killTimer);

      if (exitCode !== 0) {
        throw new Error(`[claude-cli] exit=${exitCode}; stderr=${stderr.slice(0, 500)}`);
      }

      let outer: ClaudeCliOuterJson;
      try {
        outer = JSON.parse(stdout) as ClaudeCliOuterJson;
      } catch (e) {
        throw new Error(`[claude-cli] outer JSON parse failed: ${(e as Error).message}; stdout head=${stdout.slice(0, 200)}`);
      }
      if (outer.is_error) {
        throw new Error(`[claude-cli] is_error=true; result=${(outer.result ?? '').slice(0, 300)}`);
      }
      const text = String(outer.result ?? '');
      const tokensIn = outer.usage?.input_tokens ?? 0;
      const tokensOut = outer.usage?.output_tokens ?? 0;
      return {
        text,
        tokensIn,
        tokensOut,
        durationMs: Date.now() - t0,
        model: 'claude-cli',
      };
    },
  };
}
