// 选题评估服务 - 可写性评分
// FR-001 ~ FR-003: 4维度评估话题质量

import { getLLMRouter } from '../providers/index.js';
import { getWebSearchService } from './webSearch.js';

export interface TopicEvaluationInput {
  topic: string;
  context?: string;
}

export interface TopicEvaluationResult {
  score: number; // 0-100
  passed: boolean; // >= 60 通过
  stronglyRecommended: boolean; // >= 80 强烈推荐
  riskLevel: 'low' | 'medium' | 'high' | 'extreme'; // 风险等级
  dimensions: {
    dataAvailability: number; // 数据可得性 40%
    topicHeat: number; // 话题热度 25%
    differentiation: number; // 差异化潜力 20%
    timeliness: number; // 时效性 15%
  };
  analysis: string; // 评估说明
  suggestions: string[]; // 改进建议
  heatIndicators?: {
    newsCount: number;
    searchResults: number;
    recentTrend: 'rising' | 'stable' | 'declining';
  };
}

export async function evaluateTopic(
  input: TopicEvaluationInput
): Promise<TopicEvaluationResult> {
  const llmRouter = getLLMRouter();
  const webSearch = getWebSearchService();

  // 并行执行：LLM评估 + Web搜索热度
  const [searchResults, competitorResults] = await Promise.all([
    // 搜索话题相关资讯
    webSearch.search({
      query: `${input.topic} 研究报告 分析`,
      maxResults: 10,
      filters: { dateRange: 'month' }
    }).catch(() => []),
    // 搜索竞品分析
    webSearch.search({
      query: `${input.topic} 研报`,
      maxResults: 5
    }).catch(() => [])
  ]);

  // 计算热度指标
  const newsCount = searchResults.length;
  const hasRecentNews = newsCount > 3;
  const heatScore = Math.min(100, 40 + newsCount * 10);

  const prompt = `你是一位资深的财经内容选题评估专家。请对以下研究选题进行可写性评估。

## 评估话题
${input.topic}

${input.context ? `## 背景信息
${input.context}` : ''}

## 实时数据参考
- 相关资讯数量: ${newsCount} 条
- 近期关注度: ${hasRecentNews ? '较高' : '一般'}
- 竞品研报数量: ${competitorResults.length} 份

## 评估话题
${input.topic}

${input.context ? `## 背景信息\n${input.context}` : ''}

## 评估维度（满分100分）

1. **数据可得性（40分）**：关键数据是否容易获取？是否有公开数据源？
2. **话题热度（25分）**：近期关注度如何？是否有持续讨论？
3. **差异化潜力（20分）**：与已有内容相比，能否找到新角度？
4. **时效性（15分）**：是否具备持续价值？还是短期热点？

## 输出要求
请输出JSON格式：
{
  "score": 总分,
  "dimensions": {
    "dataAvailability": 数据可得性得分,
    "topicHeat": 话题热度得分,
    "differentiation": 差异化得分,
    "timeliness": 时效性得分
  },
  "analysis": "评估说明（200字以内）",
  "suggestions": ["改进建议1", "改进建议2"]
}

评分标准：
- 80-100分：优秀选题，建议立即开始
- 60-79分：可写，但需要注意某些方面
- 40-59分：有风险，建议调整角度
- <40分：不建议，选题价值有限

风险等级定义：
- low: 无风险或低风险（>=80分）
- medium: 中等风险（60-79分）
- high: 高风险（40-59分）
- extreme: 极高风险（<40分）`;

  try {
    const result = await llmRouter.generate(prompt, 'analysis', {
      temperature: 0.3,
      maxTokens: 1500,
    });

    const jsonMatch =
      result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
      result.content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      const score = Math.min(100, Math.max(0, parsed.score || 50));

      // 确定风险等级
      let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
      if (score >= 80) riskLevel = 'low';
      else if (score >= 60) riskLevel = 'medium';
      else if (score >= 40) riskLevel = 'high';
      else riskLevel = 'extreme';

      return {
        score,
        passed: score >= 60,
        stronglyRecommended: score >= 80,
        riskLevel,
        dimensions: {
          dataAvailability: parsed.dimensions?.dataAvailability || 0,
          topicHeat: parsed.dimensions?.topicHeat || heatScore,
          differentiation: parsed.dimensions?.differentiation || 0,
          timeliness: parsed.dimensions?.timeliness || 0,
        },
        analysis: parsed.analysis || '暂无详细分析',
        suggestions: parsed.suggestions || [],
        heatIndicators: {
          newsCount,
          searchResults: searchResults.length,
          recentTrend: hasRecentNews ? 'rising' : 'stable'
        }
      };
    }
  } catch (error) {
    console.error('[TopicEvaluation] Failed to evaluate:', error);
  }

  // Fallback: 返回默认评分（使用搜索数据）
  const fallbackScore = Math.min(100, 50 + newsCount * 5);
  let fallbackRisk: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
  if (fallbackScore >= 80) fallbackRisk = 'low';
  else if (fallbackScore >= 60) fallbackRisk = 'medium';
  else if (fallbackScore >= 40) fallbackRisk = 'high';
  else fallbackRisk = 'extreme';

  return {
    score: fallbackScore,
    passed: fallbackScore >= 60,
    stronglyRecommended: fallbackScore >= 80,
    riskLevel: fallbackRisk,
    dimensions: {
      dataAvailability: 60,
      topicHeat: heatScore,
      differentiation: 55,
      timeliness: 60,
    },
    analysis: `基于搜索数据评估：找到${newsCount}条相关资讯，关注度${hasRecentNews ? '较高' : '一般'}`,
    suggestions: newsCount < 3 ? ['建议补充更多背景信息', '可尝试更具体的关键词'] : ['数据充足，建议开始研究'],
    heatIndicators: {
      newsCount,
      searchResults: searchResults.length,
      recentTrend: hasRecentNews ? 'rising' : 'stable'
    }
  };
}
