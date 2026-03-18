// API Configuration Check Service
// 在系统启动时检查所有外部 API 配置是否正确

import { getAvailableLLMs, generateEmbedding } from './llm.js';

export interface APICheckResult {
  llm: {
    kimi: boolean;
    claude: boolean;
    openai: boolean;
    hasAny: boolean;
  };
  search: {
    tavily: boolean;
    serper: boolean;
    hasAny: boolean;
  };
  embedding: boolean;
  allRequiredReady: boolean;
}

/**
 * 检查所有 API 配置状态
 */
export function checkAPIConfig(): APICheckResult {
  const llms = getAvailableLLMs();

  const search = {
    tavily: !!(process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.includes('your_')),
    serper: !!(process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.includes('your_')),
    get hasAny() {
      return this.tavily || this.serper;
    },
  };

  const embedding = !!(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your_'));

  const result: APICheckResult = {
    llm: {
      ...llms,
      hasAny: llms.kimi || llms.claude || llms.openai,
    },
    search,
    embedding,
    allRequiredReady: llms.kimi || llms.claude || llms.openai,
  };

  return result;
}

/**
 * 打印 API 配置状态报告
 */
export function printAPICheckReport(): void {
  const result = checkAPIConfig();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              API 配置检查报告                               ║');
  console.log('╠════════════════════════════════════════════════════════════╣');

  // LLM APIs
  console.log('║ LLM API:                                                   ║');
  console.log(`║   • Kimi (Moonshot)   ${result.llm.kimi ? '✅ 已配置' : '❌ 未配置'}                            ║`);
  console.log(`║   • Claude (Anthropic)${result.llm.claude ? '✅ 已配置' : '❌ 未配置'}                            ║`);
  console.log(`║   • OpenAI            ${result.llm.openai ? '✅ 已配置' : '❌ 未配置'}                            ║`);
  console.log(`║   状态: ${result.llm.hasAny ? '✅ 至少有一个可用' : '❌ 无可用 LLM API'}                         ║`);

  console.log('╠════════════════════════════════════════════════════════════╣');

  // Search APIs
  console.log('║ Web Search API (可选):                                     ║');
  console.log(`║   • Tavily            ${result.search.tavily ? '✅ 已配置' : '⚪ 未配置'}                            ║`);
  console.log(`║   • Serper            ${result.search.serper ? '✅ 已配置' : '⚪ 未配置'}                            ║`);
  console.log(`║   状态: ${result.search.hasAny ? '✅ 可用' : '⚪ 未配置(将跳过网页搜索)'}                  ║`);

  console.log('╠════════════════════════════════════════════════════════════╣');

  // Embedding
  console.log('║ Embedding API:                                             ║');
  console.log(`║   状态: ${result.embedding ? '✅ OpenAI 已配置' : '⚪ 未配置(使用随机向量)'}                ║`);

  console.log('╠════════════════════════════════════════════════════════════╣');

  // Overall status
  if (result.allRequiredReady) {
    console.log('║ 总体状态: ✅ 所有必需 API 已配置，系统可以正常启动           ║');
  } else {
    console.log('║ 总体状态: ❌ 缺少必需的 LLM API                              ║');
    console.log('║                                                            ║');
    console.log('║ 请配置以下环境变量之一:                                     ║');
    console.log('║   - KIMI_API_KEY (推荐)                                     ║');
    console.log('║   - CLAUDE_API_KEY                                          ║');
    console.log('║   - OPENAI_API_KEY                                          ║');
  }

  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

/**
 * 验证必需的配置，如果不满足则抛出错误
 */
export function validateRequiredConfig(): void {
  const result = checkAPIConfig();

  if (!result.allRequiredReady) {
    throw new Error(
      '缺少必需的 LLM API 配置。请设置以下环境变量之一:\n' +
      '  - KIMI_API_KEY (推荐，获取地址: https://platform.moonshot.cn/)\n' +
      '  - CLAUDE_API_KEY (获取地址: https://console.anthropic.com/)\n' +
      '  - OPENAI_API_KEY (获取地址: https://platform.openai.com/)'
    );
  }
}

/**
 * 异步测试 API 连通性
 */
export async function testAPIConnectivity(): Promise<{
  llm: boolean;
  search: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let llmWorking = false;
  let searchWorking = false;

  // Test LLM
  try {
    const { generate } = await import('./llm.js');
    const result = await generate('Hello', 'default', { maxTokens: 10 });
    if (result.content) {
      llmWorking = true;
    }
  } catch (error: any) {
    errors.push(`LLM API 测试失败: ${error.message}`);
  }

  // Test Search (if configured)
  const searchConfig = checkAPIConfig().search;
  if (searchConfig.hasAny) {
    try {
      const { getWebSearchService } = await import('./webSearch.js');
      const searchService = getWebSearchService();
      await searchService.search({ query: 'test', maxResults: 1 });
      searchWorking = true;
    } catch (error: any) {
      // If it's a rate limit or auth error, consider it "working" but with issues
      if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
        searchWorking = true;
        errors.push(`Search API 警告: ${error.message}`);
      } else {
        errors.push(`Search API 测试失败: ${error.message}`);
      }
    }
  } else {
    searchWorking = true; // Not required
  }

  return {
    llm: llmWorking,
    search: searchWorking,
    errors,
  };
}
