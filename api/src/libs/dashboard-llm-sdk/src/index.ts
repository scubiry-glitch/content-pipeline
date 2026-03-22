export interface DashboardLlmSdkOptions {
  baseUrl?: string;
  token?: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
  fetchImpl?: typeof fetch;
}

export interface DashboardLlmChatInput {
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export interface DashboardLlmProviderItem {
  id: string;
  baseUrl: string;
  api: string;
  models: Array<Record<string, unknown>>;
}

export interface DashboardLlmChatResult {
  provider: string;
  model: string;
  id?: string;
  reply: string;
  raw?: unknown;
}

interface DashboardApiEnvelope<T> {
  status?: string;
  message?: string;
  data?: T;
}

interface DashboardApiError extends Error {
  status?: number;
  payload?: unknown;
}

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`;
}

function buildError(message: string, status?: number, payload?: unknown): DashboardApiError {
  const err = new Error(message) as DashboardApiError;
  err.status = status;
  err.payload = payload;
  return err;
}

function readReplyFromEnvelope(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const data = (payload as { data?: { reply?: unknown } }).data;
  return typeof data?.reply === 'string' ? data.reply.trim() : '';
}

export class DashboardLlmSdk {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: DashboardLlmSdkOptions) {
    this.baseUrl = options?.baseUrl?.trim() || process.env.LLM_API_BASE_URL?.trim() || 'http://127.0.0.1:3004';
    this.token = options?.token?.trim() || process.env.LLM_API_TOKEN?.trim() || '';
    this.defaultModel = options?.defaultModel?.trim() || process.env.DASHBOARD_LLM_MODEL?.trim() || 'k2p5';
    this.defaultMaxTokens = options?.defaultMaxTokens || 1024;
    this.fetchImpl = options?.fetchImpl || fetch;
  }

  ensureToken(): void {
    if (!this.token) {
      throw new Error('缺少 LLM_API_TOKEN');
    }
  }

  async listProviders(): Promise<DashboardLlmProviderItem[]> {
    this.ensureToken();
    const res = await this.fetchImpl(joinUrl(this.baseUrl, '/api/llm/providers'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    const text = await res.text();
    const payload = text ? (JSON.parse(text) as DashboardApiEnvelope<{ providers?: DashboardLlmProviderItem[] }>) : {};
    if (!res.ok) {
      throw buildError(`读取 providers 失败: HTTP ${res.status}`, res.status, payload);
    }
    return Array.isArray(payload.data?.providers) ? payload.data.providers : [];
  }

  async chat(input: DashboardLlmChatInput): Promise<DashboardLlmChatResult> {
    this.ensureToken();
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) {
      throw new Error('prompt 不能为空');
    }

    const res = await this.fetchImpl(joinUrl(this.baseUrl, '/api/llm/kimi-coding/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        prompt,
        model: input.model || this.defaultModel,
        maxTokens: input.maxTokens || this.defaultMaxTokens,
      }),
    });

    const rawText = await res.text();
    let payload: unknown = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = { rawText };
    }

    if (!res.ok) {
      const message =
        (payload as { message?: unknown })?.message && typeof (payload as { message?: unknown }).message === 'string'
          ? String((payload as { message?: unknown }).message)
          : `LLM 请求失败: HTTP ${res.status}`;
      throw buildError(message, res.status, payload);
    }

    const parsed = payload as DashboardApiEnvelope<{
      provider?: string;
      model?: string;
      id?: string;
      reply?: string;
      raw?: unknown;
    }>;
    const data = parsed.data || {};
    const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
    if (!reply) {
      const fallbackReply = readReplyFromEnvelope(payload);
      if (!fallbackReply) {
        throw buildError('LLM 返回为空', res.status, payload);
      }
      return {
        provider: String(data.provider || 'kimi-coding'),
        model: String(data.model || input.model || this.defaultModel),
        id: typeof data.id === 'string' ? data.id : undefined,
        reply: fallbackReply,
        raw: data.raw,
      };
    }

    return {
      provider: String(data.provider || 'kimi-coding'),
      model: String(data.model || input.model || this.defaultModel),
      id: typeof data.id === 'string' ? data.id : undefined,
      reply,
      raw: data.raw,
    };
  }
}

export function createDashboardLlmSdk(options?: DashboardLlmSdkOptions): DashboardLlmSdk {
  return new DashboardLlmSdk(options);
}
