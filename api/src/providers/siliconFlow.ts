// SiliconFlow Provider - 支持 DeepSeek 等模型
// API 文档: https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions

import { Agent } from 'undici';
import { LLMProvider, fetchWithTimeout } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';
import { getProviderBucket } from './rateLimiter.js';

// 流式 SSE 双阶段超时：
//   1) 首字节窗口（first-byte）：从 fetch 发出 → 收到第一个 SSE chunk。
//      reasoning 模型 + 长 prompt 在 prefill 阶段不会发任何字节，可达数分钟。
//      通过 LLM_FIRST_BYTE_TIMEOUT_MS 覆盖（默认 600s = 10min）。
//   2) 静默窗口（idle）：上一个 chunk → 下一个 chunk。
//      正常生成时 chunk 间隔 < 1s；连续 60s 没动静基本可以判死。
//      通过 LLM_FETCH_TIMEOUT_MS 覆盖（默认 60s）。保留旧变量名以兼容历史 .env。
//
// 历史问题：原来两窗口共用 LLM_FETCH_TIMEOUT_MS=300s —— 首字节给得不够松（reasoning
// 长 prompt 仍可能超），idle 给得不够紧（断流后还要干等 5min）。现在分开。
const FIRST_BYTE_TIMEOUT_MS = parseInt(process.env.LLM_FIRST_BYTE_TIMEOUT_MS ?? '', 10) || 600_000;
const STREAM_IDLE_TIMEOUT_MS = parseInt(process.env.LLM_FETCH_TIMEOUT_MS ?? '', 10) || 60_000;

// Node 18+ 的 global fetch 用 undici 实现，它有自己的 headersTimeout / bodyTimeout（默认都 300s），
// 比我们 AbortController 的 600s 触发还快，长 prompt prefill 时会先抛 'fetch failed'。
// 给两者都加 30s buffer，确保 AbortController 永远先触发（更准确的报错信息）。
const FETCH_AGENT = new Agent({
  headersTimeout: FIRST_BYTE_TIMEOUT_MS + 30_000,
  bodyTimeout: FIRST_BYTE_TIMEOUT_MS + 30_000,
  // keepalive 连接复用：对密集 axes 调用有意义；流式单次调用无害
  keepAliveTimeout: 30_000,
});

/**
 * 用流式 SSE 读取 SiliconFlow chat/completions，并将全部 content delta 拼成字符串返回。
 * 双阶段超时：首字节窗口 → 收到首 chunk 后切到 idle 窗口。
 */
async function generateViaStream(
  baseUrl: string,
  apiKey: string,
  body: Record<string, any>,
  onProgress?: (tokensSoFar: number, snippet: string, cumulative?: string) => void,
): Promise<{ content: string; model: string; promptTokens: number; completionTokens: number }> {
  // 全局 token-bucket 控速；config/run-routing.json providers.siliconflow.rps 配置
  const bucket = getProviderBucket('siliconflow');
  if (bucket) await bucket.acquire();

  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const armTimeout = (ms: number, reason: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(new Error(reason)), ms);
  };

  // 首字节窗口；收到第一个 chunk 时（line 73 附近）切到更紧的 idle 窗口
  armTimeout(FIRST_BYTE_TIMEOUT_MS, `SiliconFlow first-byte timeout after ${FIRST_BYTE_TIMEOUT_MS}ms (prefill stuck or model queueing)`);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
        'Connection': 'close',
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: ctrl.signal,
      // dispatcher 是 Node global fetch (undici 实现) 私有字段，TS 标准类型未声明但运行期支持
      ...({ dispatcher: FETCH_AGENT } as Record<string, unknown>),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`SiliconFlow API error: ${response.status} - ${text.slice(0, 500)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let content = '';
    let modelName = body.model as string;
    let promptTokens = 0;
    let completionTokens = 0;
    let tokensSoFar = 0;
    let lastProgressAt = 0;
    const PROGRESS_INTERVAL = 200; // 每 200 token 触发一次回调

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // 收到 chunk：从 first-byte 窗口切到更紧的 idle 窗口；
      // 之后每个 chunk 都 re-arm，正常生成期不会触发（idempotent，无需 firstByteSeen 标志）
      armTimeout(STREAM_IDLE_TIMEOUT_MS, `SiliconFlow stream idle timeout after ${STREAM_IDLE_TIMEOUT_MS}ms (model stalled mid-stream)`);

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const json = JSON.parse(payload);
          if (json.model) modelName = json.model;
          // 末尾 chunk 带 usage
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens ?? promptTokens;
            completionTokens = json.usage.completion_tokens ?? completionTokens;
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            // 用字符数粗估 token（中文约 1.5 char/token，英文约 4 char/token；取均值 2）
            tokensSoFar = Math.round(content.length / 2);
            if (onProgress && tokensSoFar - lastProgressAt >= PROGRESS_INTERVAL) {
              lastProgressAt = tokensSoFar;
              const snippet = content.slice(-150);
              // 第三个参数 cumulative：完整累计 content。
              // 让 oneshot 等调用方做"实时落库"时不必再自己累加 snippet。
              onProgress(tokensSoFar, snippet, content);
            }
          }
        } catch { /* 跳过格式异常的 chunk */ }
      }
    }

    return { content, model: modelName, promptTokens, completionTokens };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class SiliconFlowProvider extends LLMProvider {
  constructor(apiKey?: string) {
    const key = apiKey || process.env.SILICONFLOW_API_KEY || '';
    super('siliconflow', key, 'https://api.siliconflow.cn/v1');
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const model = params?.model || 'Pro/deepseek-ai/DeepSeek-V3.2';

    try {
      const body: Record<string, any> = {
        model,
        messages: [
          { role: 'system', content: params?.systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: params?.maxTokens || 4096,
        temperature: params?.temperature ?? 0.7,
        top_p: params?.topP ?? 0.9,
        ...(params?.responseFormat === 'json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      };

      const { content, model: returnedModel, promptTokens, completionTokens } =
        await generateViaStream(this.baseUrl!, this.apiKey, body, params?.onProgress);

      return {
        content,
        model: returnedModel,
        usage: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
        },
      };
    } catch (error: any) {
      throw new Error(`SiliconFlow generation failed: ${error.message}`);
    }
  }

  async embed(text: string, model: string = 'BAAI/bge-large-zh-v1.5'): Promise<number[]> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: text,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        throw new Error(`SiliconFlow embedding error: ${response.status}`);
      }

      const data: any = await response.json();
      return data.data?.[0]?.embedding || [];
    } catch (error: any) {
      throw new Error(`SiliconFlow embedding failed: ${error.message}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }, 10_000);
      return response.ok;
    } catch {
      return false;
    }
  }

  getAvailableModels(): string[] {
    return [
      'Pro/deepseek-ai/DeepSeek-V3.2',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-14B-Instruct',
      'Qwen/Qwen2.5-7B-Instruct',
      'BAAI/bge-large-zh-v1.5',
    ];
  }
}
