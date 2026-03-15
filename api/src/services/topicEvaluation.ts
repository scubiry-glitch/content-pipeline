// 选题评估服务 - 可写性评分
// FR-001 ~ FR-003: 4维度评估话题质量

import { getLLMRouter } from '../providers/index.js';

export interface TopicEvaluationInput {
  topic: string;
  context?: string;
}

export interface TopicEvaluationResult {
  score: number; // 0-100
  passed: boolean; // >= 60 通过
  dimensions: {
    dataAvailability: number; // 数据可得性 40%
    topicHeat: number; // 话题热度 25%
    differentiation: number; // 差异化潜力 20%
    timeliness: number; // 时效性 15%
  };
  analysis: string; // 评估说明
  suggestions: string[]; // 改进建议
}

export async function evaluateTopic(
  input: TopicEvaluationInput
): Promise<TopicEvaluationResult> {
  const llmRouter = getLLMRouter();

  const prompt = `你是一位资深的财经内容选题评估专家。请对以下研究选题进行可写性评估。

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
- <40分：不建议，选题价值有限`;

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

      return {
        score: parsed.score || 50,
        passed: (parsed.score || 50) >= 60,
        dimensions: {
          dataAvailability: parsed.dimensions?.dataAvailability || 0,
          topicHeat: parsed.dimensions?.topicHeat || 0,
          differentiation: parsed.dimensions?.differentiation || 0,
          timeliness: parsed.dimensions?.timeliness || 0,
        },
        analysis: parsed.analysis || '暂无详细分析',
        suggestions: parsed.suggestions || [],
      };
    }
  } catch (error) {
    console.error('[TopicEvaluation] Failed to evaluate:', error);
  }

  // Fallback: 返回默认评分
  return {
    score: 60,
    passed: true,
    dimensions: {
      dataAvailability: 60,
      topicHeat: 60,
      differentiation: 60,
      timeliness: 60,
    },
    analysis: '评估服务暂时不可用，使用默认评分',
    suggestions: ['建议手动评估选题质量'],
  };
}
