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
 * 是否禁用 LLM fetch 的 keep-alive 连接复用 · 治本 root cause。
 *
 * Root cause 定位：
 *   Node 22 + undici fetch 默认全局 Agent 复用 HTTP keep-alive socket。
 *   中间网络设备（FW / NAT / k8s LB / cloud egress）静默 drop 长 idle
 *   TCP 但 server 没发 RST → client socket pool 里有死连接。下次
 *   fetch 复用了死连接 → 永远等。
 *
 * 解释为什么 meeting-notes 同一 meeting 的 4 次 run hang 在不同进度
 * （people 1/4、projects 2/4 都出现过）· 同一进程能完成几次后突然
 * 某次 hang · restart 就好。
 *
 * 修复：每次 LLM fetch 加 `Connection: close` header · server 响应完
 * 主动关 socket · client pool 永远不会留死连接。
 *
 * 代价：每次 fetch 都要重建 TCP+TLS 握手（~50-150ms）· 但 LLM 调用
 * 本身几十秒到几分钟，握手开销可忽略。
 *
 * 默认 true · 可通过环境变量 LLM_FETCH_KEEPALIVE=1 关闭这个保护
 * 回到旧行为（不推荐，除非你能保证客户端到 LLM 服务的网络路径稳定）。
 */
export const LLM_FETCH_DISABLE_KEEPALIVE: boolean =
  (process.env.LLM_FETCH_KEEPALIVE ?? '0') !== '1';

/**
 * 包一层 AbortController · 加 Connection: close header · 双保险。
 *
 * 超时后 fetch 抛 AbortError，provider 层 catch 转成普通错误向上抛，
 * 让 LLMRouter 走 fallback provider。
 *
 * timeoutMs = 0 → 不限时（向后兼容）。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = LLM_FETCH_TIMEOUT_MS,
): Promise<Response> {
  // 默认强制 Connection: close 避免连接池死连接 · 用户传入的同名 header 会被保留
  const headers = new Headers(init.headers);
  if (LLM_FETCH_DISABLE_KEEPALIVE && !headers.has('connection')) {
    headers.set('Connection', 'close');
  }
  const finalInit: RequestInit = { ...init, headers };

  if (!timeoutMs) return fetch(url, finalInit);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`fetch timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...finalInit, signal: finalInit.signal ?? ctrl.signal });
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
