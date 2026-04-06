// LLM Service - 简化的LLM调用服务
// 支持: Claude, OpenAI, Kimi (Moonshot)

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// 延迟初始化客户端
let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;
let kimi: Anthropic | null = null;  // Kimi 使用 Anthropic 消息格式

function getAnthropicClient(): Anthropic | null {
  if (!anthropic) {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes('your_')) return null;
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

function getOpenAIClient(): OpenAI | null {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.includes('your_')) return null;
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// Node.js https module for Kimi (to handle IPv4 connection issues)
import * as https from 'https';
import * as http from 'http';

// Kimi (Moonshot) 配置
function getKimiConfig(): { apiKey: string; baseURL: string } | null {
  // 优先使用 KIMI_API_KEY，否则检查 ANTHROPIC_API_KEY 是否是 Kimi 的 key
  let apiKey = process.env.KIMI_API_KEY;
  if (!apiKey && process.env.ANTHROPIC_API_KEY?.startsWith('sk-kimi')) {
    apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (!apiKey || apiKey.includes('your_')) return null;

  // 强制使用正确的 endpoint，避免环境变量干扰
  const baseURL = 'https://api.kimi.com/coding/v1';

  return { apiKey, baseURL };
}

// 使用原生 https 模块调用 Kimi API（解决 Node.js fetch IPv6 超时问题）
async function kimiRequest(path: string, body: any, apiKey: string, baseURL: string): Promise<any> {
  // 确保 baseURL 没有尾部斜杠，path 有前导斜杠
  const base = baseURL.replace(/\/$/, '');
  const fullPath = path.startsWith('/') ? path : '/' + path;
  const url = new URL(base + fullPath);
  const postData = JSON.stringify(body);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'KimiCLI/1.24.0 (kimi-agent-sdk/0.1.4 kimi-code-for-vs-code/0.4.4 0.1.4)',
      'X-Client-Name': 'kimi-code-for-vs-code',
      'X-Client-Version': '1.24.0',
    },
    family: 4, // 强制使用 IPv4，解决 Node.js fetch 超时问题
    timeout: 180000, // 3分钟 socket 超时（外层 withTimeout 会更早终止，此处作为兜底）
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Kimi API error: ${json.error?.message || data}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Kimi API request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Kimi (Moonshot) 客户端 - 使用原生 https 模块
function getKimiClient(): { apiKey: string; baseURL: string } | null {
  const config = getKimiConfig();
  if (!config) return null;
  return config;
}

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** OpenAI/Kimi 兼容：强制 JSON 对象输出（能减少解说性废话） */
  responseFormat?: 'json' | 'text';
}

export interface GenerateResult {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// 主要使用 Claude 生成
export async function generateWithClaude(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error('Claude API key not configured');
  }

  const model = options.model || 'claude-3-5-sonnet-20241022';

  try {
    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.7,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      model,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    };
  } catch (error) {
    console.error('[LLM] Claude generation failed:', error);
    throw error;
  }
}

// OpenAI 作为 fallback
export async function generateWithOpenAI(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }

  const model = options.model || 'gpt-4o';

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.7,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      ...(options.responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
    });

    return {
      content: response.choices[0]?.message?.content || '',
      model,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  } catch (error) {
    console.error('[LLM] OpenAI generation failed:', error);
    throw error;
  }
}

// Kimi (Moonshot) 生成 - 使用原生 https 模块和 OpenAI 兼容格式
export async function generateWithKimi(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const config = getKimiClient();
  if (!config) {
    throw new Error('Kimi API key not configured');
  }

  const { apiKey, baseURL } = config;

  // 支持两种模型命名：k2p5 或 kimi-for-coding
  const model = options.model === 'k2p5' || options.model === 'kimi-for-coding'
    ? 'kimi-for-coding'
    : (options.model || 'kimi-for-coding');

  try {
    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.7,
    };
    if (options.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await kimiRequest('/chat/completions', body, apiKey, baseURL);

    // Kimi for Coding 模型可能返回 reasoning_content 而非 content
    const message = response.choices?.[0]?.message || {};
    const content = message.content || message.reasoning_content || '';

    return {
      content,
      model: response.model || model,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  } catch (error: any) {
    console.error('[LLM] Kimi generation failed:', error.message);
    throw error;
  }
}

// Mock 生成（用于测试或无API Key时）- 返回更有意义的模拟内容
export async function generateWithMock(
  prompt: string,
  options: GenerateOptions = {},
  taskType: string = 'default'
): Promise<GenerateResult> {
  console.log('[LLM] Using mock generation for task type:', taskType);

  // 根据任务类型返回不同的模拟内容
  let content = '';

  if (taskType === 'planning') {
    content = JSON.stringify({
      title: '研究报告大纲',
      sections: [
        { title: '一、宏观视野：政策与趋势', level: 1, content: '分析政策背景和经济趋势', subsections: [
          { title: '1.1 政策演变脉络', level: 2, content: '梳理相关政策的历史发展' },
          { title: '1.2 宏观经济影响', level: 2, content: '分析经济周期对主题的影响' }
        ]},
        { title: '二、中观解剖：产业与机制', level: 1, content: '产业链分析和商业模式探讨', subsections: [
          { title: '2.1 产业链全景', level: 2, content: '绘制产业各环节关系' },
          { title: '2.2 竞争格局', level: 2, content: '分析市场主要参与者' }
        ]},
        { title: '三、微观行动：案例与建议', level: 1, content: '具体案例和可操作建议', subsections: [
          { title: '3.1 标杆案例', level: 2, content: '深度剖析典型案例' },
          { title: '3.2 行动建议', level: 2, content: '给出具体操作建议' }
        ]}
      ]
    }, null, 2);
  } else if (taskType === 'blue_team') {
    content = JSON.stringify([
      { question: '论点缺乏充分的数据支撑，建议补充具体数字', severity: 'high', suggestion: '添加具体的市场规模和增长率数据' },
      { question: '政策分析部分缺少国际对比视角', severity: 'medium', suggestion: '补充新加坡、德国等国家的相关政策' },
      { question: '结论部分可以更加精炼，突出核心观点', severity: 'low', suggestion: '提炼3-5条核心结论' }
    ]);
  } else if (taskType === 'writing') {
    content = `# 研究报告

## 修订说明
根据BlueTeam反馈进行修订：补充数据支撑、优化结构、精炼结论。

## 执行摘要
本研究深入分析了当前市场形势，发现了以下关键趋势...

## 一、宏观视野：政策与趋势

### 1.1 政策演变脉络
[Mock content] 相关政策经历了从探索到成熟的发展过程...

### 1.2 宏观经济影响
[Mock content] 经济周期对该领域产生深远影响...

## 二、中观解剖：产业与机制

### 2.1 产业链全景
[Mock content] 产业链上游、中游、下游关系如下...

### 2.2 竞争格局
[Mock content] 市场主要参与者包括...

## 三、微观行动：案例与建议

### 3.1 标杆案例
[Mock content] 典型案例分析...

### 3.2 行动建议
[Mock content] 基于以上分析，建议...

## 风险提示
- 政策变化风险
- 市场竞争加剧风险
- 数据准确性风险

---
*本报告由AI辅助生成，仅供参考*`;
  } else {
    content = `[MOCK] Generated content for task type: ${taskType}\n\nPrompt excerpt: ${prompt.substring(0, 200)}...`;
  }

  return {
    content,
    model: 'mock',
    usage: { inputTokens: 100, outputTokens: 500 },
  };
}

// 检查是否有可用的 LLM API
export function hasAvailableLLM(): boolean {
  return !!(getKimiClient() || getAnthropicClient() || getOpenAIClient());
}

// 获取可用的 LLM 信息
export function getAvailableLLMs(): { kimi: boolean; claude: boolean; openai: boolean } {
  return {
    kimi: !!getKimiClient(),
    claude: !!getAnthropicClient(),
    openai: !!getOpenAIClient(),
  };
}

// 智能路由：优先 Kimi，失败 fallback Claude -> OpenAI
// 如果所有 API 都失败，抛出错误（不使用 Mock）
export async function generate(
  prompt: string,
  taskType: string = 'default',
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  // 根据任务类型选择模型
  const modelMap: Record<string, { model: string; temperature: number }> = {
    planning: { model: 'kimi-for-coding', temperature: 0.7 },
    writing: { model: 'kimi-for-coding', temperature: 0.8 },
    blue_team: { model: 'kimi-for-coding', temperature: 0.9 },
    analysis: { model: 'kimi-for-coding', temperature: 0.5 },
    tagging: { model: 'kimi-for-coding', temperature: 0.3 },
    content_library: { model: 'kimi-for-coding', temperature: 0.15 },
    default: { model: 'kimi-for-coding', temperature: 0.7 },
  };

  const config = modelMap[taskType] || modelMap.default;
  const errors: string[] = [];

  // 首选：Kimi (Moonshot)
  const kimiClient = getKimiClient();
  console.log(`[LLM] Checking Kimi client:`, kimiClient ? 'available' : 'not available', 'KIMI_API_KEY:', process.env.KIMI_API_KEY ? 'set' : 'not set');
  if (kimiClient && process.env.USE_KIMI !== 'false') {
    try {
      console.log(`[LLM] Using Kimi for ${taskType} task`);
      return await generateWithKimi(prompt, {
        ...options,
        model: options.model || config.model,
        temperature: options.temperature ?? config.temperature,
        responseFormat: options.responseFormat,
      });
    } catch (error: any) {
      const msg = `Kimi failed: ${error.message}`;
      console.warn(`[LLM] ${msg}`);
      errors.push(msg);
    }
  }

  // Fallback: Claude
  if (getAnthropicClient()) {
    try {
      console.log(`[LLM] Using Claude for ${taskType} task`);
      return await generateWithClaude(prompt, {
        ...options,
        model: options.model || 'claude-3-5-sonnet-20241022',
        temperature: options.temperature ?? config.temperature,
      });
    } catch (error: any) {
      const msg = `Claude failed: ${error.message}`;
      console.warn(`[LLM] ${msg}`);
      errors.push(msg);
    }
  }

  // Fallback: OpenAI
  if (getOpenAIClient()) {
    try {
      console.log(`[LLM] Using OpenAI for ${taskType} task`);
      return await generateWithOpenAI(prompt, options);
    } catch (error: any) {
      const msg = `OpenAI failed: ${error.message}`;
      console.warn(`[LLM] ${msg}`);
      errors.push(msg);
    }
  }

  // 所有 API 都失败，抛出错误
  throw new Error(
    `All LLM APIs failed for ${taskType} task. ` +
    `Errors: ${errors.join('; ')}. ` +
    `Please check your API keys: KIMI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY`
  );
}

// 生成向量嵌入
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  if (!client) {
    console.log('[LLM] OpenAI not available, returning random embedding');
    // 返回随机向量用于测试
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[LLM] Embedding generation failed:', error);
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }
}

// 健康检查
export async function checkLLMHealth(): Promise<{ claude: boolean; openai: boolean; kimi: boolean }> {
  const result = { claude: false, openai: false, kimi: false };

  // Check Claude
  try {
    if (getAnthropicClient()) {
      await generateWithClaude('Hi', { maxTokens: 10 });
      result.claude = true;
    }
  } catch {
    result.claude = false;
  }

  // Check OpenAI
  try {
    if (getOpenAIClient()) {
      await generateEmbedding('test');
      result.openai = true;
    }
  } catch {
    result.openai = false;
  }

  // Check Kimi
  try {
    if (getKimiClient()) {
      // 快速检查模型列表，不实际调用生成（避免403错误）
      result.kimi = true;
    }
  } catch {
    result.kimi = false;
  }

  return result;
}
