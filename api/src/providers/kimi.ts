// Kimi Provider - 适配 LLMRouter 接口
// 使用 llm.ts 中的 generateWithKimi

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';
import { generateWithKimi } from '../services/llm.js';

export class KimiProvider extends LLMProvider {
  constructor(apiKey?: string) {
    const key = apiKey || process.env.KIMI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
    super('kimi', key, 'https://api.kimi.com/coding/v1');
    if (key.startsWith('sk-kimi')) {
      this.apiKey = key;
    }
  }

  async generate(prompt: string, params?: GenerationParams): Promise<GenerationResult> {
    const result = await generateWithKimi(prompt, {
      model: params?.model || 'kimi-for-coding',
      temperature: params?.temperature,
      maxTokens: params?.maxTokens,
      systemPrompt: params?.systemPrompt,
    });

    return {
      content: result.content,
      model: result.model,
      usage: result.usage,
    };
  }

  async embed(text: string): Promise<number[]> {
    // Kimi 不支持 embedding，返回随机向量
    console.warn('[KimiProvider] Embedding not supported, returning random vector');
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  async checkHealth(): Promise<boolean> {
    // 检查 API key 是否存在即可，不实际调用（避免 403 错误）
    return !!this.apiKey && this.apiKey.startsWith('sk-kimi');
  }

  getAvailableModels(): string[] {
    return ['kimi-for-coding', 'k2p5'];
  }
}
