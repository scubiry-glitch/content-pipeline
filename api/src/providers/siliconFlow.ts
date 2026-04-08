// SiliconFlow Provider - 支持 DeepSeek 等模型
// API 文档: https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';

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
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: params?.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: params?.maxTokens || 4096,
          temperature: params?.temperature ?? 0.7,
          top_p: params?.topP ?? 0.9,
          stream: false,
          ...(params?.responseFormat === 'json'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SiliconFlow API error: ${response.status} - ${errorText}`);
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
    } catch (error: any) {
      throw new Error(`SiliconFlow generation failed: ${error.message}`);
    }
  }

  async embed(text: string, model: string = 'BAAI/bge-large-zh-v1.5'): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
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
      // 使用 models 接口检查
      const response = await fetch(`${this.baseUrl}/models`, {
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
    return [
      'Pro/deepseek-ai/DeepSeek-V3.2',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-14B-Instruct',
      'Qwen/Qwen2.5-7B-Instruct',
      'BAAI/bge-large-zh-v1.5',  // embedding model
    ];
  }
}
