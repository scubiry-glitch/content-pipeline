// Mock Provider - 用于演示和测试
// 无需实际API调用，返回模拟响应

import { LLMProvider } from './base';
import { GenerationParams, GenerationResult } from '../../shared/src/types';

export class MockProvider extends LLMProvider {
  private callCount = 0;

  constructor() {
    super('mock', 'mock-key', undefined);
  }

  async generate(
    prompt: string,
    params?: GenerationParams
  ): Promise<GenerationResult> {
    this.callCount++;
    const startTime = Date.now();

    // 根据 prompt 内容生成模拟响应
    const content = this.generateMockResponse(prompt);

    const latency = Date.now() - startTime;
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = this.estimateTokens(content);

    return {
      content,
      inputTokens,
      outputTokens,
      model: params?.model || 'mock-model',
      provider: this.name,
      latency,
      cost: 0,
    };
  }

  async embed(text: string): Promise<number[]> {
    // 返回模拟的embedding向量 (1536维)
    return Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }

  getAvailableModels(): string[] {
    return ['mock-model'];
  }

  getCallCount(): number {
    return this.callCount;
  }

  private generateMockResponse(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();

    // Outline generation
    if (lowerPrompt.includes('outline') || lowerPrompt.includes('大纲')) {
      return JSON.stringify({
        outline: [
          {
            title: '一、宏观视野：政策背景与发展历程',
            level: 1,
            content: '分析保租房REITs的政策演进和宏观环境',
            subsections: [
              { title: '1.1 政策背景与制度设计', level: 2, content: '梳理住建部、证监会相关政策' },
              { title: '1.2 市场规模与发展趋势', level: 2, content: '分析已上市项目规模和增长趋势' },
            ],
          },
          {
            title: '二、中观解剖：产业机制与运营模式',
            level: 1,
            content: '深入分析保租房REITs的商业模式',
            subsections: [
              { title: '2.1 资产筛选标准与估值方法', level: 2, content: '分析入池资产要求和估值逻辑' },
              { title: '2.2 收益分配机制与风险结构', level: 2, content: '解析分红机制和风险隔离设计' },
            ],
          },
          {
            title: '三、微观行动：投资分析与案例研究',
            level: 1,
            content: '具体投资建议和标杆案例分析',
            subsections: [
              { title: '3.1 已上市项目表现分析', level: 2, content: '华润有巢、上海城投等案例' },
              { title: '3.2 投资策略与风险提示', level: 2, content: '给出具体投资建议' },
            ],
          },
        ],
      });
    }

    // Data requirements analysis
    if (lowerPrompt.includes('data requirement') || lowerPrompt.includes('数据需求')) {
      return JSON.stringify([
        { type: 'government', description: '住建部保租房政策文件和指导意见', priority: 'high' },
        { type: 'government', description: '已上市保租房REITs招募说明书', priority: 'high' },
        { type: 'industry', description: '保租房市场规模和供需数据', priority: 'high' },
        { type: 'industry', description: 'REITs收益率和估值水平数据', priority: 'medium' },
        { type: 'academic', description: 'REITs定价模型和估值方法研究', priority: 'medium' },
      ]);
    }

    // Blue Team questions
    if (lowerPrompt.includes('blue team') || lowerPrompt.includes('批判性')) {
      return JSON.stringify([
        {
          expertId: 'expert-1',
          expertName: '张其光',
          question: '政策持续性如何？如果保障房政策调整，对REITs现金流有何影响？',
          category: 'evidence',
          severity: 'high',
          suggestedImprovement: '补充政策风险评估和压力测试场景',
        },
        {
          expertId: 'expert-2',
          expertName: '陆铭',
          question: '租金定价机制是否充分考虑了区域差异和人口流动趋势？',
          category: 'assumption',
          severity: 'medium',
          suggestedImprovement: '增加区域比较分析和人口数据支撑',
        },
        {
          expertId: 'expert-3',
          expertName: '刘元春',
          question: '利率上行环境下的估值敏感性分析是否充分？',
          category: 'logic',
          severity: 'high',
          suggestedImprovement: '补充利率敏感性测试和情景分析',
        },
      ]);
    }

    // Research insights
    if (lowerPrompt.includes('insight') || lowerPrompt.includes('洞察')) {
      return JSON.stringify([
        {
          type: 'trend',
          content: '保租房REITs市场规模预计将在2025年达到500亿元',
          confidence: 0.75,
          evidence: ['政策文件分析', '已上市项目规模推算'],
        },
        {
          type: 'anomaly',
          content: '当前保租房REITs估值水平较市场化REITs存在10-15%折价',
          confidence: 0.8,
          evidence: ['估值数据对比'],
        },
        {
          type: 'action',
          content: '建议关注一线城市核心地段的保租房REITs项目',
          confidence: 0.7,
          evidence: ['区位分析', '出租率数据'],
        },
      ]);
    }

    // Analysis
    if (lowerPrompt.includes('analysis') || lowerPrompt.includes('分析')) {
      return JSON.stringify({
        statistics: {
          数据点数量: 15,
          政府来源占比: 0.4,
          行业来源占比: 0.35,
          平均数据质量: 0.8,
        },
        trends: [
          { metric: '市场规模', direction: 'up', magnitude: 0.7, period: '2022-2025' },
          { metric: '收益率水平', direction: 'stable', magnitude: 0.3, period: '2024' },
        ],
        comparisons: [
          {
            dimension: '估值水平',
            items: [
              { name: '保租房REITs', value: 4.5 },
              { name: '市场化REITs', value: 5.2 },
            ],
          },
        ],
      });
    }

    // Auto tagging
    if (lowerPrompt.includes('tag') || lowerPrompt.includes('标签')) {
      return JSON.stringify([
        { tag: '保租房', confidence: 0.95, method: 'NER' },
        { tag: 'REITs', confidence: 0.92, method: 'NER' },
        { tag: '投资分析', confidence: 0.85, method: 'KeyBERT' },
        { tag: '政策研究', confidence: 0.8, method: 'LDA' },
      ]);
    }

    // Default: writing/revision response
    return `[模拟生成内容] 基于提示内容："${prompt.substring(0, 50)}..."\n\n` +
           `这里将生成实际的报告内容。在真实环境中，Claude API将基于提示生成详细的研究报告。\n\n` +
           `当前是模拟模式，用于演示系统工作流程。要启用真实API调用，请确保:\n` +
           `1. 网络连接正常\n` +
           `2. ANTHROPIC_API_KEY 有效\n` +
           `3. 移除 --mock 标志`;
  }

  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
