// Kimi Provider - 适配 LLMRouter 接口
// 使用 llm.ts 中的 generateWithKimi

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../../shared/src/types';
import { generateWithKimi } from '../services/llm.js';

export class KimiProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.KIMI_API_KEY || '';
  }

  getName(): string {
    return 'kimi';
  }

  async generate(prompt: string, params?: GenerationParams): Promise<GenerationResult> {
    try {
      const result = await generateWithKimi(prompt, {
        model: params?.model || 'k2p5',
        temperature: params?.temperature,
        maxTokens: params?.maxTokens,
        systemPrompt: params?.systemPrompt,
      });

      return {
        content: result.content,
        model: result.model,
        usage: result.usage,
      };
    } catch (error) {
      console.error('[KimiProvider] Generation failed:', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    // Kimi 不支持 embedding，返回随机向量
    console.warn('[KimiProvider] Embedding not supported, returning random vector');
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  getAvailableModels(): string[] {
    return ['k2p5', 'k1.6'];
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.apiKey) return false;
      await generateWithKimi('Hi', { maxTokens: 10 });
      return true;
    } catch {
      return false;
    }
  }
}
