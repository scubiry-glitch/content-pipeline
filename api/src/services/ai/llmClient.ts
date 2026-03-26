// LLM Client - 使用 Dashboard LLM 配置
// v6.1 简化版 - 直接使用 callKimiCodingText

import { callKimiCodingText } from '../kimi-coding.js';

export interface LLMConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

// 重试配置
interface RetryConfig {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
}

export class LLMClient {
  private config: LLMConfig;
  private retryConfig: RetryConfig;

  constructor(config?: LLMConfig) {
    this.config = {
      model: config?.model || process.env.DASHBOARD_LLM_MODEL || 'k2p5',
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature ?? 0.3,
    };

    this.retryConfig = {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelay: 1000,
    };
  }

  /**
   * 发送单条请求 - 使用 Dashboard LLM
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    // 构建完整 prompt
    const fullPrompt = request.systemPrompt 
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    // 发送请求（带重试）
    const result = await this.sendWithRetry(fullPrompt, request.maxTokens);

    return {
      content: result.text,
      model: result.model,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  /**
   * 带重试的请求发送
   */
  private async sendWithRetry(
    prompt: string, 
    maxTokens?: number,
    attempt: number = 1
  ): Promise<{ text: string; model: string }> {
    try {
      const effectiveMaxTokens = maxTokens || this.config.maxTokens;
      console.log(`[LLM] Calling Dashboard LLM (attempt ${attempt}, maxTokens: ${effectiveMaxTokens})...`);
      
      const result = await callKimiCodingText(prompt, {
        model: this.config.model,
        maxTokens: effectiveMaxTokens,
        timeoutMs: 120000, // 2分钟超时
      });

      if (!result.ok) {
        throw new Error(result.error || `LLM request failed: ${result.status}`);
      }

      return {
        text: result.text,
        model: result.model,
      };
    } catch (error) {
      console.error(`[LLM] Request failed (attempt ${attempt}):`, error);

      if (attempt >= this.retryConfig.maxRetries) {
        throw error;
      }

      // 计算退避延迟
      const delay = this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
      console.log(`[LLM] Retrying in ${delay}ms...`);

      await this.sleep(delay);
      return this.sendWithRetry(prompt, maxTokens, attempt + 1);
    }
  }

  /**
   * 批量发送请求
   */
  async completeBatch(requests: LLMRequest[], concurrency: number = 2): Promise<LLMResponse[]> {
    const results: LLMResponse[] = [];

    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(req => 
          this.complete(req).catch(err => {
            console.error('[LLM] Batch request failed:', err);
            return this.createErrorResponse(err.message);
          })
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(errorMessage: string): LLMResponse {
    return {
      content: JSON.stringify({
        error: true,
        message: errorMessage,
        overall: 50,
        dimensions: {},
        aiAssessment: {
          summary: `AI 分析失败: ${errorMessage}`,
          strengths: [],
          weaknesses: ['处理过程中发生错误'],
          recommendation: 'normal',
          confidence: 0,
        },
      }),
      model: 'error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const llmClient = new LLMClient();

// 工厂函数
export function createLLMClient(config?: LLMConfig): LLMClient {
  return new LLMClient(config);
}
