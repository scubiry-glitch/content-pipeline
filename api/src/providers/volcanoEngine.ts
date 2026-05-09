// Volcano Engine (火山引擎/豆包) Provider
// API 文档: https://www.volcengine.com/docs/82379/1399202
// 支持 Responses API 格式 + Chat Completions 兼容格式

import { LLMProvider, fetchWithTimeout } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';
import { getProviderBucket } from './rateLimiter.js';

/**
 * 429-aware fetch：命中限流时按 Retry-After / 指数退避重试。
 * 共享 token-bucket（per-provider）控制 RPS 软上限；429 兜底硬上限。
 *
 * 失败模式：max 3 次后仍 429 → 抛 Error，让 _shared.ts 的 chunk-level
 * retry 走它自己的"温度+0.2 重试"路径（也会再走这里一次）。
 */
async function rateLimitedFetch(
  url: string,
  init: RequestInit,
  errorPrefix: string,
): Promise<Response> {
  const bucket = getProviderBucket('volcano-engine');
  const maxAttempts = 3;
  let lastErrText = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (bucket) await bucket.acquire();
    const resp = await fetchWithTimeout(url, init);
    if (resp.status !== 429) return resp;

    // 429：读 Retry-After header；没给就用指数退避 (10s, 30s, 60s)
    const retryAfterRaw = resp.headers.get('retry-after');
    let waitMs = 0;
    if (retryAfterRaw) {
      const sec = Number(retryAfterRaw);
      if (Number.isFinite(sec) && sec > 0) waitMs = sec * 1000;
    }
    if (!waitMs) waitMs = Math.min(60_000, 10_000 * 2 ** (attempt - 1));

    // 读 body（用于最后一次失败时给上层错误信息）
    try { lastErrText = await resp.text(); } catch { /* ignore */ }

    if (attempt >= maxAttempts) {
      throw new Error(`${errorPrefix}: 429 (after ${maxAttempts} attempts) - ${lastErrText}`);
    }
    console.warn(`[VolcanoEngine] 429 hit, backing off ${waitMs}ms before retry ${attempt + 1}/${maxAttempts}`);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
  // 不会到这；类型守护
  throw new Error(`${errorPrefix}: exhausted retries`);
}

export class VolcanoEngineProvider extends LLMProvider {
  constructor(apiKey?: string) {
    const key = apiKey || process.env.VOLCANO_API_KEY || '';
    super('volcano-engine', key, 'https://ark.cn-beijing.volces.com');
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const model = params?.model || process.env.VOLCANO_MODEL || 'deepseek-v3-2-251201';

    // 使用 Chat Completions 兼容端点（更通用）
    try {
      return await this.generateViaChatCompletions(prompt, model, params);
    } catch (error: any) {
      // 如果 Chat Completions 失败，尝试 Responses API
      console.warn(`[VolcanoEngine] Chat Completions failed, trying Responses API: ${error.message}`);
      return await this.generateViaResponsesAPI(prompt, model, params);
    }
  }

  /**
   * Chat Completions 兼容端点 (OpenAI 格式)
   */
  private async generateViaChatCompletions(
    prompt: string,
    model: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const response = await rateLimitedFetch(`${this.baseUrl}/api/v3/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: params?.systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: params?.maxTokens || 4096,
        temperature: params?.temperature ?? 0.7,
        top_p: params?.topP ?? 0.9,
        stream: false,
        ...(params?.responseFormat === 'json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
    }, 'Volcano Engine Chat API error');

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Volcano Engine Chat API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  /**
   * Responses API 端点 (火山引擎原生格式)
   * 支持 tools (如 web_search)
   */
  private async generateViaResponsesAPI(
    prompt: string,
    model: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const requestBody: any = {
      model,
      stream: false,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
    };

    // 如果有 systemPrompt，添加为 system input
    if (params?.systemPrompt) {
      requestBody.input.unshift({
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: params.systemPrompt,
          },
        ],
      });
    }

    const response = await rateLimitedFetch(`${this.baseUrl}/api/v3/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }, 'Volcano Engine Responses API error');

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Volcano Engine Responses API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();

    // Responses API 返回格式: { output: [...], usage: {...} }
    const outputText = this.extractResponseText(data);

    return {
      content: outputText,
      model: data.model || model,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }

  /**
   * 从 Responses API 输出中提取文本
   */
  private extractResponseText(data: any): string {
    if (!data.output || !Array.isArray(data.output)) {
      return '';
    }

    const textParts: string[] = [];
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === 'output_text' && typeof part.text === 'string') {
            textParts.push(part.text);
          }
        }
      }
    }
    return textParts.join('');
  }

  async embed(text: string): Promise<number[]> {
    console.warn('[VolcanoEngineProvider] Embedding not supported, returning random vector');
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }
      // 发送最小请求验证连通性 · health check 用短 timeout (10s) 避免拖死 readiness
      const response = await fetchWithTimeout(`${this.baseUrl}/api/v3/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.VOLCANO_MODEL || 'deepseek-v3-2-251201',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
          stream: false,
        }),
      }, 10_000);
      return response.ok;
    } catch {
      return false;
    }
  }

  getAvailableModels(): string[] {
    return [
      process.env.VOLCANO_MODEL || 'deepseek-v3-2-251201',
    ];
  }
}
