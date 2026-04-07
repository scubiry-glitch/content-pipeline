// Dashboard LLM 路由 - Fastify 版本
// 提供 /api/llm/* 端点，代理到上游 Kimi Coding API

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { callKimiCodingText, kimiCodingProvider } from '../services/kimi-coding.js';
import { getLLMRouter } from '../providers/index.js';

// 从请求头读取 Bearer Token
function readBearerToken(req: FastifyRequest): string {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

// 检查是否授权
function isAuthorized(req: FastifyRequest): boolean {
  const expected = process.env.LLM_API_TOKEN?.trim();
  if (!expected) return true;
  return readBearerToken(req) === expected;
}

// 读取 maxTokens
function readMaxTokens(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.floor(raw);
}

// 从 messages 读取 prompt (OpenAI 格式)
function readPromptFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  const userTexts: string[] = [];
  for (const item of messages) {
    if (!item || typeof item !== 'object') continue;
    const role = String((item as { role?: unknown }).role ?? '').trim();
    if (role !== 'user') continue;
    const content = (item as { content?: unknown }).content;
    if (typeof content === 'string') {
      const t = content.trim();
      if (t) userTexts.push(t);
      continue;
    }
    if (!Array.isArray(content)) continue;
    const parts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const type = String((part as { type?: unknown }).type ?? '').trim();
      if (type !== 'text') continue;
      const text = String((part as { text?: unknown }).text ?? '').trim();
      if (text) parts.push(text);
    }
    if (parts.length > 0) userTexts.push(parts.join('\n'));
  }
  return userTexts.join('\n').trim();
}

// Dashboard LLM 路由注册
export async function llmRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/llm/providers - 获取 providers 列表
  fastify.get('/providers', async (_req: FastifyRequest, reply: FastifyReply) => {
    const provider = kimiCodingProvider['kimi-coding'];
    return {
      status: 'success',
      data: {
        providers: [
          {
            id: 'kimi-coding',
            baseUrl: provider.baseUrl,
            api: provider.api,
            models: provider.models,
          },
        ],
      },
    };
  });

  // POST /api/llm/kimi-coding/chat - 聊天接口
  fastify.post('/kimi-coding/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthorized(req)) {
      reply.status(401);
      return {
        status: 'error',
        message: 'Unauthorized',
      };
    }

    const body = req.body as { prompt?: string; model?: string; maxTokens?: number };
    const prompt = String(body?.prompt ?? '').trim();
    if (!prompt) {
      reply.status(400);
      return {
        status: 'error',
        message: 'prompt 不能为空',
      };
    }

    const model = String(body?.model ?? '').trim() || undefined;
    const maxTokens = readMaxTokens(body?.maxTokens);

    try {
      const result = await callKimiCodingText(prompt, { model, maxTokens });
      if (!result.ok) {
        reply.status(result.status || 502);
        return {
          status: 'error',
          message: result.error || 'LLM 调用失败',
          data: {
            provider: 'kimi-coding',
            model: result.model,
            upstreamStatus: result.status,
            raw: result.raw,
          },
        };
      }

      return {
        status: 'success',
        data: {
          provider: 'kimi-coding',
          model: result.model,
          id: result.id,
          reply: result.text,
          raw: result.raw,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM 调用异常';
      reply.status(500);
      return {
        status: 'error',
        message,
      };
    }
  });

  // GET /model-config - 获取当前模型配置
  fastify.get('/model-config', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const router = getLLMRouter();
      const providers = router.getAvailableProviders();
      const providerDetails: Record<string, { models: string[] }> = {};

      for (const name of providers) {
        const provider = router.getProvider(name);
        providerDetails[name] = {
          models: provider?.getAvailableModels() || [],
        };
      }

      return {
        status: 'success',
        data: {
          providers: providerDetails,
          routingRules: router.getRoutingRules(),
          modelConfigs: router.getModelConfigs(),
          env: {
            DEFAULT_LLM_MODEL: process.env.DEFAULT_LLM_MODEL || '',
            DASHBOARD_LLM_MODEL: process.env.DASHBOARD_LLM_MODEL || '',
            VOLCANO_MODEL: process.env.VOLCANO_MODEL || '',
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get model config';
      reply.status(500);
      return { status: 'error', message };
    }
  });

  // PUT /model-config - 更新运行时模型配置（重启后还原）
  fastify.put('/model-config', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthorized(req)) {
      reply.status(401);
      return { status: 'error', message: 'Unauthorized' };
    }

    try {
      const router = getLLMRouter();
      const body = req.body as {
        routingRules?: Array<{ taskType: string; preferredProvider?: string; fallbackProvider?: string; priority?: 'quality' | 'speed' | 'cost' }>;
        modelConfigs?: Record<string, Record<string, string>>;
      };

      let updatedRules = 0;
      let updatedModels = 0;

      // 更新路由规则
      if (body.routingRules) {
        for (const rule of body.routingRules) {
          const success = router.updateRoutingRule(rule.taskType, {
            preferredProvider: rule.preferredProvider,
            fallbackProvider: rule.fallbackProvider,
            priority: rule.priority,
          });
          if (success) updatedRules++;
        }
      }

      // 更新模型配置
      if (body.modelConfigs) {
        for (const [provider, priorities] of Object.entries(body.modelConfigs)) {
          for (const [priority, model] of Object.entries(priorities)) {
            router.updateModelConfig(provider, priority, model);
            updatedModels++;
          }
        }
      }

      return {
        status: 'success',
        data: {
          updatedRules,
          updatedModels,
          message: '运行时配置已更新（重启后还原）',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update config';
      reply.status(500);
      return { status: 'error', message };
    }
  });

  // POST /test-provider - 测试 provider 连通性
  fastify.post('/test-provider', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthorized(req)) {
      reply.status(401);
      return { status: 'error', message: 'Unauthorized' };
    }

    const body = req.body as { provider: string; prompt?: string };
    const providerName = body?.provider;
    if (!providerName) {
      reply.status(400);
      return { status: 'error', message: 'provider 参数不能为空' };
    }

    try {
      const router = getLLMRouter();
      const provider = router.getProvider(providerName);
      if (!provider) {
        reply.status(404);
        return {
          status: 'error',
          message: `Provider "${providerName}" 未注册`,
          availableProviders: router.getAvailableProviders(),
        };
      }

      const testPrompt = body.prompt || '请用一句话回答：1+1等于几？';
      const startTime = Date.now();
      const result = await provider.generate(testPrompt, { maxTokens: 100 });
      const latencyMs = Date.now() - startTime;

      return {
        status: 'success',
        data: {
          provider: providerName,
          success: true,
          latencyMs,
          model: result.model,
          content: result.content.substring(0, 200),
          usage: result.usage,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      return {
        status: 'error',
        data: {
          provider: providerName,
          success: false,
          error: message,
        },
      };
    }
  });

  // POST /v1/chat/completions - OpenAI 兼容接口
  fastify.post('/chat/completions', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthorized(req)) {
      reply.status(401);
      return {
        error: {
          message: 'Invalid authentication credentials',
          type: 'invalid_request_error',
        },
      };
    }

    const body = req.body as { model?: string; max_tokens?: number; max_completion_tokens?: number; messages?: unknown };
    const model = String(body?.model ?? '').trim() || 'k2p5';
    const maxTokens = readMaxTokens(body?.max_tokens) ?? readMaxTokens(body?.max_completion_tokens);
    const prompt = readPromptFromMessages(body?.messages);
    
    if (!prompt) {
      reply.status(400);
      return {
        error: {
          message: 'messages 不能为空，且至少包含一条 user 文本消息',
          type: 'invalid_request_error',
        },
      };
    }

    try {
      const result = await callKimiCodingText(prompt, { model, maxTokens });
      if (!result.ok) {
        reply.status(result.status || 502);
        return {
          error: {
            message: result.error || 'Upstream model error',
            type: 'upstream_error',
            upstream_status: result.status,
            upstream_raw: result.raw,
          },
        };
      }

      const completionText = result.text || '';
      const now = Math.floor(Date.now() / 1000);
      return {
        id: result.id || `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: now,
        model: result.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: completionText,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      reply.status(500);
      return {
        error: {
          message,
          type: 'server_error',
        },
      };
    }
  });
}
