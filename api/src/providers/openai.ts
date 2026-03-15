// OpenAI Provider实现

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../../shared/src/types';

export class OpenAIProvider extends LLMProvider {
  private modelCosts: Record<string, { input: number; output: number }> = {
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'text-embedding-3-large': { input: 0.00013, output: 0 },
    'text-embedding-3-small': { input: 0.00002, output: 0 },
  };

  constructor(apiKey: string) {
    super('openai', apiKey, 'https://api.openai.com');
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const model = params?.model || 'gpt-4-turbo';
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: params?.maxTokens || 4000,
          temperature: params?.temperature ?? 0.7,
          top_p: params?.topP ?? 1,
          frequency_penalty: params?.frequencyPenalty ?? 0,
          presence_penalty: params?.presencePenalty ?? 0,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      const costs = this.modelCosts[model] || { input: 0.01, output: 0.03 };
      const cost = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;

      return {
        content: data.choices[0]?.message?.content || '',
        inputTokens,
        outputTokens,
        model,
        provider: this.name,
        latency,
        cost,
      };
    } catch (error) {
      throw new Error(`OpenAI generation failed: ${error}`);
    }
  }

  async embed(text: string, model: string = 'text-embedding-3-small'): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI embedding error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0]?.embedding || [];
    } catch (error) {
      throw new Error(`OpenAI embedding failed: ${error}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(this.modelCosts).filter(m => !m.includes('embedding'));
  }

  getEmbeddingModels(): string[] {
    return Object.keys(this.modelCosts).filter(m => m.includes('embedding'));
  }
}
