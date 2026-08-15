// Claude Provider实现（官方 api.anthropic.com + 兼容 ANTHROPIC_BASE_URL 的企业网关）

import { LLMProvider, fetchWithTimeout } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';
import type { StreamChunk } from '../services/llm.js';

/** 网关/官方默认模型：优先 ANTHROPIC_MODEL（如 claude-opus-4.7），否则旧默认 */
function defaultClaudeModel(explicit?: string): string {
  return explicit || process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-sonnet-20240229';
}

const DEFAULT_ANTHROPIC_ORIGIN = 'https://api.anthropic.com';

function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, '');
}

export class ClaudeProvider extends LLMProvider {
  private modelCosts: Record<string, number> = {
    'claude-3-opus-20240229': 0.015,
    'claude-3-sonnet-20240229': 0.003,
    'claude-3-haiku-20240307': 0.00025,
  };

  constructor(apiKey: string, explicitBaseUrl?: string) {
    const base =
      (explicitBaseUrl?.trim() ||
        process.env.ANTHROPIC_BASE_URL?.trim() ||
        DEFAULT_ANTHROPIC_ORIGIN);
    super('claude', apiKey, normalizeOrigin(base));
  }

  /** 企业网关常要求 Authorization: Bearer；官方 Anthropic 使用 x-api-key */
  private buildMessageHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
    if (authToken) {
      h.Authorization = `Bearer ${authToken}`;
      return h;
    }
    if (this.baseUrl && this.baseUrl !== DEFAULT_ANTHROPIC_ORIGIN) {
      h.Authorization = `Bearer ${this.apiKey}`;
      return h;
    }
    h['x-api-key'] = this.apiKey;
    return h;
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const model = defaultClaudeModel(params?.model);

    const systemText = params?.systemPrompt?.trim();
    const userText = prompt?.trim();
    const body: Record<string, unknown> = {
      model,
      max_tokens: params?.maxTokens || 4000,
      temperature: params?.temperature ?? 0.7,
      top_p: params?.topP ?? 1,
      messages: [
        {
          role: 'user',
          content:
            userText ||
            (systemText
              ? 'Follow the system instructions and produce the required output exactly as specified.'
              : ''),
        },
      ],
    };
    if (systemText) body.system = systemText;

    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.buildMessageHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Claude API error: ${response.status} ${errText.slice(0, 500)}`);
      }

      const data: any = await response.json();

      return {
        content: data.content?.[0]?.text || '',
        model,
        usage: {
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
        },
      };
    } catch (error) {
      throw new Error(`Claude generation failed: ${error}`);
    }
  }

  /**
   * 流式生成（Anthropic Messages SSE）。复用 buildMessageHeaders（Bearer/x-api-key）
   * 与 baseUrl（兼容 ANTHROPIC_BASE_URL 企业网关）。产出与 streamOpenAICompatible
   * 一致的 StreamChunk：text_delta→content，thinking_delta→reasoning。
   * 供「追问专家」/chat/stream 走网关，绕开火山 R1 EndpointRPMExceeded 429。
   */
  async *streamGenerate(
    prompt: string,
    params?: GenerationParams
  ): AsyncGenerator<StreamChunk> {
    const model = defaultClaudeModel(params?.model);
    const systemText = params?.systemPrompt?.trim();
    const userText = prompt?.trim();
    const body: Record<string, unknown> = {
      model,
      max_tokens: params?.maxTokens || 4000,
      temperature: params?.temperature ?? 0.7,
      messages: [
        {
          role: 'user',
          content:
            userText ||
            (systemText
              ? 'Follow the system instructions and produce the required output exactly as specified.'
              : ''),
        },
      ],
      stream: true,
    };
    if (systemText) body.system = systemText;

    // timeoutMs=0：流式响应可能很长，不能用整体超时把流掐断
    const res = await fetchWithTimeout(
      `${this.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: { ...this.buildMessageHeaders(), Accept: 'text/event-stream' },
        body: JSON.stringify(body),
      },
      0,
    );
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Claude stream error: ${res.status} ${errText.slice(0, 500)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let modelSeen = model;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let json: any;
          try { json = JSON.parse(data); } catch { continue; }
          switch (json.type) {
            case 'message_start':
              modelSeen = json.message?.model || modelSeen;
              break;
            case 'content_block_delta': {
              const d = json.delta || {};
              if (d.type === 'text_delta' && d.text) {
                yield { type: 'content', delta: String(d.text) };
              } else if (d.type === 'thinking_delta' && d.thinking) {
                yield { type: 'reasoning', delta: String(d.thinking) };
              }
              break;
            }
            case 'error':
              throw new Error(
                `Claude stream event error: ${JSON.stringify(json.error || json).slice(0, 500)}`,
              );
            case 'message_stop':
              yield { type: 'done', model: modelSeen };
              return;
            default:
              break;
          }
        }
      }
      yield { type: 'done', model: modelSeen };
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
    }
  }

  async embed(text: string): Promise<number[]> {
    throw new Error('Claude does not support embeddings');
  }

  async checkHealth(): Promise<boolean> {
    const headersBase = this.buildMessageHeaders();
    try {
      const list = await fetchWithTimeout(`${this.baseUrl}/v1/models`, {
        headers: {
          ...headersBase,
          'Content-Type': 'application/json',
        },
      });
      if (list.ok) return true;
    } catch {
      /* 网关可能未实现 GET /v1/models */
    }
    try {
      const ping = await fetchWithTimeout(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.buildMessageHeaders(),
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      return ping.ok;
    } catch {
      return false;
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(this.modelCosts);
  }
}
