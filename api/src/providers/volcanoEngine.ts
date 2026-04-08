// Volcano Engine (火山引擎/豆包) Provider
// API 文档: https://www.volcengine.com/docs/82379/1399202
// 支持 Responses API 格式 + Chat Completions 兼容格式

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';

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
    const response = await fetch(`${this.baseUrl}/api/v3/chat/completions`, {
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
    });

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

    const response = await fetch(`${this.baseUrl}/api/v3/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

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
      // 发送最小请求验证连通性
      const response = await fetch(`${this.baseUrl}/api/v3/chat/completions`, {
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
      });
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
