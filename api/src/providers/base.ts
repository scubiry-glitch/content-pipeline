// LLM提供商抽象基类

import { GenerationParams, GenerationResult } from '../types/index.js';

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
