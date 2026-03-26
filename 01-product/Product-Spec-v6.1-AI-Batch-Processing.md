# 产品需求文档: AI 批量处理 - RSS 内容智能分析 v6.1

**版本**: v6.1  
**日期**: 2026-03-27  
**状态**: 📝 需求文档  
**负责人**: 产品研发运营协作体系  
**依赖**: v6.0 Hot-Topics 与 Assets 联动  
**优先级**: P0  

---

## 1. 文档概述

### 1.1 背景

当前 RSS 内容采集系统每日自动抓取大量文章，但存在以下问题：

1. **质量参差不齐**：缺乏自动化质量评估，低质量内容占用存储和注意力
2. **分类混乱**：仅依赖简单的关键词匹配，无法精准归类到 expert-library 领域体系
3. **情感分析粗糙**：当前基于情感词库的规则方法，无法识别复杂语境和隐含情感
4. **人工筛选成本高**：编辑需要逐篇阅读才能确定是否值得跟进，效率低下

### 1.2 目标

构建 AI 驱动的批量处理流水线，实现 RSS 内容的：
- **智能质量评估**：多维度质量打分，自动过滤低质量内容
- **精准领域分类**：对标 expert-library 分类体系，自动匹配领域标签
- **深度情感分析**：细粒度情感识别，提取关键观点和风险点
- **任务智能推荐**：基于热点+质量+分类自动生成创作建议

### 1.3 成功标准

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 质量评估准确率 | 人工判断 | > 85% AI 与人工一致 | 抽样对比 |
| 分类准确率 | 关键词匹配 ~60% | > 80% 领域匹配准确 | 专家标注验证 |
| 情感分析准确率 | 规则方法 ~65% | > 82% 情感识别准确 | 标注数据集测试 |
| 任务推荐采纳率 | 无 | > 30% 推荐被采纳 | 推荐点击转化 |
| 编辑筛选效率 | 5-10 min/篇 | < 1 min/篇 | 平均处理时间 |

---

## 2. 产品架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           RSS 采集层 (RSS Collector)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  RSS Feed → parseRSSItem() → RSSItem { title, content, source, publishedAt }   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        AI 批量处理层 (AI Batch Processor)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Batch Processor Controller                           │  │
│  │                   (调度器：控制批量大小、并发、优先级)                      │  │
│  └──────┬─────────────┬─────────────┬─────────────┬──────────────────────────┘  │
│         │             │             │             │                             │
│         ▼             ▼             ▼             ▼                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐  │
│  │  质量评估    │ │  领域分类    │ │  情感分析    │ │      任务推荐生成器        │  │
│  │  Processor  │ │  Processor  │ │  Processor  │ │      Task Recommender   │  │
│  │             │ │             │ │             │ │                         │  │
│  │ • 内容丰富度 │ │ • 领域匹配   │ │ • 整体情感   │ │ • 内容形式建议           │  │
│  │ • 来源可信   │ │ • 标签提取   │ │ • 市场情绪   │ │ • 切入角度推荐           │  │
│  │ • 时效评估   │ │ • 置信度     │ │ • 观点提取   │ │ • 目标读者分析           │  │
│  │ • 独特性     │ │             │ │ • 风险识别   │ │ • 差异化建议             │  │
│  │ • 可读性     │ │             │ │             │ │ • 专家匹配               │  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └───────────┬─────────────┘  │
│         │             │             │             │                             │
│         └─────────────┴─────────────┴─────────────┘                             │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      AI Analysis Results 聚合                             │  │
│  │                                                                             │  │
│  │   { qualityScore, category, tags, sentiment, taskRecommendations }       │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           数据持久层 (Data Persistence)                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  rss_items (更新)                    assets (增强)                              │
│  ├── ai_quality_score                ├── quality_score (AI评估)                │
│  ├── ai_quality_dimensions           ├── ai_category                           │
│  ├── ai_category                     ├── ai_tags                               │
│  ├── ai_tags                         ├── ai_sentiment                         │
│  ├── ai_sentiment                    ├── ai_task_recommendations              │
│  ├── ai_key_points                   └── ai_analyzed_at                        │
│  ├── ai_risks                                                                   │
│  ├── ai_opportunities                                                           │
│  ├── ai_task_recommendations                                                    │
│  └── ai_analyzed_at                                                             │
│                                                                                 │
│  rss_item_ai_analysis (新表)                                                    │
│  ├── rss_item_id, quality_score, quality_dimensions                             │
│  ├── primary_category, secondary_categories                                     │
│  ├── sentiment_score, sentiment_dimensions, key_points                          │
│  └── task_recommendations                                                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 处理流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          AI 批量处理流程                                      │
└──────────────────────────────────────────────────────────────────────────────┘

Step 1: 批次准备
├── 查询待处理的 RSS items (ai_analyzed_at IS NULL)
├── 按优先级排序 (hot_score DESC, published_at DESC)
└── 分批处理 (默认每批 10-20 篇)

Step 2: 并行 AI 处理
├── Batch Quality Analysis (批量质量评估)
│   └── LLM Prompt: "评估以下 {n} 篇文章的质量..."
├── Batch Category Classification (批量分类)
│   └── LLM Prompt: "将以下文章分类到 expert-library 领域..."
├── Batch Sentiment Analysis (批量情感分析)
│   └── LLM Prompt: "分析以下文章的情感倾向和关键观点..."
└── Batch Task Recommendation (批量任务推荐)
    └── LLM Prompt: "基于以下内容生成创作建议..."

Step 3: 结果解析与验证
├── 解析 LLM JSON 输出
├── 数据校验 (分数范围、必填字段)
└── 异常处理 (重试或标记人工审核)

Step 4: 数据持久化
├── 更新 rss_items 表
├── 插入 rss_item_ai_analysis 表
├── 同步到 assets 表 (如果已导入)
└── 触发下游任务 (如：高质量内容自动推荐)

Step 5: 后续处理
├── 低质量内容标记 (is_low_quality = true)
├── 高质量内容进入热门候选池
└── 任务推荐推送到编辑工作台
```

---

## 3. 功能规格

### 3.1 文章质量打分 (FR-6.1-001)

#### 3.1.1 评估维度

| 维度 | 权重 | 说明 | 评分标准 |
|------|------|------|----------|
| 内容丰富度 | 25% | 信息量、深度、完整性 | 0-100，基于字数、信息密度 |
| 来源可信度 | 20% | 发布来源的权威性 | 0-100，复用 source_authority 表 |
| 时效性 | 20% | 内容的及时性 | 0-100，基于发布时间衰减 |
| 独特性 | 15% | 观点新颖程度 | 0-100，基于与已有内容相似度 |
| 可读性 | 15% | 语言流畅、结构清晰 | 0-100，基于段落结构和语言质量 |
| 数据支撑 | 5% | 是否有数据、图表支撑 | 0-100，检测数据点数量 |

#### 3.1.2 综合质量分计算

```typescript
interface QualityScore {
  overall: number;        // 综合得分 0-100
  
  dimensions: {
    contentRichness: number;    // 内容丰富度
    sourceCredibility: number;  // 来源可信度
    timeliness: number;         // 时效性
    uniqueness: number;         // 独特性
    readability: number;        // 可读性
    dataSupport: number;        // 数据支撑
  };
  
  // AI 评估详情
  aiAssessment: {
    summary: string;            // 质量总结
    strengths: string[];        // 优点 (最多3点)
    weaknesses: string[];       // 不足 (最多3点)
    recommendation: 'promote' | 'normal' | 'demote' | 'filter';
    confidence: number;         // AI 置信度 0-1
  };
}

function calculateQualityScore(dimensions: QualityDimensions): number {
  const weights = {
    contentRichness: 0.25,
    sourceCredibility: 0.20,
    timeliness: 0.20,
    uniqueness: 0.15,
    readability: 0.15,
    dataSupport: 0.05,
  };
  
  return Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + dimensions[key as keyof QualityDimensions] * weight;
  }, 0);
}
```

#### 3.1.3 AI Prompt 模板

```
你是一位资深内容审核编辑，拥有10年财经/科技内容审核经验。

请对以下文章进行质量评估：

【文章信息】
标题: {title}
来源: {source}
发布时间: {publishedAt}
字数: {wordCount}

【内容摘要】
{summary}

【评估要求】
请从以下6个维度评分（0-100分），并给出详细理由：

1. 内容丰富度 (25%): 信息是否充实、有深度、覆盖全面
2. 来源可信度 (20%): 发布来源的权威性、专业度
3. 时效性 (20%): 内容是否及时、信息是否最新
4. 独特性 (15%): 观点是否新颖、有差异化价值
5. 可读性 (15%): 结构是否清晰、语言是否流畅
6. 数据支撑 (5%): 是否有数据、案例、图表支撑

【输出格式】
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
    "summary": "这是一篇高质量的深度分析文章...",
    "strengths": [
      "数据翔实，引用了多个权威数据源",
      "观点独到，对行业趋势有深度洞察"
    ],
    "weaknesses": [
      "部分段落略显冗长，可读性有待提升"
    ],
    "recommendation": "promote",
    "confidence": 0.92
  }
}

注意：
- 评分要客观公正，避免极端分数（<20 或 >95 需有充分理由）
- strengths 和 weaknesses 最多各列3点
- recommendation 只能是: promote(重点推荐), normal(正常), demote(降权), filter(过滤)
```

### 3.2 领域分类与 Tag 匹配 (FR-6.1-002)

#### 3.2.1 Expert-Library 分类体系

复用现有 expert-library 的领域分类：

```typescript
// 主分类 (Primary Categories)
const DOMAIN_CATEGORIES = {
  '房地产': ['房地产', '房产', '住房', '住宅', '楼宇', '物业', 'REITs', 'reits', '保租房'],
  '保租房': ['保租房', '保障性租赁住房', '租赁住房', '公租房', '保障房', '长租'],
  '金融科技': ['金融科技', '智能理财', '财富管理', '数字化', '科技金融', '区块链', '支付'],
  '新能源': ['新能源', '电池', '储能', '锂电', '光伏', '风电', '电动汽车', '充电桩', '能源'],
  '人工智能': ['人工智能', 'AI', '大模型', '机器学习', '深度学习', '算法', '智能', 'GPT', 'AIGC'],
  '半导体': ['半导体', '芯片', '集成电路', '晶圆', '制程', '光刻', 'EDA', 'GPU'],
  '生物医药': ['生物医药', '医药', '医疗', '器械', '药品', '疫苗', '基因', 'CRO'],
  '消费品': ['消费品', '零售', '品牌', '营销', '渠道', '电商', '新消费'],
  'TMT': ['TMT', '互联网', '软件', 'SaaS', '云计算', '大数据', '5G', '物联网'],
  '政策': ['政策', '监管', '法规', '意见', '通知', '办法', '规范'],
  '资本市场': ['资本', '证券', '上市', 'IPO', '股市', '基金', '投资', '融资'],
  '宏观经济': ['宏观', '经济', 'GDP', '增长', '周期', '通胀', '利率', '汇率'],
  '高端制造': ['制造', '工业', '机器人', '自动化', '航空航天', '军工'],
  '交运物流': ['交运', '物流', '供应链', '航运', '快递', '港口'],
  '环保': ['环保', 'ESG', '碳中和', '绿色', '污染治理'],
};

// 通用标签 (Universal Tags)
const UNIVERSAL_TAGS = [
  '2024', '2025', '2026',           // 年份
  'Q1', 'Q2', 'Q3', 'Q4',          // 季度
  '年报', '季报', '月报',           // 报告类型
  '深度', '快讯', '评论', '调研',   // 内容类型
  ' bullish', 'bearish',           // 市场观点
];
```

#### 3.2.2 分类结果结构

```typescript
interface CategoryAnalysis {
  // 主分类
  primaryCategory: {
    domain: string;           // 主领域
    confidence: number;       // 置信度 0-1
    reason: string;           // 分类理由
  };
  
  // 次要分类
  secondaryCategories: {
    domain: string;
    confidence: number;
  }[];
  
  // 标签
  tags: {
    tag: string;
    confidence: number;
    type: 'industry' | 'concept' | 'company' | 'person' | 'time' | 'other';
  }[];
  
  // 实体识别
  entities: {
    name: string;
    type: 'company' | 'person' | 'product' | 'technology' | 'event';
    mentions: number;         // 提及次数
  }[];
  
  // 与 expert-library 的匹配
  expertLibraryMatch: {
    matchedDomains: string[];        // 匹配的领域
    suggestedExperts: string[];      // 建议的专家类型
    confidence: number;
  };
}
```

#### 3.2.3 AI Prompt 模板

```
你是一位资深的财经科技内容分类专家，熟悉 expert-library 领域分类体系。

请将以下文章精准分类：

【文章信息】
标题: {title}
摘要: {summary}
来源: {source}

【Expert-Library 领域分类】
1. 房地产 - 房产、住房、住宅、物业、REITs
2. 保租房 - 保障性租赁住房、租赁住房、公租房
3. 金融科技 - 智能理财、财富管理、区块链、支付
4. 新能源 - 电池、储能、光伏、风电、电动汽车
5. 人工智能 - AI、大模型、机器学习、GPT、AIGC
6. 半导体 - 芯片、集成电路、晶圆、制程、光刻
7. 生物医药 - 医药、医疗、器械、疫苗、基因
8. 消费品 - 零售、品牌、营销、电商、新消费
9. TMT - 互联网、软件、SaaS、云计算、5G
10. 政策 - 监管、法规、意见、通知
11. 资本市场 - 证券、上市、IPO、基金、投资
12. 宏观经济 - GDP、增长、周期、通胀、利率
13. 高端制造 - 工业、机器人、自动化、军工
14. 交运物流 - 物流、供应链、航运、快递
15. 环保 - ESG、碳中和、绿色

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
- 只能选择上述 15 个领域之一作为主分类
- 次要分类最多 3 个，置信度需 > 0.3
- 标签数量控制在 5-10 个
```

### 3.3 情感分析 (FR-6.1-003)

#### 3.3.1 细粒度情感分析

```typescript
interface SentimentAnalysis {
  // 整体情感
  overall: 'positive' | 'neutral' | 'negative' | 'mixed';
  score: number;  // -100 到 +100
  
  // 维度情感
  dimensions: {
    marketSentiment: number;      // 市场情绪 -100~+100
    policySentiment: number;      // 政策态度 -100~+100
    industryOutlook: number;      // 行业前景 -100~+100
    investmentSentiment: number;  // 投资情绪 -100~+100
    riskLevel: 'low' | 'medium' | 'high';  // 风险等级
  };
  
  // 关键观点提取
  keyOpinions: {
    opinion: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    confidence: number;
    context?: string;  // 原文引用
  }[];
  
  // 关键要素
  keyElements: {
    opportunities: string[];  // 机会点
    risks: string[];          // 风险提示
    uncertainties: string[];  // 不确定因素
    catalysts: string[];      // 催化因素
  };
  
  // 观点强度
  intensity: 'strong' | 'moderate' | 'weak';
  
  // 立场倾向
  stance: 'bullish' | 'bearish' | 'neutral' | 'mixed';
}
```

#### 3.3.2 AI Prompt 模板

```
你是一位专业的市场情绪分析师，擅长从财经科技内容中提取情感倾向和关键观点。

请分析以下文章的情感特征：

【文章信息】
标题: {title}
内容: {content}
来源: {source}

【分析要求】

1. 整体情感判断 (-100 到 +100)
   - 正值表示积极，负值表示消极
   - 基于全文基调、用词倾向、结论态度综合判断

2. 维度情感分析
   - 市场情绪：对整体市场的态度
   - 政策态度：对监管/政策的评价
   - 行业前景：对行业发展的判断
   - 投资情绪：对投资价值的看法

3. 关键观点提取 (3-5个)
   - 提取文章的核心观点
   - 标注每个观点的情感倾向
   - 提供原文上下文

4. 风险与机会识别
   - opportunities: 文中提到的机会点
   - risks: 文中提示的风险
   - uncertainties: 不确定因素
   - catalysts: 可能的催化因素

【输出格式】
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
    "opportunities": [
      "大模型应用场景持续扩展",
      "企业数字化转型需求旺盛"
    ],
    "risks": [
      "监管政策不确定性",
      "技术迭代风险"
    ],
    "uncertainties": [
      "国际竞争格局变化"
    ],
    "catalysts": [
      "Q3业绩发布",
      "重要行业会议"
    ]
  },
  "intensity": "moderate",
  "stance": "bullish"
}
```

### 3.4 任务智能推荐 (FR-6.1-004)

#### 3.4.1 推荐逻辑

```typescript
interface TaskRecommendation {
  id: string;
  sourceRssItemId: string;
  
  // 触发条件
  triggerReason: {
    highQuality: boolean;      // 高质量内容触发
    hotTopic: boolean;         // 热点话题触发
    contentGap: boolean;       // 内容空白触发
    timeSensitive: boolean;    // 时效性触发
  };
  
  // 推荐内容
  recommendation: {
    title: string;                    // 建议标题
    format: 'report' | 'article' | 'brief' | 'thread';  // 建议格式
    priority: 'high' | 'medium' | 'low';
    reason: string;                   // 推荐理由
    
    // 内容建议
    content: {
      angle: string;                  // 切入角度
      keyPoints: string[];            // 建议核心观点
      targetAudience: string;         // 目标读者画像
      estimatedReadTime: number;      // 预计阅读时长(分钟)
      suggestedLength: string;        // 建议篇幅
    };
    
    // 差异化建议
    differentiation: {
      uniqueAngle: string;            // 独特角度
      contentGap: string[];           // 内容空白点
      competitiveAdvantage: string;   // 竞争优势
    };
    
    // 素材建议
    suggestedAssets: {
      assetId: string;
      relevanceScore: number;
      usageSuggestion: string;
    }[];
    
    // 专家建议
    suggestedExperts: {
      role: 'fact_checker' | 'logic_checker' | 'domain_expert' | 'reader_rep';
      domain: string;
      reason: string;
    }[];
    
    // 时效建议
    timeline: {
      suggestedPublishTime: string;   // 建议发布时间
      urgency: 'immediate' | 'today' | 'this_week' | 'flexible';
      timeWindowReason: string;
    };
  };
  
  // AI 评估
  aiAssessment: {
    confidence: number;               // 推荐置信度
    expectedEngagement: number;       // 预期互动量
    expectedQuality: number;          // 预期质量分
    riskFactors: string[];            // 风险因素
  };
}
```

#### 3.4.2 AI Prompt 模板

```
你是一位资深的内容策划编辑，擅长发现优质选题并制定创作策略。

请基于以下 RSS 文章内容，生成详细的创作建议：

【文章信息】
标题: {title}
摘要: {summary}
来源: {source}
发布时间: {publishedAt}

【AI 分析结果】
质量评分: {qualityScore}/100
领域分类: {category}
情感分析: {sentiment} (得分: {sentimentScore})
关键标签: {tags}

【输出要求】

1. 内容形式建议
   - 根据内容质量和时效性，建议合适的产出形式
   - 可选: 深度研报 / 分析文章 / 快讯简报 / 社交媒体 thread

2. 切入角度 (2-3个)
   - 每个角度要有独特性
   - 说明差异化价值

3. 目标读者
   - 描述目标读者画像
   - 说明读者痛点/需求

4. 内容大纲建议
   - 核心观点 (3-5个)
   - 建议篇幅
   - 关键数据/案例需求

5. 发布策略
   - 建议发布时间
   -  urgency 等级
   - 预期传播窗口

6. 风险提示
   - 可能的风险点
   - 应对建议

【输出格式】
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
      "contentGap": [
        "市场上缺乏B端ROI数据",
        "较少分析垂直领域专用模型"
      ],
      "competitiveAdvantage": "结合一手案例数据，提供差异化洞察"
    },
    
    "suggestedAssets": [
      {
        "assetId": "rss-xxxx",
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
    "riskFactors": [
      "数据来源单一，需要交叉验证",
      "时效性窗口较短"
    ]
  }
}
```

### 3.5 批量处理优化 (FR-6.1-005)

#### 3.5.1 批处理策略

```typescript
interface BatchProcessingConfig {
  // 批次大小
  batchSize: number;           // 默认 10 篇
  
  // 并发控制
  maxConcurrency: number;      // 默认 3 个批次并行
  
  // 优先级队列
  priorityRules: {
    high: { minHotScore: 70, maxAge: 24 },    // 高热度+新内容优先
    normal: { minHotScore: 40, maxAge: 72 },  // 普通优先级
    low: { minHotScore: 0, maxAge: 168 },     // 低优先级
  };
  
  // 重试策略
  retryConfig: {
    maxRetries: 3;
    backoffMultiplier: 2;
    initialDelay: 1000;  // ms
  };
  
  // 限流
  rateLimit: {
    requestsPerMinute: 60;   // 每分钟请求数
    tokensPerDay: 10000;     // 每日 Token 上限
  };
}

// 批处理合并 Prompt (节省 Token)
function createBatchPrompt(items: RSSItem[], task: string): string {
  const itemTexts = items.map((item, i) => `
[文章 ${i + 1}]
标题: ${item.title}
摘要: ${item.summary}
来源: ${item.source}
`).join('\n---\n');

  return `
请对以下 ${items.length} 篇文章进行${task}分析。

${itemTexts}

【输出要求】
请为每篇文章输出独立结果，格式如下:

[文章 1 结果]
{JSON 结果}

[文章 2 结果]
{JSON 结果}

...
`;
}
```

#### 3.5.2 处理流程优化

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        批量处理优化策略                                      │
└─────────────────────────────────────────────────────────────────────────────┘

1. 智能批次分组
   ├── 按领域分组：同领域文章一起处理，复用 domain context
   ├── 按质量分组：高质量内容优先处理
   └── 按时效分组：新内容优先处理

2. Prompt 优化
   ├── Few-shot 示例：提供 2-3 个高质量示例
   ├── Chain-of-Thought：复杂任务分步骤
   └── Output Schema：严格的 JSON Schema 约束

3. 结果缓存
   ├── Embedding Cache：相似内容复用分析结果
   ├── LLM Response Cache：相同输入直接返回缓存
   └── 增量更新：仅分析新增/变更内容

4. 降级策略
   ├── LLM 不可用时：规则引擎兜底
   ├── Token 不足时：精简 Prompt，保留核心功能
   └── 超时时：异步处理，后台完成

5. 质量监控
   ├── 输出 Schema 校验
   ├── 分数范围检查
   ├── 异常值检测
   └── 人工抽检反馈
```

---

## 4. 技术实现

### 4.1 数据库 Schema

```sql
-- ============================================
-- RSS AI 分析结果表
-- ============================================
CREATE TABLE rss_item_ai_analysis (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(32) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  
  -- 质量评分
  quality_score INTEGER,
  quality_dimensions JSONB DEFAULT '{}',
  quality_summary TEXT,
  quality_strengths TEXT[] DEFAULT '{}',
  quality_weaknesses TEXT[] DEFAULT '{}',
  quality_recommendation VARCHAR(20),  -- promote/normal/demote/filter
  
  -- 分类标签
  primary_category VARCHAR(50),
  primary_category_confidence DECIMAL(3,2),
  secondary_categories JSONB DEFAULT '[]',
  extracted_tags JSONB DEFAULT '[]',
  extracted_entities JSONB DEFAULT '[]',
  expert_library_match JSONB DEFAULT '{}',
  
  -- 情感分析
  sentiment VARCHAR(20),
  sentiment_score INTEGER,  -- -100 to +100
  sentiment_dimensions JSONB DEFAULT '{}',
  key_opinions JSONB DEFAULT '[]',
  key_elements JSONB DEFAULT '{}',  -- opportunities/risks/uncertainties/catalysts
  sentiment_intensity VARCHAR(20),
  sentiment_stance VARCHAR(20),
  
  -- 任务推荐
  task_recommendations JSONB DEFAULT '[]',
  
  -- 元数据
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  model_version VARCHAR(20) DEFAULT 'v1.0',
  processing_time_ms INTEGER,
  
  CONSTRAINT unique_rss_ai_analysis UNIQUE (rss_item_id)
);

CREATE INDEX idx_ria_quality ON rss_item_ai_analysis(quality_score DESC);
CREATE INDEX idx_ria_category ON rss_item_ai_analysis(primary_category);
CREATE INDEX idx_ria_sentiment ON rss_item_ai_analysis(sentiment);
CREATE INDEX idx_ria_analyzed_at ON rss_item_ai_analysis(analyzed_at);

-- ============================================
-- rss_items 表扩展
-- ============================================
ALTER TABLE rss_items ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER;
ALTER TABLE rss_items ADD COLUMN IF NOT EXISTS ai_category VARCHAR(50);
ALTER TABLE rss_items ADD COLUMN IF NOT EXISTS ai_sentiment VARCHAR(20);
ALTER TABLE rss_items ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rss_items ADD COLUMN IF NOT EXISTS ai_task_recommended BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_rss_ai_quality ON rss_items(ai_quality_score) WHERE ai_quality_score IS NOT NULL;
CREATE INDEX idx_rss_ai_analyzed ON rss_items(ai_analyzed_at) WHERE ai_analyzed_at IS NULL;

-- ============================================
-- AI 任务推荐表
-- ============================================
CREATE TABLE ai_task_recommendations (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(32) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  recommendation_data JSONB NOT NULL,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/accepted/rejected/implemented
  
  -- 用户反馈
  accepted_by VARCHAR(50),
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- 关联的任务
  created_task_id VARCHAR(50),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_rss_recommendation UNIQUE (rss_item_id)
);

CREATE INDEX idx_atr_status ON ai_task_recommendations(status);
CREATE INDEX idx_atr_created ON ai_task_recommendations(created_at DESC);
```

### 4.2 核心服务

```typescript
// 1. AI 批量处理服务
class AIBatchProcessor {
  constructor(
    private llmClient: LLMClient,
    private config: BatchProcessingConfig
  ) {}
  
  // 主处理入口
  async processBatch(items: RSSItem[]): Promise<AIAnalysisResult[]> {
    // 1. 批量质量评估
    const qualityResults = await this.batchQualityAnalysis(items);
    
    // 2. 批量分类
    const categoryResults = await this.batchCategoryClassification(items);
    
    // 3. 批量情感分析
    const sentimentResults = await this.batchSentimentAnalysis(items);
    
    // 4. 批量任务推荐 (仅高质量内容)
    const highQualityItems = items.filter((_, i) => qualityResults[i].score >= 70);
    const recommendationResults = await this.batchTaskRecommendation(highQualityItems);
    
    // 5. 合并结果
    return this.mergeResults(items, qualityResults, categoryResults, sentimentResults, recommendationResults);
  }
  
  // 批量质量评估
  private async batchQualityAnalysis(items: RSSItem[]): Promise<QualityScore[]>;
  
  // 批量分类
  private async batchCategoryClassification(items: RSSItem[]): Promise<CategoryAnalysis[]>;
  
  // 批量情感分析
  private async batchSentimentAnalysis(items: RSSItem[]): Promise<SentimentAnalysis[]>;
  
  // 批量任务推荐
  private async batchTaskRecommendation(items: RSSItem[]): Promise<TaskRecommendation[]>;
}

// 2. 定时任务调度器
class AIProcessingScheduler {
  // 启动定时任务
  start(): void {
    // 每 15 分钟处理新抓取的内容
    cron.schedule('*/15 * * * *', () => this.processNewItems());
    
    // 每小时重试失败的任务
    cron.schedule('0 * * * *', () => this.retryFailedItems());
    
    // 每天凌晨全量刷新 (低频)
    cron.schedule('0 2 * * *', () => this.fullRefresh());
  }
  
  // 处理新抓取的内容
  private async processNewItems(): Promise<void> {
    const unprocessedItems = await this.getUnprocessedItems({
      limit: this.config.batchSize * this.config.maxConcurrency,
      orderBy: 'hot_score DESC, published_at DESC'
    });
    
    // 分批处理
    const batches = chunk(unprocessedItems, this.config.batchSize);
    await Promise.all(batches.map(batch => this.processor.processBatch(batch)));
  }
}

// 3. 结果验证与存储服务
class AIResultPersistenceService {
  // 保存分析结果
  async saveResults(results: AIAnalysisResult[]): Promise<void> {
    for (const result of results) {
      // 保存到 rss_item_ai_analysis
      await this.saveToAnalysisTable(result);
      
      // 同步到 rss_items
      await this.syncToRssItems(result);
      
      // 如果已导入 assets，同步更新
      await this.syncToAssets(result);
      
      // 保存任务推荐
      if (result.taskRecommendation) {
        await this.saveTaskRecommendation(result);
      }
    }
  }
  
  // 获取待处理项目
  async getUnprocessedItems(options: QueryOptions): Promise<RSSItem[]>;
  
  // 获取已处理项目
  async getProcessedItems(filters: AnalysisFilters): Promise<AIAnalysisResult[]>;
}
```

### 4.3 API 接口

```typescript
// 1. 触发批量处理 (管理接口)
// POST /api/v1/ai/batch-process
interface BatchProcessRequest {
  itemIds?: string[];      // 指定处理，不传则处理所有未处理
  priority?: 'high' | 'normal' | 'low';
  force?: boolean;         // 强制重新处理已分析内容
}

interface BatchProcessResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  estimatedCompletionTime: string;
}

// 2. 获取 AI 分析结果
// GET /api/v1/rss-items/:id/ai-analysis
interface AIAnalysisResponse {
  rssItemId: string;
  quality: QualityScore;
  category: CategoryAnalysis;
  sentiment: SentimentAnalysis;
  taskRecommendation?: TaskRecommendation;
  analyzedAt: string;
  modelVersion: string;
}

// 3. 查询分析结果列表
// GET /api/v1/ai/analysis-results
interface AnalysisResultsQuery {
  minQualityScore?: number;
  maxQualityScore?: number;
  category?: string;
  sentiment?: string;
  hasTaskRecommendation?: boolean;
  analyzedAfter?: string;
  analyzedBefore?: string;
  sortBy?: 'quality' | 'time' | 'hot_score';
  limit?: number;
  offset?: number;
}

// 4. 获取任务推荐
// GET /api/v1/ai/task-recommendations
interface TaskRecommendationsQuery {
  status?: 'pending' | 'accepted' | 'rejected' | 'all';
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  limit?: number;
}

// 5. 接受/拒绝推荐
// POST /api/v1/ai/task-recommendations/:id/accept
// POST /api/v1/ai/task-recommendations/:id/reject
interface AcceptRecommendationRequest {
  taskId?: string;  // 如果已创建任务
  note?: string;
}

interface RejectRecommendationRequest {
  reason: string;
}

// 6. 获取处理统计
// GET /api/v1/ai/stats
interface AIProcessingStats {
  totalAnalyzed: number;
  analyzedToday: number;
  averageQualityScore: number;
  categoryDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  pendingRecommendations: number;
  acceptedRecommendations: number;
  averageProcessingTime: number;
}
```

---

## 5. 实施计划

### 5.1 Phase 1: 基础设施 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 创建 rss_item_ai_analysis 表 | 后端 | 0.5d | 表结构正确，索引完备 |
| 扩展 rss_items 表 | 后端 | 0.5d | 新增字段正确 |
| 创建 ai_task_recommendations 表 | 后端 | 0.5d | 表结构正确 |
| LLM Client 封装 | 后端 | 1d | 支持多模型切换、重试、限流 |
| Prompt 模板系统 | 后端 | 1d | 支持变量替换、版本管理 |

### 5.2 Phase 2: 核心处理服务 (5 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 质量评估 Processor | 后端 | 1.5d | 6维度评分准确，JSON 输出稳定 |
| 领域分类 Processor | 后端 | 1.5d | 15领域分类准确，标签提取完整 |
| 情感分析 Processor | 后端 | 1.5d | 细粒度情感识别准确 |
| 任务推荐 Processor | 后端 | 1.5d | 推荐结构完整，建议可落地 |
| 批处理优化 | 后端 | 1d | 批次合并、并发控制、降级策略 |

### 5.3 Phase 3: API 与调度 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| AI Batch Process API | 后端 | 1d | 支持批量触发、状态查询 |
| AI Analysis 查询 API | 后端 | 1d | 支持多维度筛选、排序 |
| 任务推荐管理 API | 后端 | 1d | 接受/拒绝/查询推荐 |
| 定时任务调度器 | 后端 | 1d | 15分钟/小时/天级任务稳定运行 |

### 5.4 Phase 4: 前端集成 (4 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| RSS Items 列表展示 AI 分数 | 前端 | 1d | 质量分、分类、情感可视化 |
| RSS Item 详情 AI 分析面板 | 前端 | 1.5d | 完整展示4维度分析结果 |
| 任务推荐工作台 | 前端 | 1.5d | 推荐列表、接受/拒绝操作 |
| AI 统计仪表盘 | 前端 | 1d | 处理量、分布统计可视化 |

### 5.5 Phase 5: 优化与监控 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| Prompt 调优 | 后端 | 1d | 准确率达标 (>80%) |
| 缓存系统 | 后端 | 1d | Embedding Cache、Response Cache |
| 监控告警 | 后端 | 1d | 异常检测、处理延迟告警 |
| 人工反馈闭环 | 后端+前端 | 1d | 支持标注、反馈、模型迭代 |

---

## 6. 验收标准

### 6.1 功能验收

| 功能点 | 验收标准 | 测试方法 |
|--------|----------|----------|
| 质量打分 | 6维度评分完整，总分计算正确 | 抽查 50 篇，人工对比 |
| 领域分类 | 15领域分类准确，置信度合理 | 专家标注 100 篇对比 |
| 情感分析 | 整体+维度情感识别准确 | 标注数据集测试 |
| 任务推荐 | 推荐结构完整，建议可执行 | 编辑试用反馈 |
| 批量处理 | 支持并发，失败可重试 | 压力测试 1000 篇 |

### 6.2 性能指标

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| 单篇处理时间 | < 5s | 平均处理时间 |
| 批处理吞吐量 | > 100篇/小时 | 1小时处理量 |
| API 响应时间 | < 200ms | P95 响应时间 |
| 系统可用性 | > 99.5% | 月度可用性统计 |

### 6.3 准确性指标

| 指标 | 目标 | 验证方式 |
|------|------|----------|
| 质量评估准确率 | > 85% | 人工抽样对比 |
| 分类准确率 | > 80% | 专家标注验证 |
| 情感分析准确率 | > 82% | 标注数据集测试 |
| 推荐采纳率 | > 30% | 推荐点击率 |

---

## 7. 附录

### 7.1 与 v6.0 的协同

本 PRD (v6.1) 与 v6.0 (Hot-Topics 与 Assets 联动) 是互补关系：

| v6.0 (数据层) | v6.1 (AI 层) | 协同效果 |
|---------------|--------------|----------|
| 热点-素材关联表 | AI 质量评分 | 高质量热点素材优先推荐 |
| 社区素材入库 | AI 领域分类 | 社区内容精准归类 |
| Hybrid Score | AI 情感分析 | 排序更智能 |
| 任务推荐基础 | AI 任务建议 | 推荐更准确 |

**实施顺序**：
1. v6.0 Phase 1-2 (数据层 + API)
2. v6.1 Phase 1-3 (AI 服务 + API)
3. v6.0 Phase 3 (前端联动)
4. v6.1 Phase 4-5 (前端 + 优化)

### 7.2 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| LLM API 成本过高 | 高 | 批处理优化、缓存、本地模型兜底 |
| AI 准确率不达标 | 高 | Prompt 调优、Few-shot、人工反馈闭环 |
| 处理延迟过高 | 中 | 异步处理、流式输出、降级策略 |
| 数据隐私合规 | 中 | 数据脱敏、本地化处理 |

### 7.3 相关文档

- [Hot-Topics 现有实现](../api/src/services/hotTopicService.ts)
- [Expert Library 分类体系](../api/src/services/expertLibrary.ts)
- [RSS Collector](../api/src/services/rssCollector.ts)
- [v6.0 联动方案](./Product-Spec-v6.0-HotTopics-Assets-Linkage.md)
