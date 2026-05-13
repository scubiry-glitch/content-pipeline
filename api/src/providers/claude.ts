// Claude Provider实现（官方 api.anthropic.com + 兼容 ANTHROPIC_BASE_URL 的企业网关）

import { LLMProvider, fetchWithTimeout } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';

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
    const model = params?.model || 'claude-3-sonnet-20240229';

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
