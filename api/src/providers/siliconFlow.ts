// SiliconFlow Provider - 支持 DeepSeek 等模型
// API 文档: https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions

import { LLMProvider, fetchWithTimeout } from './base';
import { GenerationParams, GenerationResult } from '../types/index.js';

// 流式模式下，每次收到新数据块后重置的静默超时（ms）。
// 只要模型在持续输出，计时器就会不断重置，不受总生成时长限制。
const STREAM_IDLE_TIMEOUT_MS = 120_000;

/**
 * 用流式 SSE 读取 SiliconFlow chat/completions，并将全部 content delta 拼成字符串返回。
 * 采用"滚动静默超时"：每收到一个 chunk 就重置计时器，避免因总生成时间过长而超时。
 */
async function generateViaStream(
  baseUrl: string,
  apiKey: string,
  body: Record<string, any>,
  onProgress?: (tokensSoFar: number, snippet: string) => void,
): Promise<{ content: string; model: string; promptTokens: number; completionTokens: number }> {
  const ctrl = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => ctrl.abort(new Error(`SiliconFlow stream idle timeout after ${STREAM_IDLE_TIMEOUT_MS}ms`)),
      STREAM_IDLE_TIMEOUT_MS,
    );
  };

  resetIdle(); // 启动首次计时，防止连接本身就挂住

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
        'Connection': 'close',
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: ctrl.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`SiliconFlow API error: ${response.status} - ${text.slice(0, 500)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let content = '';
    let modelName = body.model as string;
    let promptTokens = 0;
    let completionTokens = 0;
    let tokensSoFar = 0;
    let lastProgressAt = 0;
    const PROGRESS_INTERVAL = 200; // 每 200 token 触发一次回调

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle(); // 收到数据块，重置静默计时器

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const json = JSON.parse(payload);
          if (json.model) modelName = json.model;
          // 末尾 chunk 带 usage
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens ?? promptTokens;
            completionTokens = json.usage.completion_tokens ?? completionTokens;
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            // 用字符数粗估 token（中文约 1.5 char/token，英文约 4 char/token；取均值 2）
            tokensSoFar = Math.round(content.length / 2);
            if (onProgress && tokensSoFar - lastProgressAt >= PROGRESS_INTERVAL) {
              lastProgressAt = tokensSoFar;
              const snippet = content.slice(-150);
              onProgress(tokensSoFar, snippet);
            }
          }
        } catch { /* 跳过格式异常的 chunk */ }
      }
    }

    return { content, model: modelName, promptTokens, completionTokens };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

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

    try {
      const body: Record<string, any> = {
        model,
        messages: [
          { role: 'system', content: params?.systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: params?.maxTokens || 4096,
        temperature: params?.temperature ?? 0.7,
        top_p: params?.topP ?? 0.9,
        ...(params?.responseFormat === 'json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      };

      const { content, model: returnedModel, promptTokens, completionTokens } =
        await generateViaStream(this.baseUrl!, this.apiKey, body, params?.onProgress);

      return {
        content,
        model: returnedModel,
        usage: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
        },
      };
    } catch (error: any) {
      throw new Error(`SiliconFlow generation failed: ${error.message}`);
    }
  }

  async embed(text: string, model: string = 'BAAI/bge-large-zh-v1.5'): Promise<number[]> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
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
      const response = await fetchWithTimeout(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }, 10_000);
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
      'BAAI/bge-large-zh-v1.5',
    ];
  }
}
