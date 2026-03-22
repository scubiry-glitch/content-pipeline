// Dashboard LLM Provider - 使用 Dashboard LLM SDK
// 用于接入 Dashboard 提供的 LLM API

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';
import { createDashboardLlmSdk, DashboardLlmSdk } from '../libs/dashboard-llm-sdk/src/index.js';

export class DashboardLlmProvider extends LLMProvider {
  private sdk: DashboardLlmSdk;

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || process.env.LLM_API_TOKEN || '';
    const url = baseUrl || process.env.LLM_API_BASE_URL || 'http://127.0.0.1:3004';
    super('dashboard-llm', key, url);
    
    this.sdk = createDashboardLlmSdk({
      baseUrl: url,
      token: key,
      defaultModel: process.env.DASHBOARD_LLM_MODEL || 'k2p5',
    });
  }

  async generate(prompt: string, params?: GenerationParams): Promise<GenerationResult> {
    const result = await this.sdk.chat({
      prompt,
      model: params?.model,
      maxTokens: params?.maxTokens,
    });

    return {
      content: result.reply,
      model: result.model,
      usage: undefined, // Dashboard API 不返回 usage 信息
    };
  }

  async embed(text: string): Promise<number[]> {
    // Dashboard LLM 不支持 embedding，返回随机向量
    console.warn('[DashboardLlmProvider] Embedding not supported, returning random vector');
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  async checkHealth(): Promise<boolean> {
    try {
      // 检查 token 是否存在
      if (!this.apiKey) {
        return false;
      }
      // 尝试调用 listProviders 来验证连接
      await this.sdk.listProviders();
      return true;
    } catch (error) {
      console.error('[DashboardLlmProvider] Health check failed:', error);
      return false;
    }
  }

  getAvailableModels(): string[] {
    return ['k2p5', 'kimi-for-coding'];
  }

  // 获取 SDK 实例，用于直接调用高级功能
  getSdk(): DashboardLlmSdk {
    return this.sdk;
  }
}
