// AI Prompt 模板系统 v2 - 优化版
// v6.1 Phase 5: 添加 Few-shot 示例、Chain-of-Thought、输出格式约束

import { RSSItem } from '../rssCollector.js';

// ============================================
// Few-shot 示例库
// ============================================

const QUALITY_EXAMPLES = `
【示例1 - 高质量文章】
标题: OpenAI发布GPT-4o：多模态大模型迎来重大突破，实时交互能力显著提升
来源: MIT Technology Review
分析: 
- 内容丰富度(95): 详细的技术架构解析、性能对比数据、应用场景说明
- 来源可信度(95): MIT Technology Review 是权威科技媒体
- 时效性(90): 发布于产品发布当天
- 独特性(85): 提供了独家的技术解读
- 可读性(90): 结构清晰，语言专业但易懂
- 数据支撑(88): 包含基准测试数据、用户反馈统计
综合评分: 91
推荐: promote

【示例2 - 低质量文章】
标题: 震惊！AI要取代人类了！！！
来源: 未知自媒体
分析:
- 内容丰富度(25): 仅有情绪化表达，缺乏实质内容
- 来源可信度(15): 来源不明，无专业背景
- 时效性(40): 内容老旧，反复炒作
- 独特性(20): 陈词滥调，无新观点
- 可读性(30): 标题党，内容空洞
- 数据支撑(10): 无任何数据支撑
综合评分: 23
推荐: filter
`;

const CATEGORY_EXAMPLES = `
【示例1 - 人工智能分类】
标题: Google DeepMind发布AlphaFold 3，蛋白质结构预测精度再提升
分类: 人工智能 (置信度: 0.95)
理由: 文章核心讨论AI模型在生物科学领域的应用
次要分类: 生物医药 (置信度: 0.72)
标签: [AI, DeepMind, AlphaFold, 蛋白质预测, 生物信息学]
实体: [Google DeepMind(公司), AlphaFold 3(产品), Demis Hassabis(人物)]

【示例2 - 金融科技分类】
标题: 央行数字货币试点扩大，深圳发放5000万数字人民币红包
分类: 金融科技 (置信度: 0.92)
理由: 核心讨论央行数字货币(DC/EP)的政策和应用
次要分类: 政策 (置信度: 0.65)
标签: [数字货币, 央行, 深圳, 红包, 试点]
实体: [中国人民银行(机构), 深圳(地区)]
`;

const SENTIMENT_EXAMPLES = `
【示例1 - 积极情感】
标题: Tesla Q3财报超预期，电动车交付量创新高，股价盘后大涨8%
整体情感: positive (分数: +78)
市场情绪: +75 (投资者对电动车行业信心增强)
政策态度: +60 (新能源车政策环境友好)
行业前景: +85 (电动车市场持续增长)
投资情绪: +80 (看好Tesla及电动车板块)
风险等级: low
关键观点:
1. "交付量创新高" - positive (新产品策略奏效)
2. "毛利率提升" - positive (规模效应显现)
3. "全年目标可期" - positive (管理层信心充足)

【示例2 - 消极情感】
标题: 某房企债务违约风险上升，监管部门约谈，股价连续跌停
整体情感: negative (分数: -72)
市场情绪: -65 (房地产板块承压)
政策态度: -45 (监管趋严)
行业前景: -55 (行业调整期)
投资情绪: -70 (避险情绪升温)
风险等级: high
关键观点:
1. "债务违约风险" - negative (流动性紧张)
2. "监管约谈" - negative (合规压力加大)
3. "股价跌停" - negative (投资者信心受挫)
`;

// ============================================
// 1. 质量评估 Prompt v2
// ============================================

export interface QualityPromptParams {
  title: string;
  content: string;
  source: string;
  publishedAt: string;
  wordCount: number;
}

export function createQualityPromptV2(params: QualityPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深内容审核编辑，拥有10年财经/科技内容审核经验。

【评估维度与权重】
1. 内容丰富度 (25%): 信息量、深度、完整性、观点数量
2. 来源可信度 (20%): 媒体权威性、作者专业性、历史表现
3. 时效性 (20%): 发布及时性、信息新鲜度、当前价值
4. 独特性 (15%): 观点新颖性、差异化价值、原创程度
5. 可读性 (15%): 结构清晰度、语言流畅度、逻辑性
6. 数据支撑 (5%): 数据/图表/案例的丰富程度

【评分标准】
- 90-100: 卓越，行业顶级内容，必须重点推荐
- 80-89: 优秀，值得重点跟进和推荐
- 70-79: 良好，符合发布标准，可以正常使用
- 60-69: 一般，有使用价值但需要优化
- 50-59: 较差，建议使用价值有限
- <50: 不合格，建议过滤

【Few-shot示例】
${QUALITY_EXAMPLES}

【输出要求】
- 严格按照JSON格式输出
- 每个维度分数必须0-100整数
- overall分数是6个维度的加权平均（权重如上）
- strengths和weaknesses最多各3点，具体明确
- recommendation只能是: promote/normal/demote/filter`;

  const userPrompt = `请对以下文章进行质量评估：

【文章信息】
标题: ${params.title}
来源: ${params.source}
发布时间: ${params.publishedAt}
字数: ${params.wordCount}

【内容摘要】
${params.content.slice(0, 3000)}

【分析步骤】
1. 先通读全文，理解文章主旨和结构
2. 逐维度评估，记录关键证据
3. 计算综合评分
4. 生成质量总结和改进建议

【输出格式】
\`\`\`json
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
    "summary": "这是一篇高质量的深度分析文章，数据翔实，观点独到，但时效性略有不足",
    "strengths": [
      "数据翔实，引用了多个权威数据源支撑观点",
      "分析框架清晰，逻辑严密，论证充分",
      "观点独到，对行业趋势有深度洞察"
    ],
    "weaknesses": [
      "部分段落略显冗长，可读性有待提升",
      "时效性一般，部分内容已有更最新进展"
    ],
    "recommendation": "promote",
    "confidence": 0.92
  }
}
\`\`\``;

  return { systemPrompt, userPrompt };
}

// ============================================
// 2. 领域分类 Prompt v2
// ============================================

const DOMAIN_DEFINITIONS = `
【领域定义】
1. 房地产: 房产市场、住宅开发、商业地产、物业管理、REITs、保租房
2. 保租房: 保障性租赁住房、公租房、长租市场、住房租赁政策
3. 金融科技: 数字支付、区块链、智能投顾、数字货币、监管科技
4. 新能源: 电动汽车、锂电池、光伏、风电、储能、氢能
5. 人工智能: 大模型、机器学习、计算机视觉、NLP、AI芯片
6. 半导体: 芯片设计、晶圆制造、EDA、GPU、存储芯片
7. 生物医药: 创新药、医疗器械、基因治疗、CXO、疫苗
8. 消费品: 新零售、品牌营销、电商、新消费、奢侈品
9. TMT: 互联网、SaaS、云计算、5G、物联网、软件
10. 政策: 监管政策、行业法规、政府文件、指导意见
11. 资本市场: IPO、并购重组、证券投资、基金、二级市场
12. 宏观经济: GDP、通胀、利率、汇率、经济周期、货币政策
13. 高端制造: 工业机器人、航空航天、精密仪器、自动化
14. 交运物流: 快递、供应链、航运、物流科技、港口
15. 环保: ESG、碳中和、清洁能源、污染治理、可持续发展
`;

export interface CategoryPromptParams {
  title: string;
  content: string;
  source: string;
  existingTags?: string[];
}

export function createCategoryPromptV2(params: CategoryPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位资深的财经科技内容分类专家，熟悉 expert-library 领域分类体系。

${DOMAIN_DEFINITIONS}

【分类原则】
1. 精准性: 选择最核心、最相关的单一主分类
2. 置信度: 给出0-1之间的置信度分数，>0.8为高置信度
3. 多标签: 支持最多3个次要分类，每个需>0.3置信度
4. 标签提取: 提取5-10个关键词，包括行业、技术、公司、概念
5. 实体识别: 识别文中提及的公司、人物、产品、技术

【Few-shot示例】
${CATEGORY_EXAMPLES}

【输出要求】
- 主分类必须是上面列出的15个领域之一
- 置信度分数范围0-1
- 标签type只能是: industry, concept, company, person, technology, product, time, event, other`;

  const userPrompt = `请将以下文章精准分类：

【文章信息】
标题: ${params.title}
来源: ${params.source}
${params.existingTags?.length ? `已有标签: ${params.existingTags.join(', ')}` : ''}

【内容摘要】
${params.content.slice(0, 3000)}

【分类步骤】
1. 分析标题和核心内容主题
2. 匹配最合适的领域定义
3. 识别相关次要领域
4. 提取关键词和实体
5. 评估分类置信度

【输出格式】
\`\`\`json
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
    { "tag": "ChatGPT", "confidence": 0.88, "type": "product" },
    { "tag": "2025", "confidence": 1.0, "type": "time" },
    { "tag": "商业化", "confidence": 0.75, "type": "concept" }
  ],
  "entities": [
    { "name": "OpenAI", "type": "company", "mentions": 5 },
    { "name": "ChatGPT", "type": "product", "mentions": 3 },
    { "name": "Sam Altman", "type": "person", "mentions": 2 }
  ],
  "expertLibraryMatch": {
    "matchedDomains": ["人工智能", "TMT"],
    "suggestedExperts": ["domain_expert", "fact_checker"],
    "confidence": 0.88
  }
}
\`\``;

  return { systemPrompt, userPrompt };
}

// ============================================
// 3. 情感分析 Prompt v2
// ============================================

export interface SentimentPromptParams {
  title: string;
  content: string;
  source: string;
}

export function createSentimentPromptV2(params: SentimentPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一位专业的市场情绪分析师，擅长从财经科技内容中提取情感倾向和关键观点。

【分析维度】
1. 整体情感: 基于全文基调、用词倾向、结论态度 (-100到+100)
2. 市场情绪: 对整体市场的态度 (-100到+100)
3. 政策态度: 对监管/政策的评价 (-100到+100)
4. 行业前景: 对行业发展的判断 (-100到+100)
5. 投资情绪: 对投资价值的看法 (-100到+100)
6. 风险等级: low/medium/high

【情感分数标准】
- +80~+100: 非常积极，强烈推荐
- +50~+79: 积极，看好
- +20~+49: 轻微积极
- -19~+19: 中性，客观
- -49~-20: 轻微消极
- -79~-50: 消极，看空
- -100~-80: 非常消极，强烈看空

【Few-shot示例】
${SENTIMENT_EXAMPLES}

【关键观点提取】
- 识别文中的核心观点和论断
- 标注每个观点的情感倾向
- 提供原文上下文作为证据
- 评估观点的置信度`;

  const userPrompt = `请分析以下文章的情感特征：

【文章信息】
标题: ${params.title}
来源: ${params.source}

【内容】
${params.content.slice(0, 4000)}

【分析步骤】
1. 通读全文，识别情感基调
2. 逐维度评估情感分数
3. 提取关键观点及其情感
4. 识别机会点、风险、不确定因素
5. 评估整体立场(intensity/stance)

【输出格式】
\`\`\`json
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
      "context": "根据文章第三段：'随着大模型技术成熟，AI应用正在从实验室走向产业化...'"
    },
    {
      "opinion": "监管政策仍存在不确定性",
      "sentiment": "negative",
      "confidence": 0.72,
      "context": "文章提到：'值得注意的是，AI监管的靴子尚未完全落地...'"
    }
  ],
  "keyElements": {
    "opportunities": [
      "大模型应用场景持续扩展",
      "企业数字化转型需求旺盛",
      "云端AI服务市场快速增长"
    ],
    "risks": [
      "监管政策不确定性",
      "技术迭代可能导致现有方案过时",
      "国际竞争加剧"
    ],
    "uncertainties": [
      "大模型商业化路径尚不清晰",
      "国际竞争格局变化"
    ],
    "catalysts": [
      "Q3业绩发布",
      "重要行业会议即将召开",
      "新产品发布"
    ]
  },
  "intensity": "moderate",
  "stance": "bullish"
}
\`\``;

  return { systemPrompt, userPrompt };
}

// ============================================
// Prompt 版本管理
// ============================================

export class PromptVersionManager {
  private static versions: Map<string, { version: number; factory: Function }> = new Map();

  static register(name: string, version: number, factory: Function): void {
    const current = this.versions.get(name);
    if (!current || current.version < version) {
      this.versions.set(name, { version, factory });
    }
  }

  static get(name: string, targetVersion?: number): Function | undefined {
    const current = this.versions.get(name);
    if (!current) return undefined;
    if (targetVersion && current.version !== targetVersion) return undefined;
    return current.factory;
  }

  static getLatestVersion(name: string): number {
    return this.versions.get(name)?.version || 1;
  }
}

// 注册 v2 版本的 prompts
PromptVersionManager.register('quality', 2, createQualityPromptV2);
PromptVersionManager.register('category', 2, createCategoryPromptV2);
PromptVersionManager.register('sentiment', 2, createSentimentPromptV2);
