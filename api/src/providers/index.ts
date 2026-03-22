// LLM Provider exports and Router

import { LLMProvider } from './base';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { ClaudeCodeProvider, isClaudeCodeEnvironment, getClaudeCodeModel, createClaudeProvider } from './claudeCode';
import { KimiProvider } from './kimi';
import { DashboardLlmProvider } from './dashboardLlm';
import { GenerationParams, GenerationResult } from '../types/index.js';

export { LLMProvider, ClaudeProvider, OpenAIProvider, ClaudeCodeProvider, KimiProvider, DashboardLlmProvider };
export { isClaudeCodeEnvironment, getClaudeCodeModel, createClaudeProvider };

// Mock provider for demo/testing
export { MockProvider } from './mock';

// Task type to optimal model mapping
interface ModelRoutingRule {
  taskType: string;
  priority: 'quality' | 'speed' | 'cost';
  preferredProvider: string;
  fallbackProvider?: string;
}

export class LLMRouter {
  private providers: Map<string, LLMProvider> = new Map();
  private routingRules: ModelRoutingRule[] = [
    // Deep reasoning tasks - prefer Dashboard LLM, fallback to Kimi/Claude
    { taskType: 'planning', priority: 'quality', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
    { taskType: 'analysis', priority: 'quality', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
    { taskType: 'blue_team_review', priority: 'quality', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
    // Writing tasks
    { taskType: 'writing', priority: 'quality', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
    { taskType: 'summarization', priority: 'speed', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
    // Fast tasks
    { taskType: 'tagging', priority: 'speed', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
    { taskType: 'embedding', priority: 'cost', preferredProvider: 'openai' },
    { taskType: 'health_check', priority: 'speed', preferredProvider: 'dashboard-llm', fallbackProvider: 'kimi' },
  ];

  // Model configs for different priorities
  private modelConfigs: Record<string, Record<string, string>> = {
    'dashboard-llm': {
      quality: 'k2p5',
      speed: 'k2p5',
      cost: 'k2p5',
    },
    kimi: {
      quality: 'kimi-for-coding',
      speed: 'kimi-for-coding',
      cost: 'kimi-for-coding',
    },
    claude: {
      quality: 'claude-3-opus-20240229',
      speed: 'claude-3-sonnet-20240229',
      cost: 'claude-3-haiku-20240307',
    },
    'claude-code': {
      quality: getClaudeCodeModel(),
      speed: getClaudeCodeModel(),
      cost: getClaudeCodeModel(),
    },
    openai: {
      quality: 'gpt-4-turbo',
      speed: 'gpt-3.5-turbo',
      cost: 'gpt-3.5-turbo',
    },
  };

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  async generate(
    prompt: string,
    taskType: string = 'default',
    customParams?: GenerationParams
  ): Promise<GenerationResult> {
    const rule = this.routingRules.find(r => r.taskType === taskType) || {
      taskType: 'default',
      priority: 'quality',
      preferredProvider: 'claude',
      fallbackProvider: 'openai',
    };

    // Try preferred provider first
    let provider = this.providers.get(rule.preferredProvider);
    let model: string | undefined = this.modelConfigs[rule.preferredProvider as keyof typeof this.modelConfigs]?.[rule.priority];

    // If preferred not available, try fallback
    if (!provider && rule.fallbackProvider) {
      provider = this.providers.get(rule.fallbackProvider);
      model = this.modelConfigs[rule.fallbackProvider as keyof typeof this.modelConfigs]?.[rule.priority];
    }

    if (!provider) {
      // Use any available provider as last resort
      const available = Array.from(this.providers.values())[0];
      if (!available) {
        throw new Error('No LLM provider available');
      }
      provider = available;
      model = undefined;
    }

    const params: GenerationParams = {
      ...customParams,
      model: customParams?.model || model,
    };

    return provider.generate(prompt, params);
  }

  async embed(text: string, providerName: string = 'openai'): Promise<number[]> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found for embedding`);
    }
    return provider.embed(text);
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [name, provider] of this.providers) {
      results[name] = await provider.checkHealth();
    }
    return results;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }
}

// Singleton instance
let routerInstance: LLMRouter | null = null;

export function getLLMRouter(): LLMRouter {
  if (!routerInstance) {
    routerInstance = new LLMRouter();
  }
  return routerInstance;
}

export interface LLMRouterConfig {
  claudeApiKey?: string;
  openaiApiKey?: string;
  kimiApiKey?: string;
  dashboardLlmToken?: string; // Dashboard LLM API Token
  dashboardLlmBaseUrl?: string; // Dashboard LLM API Base URL
  useClaudeCode?: boolean; // 强制使用Claude Code环境
  embeddingProvider?: 'openai' | 'claude';
}

export function initLLMRouter(config?: LLMRouterConfig): LLMRouter {
  const router = new LLMRouter();
  const cfg = config || {};

  // 0. 优先检查 Dashboard LLM (如果配置了 LLM_API_TOKEN)
  if (cfg.dashboardLlmToken || process.env.LLM_API_TOKEN) {
    console.log('[LLM Router] 注册 Dashboard LLM Provider');
    router.registerProvider(new DashboardLlmProvider(cfg.dashboardLlmToken, cfg.dashboardLlmBaseUrl));
  }
  // 1. 检查Kimi (如果配置了且 Dashboard LLM 未配置)
  else if (cfg.kimiApiKey || process.env.KIMI_API_KEY) {
    console.log('[LLM Router] 注册Kimi Provider');
    router.registerProvider(new KimiProvider(cfg.kimiApiKey));
  }

  // 2. 检查是否强制使用Claude Code
  if (cfg.useClaudeCode || (!cfg.claudeApiKey && isClaudeCodeEnvironment())) {
    console.log('[LLM Router] 使用Claude Code环境提供的模型');
    router.registerProvider(new ClaudeCodeProvider());
  }
  // 2. 使用显式API Key
  else if (cfg.claudeApiKey) {
    // 检查是否是Kimi的key (以 sk-kimi 开头)
    if (cfg.claudeApiKey.startsWith('sk-kimi')) {
      console.log('[LLM Router] 检测到Kimi API Key，注册Kimi Provider');
      router.registerProvider(new KimiProvider(cfg.claudeApiKey));
    } else {
      router.registerProvider(new ClaudeProvider(cfg.claudeApiKey));
    }
  }
  // 3. 使用环境变量API Key
  else if (process.env.ANTHROPIC_API_KEY) {
    // 检查是否是Kimi的key (以 sk-kimi 开头)
    if (process.env.ANTHROPIC_API_KEY.startsWith('sk-kimi')) {
      console.log('[LLM Router] 检测到Kimi API Key，注册Kimi Provider');
      router.registerProvider(new KimiProvider(process.env.ANTHROPIC_API_KEY));
    } else {
      router.registerProvider(new ClaudeProvider(process.env.ANTHROPIC_API_KEY));
    }
  }

  // 注册OpenAI Provider (用于Embedding等)
  if (cfg.openaiApiKey) {
    router.registerProvider(new OpenAIProvider(cfg.openaiApiKey));
  } else if (process.env.OPENAI_API_KEY) {
    router.registerProvider(new OpenAIProvider(process.env.OPENAI_API_KEY));
  }

  // 确保至少有一个Provider
  if (router.getAvailableProviders().length === 0) {
    throw new Error(
      '未配置任何LLM Provider。请设置以下环境变量之一:\n' +
      '  - LLM_API_TOKEN (Dashboard LLM, 推荐)\n' +
      '  - KIMI_API_KEY (Kimi)\n' +
      '  - ANTHROPIC_API_KEY (Claude)\n' +
      '  - OPENAI_API_KEY\n' +
      '或在Claude Code环境中运行'
    );
  }

  console.log('[LLM Router] 可用 Providers:', router.getAvailableProviders().join(', '));

  routerInstance = router;
  return router;
}
