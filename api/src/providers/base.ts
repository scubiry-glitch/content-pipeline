// LLM提供商抽象基类

import { GenerationParams, GenerationResult } from '../types/index.js';

/**
 * 默认 fetch 超时（毫秒）· Node 原生 fetch 无 timeout，大型 LLM 请求会
 * 在 socket 上无限等。生产事故里 meeting-notes 一条 axis run 在 Volcano
 * 的 chat/completions 卡了 10+ 分钟无任何反应，就是这个原因。
 *
 * 默认 120s（覆盖 99% 的 LLM 慢响应）· 可通过环境变量 LLM_FETCH_TIMEOUT_MS
 * 覆盖（设 0 表示不限时，回到旧行为）。
 */
export const LLM_FETCH_TIMEOUT_MS: number = (() => {
  const v = parseInt(process.env.LLM_FETCH_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(v) && v >= 0) return v;
  return 120_000;
})();

/**
 * 包一层 AbortController · 超时后 fetch 会抛 AbortError，
 * provider 层 catch 转成普通错误向上抛，让上游 LLMRouter 走 fallback。
 *
 * timeoutMs = 0 → 不限时（向后兼容）。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = LLM_FETCH_TIMEOUT_MS,
): Promise<Response> {
  if (!timeoutMs) return fetch(url, init);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`fetch timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export abstract class LLMProvider {
  protected name: string;
  protected apiKey: string;
  protected baseUrl?: string;

  constructor(name: string, apiKey: string, baseUrl?: string) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  abstract generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult>;

  abstract embed(text: string): Promise<number[]>;

  abstract checkHealth(): Promise<boolean>;

  abstract getAvailableModels(): string[];

  getName(): string {
    return this.name;
  }

  protected calculateCost(inputTokens: number, outputTokens: number, costPer1k: number): number {
    return ((inputTokens + outputTokens) / 1000) * costPer1k;
  }
}
