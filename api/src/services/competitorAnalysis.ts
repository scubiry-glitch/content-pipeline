// 竞品分析服务 - Competitor Analysis
// FR-007 ~ FR-008: 同类主题研报搜索与分析

import { getWebSearchService } from './webSearch.js';
import { getLLMRouter } from '../providers/index.js';

export interface CompetitorReport {
  id: string;
  title: string;
  source: string;
  publishDate?: string;
  url?: string;
  keyPoints: string[];
  coreView: string;
  relevance: number;
}

export interface DifferentiationSuggestion {
  angle: string;
  rationale: string;
  potentialValue: 'high' | 'medium' | 'low';
}

export interface CompetitorAnalysisResult {
  reports: CompetitorReport[];
  summary: {
    totalFound: number;
    avgPublishDate: string;
    commonAngles: string[];
    gaps: string[];
  };
  differentiationSuggestions: DifferentiationSuggestion[];
  analysis: string;
}

export async function analyzeCompetitors(
  topic: string,
  context?: string
): Promise<CompetitorAnalysisResult> {
  const webSearch = getWebSearchService();
  const llmRouter = getLLMRouter();

  // 搜索同类主题研报
  const searchQueries = [
    `${topic} 研究报告`,
    `${topic} 深度分析`,
    `${topic} 研报`,
  ];

  const allResults = await Promise.all(
    searchQueries.map(q =>
      webSearch.search({ query: q, maxResults: 5 }).catch(() => [])
    )
  );

  // 合并去重
  const seenUrls = new Set<string>();
  const uniqueResults: typeof allResults[0] = [];

  for (const results of allResults) {
    for (const r of results) {
      if (!seenUrls.has(r.url) && uniqueResults.length < 5) {
        seenUrls.add(r.url);
        uniqueResults.push(r);
      }
    }
  }

  // 使用 LLM 提取关键信息和分析
  const prompt = `你是一位资深的行业研究分析师。请对以下竞品研报进行分析，提取关键信息并给出差异化建议。

## 研究主题
${topic}

${context ? `## 背景信息
${context}` : ''}

## 竞品研报信息
${uniqueResults.map((r, i) => `
${i + 1}. ${r.title}
   来源: ${r.source}
   摘要: ${r.snippet}
`).join('\n')}

## 分析要求
1. 提取每篇研报的核心观点和关键发现
2. 分析竞品的共同角度和遗漏点
3. 找出3-5个差异化切入点
4. 评估每个差异化角度的潜在价值

## 输出格式
请输出JSON格式：
{
  "reports": [
    {
      "id": "唯一标识",
      "title": "报告标题",
      "source": "发布机构",
      "publishDate": "发布时间（如2024-01）",
      "keyPoints": ["关键发现1", "关键发现2"],
      "coreView": "核心观点（100字以内）",
      "relevance": 相关度分数(0-100)
    }
  ],
  "summary": {
    "totalFound": 找到的研报数量,
    "avgPublishDate": "平均发布时间",
    "commonAngles": ["共同角度1", "共同角度2"],
    "gaps": ["遗漏点1", "遗漏点2"]
  },
  "differentiationSuggestions": [
    {
      "angle": "差异化角度",
      "rationale": "理由说明",
      "potentialValue": "high/medium/low"
    }
  ],
  "analysis": "整体分析说明（200字以内）"
}

注意：
- 只返回JSON，不要其他内容
- 如果搜索结果不够，基于已有信息进行分析
- 差异化建议要具体、可操作`;

  try {
    const result = await llmRouter.generate(prompt, 'analysis', {
      temperature: 0.3,
      maxTokens: 2000,
    });

    const jsonMatch =
      result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
      result.content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);

      // 补充 URL 信息
      const reportsWithUrl = (parsed.reports || []).map((r: any, i: number) => ({
        ...r,
        url: uniqueResults[i]?.url,
      }));

      return {
        reports: reportsWithUrl,
        summary: parsed.summary || {
          totalFound: uniqueResults.length,
          avgPublishDate: '未知',
          commonAngles: [],
          gaps: [],
        },
        differentiationSuggestions: parsed.differentiationSuggestions || [],
        analysis: parsed.analysis || '竞品分析完成',
      };
    }
  } catch (error) {
    console.error('[CompetitorAnalysis] Analysis failed:', error);
  }

  // Fallback: 返回基础分析
  return {
    reports: uniqueResults.slice(0, 5).map((r, i) => ({
      id: `comp_${i}`,
      title: r.title,
      source: r.source,
      url: r.url,
      keyPoints: [r.snippet.slice(0, 100)],
      coreView: r.snippet.slice(0, 100),
      relevance: Math.round(r.relevance * 100),
    })),
    summary: {
      totalFound: uniqueResults.length,
      avgPublishDate: '未知',
      commonAngles: ['基础面分析'],
      gaps: ['深度调研'],
    },
    differentiationSuggestions: [
      {
        angle: '聚焦细分领域',
        rationale: '现有研报多为宏观分析，可从细分赛道切入',
        potentialValue: 'high',
      },
      {
        angle: '增加数据维度',
        rationale: '补充一手数据和实地调研结果',
        potentialValue: 'medium',
      },
    ],
    analysis: `找到 ${uniqueResults.length} 篇相关研报，建议从细分角度切入形成差异化。`,
  };
}

// 快速竞品检查（用于实时提示）
export async function quickCompetitorCheck(topic: string): Promise<{
  hasCompetitors: boolean;
  count: number;
  latestDate?: string;
}> {
  const webSearch = getWebSearchService();

  try {
    const results = await webSearch.search({
      query: `${topic} 研报`,
      maxResults: 5,
    });

    return {
      hasCompetitors: results.length > 0,
      count: results.length,
    };
  } catch (error) {
    return { hasCompetitors: false, count: 0 };
  }
}
