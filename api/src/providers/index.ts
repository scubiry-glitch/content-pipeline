// LLM Provider exports and Router

import { LLMProvider } from './base';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { ClaudeCodeProvider, isClaudeCodeEnvironment, getClaudeCodeModel, createClaudeProvider } from './claudeCode';
import { KimiProvider } from './kimi';
import { DashboardLlmProvider } from './dashboardLlm';
import { SiliconFlowProvider } from './siliconFlow';
import { VolcanoEngineProvider } from './volcanoEngine';
import { GenerationParams, GenerationResult } from '../types/index.js';

export { LLMProvider, ClaudeProvider, OpenAIProvider, ClaudeCodeProvider, KimiProvider, DashboardLlmProvider, SiliconFlowProvider, VolcanoEngineProvider };
export { isClaudeCodeEnvironment, getClaudeCodeModel, createClaudeProvider };

// Mock provider for demo/testing
export { MockProvider } from './mock';

// Task type to optimal model mapping
export interface ModelRoutingRule {
  taskType: string;
  priority: 'quality' | 'speed' | 'cost';
  preferredProvider: string;
  fallbackProvider?: string;
}

export class LLMRouter {
  private providers: Map<string, LLMProvider> = new Map();
  private routingRules: ModelRoutingRule[] = [
    // 主模型切换到 Volcano Engine，SiliconFlow/Kimi 兜底
    { taskType: 'planning', priority: 'quality', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'analysis', priority: 'quality', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'blue_team_review', priority: 'quality', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'writing', priority: 'quality', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'content_library', priority: 'quality', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'expert_library', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'volcano-engine' },
    { taskType: 'summarization', priority: 'speed', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'tagging', priority: 'speed', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
    { taskType: 'embedding', priority: 'cost', preferredProvider: 'siliconflow' },
    { taskType: 'health_check', priority: 'speed', preferredProvider: 'volcano-engine', fallbackProvider: 'siliconflow' },
  ];

  // Model configs for different priorities
  private modelConfigs: Record<string, Record<string, string>> = {
    'dashboard-llm': {
      quality: 'k2p5',
      speed: 'k2p5',
      cost: 'k2p5',
    },
    siliconflow: {
      quality: 'Pro/deepseek-ai/DeepSeek-V3.2',
      speed: 'Qwen/Qwen2.5-7B-Instruct',
      cost: 'Qwen/Qwen2.5-7B-Instruct',
    },
    'volcano-engine': {
      quality: 'deepseek-v3-2-251201',
      speed: 'deepseek-v3-2-251201',
      cost: 'deepseek-v3-2-251201',
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
      preferredProvider: 'volcano-engine',
      fallbackProvider: 'siliconflow',
    };

    const preferredProv = this.providers.get(rule.preferredProvider);
    const fallbackName = rule.fallbackProvider;
    const fallbackProv = fallbackName ? this.providers.get(fallbackName) : undefined;

    let primary: LLMProvider;
    let primaryModel: string | undefined;
    /** 本次请求是否优先走了 routing 表里的首选 provider（失败时可再试 fallback） */
    let triedPreferred: boolean;

    if (preferredProv) {
      primary = preferredProv;
      primaryModel = this.modelConfigs[rule.preferredProvider]?.[rule.priority];
      triedPreferred = true;
    } else if (fallbackProv) {
      primary = fallbackProv;
      primaryModel = fallbackName
        ? this.modelConfigs[fallbackName]?.[rule.priority]
        : undefined;
      triedPreferred = false;
    } else {
      const available = Array.from(this.providers.values())[0];
      if (!available) {
        throw new Error('No LLM provider available');
      }
      const params: GenerationParams = {
        ...customParams,
        model: customParams?.model,
      };
      return available.generate(prompt, params);
    }

    const buildParams = (model?: string): GenerationParams => ({
      ...customParams,
      model: customParams?.model || model,
    });

    try {
      return await primary.generate(prompt, buildParams(primaryModel));
    } catch (err) {
      if (
        triedPreferred &&
        fallbackProv &&
        fallbackProv !== primary &&
        fallbackName
      ) {
        const fbModel = this.modelConfigs[fallbackName]?.[rule.priority];
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[LLM Router] ${rule.preferredProvider} failed, trying ${fallbackName}:`,
          msg
        );
        return await fallbackProv.generate(prompt, buildParams(fbModel));
      }
      throw err;
    }
  }

  async complete(params: {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
  }): Promise<GenerationResult> {
    // Convert messages to a single prompt for providers that don't support chat
    const prompt = params.messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
    return this.generate(prompt, 'default', {
      temperature: params.temperature,
      maxTokens: params.max_tokens,
    });
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

  // --- 配置管理 API (供前端配置页使用) ---

  getRoutingRules(): ModelRoutingRule[] {
    return [...this.routingRules];
  }

  getModelConfigs(): Record<string, Record<string, string>> {
    return JSON.parse(JSON.stringify(this.modelConfigs));
  }

  updateRoutingRule(taskType: string, updates: Partial<Omit<ModelRoutingRule, 'taskType'>>): boolean {
    const rule = this.routingRules.find(r => r.taskType === taskType);
    if (!rule) return false;
    if (updates.priority) rule.priority = updates.priority;
    if (updates.preferredProvider !== undefined) rule.preferredProvider = updates.preferredProvider;
    if (updates.fallbackProvider !== undefined) rule.fallbackProvider = updates.fallbackProvider;
    return true;
  }

  updateModelConfig(provider: string, priority: string, model: string): void {
    if (!this.modelConfigs[provider]) {
      this.modelConfigs[provider] = { quality: model, speed: model, cost: model };
    } else {
      this.modelConfigs[provider][priority] = model;
    }
  }

  /** 打印路由决策日志 */
  printRoutingTable(): void {
    console.log('[LLM Router] Task routing table:');
    for (const rule of this.routingRules) {
      const hasPreferred = this.providers.has(rule.preferredProvider);
      const hasFallback = rule.fallbackProvider ? this.providers.has(rule.fallbackProvider) : false;
      const activeProvider = hasPreferred ? rule.preferredProvider : (hasFallback ? rule.fallbackProvider : 'any');
      const model = hasPreferred
        ? this.modelConfigs[rule.preferredProvider]?.[rule.priority]
        : (hasFallback && rule.fallbackProvider ? this.modelConfigs[rule.fallbackProvider]?.[rule.priority] : 'default');
      console.log(`  ${rule.taskType} → ${activeProvider} (${model || 'default'})`);
    }
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
  siliconFlowApiKey?: string; // SiliconFlow API Key
  volcanoApiKey?: string; // 火山引擎 API Key
  useClaudeCode?: boolean; // 强制使用Claude Code环境
  embeddingProvider?: 'openai' | 'claude' | 'siliconflow';
}

export function initLLMRouter(config?: LLMRouterConfig): LLMRouter {
  const router = new LLMRouter();
  const cfg = config || {};

  // 注册所有可用的 Provider（独立判断，不再互斥）
  // Dashboard LLM
  if (cfg.dashboardLlmToken || process.env.LLM_API_TOKEN) {
    console.log('[LLM Router] 注册 Dashboard LLM Provider');
    router.registerProvider(new DashboardLlmProvider(cfg.dashboardLlmToken, cfg.dashboardLlmBaseUrl));
  }

  // SiliconFlow (DeepSeek/Qwen)
  if (cfg.siliconFlowApiKey || process.env.SILICONFLOW_API_KEY) {
    console.log('[LLM Router] 注册 SiliconFlow Provider');
    router.registerProvider(new SiliconFlowProvider(cfg.siliconFlowApiKey));
  }

  // 火山引擎 (豆包 DeepSeek)
  if (cfg.volcanoApiKey || process.env.VOLCANO_API_KEY) {
    console.log('[LLM Router] 注册 Volcano Engine Provider');
    router.registerProvider(new VolcanoEngineProvider(cfg.volcanoApiKey));
  }

  // Kimi
  if (cfg.kimiApiKey || process.env.KIMI_API_KEY) {
    console.log('[LLM Router] 注册 Kimi Provider');
    router.registerProvider(new KimiProvider(cfg.kimiApiKey));
  }

  // Claude Code 环境
  if (cfg.useClaudeCode || (!cfg.claudeApiKey && isClaudeCodeEnvironment())) {
    console.log('[LLM Router] 使用 Claude Code 环境提供的模型');
    router.registerProvider(new ClaudeCodeProvider());
  }
  // Claude (显式 API Key)
  else if (cfg.claudeApiKey) {
    if (cfg.claudeApiKey.startsWith('sk-kimi')) {
      // 避免重复注册 Kimi
      if (!router.getProvider('kimi')) {
        console.log('[LLM Router] 检测到 Kimi API Key，注册 Kimi Provider');
        router.registerProvider(new KimiProvider(cfg.claudeApiKey));
      }
    } else {
      router.registerProvider(new ClaudeProvider(cfg.claudeApiKey));
    }
  }
  // Claude (环境变量)
  else if (process.env.ANTHROPIC_API_KEY) {
    if (process.env.ANTHROPIC_API_KEY.startsWith('sk-kimi')) {
      if (!router.getProvider('kimi')) {
        console.log('[LLM Router] 检测到 Kimi API Key，注册 Kimi Provider');
        router.registerProvider(new KimiProvider(process.env.ANTHROPIC_API_KEY));
      }
    } else {
      router.registerProvider(new ClaudeProvider(process.env.ANTHROPIC_API_KEY));
    }
  }

  // OpenAI (用于 Embedding 等)
  if (cfg.openaiApiKey || process.env.OPENAI_API_KEY) {
    router.registerProvider(new OpenAIProvider(cfg.openaiApiKey || process.env.OPENAI_API_KEY!));
  }

  // 确保至少有一个 Provider
  if (router.getAvailableProviders().length === 0) {
    throw new Error(
      '未配置任何 LLM Provider。请设置以下环境变量之一:\n' +
      '  - LLM_API_TOKEN (Dashboard LLM)\n' +
      '  - SILICONFLOW_API_KEY (SiliconFlow - DeepSeek/Qwen)\n' +
      '  - VOLCANO_API_KEY (火山引擎 - 豆包 DeepSeek)\n' +
      '  - KIMI_API_KEY (Kimi)\n' +
      '  - ANTHROPIC_API_KEY (Claude)\n' +
      '  - OPENAI_API_KEY\n' +
      '或在 Claude Code 环境中运行'
    );
  }

  console.log('[LLM Router] 可用 Providers:', router.getAvailableProviders().join(', '));

  // 打印路由决策表
  router.printRoutingTable();

  routerInstance = router;
  return router;
}
