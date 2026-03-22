export interface KimiCodingModelConfig {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<'text' | 'image'>;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
}

export interface KimiCodingProviderConfig {
  baseUrl: string;
  apiKey: string;
  api: 'anthropic-messages';
  models: KimiCodingModelConfig[];
}

export const KIMI_CODING_USER_AGENT =
  'KimiCLI/1.23.0 (kimi-agent-sdk/0.1.6 kimi-code-for-vs-code/0.4.5 0.1.6)';

export const kimiCodingProvider: Record<'kimi-coding', KimiCodingProviderConfig> = {
  'kimi-coding': {
    baseUrl: 'https://api.kimi.com/coding/',
    apiKey: '',
    api: 'anthropic-messages',
    models: [
      {
        id: 'k2p5',
        name: 'Kimi for Coding',
        reasoning: true,
        input: ['text', 'image'],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: 262144,
        maxTokens: 32768,
      },
    ],
  },
};

interface AnthropicTextChunk {
  type: 'text';
  text: string;
}

interface AnthropicMessageResponse {
  id?: string;
  model?: string;
  role?: string;
  type?: string;
  content?: AnthropicTextChunk[];
  stop_reason?: string;
}

export interface KimiCodingCallResult {
  ok: boolean;
  status: number;
  model: string;
  id?: string;
  text: string;
  raw?: unknown;
  error?: string;
}

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`;
}

export async function callKimiCodingText(
  prompt: string,
  options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    endpointPath?: string;
  },
): Promise<KimiCodingCallResult> {
  const provider = kimiCodingProvider['kimi-coding'];
  const apiKey =
    options?.apiKey?.trim() ||
    process.env.KIMI_CODING_API_KEY?.trim() ||
    process.env.KIMI_API_KEY?.trim() ||
    process.env.kimikey?.trim() ||
    provider.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      model: options?.model || provider.models[0]!.id,
      text: '',
      error: '未配置 KIMI_CODING_API_KEY',
    };
  }

  const model = options?.model || provider.models[0]!.id;
  const maxTokens = options?.maxTokens || 1024;
  const endpointPath = options?.endpointPath || 'v1/messages';
  const url = joinUrl(provider.baseUrl, endpointPath);

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': KIMI_CODING_USER_AGENT,
      'x-api-key': apiKey,
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let raw: unknown = rawText;
  try {
    raw = JSON.parse(rawText);
  } catch {
    // keep raw as plain text
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      model,
      text: '',
      raw,
      error: `请求失败: HTTP ${res.status}`,
    };
  }

  const message = raw as AnthropicMessageResponse;
  const text =
    message.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim() || '';

  return {
    ok: true,
    status: res.status,
    model,
    id: message.id,
    text,
    raw,
  };
}
