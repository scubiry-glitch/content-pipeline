// AI Prompt 模板系统
// v6.1 RSS 内容智能分析 Prompt 模板

import { RSSItem } from '../rssCollector.js';

// ============================================
// 1. 质量评估 Prompt
// ============================================

export interface QualityPromptParams {
  title: string;
  content: string;
  source: string;
  publishedAt: string;
  wordCount: number;
}

export function createQualityPrompt(params: QualityPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深内容审核编辑，拥有10年财经/科技内容审核经验。

评估标准：
1. 内容丰富度 (25%): 信息是否充实、有深度、覆盖全面
2. 来源可信度 (20%): 发布来源的权威性、专业度
3. 时效性 (20%): 内容是否及时、信息是否最新
4. 独特性 (15%): 观点是否新颖、有差异化价值
5. 可读性 (15%): 结构是否清晰、语言是否流畅
6. 数据支撑 (5%): 是否有数据、案例、图表支撑

评分规则：
- 90-100: 卓越，行业顶级内容
- 80-89: 优秀，值得重点推荐
- 70-79: 良好，符合发布标准
- 60-69: 一般，需要优化
- 50-59: 较差，建议大幅修改
- <50: 不合格，建议过滤

输出必须是有效的 JSON 格式。`;

  const userPrompt = `请对以下文章进行质量评估：

【文章信息】
标题: ${params.title}
来源: ${params.source}
发布时间: ${params.publishedAt}
字数: ${params.wordCount}

【内容摘要】
${params.content.slice(0, 3000)}

【输出要求】
请严格按照以下 JSON 格式输出：

{
  "overall": 85,
  "dimensions": {
    "contentRichness": 88,
    "sourceCredibility": 90,
    "timeliness": 75,
    "uniqueness": 82,
    "readability": 85,
    "dataSupport": 70
  },
  "aiAssessment": {
    "summary": "质量总结（100字以内）",
    "strengths": ["优点1", "优点2", "优点3"],
    "weaknesses": ["不足1", "不足2"],
    "recommendation": "promote",
    "confidence": 0.92
  }
}

注意：
- overall 分数是 6 个维度的加权平均
- strengths 和 weaknesses 最多各列 3 点，每点 30 字以内
- recommendation 只能是: promote(重点推荐), normal(正常), demote(降权), filter(过滤)
- confidence 表示 AI 对此评分的置信度 0-1
- 务必确保输出完整、有效的 JSON，不要截断`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 2. 领域分类 Prompt
// ============================================

export interface CategoryPromptParams {
  title: string;
  content: string;
  source: string;
  existingTags?: string[];
}

const DOMAIN_CATEGORIES = [
  { code: 'real_estate', name: '房地产', keywords: ['房地产', '房产', '住房', '住宅', '楼宇', '物业', 'REITs', 'reits', '保租房'] },
  { code: 'rental_housing', name: '保租房', keywords: ['保租房', '保障性租赁住房', '租赁住房', '公租房', '保障房', '长租'] },
  { code: 'fintech', name: '金融科技', keywords: ['金融科技', '智能理财', '财富管理', '数字化', '科技金融', '区块链', '支付'] },
  { code: 'new_energy', name: '新能源', keywords: ['新能源', '电池', '储能', '锂电', '光伏', '风电', '电动汽车', '充电桩', '能源'] },
  { code: 'ai', name: '人工智能', keywords: ['人工智能', 'AI', '大模型', '机器学习', '深度学习', '算法', '智能', 'GPT', 'AIGC'] },
  { code: 'semiconductor', name: '半导体', keywords: ['半导体', '芯片', '集成电路', '晶圆', '制程', '光刻', 'EDA', 'GPU'] },
  { code: 'biotech', name: '生物医药', keywords: ['生物医药', '医药', '医疗', '器械', '药品', '疫苗', '基因', 'CRO'] },
  { code: 'consumer', name: '消费品', keywords: ['消费品', '零售', '品牌', '营销', '渠道', '电商', '新消费'] },
  { code: 'tmt', name: 'TMT', keywords: ['TMT', '互联网', '软件', 'SaaS', '云计算', '大数据', '5G', '物联网'] },
  { code: 'policy', name: '政策', keywords: ['政策', '监管', '法规', '意见', '通知', '办法', '规范'] },
  { code: 'capital_market', name: '资本市场', keywords: ['资本', '证券', '上市', 'IPO', '股市', '基金', '投资', '融资'] },
  { code: 'macro', name: '宏观经济', keywords: ['宏观', '经济', 'GDP', '增长', '周期', '通胀', '利率', '汇率'] },
  { code: 'manufacturing', name: '高端制造', keywords: ['制造', '工业', '机器人', '自动化', '航空航天', '军工'] },
  { code: 'logistics', name: '交运物流', keywords: ['交运', '物流', '供应链', '航运', '快递', '港口'] },
  { code: 'esg', name: '环保', keywords: ['环保', 'ESG', '碳中和', '绿色', '污染治理'] },
];

export function createCategoryPrompt(params: CategoryPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深的财经科技内容分类专家，熟悉 expert-library 领域分类体系。

分类原则：
1. 精准性：选择最核心、最相关的领域
2. 置信度：对分类结果给出 0-1 的置信度分数
3. 多标签：支持次要分类，但主分类只能有一个
4. 实体识别：提取文中的公司、人物、技术、产品等实体

领域定义：
${DOMAIN_CATEGORIES.map(c => `- ${c.name}: ${c.keywords.slice(0, 5).join('、')}等`).join('\n')}

输出必须是有效的 JSON 格式。`;

  const userPrompt = `请将以下文章精准分类：

【文章信息】
标题: ${params.title}
来源: ${params.source}
${params.existingTags?.length ? `已有标签: ${params.existingTags.join(', ')}` : ''}

【内容摘要】
${params.content.slice(0, 3000)}

【输出要求】
请输出 JSON 格式：

{
  "primaryCategory": {
    "domain": "人工智能",
    "confidence": 0.92,
    "reason": "文章主要讨论大模型技术发展和应用场景，属于人工智能核心领域"
  },
  "secondaryCategories": [
    { "domain": "TMT", "confidence": 0.65 },
    { "domain": "资本市场", "confidence": 0.45 }
  ],
  "tags": [
    { "tag": "大模型", "confidence": 0.95, "type": "technology" },
    { "tag": "OpenAI", "confidence": 0.90, "type": "company" },
    { "tag": "2025", "confidence": 1.0, "type": "time" }
  ],
  "entities": [
    { "name": "OpenAI", "type": "company", "mentions": 5 },
    { "name": "ChatGPT", "type": "product", "mentions": 3 }
  ],
  "expertLibraryMatch": {
    "matchedDomains": ["人工智能", "TMT"],
    "suggestedExperts": ["domain_expert", "fact_checker"],
    "confidence": 0.88
  }
}

注意：
- 主分类 domain 必须是上面列出的 15 个领域之一
- 次要分类最多 3 个，置信度需 > 0.3
- 标签数量控制在 5-10 个
- type 可选: industry(行业), concept(概念), company(公司), person(人物), technology(技术), product(产品), time(时间), event(事件), other(其他)`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 3. 情感分析 Prompt
// ============================================

export interface SentimentPromptParams {
  title: string;
  content: string;
  source: string;
}

export function createSentimentPrompt(params: SentimentPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位专业的市场情绪分析师，擅长从财经科技内容中提取情感倾向和关键观点。

分析维度：
1. 整体情感：基于全文基调、用词倾向、结论态度综合判断
2. 市场情绪：对整体市场的态度
3. 政策态度：对监管/政策的评价
4. 行业前景：对行业发展的判断
5. 投资情绪：对投资价值的看法
6. 风险等级：内容中提示的风险程度

评分规则（-100 到 +100）：
- +80~+100: 非常积极，强烈推荐
- +50~+79: 积极，看好
- +20~+49: 轻微积极
- -19~+19: 中性，客观
- -49~-20: 轻微消极
- -79~-50: 消极，看空
- -100~-80: 非常消极，强烈看空

输出必须是有效的 JSON 格式。`;

  const userPrompt = `请分析以下文章的情感特征：

【文章信息】
标题: ${params.title}
来源: ${params.source}

【内容】
${params.content.slice(0, 4000)}

【输出要求】
{
  "overall": "positive",
  "score": 75,
  "dimensions": {
    "marketSentiment": 60,
    "policySentiment": 80,
    "industryOutlook": 70,
    "investmentSentiment": 65,
    "riskLevel": "medium"
  },
  "keyOpinions": [
    {
      "opinion": "AI行业将迎来新一轮增长周期",
      "sentiment": "positive",
      "confidence": 0.85,
      "context": "根据文章第三段..."
    }
  ],
  "keyElements": {
    "opportunities": ["机会点1", "机会点2"],
    "risks": ["风险1", "风险2"],
    "uncertainties": ["不确定因素"],
    "catalysts": ["催化因素"]
  },
  "intensity": "moderate",
  "stance": "bullish"
}

注意：
- overall 只能是: positive, neutral, negative, mixed
- riskLevel 只能是: low, medium, high
- intensity 只能是: strong, moderate, weak
- stance 只能是: bullish(看多), bearish(看空), neutral(中性), mixed(混合)`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 4. 任务推荐 Prompt
// ============================================

export interface TaskRecommendationPromptParams {
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  qualityScore: number;
  category: string;
  sentiment: string;
  sentimentScore: number;
  tags: string[];
}

export function createTaskRecommendationPrompt(params: TaskRecommendationPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深的内容策划编辑，擅长发现优质选题并制定创作策略。

推荐原则：
1. 质量优先：高质量内容才值得深入创作
2. 时效敏感：热点内容需要快速跟进
3. 差异化：提供独特的切入角度
4. 可落地：建议具体可执行

内容形式选择：
- report(研报): 深度分析，3000字以上，适合高质量、复杂话题
- article(文章): 中等深度，1500-3000字，适合一般话题
- brief(简报): 快速解读，500-1500字，适合时效性强的内容
- thread(社交媒体): 多段落，适合传播性强的话题

输出必须是有效的 JSON 格式。`;

  const userPrompt = `请基于以下内容生成创作建议：

【文章信息】
标题: ${params.title}
摘要: ${params.summary}
来源: ${params.source}
发布时间: ${params.publishedAt}

【AI 分析结果】
质量评分: ${params.qualityScore}/100
领域分类: ${params.category}
情感分析: ${params.sentiment} (得分: ${params.sentimentScore})
关键标签: ${params.tags.join(', ')}

【输出要求】
{
  "recommendation": {
    "title": "建议标题: AI大模型商业化进入深水区，B端应用迎来爆发拐点",
    "format": "report",
    "priority": "high",
    "reason": "该话题质量高(88分)、时效性强(今日发布)、属于热门领域(AI)，建议立即跟进",
    
    "content": {
      "angle": "从B端企业落地案例切入，分析大模型商业化路径",
      "keyPoints": [
        "大模型B端应用已进入规模化落地阶段",
        "头部企业案例显示ROI开始为正",
        "垂直领域专用模型成为新趋势"
      ],
      "targetAudience": "关注AI落地的投资人和企业决策者",
      "estimatedReadTime": 8,
      "suggestedLength": "3000-4000字深度分析"
    },
    
    "differentiation": {
      "uniqueAngle": "聚焦B端落地案例而非技术参数",
      "contentGap": ["市场上缺乏B端ROI数据", "较少分析垂直领域专用模型"],
      "competitiveAdvantage": "结合一手案例数据，提供差异化洞察"
    },
    
    "suggestedAssets": [
      {
        "assetId": "source-rss-item",
        "relevanceScore": 0.95,
        "usageSuggestion": "作为主要素材，提取关键数据和观点"
      }
    ],
    
    "suggestedExperts": [
      {
        "role": "domain_expert",
        "domain": "人工智能",
        "reason": "需要AI领域专家验证技术趋势判断"
      },
      {
        "role": "fact_checker",
        "domain": "通用",
        "reason": "需要验证数据来源和案例真实性"
      }
    ],
    
    "timeline": {
      "suggestedPublishTime": "明日上午10:00",
      "urgency": "today",
      "timeWindowReason": "话题热度在48小时内最高，建议今日发布抢占先机"
    }
  },
  
  "aiAssessment": {
    "confidence": 0.88,
    "expectedEngagement": 85,
    "expectedQuality": 82,
    "riskFactors": ["数据来源单一，需要交叉验证", "时效性窗口较短"]
  }
}

注意：
- format 只能是: report, article, brief, thread
- priority 只能是: high, medium, low
- urgency 只能是: immediate, today, this_week, flexible
- role 只能是: fact_checker, logic_checker, domain_expert, reader_rep`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 5. 批处理合并 Prompt（节省 Token）
// ============================================

export interface BatchQualityPromptParams {
  items: Array<{
    index: number;
    title: string;
    content: string;
    source: string;
    wordCount: number;
  }>;
}

export function createBatchQualityPrompt(params: BatchQualityPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深内容审核编辑。请批量评估以下文章的质量。

评估维度（每项0-100分）：
- contentRichness: 内容丰富度
- sourceCredibility: 来源可信度
- timeliness: 时效性
- uniqueness: 独特性
- readability: 可读性
- dataSupport: 数据支撑

综合分 overall 是以上6项的加权平均（权重：25%, 20%, 20%, 15%, 15%, 5%）。

输出必须是有效的 JSON 格式。`;

  const itemsText = params.items.map(item => `
[文章 ${item.index}]
标题: ${item.title}
来源: ${item.source}
字数: ${item.wordCount}
摘要: ${item.content.slice(0, 1500)}
`).join('\n---\n');

  const userPrompt = `请对以下 ${params.items.length} 篇文章进行质量评估：

${itemsText}

【输出要求】
为每篇文章输出独立结果，格式如下：

{
  "results": [
    {
      "index": 1,
      "overall": 85,
      "dimensions": {
        "contentRichness": 88,
        "sourceCredibility": 90,
        "timeliness": 75,
        "uniqueness": 82,
        "readability": 85,
        "dataSupport": 70
      },
      "aiAssessment": {
        "summary": "质量总结",
        "strengths": ["优点1"],
        "weaknesses": ["不足1"],
        "recommendation": "promote",
        "confidence": 0.92
      }
    },
    ...
  ]
}

注意：
- 每篇文章必须有 index 对应输入顺序
- strengths/weaknesses 最多各3点
- recommendation: promote/normal/demote/filter`;

  return { systemPrompt, userPrompt };
}

// ============================================
// 6. Prompt 模板管理器
// ============================================

export class PromptTemplateManager {
  private templates: Map<string, Function> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    this.templates.set('quality', createQualityPrompt);
    this.templates.set('category', createCategoryPrompt);
    this.templates.set('sentiment', createSentimentPrompt);
    this.templates.set('taskRecommendation', createTaskRecommendationPrompt);
    this.templates.set('batchQuality', createBatchQualityPrompt);
  }

  getTemplate(name: string): Function | undefined {
    return this.templates.get(name);
  }

  registerTemplate(name: string, templateFn: Function): void {
    this.templates.set(name, templateFn);
  }

  createPrompt(name: string, params: any): { systemPrompt: string; userPrompt: string } {
    const templateFn = this.templates.get(name);
    if (!templateFn) {
      throw new Error(`Template not found: ${name}`);
    }
    return templateFn(params);
  }

  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }
}

// 导出单例
export const promptManager = new PromptTemplateManager();

// 导出领域分类定义
export { DOMAIN_CATEGORIES };
