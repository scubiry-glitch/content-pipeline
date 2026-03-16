// Claude Provider实现

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';

export class ClaudeProvider extends LLMProvider {
  private modelCosts: Record<string, number> = {
    'claude-3-opus-20240229': 0.015,
    'claude-3-sonnet-20240229': 0.003,
    'claude-3-haiku-20240307': 0.00025,
  };

  constructor(apiKey: string) {
    super('claude', apiKey, 'https://api.anthropic.com');
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const model = params?.model || 'claude-3-sonnet-20240229';
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: params?.maxTokens || 4000,
          temperature: params?.temperature ?? 0.7,
          top_p: params?.topP ?? 1,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
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
    // Claude doesn't have embedding API, fallback to OpenAI
    throw new Error('Claude does not support embeddings');
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(this.modelCosts);
  }
}
