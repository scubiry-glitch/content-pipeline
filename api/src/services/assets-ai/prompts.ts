// ============================================
// v6.2 Assets AI 批量处理 - Prompt 模板
// ============================================

// ============================================
// 1. 质量评估 Prompt
// ============================================
export interface AssetQualityPromptParams {
  title: string;
  content: string;
  source?: string;
  author?: string;
  publishedAt?: string;
  pageCount?: number;
  wordCount?: number;
  fileType?: string;
}

export function createAssetQualityPrompt(params: AssetQualityPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深的研报评审专家，拥有10年券商研究所质量控制经验。

评估维度与权重：
1. 完整性 (25%): 结构是否完整，是否包含摘要、目录、正文、结论、参考文献
2. 数据质量 (25%): 数据是否准确、来源是否标注、是否有数据表格和图表
3. 来源权威性 (20%): 发布机构资质、作者专业背景、机构知名度
4. 时效性 (15%): 报告发布时间、数据截止日期、是否反映最新情况
5. 可读性 (10%): 逻辑是否清晰、表达是否规范、专业术语使用是否得当
6. 实用性 (5%): 对投资决策/内容创作的参考价值、是否有 actionable insights

评分规则：
- 90-100: 卓越，顶级研报
- 80-89: 优秀，值得重点推荐
- 70-79: 良好，符合标准
- 60-69: 一般，需要优化
- <60: 较差，建议归档

输出必须是有效的 JSON 格式。`;

  const userPrompt = `请对以下研报/文档进行专业质量评估：

【文档信息】
标题: ${params.title}
来源: ${params.source || '未知'}
作者: ${params.author || '未知'}
发布时间: ${params.publishedAt || '未知'}
页数: ${params.pageCount || '未知'}
字数: ${params.wordCount || '未知'}
文件类型: ${params.fileType || '未知'}

【内容摘要】
${params.content.slice(0, 4000)}

【输出格式】
请严格按照以下 JSON 格式输出：

{
  "overall": 85,
  "dimensions": {
    "completeness": 88,
    "dataQuality": 90,
    "sourceAuthority": 85,
    "timeliness": 75,
    "readability": 82,
    "practicality": 80
  },
  "structure": {
    "hasAbstract": true,
    "hasTableOfContents": true,
    "hasCharts": true,
    "hasDataTables": true,
    "hasConclusion": true,
    "hasReferences": false,
    "pageCount": 32,
    "wordCount": 15000
  },
  "aiAssessment": {
    "summary": "这是一份高质量的深度研报...",
    "strengths": [
      "数据翔实，引用了多个权威数据源",
      "行业分析框架清晰，覆盖产业链各环节",
      "预测模型有详细的假设和推导过程"
    ],
    "weaknesses": [
      "部分章节略显冗长，可读性有待提升",
      "缺乏风险提示章节"
    ],
    "keyInsights": [
      "行业未来3年CAGR预计达25%",
      "头部企业市占率持续提升",
      "政策红利将在Q3集中释放"
    ],
    "dataHighlights": [
      "2024年市场规模达5000亿元",
      "渗透率从15%提升至35%"
    ],
    "recommendation": "highly_recommended",
    "confidence": 0.92
  }
}

注意：
- overall 分数是 6 个维度的加权平均
- strengths 和 weaknesses 最多各列 3 点
- keyInsights 最多 5 点
- dataHighlights 最多 5 点
- recommendation 只能是: highly_recommended(强烈推荐), recommended(推荐), normal(正常), archive(归档)
- confidence 表示 AI 对此评分的置信度 0-1`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 2. 主题分类 Prompt
// ============================================
export interface AssetClassificationPromptParams {
  title: string;
  content: string;
  abstract?: string;
  source?: string;
  keywords?: string[];
  themes: Array<{ id: string; name: string; parentId?: string }>;
}

export function createAssetClassificationPrompt(params: AssetClassificationPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深的财经内容分类专家，熟悉主题分类体系和 expert-library 领域映射。

分类原则：
1. 精准性：选择最核心、最相关的主题
2. 置信度：对分类结果给出 0-1 的置信度分数
3. 多标签：支持次要主题，但主主题只能有一个
4. 实体识别：提取文中的公司、人物、技术、产品等实体

输出必须是有效的 JSON 格式。`;

  const themesList = params.themes
    .map(t => `- ${t.id}: ${t.name}${t.parentId ? ` (父主题: ${t.parentId})` : ''}`)
    .join('\n');

  const userPrompt = `请将以下文档精准分类到现有主题：

【文档信息】
标题: ${params.title}
${params.abstract ? `摘要: ${params.abstract.slice(0, 500)}` : ''}
关键词: ${params.keywords?.join(', ') || '无'}
来源: ${params.source || '未知'}

【内容摘要】
${params.content.slice(0, 3000)}

【现有主题列表】
${themesList}

【分类要求】
1. 选择最匹配的主主题（必须来自上述列表）
2. 可选择 0-3 个次要主题
3. 给出详细的分类理由
4. 提取 5-10 个内容标签

【输出格式】
{
  "primaryTheme": {
    "themeId": "theme_005",
    "themeName": "人工智能",
    "confidence": 0.92,
    "reason": "文档主要讨论大模型技术发展和应用场景，属于人工智能核心领域"
  },
  "secondaryThemes": [
    { "themeId": "theme_021", "themeName": "TMT", "confidence": 0.65 },
    { "themeId": "theme_008", "themeName": "云计算", "confidence": 0.45 }
  ],
  "expertLibraryMapping": [
    { "domain": "人工智能", "confidence": 0.92, "mappedFrom": "人工智能" },
    { "domain": "TMT", "confidence": 0.65, "mappedFrom": "TMT" }
  ],
  "tags": [
    { "tag": "大模型", "confidence": 0.95, "type": "technology" },
    { "tag": "OpenAI", "confidence": 0.90, "type": "company" },
    { "tag": "商业化", "confidence": 0.85, "type": "concept" },
    { "tag": "B端", "confidence": 0.80, "type": "concept" },
    { "tag": "2025", "confidence": 1.0, "type": "time" }
  ],
  "entities": [
    { "name": "OpenAI", "type": "company", "mentions": 5 },
    { "name": "ChatGPT", "type": "product", "mentions": 3 }
  ]
}

注意：
- 主主题 themeId 必须来自上述列表
- 次要主题最多 3 个，置信度需 > 0.3
- 标签数量控制在 5-10 个
- type 可选: industry(行业), concept(概念), company(公司), person(人物), technology(技术), product(产品), time(时间), event(事件), other(其他)`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 3. 任务推荐 Prompt
// ============================================
export interface AssetTaskRecommendationPromptParams {
  title: string;
  content: string;
  source?: string;
  qualityScore: number;
  themeName: string;
  tags: string[];
  keyInsights: string[];
  dataHighlights: string[];
  hotTopics?: Array<{ title: string; score: number }>;
}

export function createAssetTaskRecommendationPrompt(params: AssetTaskRecommendationPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深的内容策划编辑，擅长发现优质素材并制定创作策略。

推荐原则：
1. 质量优先：高质量素材才值得深入创作
2. 差异化：提供独特的切入角度
3. 可落地：建议具体可执行
4. 素材复用：充分利用已有素材

内容形式选择：
- report(研报): 深度分析，3000字以上，适合高质量、复杂话题
- article(文章): 中等深度，1500-3000字，适合一般话题
- brief(简报): 快速解读，500-1500字，适合时效性强的内容
- infographic(信息图): 可视化展示，适合数据丰富的内容

输出必须是有效的 JSON 格式。`;

  const hotTopicsText = params.hotTopics?.length
    ? params.hotTopics.map(t => `- ${t.title} (热度: ${t.score})`).join('\n')
    : '无匹配热点';

  const userPrompt = `请基于以下文档内容，生成详细的创作建议：

【文档信息】
标题: ${params.title}
来源: ${params.source || '未知'}
质量评分: ${params.qualityScore}/100
主题分类: ${params.themeName}
关键标签: ${params.tags.join(', ')}

【文档核心内容】
核心洞察:
${params.keyInsights.map(i => `- ${i}`).join('\n')}

数据亮点:
${params.dataHighlights.map(d => `- ${d}`).join('\n')}

【当前热点话题】
${hotTopicsText}

【输出格式】
{
  "recommendation": {
    "title": "建议标题: 基于XX数据的行业深度分析",
    "format": "report",
    "priority": "high",
    "reason": "该研报质量高(88分)、数据翔实、与当前AI热点高度相关",
    
    "content": {
      "angle": "基于一手数据，分析AI商业化的关键拐点",
      "keyPoints": [
        "B端应用场景加速落地",
        "头部企业ROI开始为正",
        "垂直领域专用模型崛起"
      ],
      "dataHighlights": [
        "引用研报中的市场规模预测",
        "结合渗透率数据进行趋势分析"
      ],
      "targetAudience": "关注AI落地的投资人和企业决策者",
      "estimatedReadTime": 10,
      "suggestedLength": "4000-5000字深度研报"
    },
    
    "assetCombination": {
      "primaryAsset": {
        "assetId": "current_asset",
        "usage": "主要数据来源",
        "keySections": ["市场规模", "竞争格局", "趋势预测"]
      },
      "supportingAssets": []
    },
    
    "suggestedExperts": [
      {
        "role": "domain_expert",
        "domain": "人工智能",
        "reason": "需要AI领域专家验证技术趋势判断"
      }
    ],
    
    "timeline": {
      "suggestedPublishTime": "本周五上午10:00",
      "urgency": "this_week",
      "timeWindowReason": "研报数据具有时效性，建议本周内发布"
    }
  },
  
  "aiAssessment": {
    "confidence": 0.88,
    "expectedEngagement": 85,
    "expectedQuality": 82,
    "riskFactors": [
      "研报数据需要交叉验证",
      "需补充最新一周的市场动态"
    ]
  }
}

注意：
- format 只能是: report, article, brief, infographic
- priority 只能是: high, medium, low
- urgency 只能是: immediate, today, this_week, flexible
- role 只能是: fact_checker, logic_checker, domain_expert`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 4. 文档分块摘要 Prompt（用于向量化）
// ============================================
export interface DocumentChunkPromptParams {
  chunks: Array<{
    index: number;
    text: string;
    type: string;
  }>;
}

export function createDocumentChunkSummaryPrompt(params: DocumentChunkPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位专业的文档分析助手。请为文档的各个片段生成简洁的摘要，用于语义检索。

要求：
1. 每个片段摘要控制在 100-200 字
2. 保留关键数据、观点、结论
3. 使用原文语言
4. 标注片段类型（摘要、目录、正文、结论、图表）

输出必须是有效的 JSON 格式。`;

  const chunksText = params.chunks
    .map(c => `[片段 ${c.index}] 类型: ${c.type}\n${c.text.slice(0, 800)}`)
    .join('\n---\n');

  const userPrompt = `请为以下文档片段生成摘要：

${chunksText}

【输出格式】
{
  "summaries": [
    {
      "index": 0,
      "type": "abstract",
      "summary": "该片段是文档摘要，主要介绍了...",
      "keywords": ["关键词1", "关键词2"]
    },
    ...
  ]
}

注意：
- 每个片段必须有对应的摘要
- keywords 提取 3-5 个关键词`;

  return { systemPrompt, userPrompt };
}

// ============================================
// Prompt 模板管理器
// ============================================
export class AssetPromptManager {
  createQualityPrompt(params: AssetQualityPromptParams) {
    return createAssetQualityPrompt(params);
  }

  createClassificationPrompt(params: AssetClassificationPromptParams) {
    return createAssetClassificationPrompt(params);
  }

  createTaskRecommendationPrompt(params: AssetTaskRecommendationPromptParams) {
    return createAssetTaskRecommendationPrompt(params);
  }

  createChunkSummaryPrompt(params: DocumentChunkPromptParams) {
    return createDocumentChunkSummaryPrompt(params);
  }
}

export const assetPromptManager = new AssetPromptManager();
