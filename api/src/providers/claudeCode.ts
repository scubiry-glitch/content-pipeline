// Claude Code Provider - 使用Claude Code配置的模型
// 在Claude Code环境中运行时，直接使用其配置的模型能力

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';

/**
 * 检测是否在Claude Code环境中运行
 */
export function isClaudeCodeEnvironment(): boolean {
  return !!(
    process.env.CLAUDE_CODE_ENV ||
    process.env.ANTHROPIC_MODEL ||
    (process.argv.some(arg => arg.includes('claude')) &&
     process.env.ANTHROPIC_API_KEY === undefined)
  );
}

/**
 * 获取Claude Code配置的模型
 */
export function getClaudeCodeModel(): string {
  // 从环境变量读取Claude Code使用的模型
  return process.env.ANTHROPIC_MODEL ||
         process.env.CLAUDE_MODEL ||
         'claude-sonnet-4-5-20250929'; // 默认模型
}

/**
 * 获取模型成本 (根据Claude Code实际使用的模型)
 */
function getModelCost(model: string): number {
  const costs: Record<string, number> = {
    'claude-opus-4-6-20251001': 0.015,
    'claude-opus-4': 0.015,
    'claude-sonnet-4-5-20250929': 0.003,
    'claude-sonnet-4': 0.003,
    'claude-haiku-4-5-20251001': 0.00025,
    'claude-haiku-4': 0.00025,
    // 兼容旧版模型名称
    'claude-3-opus-20240229': 0.015,
    'claude-3-sonnet-20240229': 0.003,
    'claude-3-haiku-20240307': 0.00025,
  };

  // 尝试精确匹配
  if (costs[model]) return costs[model];

  // 尝试部分匹配
  if (model.includes('opus')) return 0.015;
  if (model.includes('haiku')) return 0.00025;

  return 0.003; // 默认Sonnet价格
}

/**
 * 使用子进程调用Claude CLI (如果可用)
 * 或者模拟API调用行为
 */
export class ClaudeCodeProvider extends LLMProvider {
  private configuredModel: string;
  private useLocalAPI: boolean;

  constructor() {
    super('claude-code', 'env-based', undefined);
    this.configuredModel = getClaudeCodeModel();
    this.useLocalAPI = !!process.env.CLAUDE_CODE_API_URL;
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const model = params?.model || this.configuredModel;
    const startTime = Date.now();

    try {
      // 方案1: 如果配置了本地API代理
      if (this.useLocalAPI && this.baseUrl) {
        return await this.callLocalAPI(prompt, model, params);
      }

      // 方案2: 检测是否有可用的系统级Claude访问
      if (process.env.CLAUDE_CODE_BYPASS) {
        return await this.callClaudeCodeCLI(prompt, model, params);
      }

      // 方案3: 提示用户当前环境无法直接调用
      // 返回一个模拟结果，实际应该通过Claude Code的父进程通信
      throw new Error(
        'Claude Code环境检测成功，但需要通过父进程通信机制调用。\n' +
        '请在Claude Code中运行此应用，或使用标准API Key模式。\n' +
        `检测到的模型: ${this.configuredModel}`
      );

    } catch (error) {
      throw new Error(`Claude Code generation failed: ${error}`);
    }
  }

  private async callLocalAPI(
    prompt: string,
    model: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: params?.maxTokens || 4000,
        temperature: params?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: any = await response.json();

    return {
      content: data.content?.[0]?.text || '',
      model,
      usage: {
        inputTokens: data.usage?.input_tokens || this.estimateTokens(prompt),
        outputTokens: data.usage?.output_tokens || this.estimateTokens(data.content?.[0]?.text || ''),
      },
    };
  }

  private async callClaudeCodeCLI(
    prompt: string,
    model: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    // 这里可以实现通过子进程调用claude CLI的逻辑
    // 由于Claude Code环境特殊性，这里提供一个占位实现

    const startTime = Date.now();

    // 模拟一个响应，实际实现需要与子进程通信
    const mockResponse = {
      content: `[Claude Code模式] 使用模型: ${model}\n\n` +
               `提示内容摘要: ${prompt.substring(0, 100)}...\n\n` +
               `注意: 当前运行在Claude Code环境中，但未建立通信通道。\n` +
               `请使用以下方式之一:\n` +
               `1. 配置 ANTHROPIC_API_KEY 使用标准API模式\n` +
               `2. 在Claude Code中使用 MCP 或工具调用机制`,
      usage: { input_tokens: this.estimateTokens(prompt), output_tokens: 100 },
    };

    return {
      content: mockResponse.content,
      model,
      usage: {
        inputTokens: mockResponse.usage.input_tokens,
        outputTokens: mockResponse.usage.output_tokens,
      },
    };
  }

  async embed(text: string): Promise<number[]> {
    // Claude Code环境不支持embedding，需要fallback到OpenAI
    throw new Error('Claude Code provider does not support embeddings. Please use OpenAI provider for embeddings.');
  }

  async checkHealth(): Promise<boolean> {
    return isClaudeCodeEnvironment();
  }

  getAvailableModels(): string[] {
    return [this.configuredModel];
  }

  getConfiguredModel(): string {
    return this.configuredModel;
  }

  private estimateTokens(text: string): number {
    // 粗略估算: 英文约4字符/token，中文约1.5字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}

/**
 * 创建适合当前环境的Provider
 */
export function createClaudeProvider(apiKey?: string): LLMProvider {
  // 优先使用显式API Key
  if (apiKey) {
    const { ClaudeProvider } = require('./claude');
    return new ClaudeProvider(apiKey);
  }

  // 检测Claude Code环境
  if (isClaudeCodeEnvironment()) {
    console.log('[LLM] 检测到Claude Code环境，使用配置的模型:', getClaudeCodeModel());
    return new ClaudeCodeProvider();
  }

  // 检查环境变量中的API Key
  if (process.env.ANTHROPIC_API_KEY) {
    const { ClaudeProvider } = require('./claude');
    return new ClaudeProvider(process.env.ANTHROPIC_API_KEY);
  }

  // 默认返回ClaudeCodeProvider，让运行时检测
  console.warn('[LLM] 未找到API Key，尝试使用Claude Code环境');
  return new ClaudeCodeProvider();
}
