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

// Kimi (Moonshot) 客户端 - 使用 Anthropic 消息格式
function getKimiClient(): Anthropic | null {
  if (!kimi) {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey || apiKey.includes('your_')) return null;

    // 确保 baseURL 以 / 结尾
    let baseURL = process.env.KIMI_BASE_URL || 'https://api.kimi.com/coding/';
    if (!baseURL.endsWith('/')) {
      baseURL += '/';
    }

    console.log('[LLM] Initializing Kimi client with baseURL:', baseURL);

    kimi = new Anthropic({
      apiKey,
      baseURL,
      // 使用 Node 内置 fetch 替代 node-fetch
      fetch: async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
        return fetch(url, {
          ...init,
          // 添加超时设置
          signal: AbortSignal.timeout(60000),
        });
      },
    });
  }
  return kimi;
}

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
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

// Kimi (Moonshot) 生成 - 使用 Anthropic 消息格式
export async function generateWithKimi(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const client = getKimiClient();
  if (!client) {
    throw new Error('Kimi API key not configured');
  }

  const model = options.model || 'k2p5';

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
    console.error('[LLM] Kimi generation failed:', error);
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

// 智能路由：优先 Kimi，失败 fallback Claude -> OpenAI -> mock
export async function generate(
  prompt: string,
  taskType: string = 'default',
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  // 根据任务类型选择模型
  const modelMap: Record<string, { model: string; temperature: number }> = {
    planning: { model: 'k2p5', temperature: 0.7 },
    writing: { model: 'k2p5', temperature: 0.8 },
    blue_team: { model: 'k2p5', temperature: 0.9 },
    analysis: { model: 'k2p5', temperature: 0.5 },
    tagging: { model: 'k2p5', temperature: 0.3 },
    default: { model: 'k2p5', temperature: 0.7 },
  };

  const config = modelMap[taskType] || modelMap.default;

  // 首选：Kimi (Moonshot)
  if (getKimiClient()) {
    try {
      return await generateWithKimi(prompt, {
        ...options,
        model: options.model || config.model,
        temperature: options.temperature ?? config.temperature,
      });
    } catch (error) {
      console.warn('[LLM] Kimi failed, trying Claude');
    }
  }

  // Fallback: Claude
  if (getAnthropicClient()) {
    try {
      return await generateWithClaude(prompt, {
        ...options,
        model: options.model || 'claude-3-5-sonnet-20241022',
        temperature: options.temperature ?? config.temperature,
      });
    } catch (error) {
      console.warn('[LLM] Claude failed, trying OpenAI');
    }
  }

  // Fallback: OpenAI
  if (getOpenAIClient()) {
    try {
      return await generateWithOpenAI(prompt, options);
    } catch (error) {
      console.warn('[LLM] OpenAI failed, using mock');
    }
  }

  // Fallback Kimi (Moonshot)
  if (getKimiClient()) {
    try {
      return await generateWithKimi(prompt, {
        ...options,
        model: options.model || 'k2p5',
      });
    } catch (error) {
      console.warn('[LLM] Kimi failed, using mock');
    }
  }

  // Final fallback: mock
  return generateWithMock(prompt, options, taskType);
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
      await generateWithKimi('Hi', { maxTokens: 10 });
      result.kimi = true;
    }
  } catch {
    result.kimi = false;
  }

  return result;
}
