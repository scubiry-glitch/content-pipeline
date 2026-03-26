# 产品需求文档: AI 批量处理 - Assets 内容智能分析 v6.2

**版本**: v6.2  
**日期**: 2026-03-27  
**状态**: 📝 需求文档  
**负责人**: 产品研发运营协作体系  
**依赖**: v6.1 RSS AI 批量处理  
**优先级**: P0  

---

## 1. 文档概述

### 1.1 背景

v6.1 已实现 RSS 内容的 AI 批量处理（质量评估、分类、情感分析、任务推荐），但 **Assets 素材库**（研报、文档、图片、PDF等）作为内容创作的核心原材料，尚未纳入 AI 分析体系。存在以下问题：

1. **素材质量不透明**：大量上传的研报、文档缺乏质量评估，编辑难以快速筛选
2. **分类体系割裂**：Assets 使用 theme-based 分类，与 expert-library 领域体系不打通
3. **检索效率低**：仅支持关键词检索，无法实现语义搜索和相似内容推荐
4. **内容沉睡**：优质素材未被充分利用，无法自动推荐到任务创作中
5. **重复上传**：缺乏内容去重机制，相似文档被多次上传

### 1.2 目标

基于 v6.1 的 AI 处理框架，扩展支持 **Assets 素材库**的智能分析：

- **智能质量评估**：多维度质量打分（研报完整性、数据准确性、时效性等）
- **精准领域分类**：对标 expert-library 分类体系，自动匹配主题 ID（theme_id）
- **文件向量化**：支持文本/图片/PDF 的 Embedding，实现语义检索
- **内容去重**：基于向量相似度识别重复/相似内容
- **任务智能推荐**：基于热点+素材质量+分类，自动生成创作建议（复用 ai_task_recommendations 表）

### 1.3 与 v6.1 的关系

```
v6.1: RSS Items  AI Processing Pipeline
         ↓
v6.2: Assets     AI Processing Pipeline (本 PRD)
         ↓
     Unified AI Task Recommendations
         ↓
     Content Creation Workflow
```

**核心差异**：

| 维度 | v6.1 RSS 处理 | v6.2 Assets 处理 |
|------|---------------|------------------|
| **内容类型** | 新闻文章、短内容 | 研报、PDF、文档、图片 |
| **质量维度** | 时效性、丰富度、可读性 | 完整性、数据质量、权威性 |
| **分类目标** | 15个领域分类 | theme_id + expert-library 映射 |
| **核心能力** | 情感分析 | 向量化 + 语义检索 + 去重 |
| **推荐策略** | 热点追踪 | 素材复用 + 内容组合 |

### 1.4 成功标准

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 素材质量评估准确率 | 人工判断 | > 85% AI 与人工一致 | 抽样对比 |
| 分类准确率 (theme匹配) | 人工打标 ~70% | > 85% 自动匹配准确 | 专家标注验证 |
| 语义检索召回率 | 关键词检索 60% | > 85% 语义检索 TOP5 | 测试数据集 |
| 内容去重准确率 | 无 | > 90% 相似内容识别 | 人工验证 |
| 任务推荐采纳率 | 无 | > 25% 素材推荐被采纳 | 推荐点击转化 |
| 素材利用率 | < 30% | > 60% 素材被检索使用 | 访问日志统计 |

---

## 2. 复盘 v6.1 实现策略

### 2.1 v6.1 核心架构回顾

```
┌─────────────────────────────────────────────────────────────────┐
│                    v6.1 RSS AI 处理流水线                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RSS Items → AIBatchProcessor → 4个并行 Processor → 持久化       │
│                 │                    │                            │
│                 │     ┌──────────────┼──────────────┐             │
│                 │     │              │              │             │
│                 ▼     ▼              ▼              ▼             │
│           Quality   Category    Sentiment    TaskRec            │
│           (质量)    (分类)      (情感)       (推荐)              │
│                                                                 │
│  输出: rss_item_ai_analysis 表                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 v6.1 可复用组件

| 组件 | 复用度 | 说明 |
|------|--------|------|
| `AIBatchProcessor` | 90% | 批处理框架通用，仅需扩展 Asset 类型 |
| `Prompt Template` | 70% | 质量评估、分类 Prompt 可复用，需适配文档类型 |
| `领域分类体系` | 100% | 复用 expert-library 15领域分类 |
| `LLM Client` | 100% | 直接复用现有封装 |
| `ai_task_recommendations` | 100% | 表结构复用，扩展 source_type 字段 |
| `定时调度器` | 80% | 复用调度逻辑，Assets 处理频率不同 |

### 2.3 v6.1 改进点（v6.2 优化）

1. **批处理优化**：v6.1 处理 RSS 短文本，v6.2 处理长文档需支持分块策略
2. **向量化流程**：v6.1 无 Embedding，v6.2 核心增加文件向量化
3. **去重机制**：v6.2 新增基于向量相似度的内容去重
4. **多模态支持**：v6.2 支持 PDF、图片等非文本内容

---

## 3. 产品架构

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Assets 采集层 (Assets Collector)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  上传/API → File Parser → Text Extraction → Content Chunking                   │
│                                                                                 │
│  支持格式: PDF, DOCX, TXT, MD, PNG, JPG, WebP                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        AI 批量处理层 (AI Assets Processor)                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Assets Batch Processor Controller                      │  │
│  │                 (调度器：控制批量大小、并发、分块策略)                       │  │
│  └──────┬─────────────┬─────────────┬─────────────┬─────────────┬────────────┘  │
│         │             │             │             │             │               │
│         ▼             ▼             ▼             ▼             ▼               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ ┌───────────┐  │
│  │   质量评估   │ │   领域分类   │ │   向量化    │ │  内容去重  │ │ 任务推荐   │  │
│  │  Processor  │ │  Processor  │ │  Processor  │ │ Processor │ │ Processor │  │
│  │             │ │             │ │             │ │           │ │           │  │
│  │ • 完整性    │ │ • 主题匹配   │ │ • 文本嵌入  │ │ • 相似度   │ │ • 素材组合 │  │
│  │ • 数据质量   │ │ • 领域映射   │ │ • 图片OCR   │ │   检测    │ │ • 引用建议 │  │
│  │ • 权威性    │ │ • 标签提取   │ │ • 多模态    │ │ • 重复识别 │ │ • 创作角度 │  │
│  │ • 时效性    │ │ • 置信度     │ │   融合     │ │ • 版本关联 │ │ • 质量评估 │  │
│  │ • 可读性    │ │             │ │ • 向量存储  │ │           │ │           │  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ └─────┬─────┘  │
│         │             │             │             │             │               │
│         └─────────────┴─────────────┴─────────────┴─────────────┘               │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Assets AI Analysis Results 聚合                      │  │
│  │                                                                             │  │
│  │   { qualityScore, themeId, embedding, similarityGroup, recommendations }  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           数据持久层 (Data Persistence)                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  assets 表 (扩展)                                                                │
│  ├── ai_quality_score          -- AI质量评分                                    │
│  ├── ai_quality_dimensions     -- 质量维度详情                                   │
│  ├── ai_theme_id               -- AI匹配主题ID                                  │
│  ├── ai_theme_confidence       -- 主题匹配置信度                                 │
│  ├── ai_tags                   -- AI提取标签                                    │
│  ├── ai_analyzed_at            -- 分析时间                                      │
│  └── ai_processing_status      -- 处理状态                                      │
│                                                                                 │
│  asset_ai_analysis (新表)                                                        │
│  ├── asset_id, quality_score, quality_dimensions                                 │
│  ├── primary_theme_id, theme_confidence, secondary_themes                        │
│  ├── embedding_vector (pgvector)                                                 │
│  ├── content_summary, key_insights, data_points                                  │
│  ├── similarity_group_id, duplicate_of                                           │
│  └── analyzed_at, model_version                                                  │
│                                                                                 │
│  ai_task_recommendations (复用，扩展)                                             │
│  ├── source_type: 'rss' | 'asset' | 'hybrid'                                     │
│  ├── source_asset_id                                                             │
│  └── recommendation_data                                                         │
│                                                                                 │
│  asset_embedding_cache (向量缓存)                                                │
│  ├── asset_id, embedding, chunk_index, chunk_text                                │
│  └── created_at                                                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Assets 特有处理流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Assets AI 批量处理流程                                 │
└──────────────────────────────────────────────────────────────────────────────┘

Step 1: 内容提取与分块
├── 解析文件格式 (PDF/DOCX/图片等)
├── 文本提取 (OCR / Text Extraction)
├── 内容分块 (长文档切分，默认每块 512 tokens)
├── 元数据提取 (标题、作者、日期、页数)
└── 存储到 asset_content_chunks

Step 2: 批量 AI 处理
├── Batch Quality Analysis (批量质量评估)
│   └── 评估维度: 完整性、数据质量、权威性、时效性、可读性
├── Batch Theme Classification (批量主题分类)
│   └── 匹配 themes 表，生成 theme_id
├── Batch Vectorization (批量向量化)
│   └── 文本 Embedding + 图片多模态 Embedding
├── Batch Duplicate Detection (批量去重)
│   └── 向量相似度计算，标记重复/相似内容
└── Batch Task Recommendation (批量任务推荐)
    └── 基于热点+素材质量+分类生成创作建议

Step 3: 结果聚合与存储
├── 合并分块分析结果
├── 计算整体质量分
├── 存储向量到 pgvector
├── 建立相似度索引
└── 同步到 assets 表

Step 4: 后续处理
├── 高质量素材进入推荐池
├── 重复内容标记并关联源文件
├── 自动推荐到任务工作台
└── 更新素材统计信息
```

---

## 4. 功能规格

### 4.1 文档质量打分 (FR-6.2-001)

#### 4.1.1 评估维度（区别于 RSS）

| 维度 | 权重 | 说明 | 评分标准 |
|------|------|------|----------|
| 完整性 | 25% | 结构完整度、章节覆盖 | 是否有摘要、目录、结论、参考文献 |
| 数据质量 | 25% | 数据准确性、来源标注 | 数据点数量、引用规范性 |
| 来源权威性 | 20% | 发布机构、作者资质 | 券商评级、研究机构排名 |
| 时效性 | 15% | 报告发布时间、数据更新 | 距今时间、数据截止日期 |
| 可读性 | 10% | 逻辑清晰度、表达规范 | 段落结构、专业术语使用 |
| 实用性 | 5% | 对创作的参考价值 | 是否有 actionable insights |

#### 4.1.2 综合质量分计算

```typescript
interface AssetQualityScore {
  overall: number;        // 综合得分 0-100
  
  dimensions: {
    completeness: number;       // 完整性 0-100
    dataQuality: number;        // 数据质量 0-100
    sourceAuthority: number;    // 来源权威性 0-100
    timeliness: number;         // 时效性 0-100
    readability: number;        // 可读性 0-100
    practicality: number;       // 实用性 0-100
  };
  
  // 文档结构分析
  structure: {
    hasAbstract: boolean;
    hasTableOfContents: boolean;
    hasCharts: boolean;
    hasDataTables: boolean;
    hasConclusion: boolean;
    hasReferences: boolean;
    pageCount: number;
    wordCount: number;
  };
  
  // AI 评估详情
  aiAssessment: {
    summary: string;            // 质量总结
    strengths: string[];        // 优点 (最多3点)
    weaknesses: string[];       // 不足 (最多3点)
    keyInsights: string[];      // 核心洞察 (最多5点)
    dataHighlights: string[];   // 数据亮点
    recommendation: 'highly_recommended' | 'recommended' | 'normal' | 'archive';
    confidence: number;         // AI 置信度 0-1
  };
}

function calculateAssetQualityScore(dimensions: AssetQualityDimensions): number {
  const weights = {
    completeness: 0.25,
    dataQuality: 0.25,
    sourceAuthority: 0.20,
    timeliness: 0.15,
    readability: 0.10,
    practicality: 0.05,
  };
  
  return Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + dimensions[key as keyof AssetQualityDimensions] * weight;
  }, 0);
}
```

#### 4.1.3 AI Prompt 模板

```
你是一位资深的研报评审专家，拥有10年券商研究所质量控制经验。

请对以下研报/文档进行专业质量评估：

【文档信息】
标题: {title}
来源: {source}
作者: {author}
发布时间: {publishedAt}
页数: {pageCount}
字数: {wordCount}

【内容摘要】
{abstract}

【章节结构】
{chapterStructure}

【评估要求】
请从以下6个维度评分（0-100分），并给出详细理由：

1. 完整性 (25%): 结构是否完整，是否包含摘要、目录、正文、结论、参考文献
2. 数据质量 (25%): 数据是否准确、来源是否标注、是否有数据表格和图表
3. 来源权威性 (20%): 发布机构资质、作者专业背景、机构知名度
4. 时效性 (15%): 报告发布时间、数据截止日期、是否反映最新情况
5. 可读性 (10%): 逻辑是否清晰、表达是否规范、专业术语使用是否得当
6. 实用性 (5%): 对投资决策/内容创作的参考价值、是否有 actionable insights

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
```

### 4.2 主题分类与领域映射 (FR-6.2-002)

#### 4.2.1 分类体系

```typescript
// 第一步: 匹配 themes 表中的主题
interface ThemeClassification {
  primaryTheme: {
    themeId: string;          // themes.id
    themeName: string;        // themes.name
    confidence: number;       // 0-1
    reason: string;
  };
  
  secondaryThemes: {
    themeId: string;
    themeName: string;
    confidence: number;
  }[];
  
  // 第二步: 映射到 expert-library 领域
  expertLibraryMapping: {
    domain: string;           // expert-library 领域
    confidence: number;
    mappedFrom: string;       // 基于哪个 theme 映射
  }[];
}

// themes 表示例（部分）
const THEMES = [
  { id: 'theme_001', name: '房地产', parent_id: null },
  { id: 'theme_002', name: '保租房', parent_id: 'theme_001' },
  { id: 'theme_003', name: '新能源', parent_id: null },
  { id: 'theme_004', name: '储能', parent_id: 'theme_003' },
  { id: 'theme_005', name: '人工智能', parent_id: null },
  { id: 'theme_006', name: '大模型', parent_id: 'theme_005' },
  // ...
];

// theme 到 expert-library 领域映射表
const THEME_TO_DOMAIN_MAPPING = {
  'theme_001': ['房地产', '宏观经济'],
  'theme_002': ['保租房', '房地产'],
  'theme_003': ['新能源'],
  'theme_004': ['新能源'],
  'theme_005': ['人工智能', 'TMT'],
  'theme_006': ['人工智能'],
  // ...
};
```

#### 4.2.2 AI Prompt 模板

```
你是一位资深的财经内容分类专家，熟悉我们的主题分类体系。

请将以下文档精准分类到现有主题：

【文档信息】
标题: {title}
摘要: {abstract}
关键词: {keywords}
来源: {source}

【现有主题列表】
{themesList}

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
```

### 4.3 文件向量化 (FR-6.2-003)

#### 4.3.1 向量化策略

```typescript
interface AssetVectorization {
  assetId: string;
  
  // 文档级向量（整体摘要）
  documentEmbedding: number[];  // 1536/768 维
  
  // 分块向量（用于精确检索）
  chunks: {
    chunkIndex: number;
    chunkText: string;        // 原始文本块
    chunkEmbedding: number[]; // 向量
    chunkType: 'abstract' | 'toc' | 'body' | 'conclusion' | 'chart';
    startPage?: number;
    endPage?: number;
  }[];
  
  // 元数据向量（用于过滤）
  metadata: {
    titleEmbedding: number[];
    tagEmbeddings: number[][];
  };
  
  // 多模态向量（如有图片）
  multimodal?: {
    imageEmbeddings: number[][];  // 图片向量
    imageCaptions: string[];       // 图片说明
  };
  
  vectorModel: string;  // 使用的模型版本
  createdAt: string;
}
```

#### 4.3.2 分块策略

```typescript
interface ChunkingStrategy {
  // 策略1: 固定大小分块
  fixedSize: {
    chunkSize: 512;      // tokens
    overlap: 50;         // 重叠 tokens
  };
  
  // 策略2: 语义分块（优先）
  semantic: {
    splitBy: ['chapter', 'section', 'paragraph'];
    maxChunkSize: 512;
    preserveStructure: true;
  };
  
  // 策略3: 混合分块（长文档）
  hybrid: {
    abstract: 'single_chunk',      // 摘要单独成块
    toc: 'single_chunk',           // 目录单独成块
    body: 'semantic_chunks',       // 正文语义分块
    conclusion: 'single_chunk',    // 结论单独成块
    charts: 'image_caption_pairs', // 图表+说明
  };
}

// 分块处理流程
function chunkDocument(document: ParsedDocument): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  // 1. 提取摘要块
  if (document.abstract) {
    chunks.push({
      chunkIndex: 0,
      text: document.abstract,
      type: 'abstract',
      priority: 10  // 最高优先级
    });
  }
  
  // 2. 处理章节
  document.chapters.forEach((chapter, idx) => {
    // 章节标题单独成块
    chunks.push({
      chunkIndex: chunks.length,
      text: chapter.title,
      type: 'toc',
      priority: 9
    });
    
    // 章节内容分块
    const sectionChunks = semanticChunk(chapter.content, {
      maxSize: 512,
      overlap: 50
    });
    
    sectionChunks.forEach(sectionText => {
      chunks.push({
        chunkIndex: chunks.length,
        text: sectionText,
        type: 'body',
        chapterTitle: chapter.title,
        priority: 5
      });
    });
  });
  
  // 3. 提取图表说明
  document.charts.forEach(chart => {
    chunks.push({
      chunkIndex: chunks.length,
      text: chart.caption,
      type: 'chart',
      chartRef: chart.id,
      priority: 7
    });
  });
  
  return chunks;
}
```

#### 4.3.3 向量存储 Schema

```sql
-- 扩展 assets 表
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_embedding_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_document_embedding vector(1536);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_embedding_model VARCHAR(50);

-- 分块向量表
CREATE TABLE asset_embeddings (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_embedding vector(1536) NOT NULL,
  chunk_type VARCHAR(20) NOT NULL,  -- abstract/toc/body/conclusion/chart
  chapter_title VARCHAR(255),
  start_page INTEGER,
  end_page INTEGER,
  priority INTEGER DEFAULT 5,  -- 检索优先级
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(asset_id, chunk_index)
);

-- 创建向量索引 (HNSW 算法，高效相似度搜索)
CREATE INDEX idx_asset_embedding_vector ON asset_embeddings 
  USING hnsw (chunk_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_asset_embedding_asset ON asset_embeddings(asset_id);
CREATE INDEX idx_asset_embedding_type ON asset_embeddings(chunk_type);

-- 向量相似度搜索函数
CREATE OR REPLACE FUNCTION search_similar_assets(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE(
  asset_id varchar,
  chunk_index int,
  chunk_text text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.asset_id,
    e.chunk_index,
    e.chunk_text,
    1 - (e.chunk_embedding <=> query_embedding) AS similarity
  FROM asset_embeddings e
  WHERE 1 - (e.chunk_embedding <=> query_embedding) > match_threshold
  ORDER BY e.chunk_embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

### 4.4 内容去重 (FR-6.2-004)

#### 4.4.1 去重策略

```typescript
interface DuplicateDetection {
  assetId: string;
  
  // 去重结果
  result: {
    isDuplicate: boolean;
    duplicateOf?: string;     // 源文件ID
    similarityGroupId?: string;
    confidence: number;       // 相似度 0-1
  };
  
  // 相似文件列表
  similarAssets: {
    assetId: string;
    assetTitle: string;
    similarity: number;       // 相似度
    matchType: 'exact' | 'high' | 'medium' | 'low';
    matchedChunks: number;    // 匹配的文本块数
  }[];
  
  // 重复原因分析
  analysis: {
    reason: 'same_source' | 'same_content' | 'new_version' | 'partial_overlap';
    commonSections: string[];  // 重复的章节
    differences: string[];     // 差异点
    recommendation: 'merge' | 'archive' | 'keep' | 'review';
  };
}

// 相似度阈值
const SIMILARITY_THRESHOLDS = {
  exact: 0.95,      // >95% 视为完全相同
  high: 0.80,       // >80% 视为高度相似
  medium: 0.60,     // >60% 视为中度相似
  low: 0.40,        // >40% 视为低度相似
};
```

#### 4.4.2 去重算法

```typescript
class DuplicateDetector {
  constructor(private embeddingService: EmbeddingService) {}
  
  async detectDuplicates(newAsset: Asset): Promise<DuplicateDetection> {
    // 1. 获取新文档的向量
    const newEmbedding = await this.getDocumentEmbedding(newAsset.id);
    
    // 2. 向量相似度搜索（找到候选集）
    const candidates = await this.searchSimilarDocuments(
      newEmbedding,
      SIMILARITY_THRESHOLDS.low,
      10
    );
    
    // 3. 精细比对（对候选集进行 chunk-level 比对）
    const detailedMatches = await Promise.all(
      candidates.map(async candidate => {
        const chunkMatches = await this.compareChunkLevel(
          newAsset.id,
          candidate.assetId
        );
        return {
          ...candidate,
          chunkMatches,
          overallSimilarity: this.calculateOverallSimilarity(chunkMatches)
        };
      })
    );
    
    // 4. 判断是否重复
    const bestMatch = detailedMatches[0];
    if (bestMatch.overallSimilarity >= SIMILARITY_THRESHOLDS.exact) {
      return {
        assetId: newAsset.id,
        result: {
          isDuplicate: true,
          duplicateOf: bestMatch.assetId,
          similarityGroupId: await this.getSimilarityGroup(bestMatch.assetId),
          confidence: bestMatch.overallSimilarity
        },
        similarAssets: detailedMatches.map(m => ({
          assetId: m.assetId,
          assetTitle: m.title,
          similarity: m.overallSimilarity,
          matchType: this.getMatchType(m.overallSimilarity),
          matchedChunks: m.chunkMatches.length
        })),
        analysis: {
          reason: bestMatch.overallSimilarity > 0.98 ? 'same_content' : 'same_source',
          commonSections: bestMatch.chunkMatches.map(c => c.section),
          differences: this.findDifferences(bestMatch.chunkMatches),
          recommendation: 'archive'
        }
      };
    }
    
    // 5. 未重复，但可能有相似内容
    return {
      assetId: newAsset.id,
      result: {
        isDuplicate: false,
        confidence: bestMatch?.overallSimilarity || 0
      },
      similarAssets: detailedMatches
        .filter(m => m.overallSimilarity >= SIMILARITY_THRESHOLDS.medium)
        .map(m => ({
          assetId: m.assetId,
          assetTitle: m.title,
          similarity: m.overallSimilarity,
          matchType: this.getMatchType(m.overallSimilarity),
          matchedChunks: m.chunkMatches.length
        }))
    };
  }
  
  // Chunk-level 比对
  private async compareChunkLevel(assetId1: string, assetId2: string): Promise<ChunkMatch[]> {
    const chunks1 = await this.getAssetChunks(assetId1);
    const chunks2 = await this.getAssetChunks(assetId2);
    
    const matches: ChunkMatch[] = [];
    
    for (const chunk1 of chunks1) {
      // 找到最相似的 chunk
      let bestMatch: ChunkMatch | null = null;
      let bestSimilarity = 0;
      
      for (const chunk2 of chunks2) {
        const similarity = this.cosineSimilarity(
          chunk1.embedding,
          chunk2.embedding
        );
        
        if (similarity > bestSimilarity && similarity > SIMILARITY_THRESHOLDS.medium) {
          bestSimilarity = similarity;
          bestMatch = {
            chunk1Index: chunk1.index,
            chunk2Index: chunk2.index,
            similarity,
            section: chunk1.section
          };
        }
      }
      
      if (bestMatch) {
        matches.push(bestMatch);
      }
    }
    
    return matches;
  }
}
```

### 4.5 任务智能推荐 (FR-6.2-005)

#### 4.5.1 推荐逻辑（复用并扩展 v6.1）

```typescript
interface AssetTaskRecommendation {
  id: string;
  sourceType: 'asset';      // 区别于 RSS 的 'rss'
  sourceAssetId: string;
  sourceRssItemId?: string; // 如有关联的 RSS 热点
  
  // 触发条件
  triggerReason: {
    highQualityAsset: boolean;    // 高质量素材触发
    hotTopicMatch: boolean;       // 匹配当前热点
    contentGap: boolean;          // 内容空白
    dataDriven: boolean;          // 数据驱动（有独家数据）
  };
  
  // 推荐内容
  recommendation: {
    title: string;                    // 建议标题
    format: 'report' | 'article' | 'brief' | 'infographic';
    priority: 'high' | 'medium' | 'low';
    reason: string;                   // 推荐理由
    
    // 内容建议
    content: {
      angle: string;                  // 切入角度
      keyPoints: string[];            // 建议核心观点
      dataHighlights: string[];       // 数据亮点
      targetAudience: string;         // 目标读者
      estimatedReadTime: number;
      suggestedLength: string;
    };
    
    // 素材组合建议（Assets 特有）
    assetCombination: {
      primaryAsset: {                 // 主素材
        assetId: string;
        usage: '主要数据来源';
        keySections: string[];        // 建议使用章节
      };
      supportingAssets: {             // 辅助素材
        assetId: string;
        relevanceScore: number;
        usageSuggestion: string;
      }[];
    };
    
    // 专家建议
    suggestedExperts: {
      role: 'fact_checker' | 'logic_checker' | 'domain_expert';
      domain: string;
      reason: string;
    }[];
    
    // 发布策略
    timeline: {
      suggestedPublishTime: string;
      urgency: 'immediate' | 'today' | 'this_week' | 'flexible';
      timeWindowReason: string;
    };
  };
  
  // AI 评估
  aiAssessment: {
    confidence: number;
    expectedEngagement: number;
    expectedQuality: number;
    riskFactors: string[];
  };
}
```

#### 4.5.2 复用 ai_task_recommendations 表

```sql
-- 扩展 ai_task_recommendations 表（已存在，添加 source_type 区分）
ALTER TABLE ai_task_recommendations 
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'rss';

ALTER TABLE ai_task_recommendations 
  ADD COLUMN IF NOT EXISTS source_asset_id VARCHAR(50) REFERENCES assets(id);

-- 修改约束：允许 rss_item_id 或 source_asset_id
ALTER TABLE ai_task_recommendations 
  DROP CONSTRAINT IF EXISTS unique_rss_recommendation;

-- 新的唯一约束：根据 source_type 决定
CREATE UNIQUE INDEX idx_atr_unique_rss 
  ON ai_task_recommendations(rss_item_id) 
  WHERE source_type = 'rss';

CREATE UNIQUE INDEX idx_atr_unique_asset 
  ON ai_task_recommendations(source_asset_id) 
  WHERE source_type = 'asset';

-- 查询时区分来源
-- RSS 推荐: SELECT * FROM ai_task_recommendations WHERE source_type = 'rss'
-- Assets 推荐: SELECT * FROM ai_task_recommendations WHERE source_type = 'asset'
```

#### 4.5.3 AI Prompt 模板

```
你是一位资深的内容策划编辑，擅长发现优质素材并制定创作策略。

请基于以下文档内容，生成详细的创作建议：

【文档信息】
标题: {title}
来源: {source}
质量评分: {qualityScore}/100
主题分类: {themeName}
关键标签: {tags}

【文档核心内容】
摘要: {abstract}
核心洞察: {keyInsights}
数据亮点: {dataHighlights}

【当前热点话题】（如有匹配）
{hotTopics}

【输出要求】

1. 内容形式建议
   - 根据素材质量和数据丰富度，建议产出形式
   - 深度研报 / 分析文章 / 数据简报 / 信息图

2. 切入角度 (2-3个)
   - 如何基于该素材展开创作
   - 与热点话题的结合方式

3. 素材使用建议
   - 建议使用哪些章节/数据
   - 是否需要补充其他素材

4. 内容大纲
   - 核心观点
   - 关键数据支撑
   - 建议篇幅

5. 发布策略
   - 建议发布时间
   - 目标读者
   - urgency 等级

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
        "assetId": "asset_xxx",
        "usage": "主要数据来源",
        "keySections": ["市场规模", "竞争格局", "趋势预测"]
      },
      "supportingAssets": [
        {
          "assetId": "asset_yyy",
          "relevanceScore": 0.85,
          "usageSuggestion": "作为对比数据，补充行业另一视角"
        }
      ]
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
```

---

## 5. 技术实现

### 5.1 数据库 Schema

```sql
-- ============================================
-- Assets AI 分析结果表 (新表)
-- ============================================
CREATE TABLE asset_ai_analysis (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  
  -- 质量评分
  quality_score INTEGER,
  quality_dimensions JSONB DEFAULT '{}',
  quality_summary TEXT,
  quality_strengths TEXT[] DEFAULT '{}',
  quality_weaknesses TEXT[] DEFAULT '{}',
  quality_key_insights TEXT[] DEFAULT '{}',
  quality_data_highlights TEXT[] DEFAULT '{}',
  quality_recommendation VARCHAR(20),  -- highly_recommended/recommended/normal/archive
  
  -- 结构分析
  structure_analysis JSONB DEFAULT '{}',
  
  -- 主题分类
  primary_theme_id VARCHAR(50),
  primary_theme_confidence DECIMAL(3,2),
  secondary_themes JSONB DEFAULT '[]',
  expert_library_mapping JSONB DEFAULT '[]',
  
  -- 标签和实体
  extracted_tags JSONB DEFAULT '[]',
  extracted_entities JSONB DEFAULT '[]',
  
  -- 向量化状态
  embedding_status VARCHAR(20) DEFAULT 'pending',  -- pending/processing/completed/failed
  document_embedding vector(1536),
  chunk_count INTEGER DEFAULT 0,
  embedding_model VARCHAR(50),
  
  -- 去重结果
  duplicate_detection_result JSONB DEFAULT '{}',
  similarity_group_id VARCHAR(50),
  
  -- 任务推荐
  has_recommendation BOOLEAN DEFAULT FALSE,
  
  -- 元数据
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  model_version VARCHAR(20) DEFAULT 'v1.0',
  processing_time_ms INTEGER,
  
  CONSTRAINT unique_asset_ai_analysis UNIQUE (asset_id)
);

CREATE INDEX idx_aaa_quality ON asset_ai_analysis(quality_score DESC);
CREATE INDEX idx_aaa_theme ON asset_ai_analysis(primary_theme_id);
CREATE INDEX idx_aaa_embedding_status ON asset_ai_analysis(embedding_status);
CREATE INDEX idx_aaa_analyzed_at ON asset_ai_analysis(analyzed_at);
CREATE INDEX idx_aaa_similarity_group ON asset_ai_analysis(similarity_group_id);

-- ============================================
-- 扩展 assets 表
-- ============================================
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_theme_id VARCHAR(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_theme_confidence DECIMAL(3,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_duplicate_of VARCHAR(50);

CREATE INDEX idx_assets_ai_quality ON assets(ai_quality_score) WHERE ai_quality_score IS NOT NULL;
CREATE INDEX idx_assets_ai_theme ON assets(ai_theme_id) WHERE ai_theme_id IS NOT NULL;
CREATE INDEX idx_assets_ai_status ON assets(ai_processing_status);

-- ============================================
-- 扩展 ai_task_recommendations 表（复用 v6.1）
-- ============================================
ALTER TABLE ai_task_recommendations 
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'rss';

ALTER TABLE ai_task_recommendations 
  ADD COLUMN IF NOT EXISTS source_asset_id VARCHAR(50) REFERENCES assets(id);

-- 移除旧唯一约束，创建条件唯一索引
ALTER TABLE ai_task_recommendations 
  DROP CONSTRAINT IF EXISTS unique_rss_recommendation;

CREATE UNIQUE INDEX idx_atr_unique_rss 
  ON ai_task_recommendations(rss_item_id) 
  WHERE source_type = 'rss';

CREATE UNIQUE INDEX idx_atr_unique_asset 
  ON ai_task_recommendations(source_asset_id) 
  WHERE source_type = 'asset';

CREATE INDEX idx_atr_source_type ON ai_task_recommendations(source_type);

-- ============================================
-- Asset 内容分块表（用于向量化）
-- ============================================
CREATE TABLE asset_content_chunks (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_type VARCHAR(20) NOT NULL,  -- abstract/toc/body/conclusion/chart
  chapter_title VARCHAR(255),
  start_page INTEGER,
  end_page INTEGER,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(asset_id, chunk_index)
);

CREATE INDEX idx_acc_asset ON asset_content_chunks(asset_id);
CREATE INDEX idx_acc_type ON asset_content_chunks(chunk_type);

-- ============================================
-- Asset 分块向量表（pgvector）
-- ============================================
CREATE TABLE asset_embeddings (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_embedding vector(1536) NOT NULL,
  chunk_type VARCHAR(20) NOT NULL,
  chapter_title VARCHAR(255),
  start_page INTEGER,
  end_page INTEGER,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(asset_id, chunk_index)
);

-- HNSW 向量索引（高效相似度搜索）
CREATE INDEX idx_ae_vector ON asset_embeddings 
  USING hnsw (chunk_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_ae_asset ON asset_embeddings(asset_id);
CREATE INDEX idx_ae_type ON asset_embeddings(chunk_type);

-- ============================================
-- 相似内容分组表
-- ============================================
CREATE TABLE asset_similarity_groups (
  id VARCHAR(50) PRIMARY KEY,
  root_asset_id VARCHAR(50) NOT NULL,  -- 原始文件
  asset_ids TEXT[] NOT NULL,            -- 所有相似文件
  similarity_matrix JSONB,              -- 相似度矩阵
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_asg_root ON asset_similarity_groups(root_asset_id);
```

### 5.2 核心服务

```typescript
// 1. Assets AI 批量处理服务
class AssetsAIBatchProcessor {
  constructor(
    private llmClient: LLMClient,
    private embeddingService: EmbeddingService,
    private config: BatchProcessingConfig
  ) {}
  
  // 主处理入口
  async processAssetBatch(assets: Asset[]): Promise<AssetAIAnalysisResult[]> {
    const results: AssetAIAnalysisResult[] = [];
    
    for (const asset of assets) {
      try {
        // 1. 内容提取与分块
        await this.extractAndChunkContent(asset);
        
        // 2. 质量评估
        const qualityResult = await this.assessQuality(asset);
        
        // 3. 主题分类
        const classificationResult = await this.classifyTheme(asset);
        
        // 4. 向量化
        const embeddingResult = await this.vectorizeAsset(asset);
        
        // 5. 去重检测
        const duplicateResult = await this.detectDuplicates(asset);
        
        // 6. 任务推荐（仅高质量内容）
        let recommendationResult = null;
        if (qualityResult.overall >= 70) {
          recommendationResult = await this.generateRecommendation(
            asset, 
            qualityResult,
            classificationResult
          );
        }
        
        // 7. 合并结果
        results.push({
          assetId: asset.id,
          quality: qualityResult,
          classification: classificationResult,
          embedding: embeddingResult,
          duplicate: duplicateResult,
          recommendation: recommendationResult
        });
        
      } catch (error) {
        console.error(`[AssetsAI] Failed to process asset ${asset.id}:`, error);
        await this.markFailed(asset.id, error.message);
      }
    }
    
    return results;
  }
  
  // 内容提取与分块
  private async extractAndChunkContent(asset: Asset): Promise<void> {
    // 1. 解析文件
    const parsedContent = await this.parseFile(asset);
    
    // 2. 分块
    const chunks = this.chunkDocument(parsedContent);
    
    // 3. 保存分块
    await this.saveChunks(asset.id, chunks);
  }
  
  // 质量评估
  private async assessQuality(asset: Asset): Promise<AssetQualityScore> {
    const chunks = await this.getAssetChunks(asset.id);
    const prompt = this.buildQualityPrompt(asset, chunks);
    const response = await this.llmClient.complete(prompt);
    return this.parseQualityResponse(response);
  }
  
  // 主题分类
  private async classifyTheme(asset: Asset): Promise<ThemeClassification> {
    const themes = await this.getAllThemes();
    const prompt = this.buildClassificationPrompt(asset, themes);
    const response = await this.llmClient.complete(prompt);
    return this.parseClassificationResponse(response);
  }
  
  // 向量化
  private async vectorizeAsset(asset: Asset): Promise<AssetVectorization> {
    const chunks = await this.getAssetChunks(asset.id);
    
    // 1. 分块向量化
    const chunkEmbeddings = await Promise.all(
      chunks.map(chunk => this.embeddingService.embed(chunk.text))
    );
    
    // 2. 文档级向量（摘要块的向量）
    const abstractChunk = chunks.find(c => c.type === 'abstract');
    const documentEmbedding = abstractChunk 
      ? await this.embeddingService.embed(abstractChunk.text)
      : chunkEmbeddings[0];
    
    // 3. 保存向量
    await this.saveEmbeddings(asset.id, chunks, chunkEmbeddings, documentEmbedding);
    
    return {
      assetId: asset.id,
      documentEmbedding,
      chunks: chunks.map((chunk, i) => ({
        ...chunk,
        embedding: chunkEmbeddings[i]
      }))
    };
  }
  
  // 去重检测
  private async detectDuplicates(asset: Asset): Promise<DuplicateDetection> {
    const embedding = await this.getDocumentEmbedding(asset.id);
    
    // 1. 向量相似度搜索
    const similarAssets = await this.searchSimilarAssets(
      embedding,
      SIMILARITY_THRESHOLDS.low,
      10
    );
    
    // 2. 判断重复
    const bestMatch = similarAssets[0];
    if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLDS.exact) {
      return {
        isDuplicate: true,
        duplicateOf: bestMatch.assetId,
        confidence: bestMatch.similarity,
        similarAssets
      };
    }
    
    return {
      isDuplicate: false,
      similarAssets: similarAssets.filter(s => s.similarity >= SIMILARITY_THRESHOLDS.medium)
    };
  }
  
  // 生成任务推荐
  private async generateRecommendation(
    asset: Asset,
    quality: AssetQualityScore,
    classification: ThemeClassification
  ): Promise<AssetTaskRecommendation> {
    const hotTopics = await this.getRelatedHotTopics(classification);
    const prompt = this.buildRecommendationPrompt(asset, quality, classification, hotTopics);
    const response = await this.llmClient.complete(prompt);
    return this.parseRecommendationResponse(response);
  }
}

// 2. 语义检索服务
class AssetSemanticSearchService {
  constructor(private db: Database) {}
  
  // 语义检索
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // 1. 查询向量化
    const queryEmbedding = await this.embedQuery(query);
    
    // 2. 向量相似度搜索
    const candidates = await this.db.query(`
      SELECT 
        asset_id,
        chunk_index,
        chunk_text,
        chunk_type,
        1 - (chunk_embedding <=> $1) AS similarity
      FROM asset_embeddings
      WHERE 1 - (chunk_embedding <=> $1) > $2
      ORDER BY chunk_embedding <=> $1
      LIMIT $3
    `, [queryEmbedding, options.threshold, options.limit]);
    
    // 3. 结果聚合（按 asset 聚合）
    const assetScores = this.aggregateByAsset(candidates);
    
    // 4. 获取 asset 详情
    const results = await Promise.all(
      Object.entries(assetScores).map(async ([assetId, score]) => {
        const asset = await this.getAssetDetail(assetId);
        return {
          ...asset,
          relevanceScore: score,
          matchedChunks: candidates.filter(c => c.asset_id === assetId)
        };
      })
    );
    
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
  
  // 相似内容推荐
  async findSimilarAssets(assetId: string, limit: number = 5): Promise<Asset[]> {
    const embedding = await this.getDocumentEmbedding(assetId);
    
    const results = await this.db.query(`
      SELECT DISTINCT ON (asset_id)
        asset_id,
        1 - (chunk_embedding <=> $1) AS similarity
      FROM asset_embeddings
      WHERE asset_id != $2
        AND 1 - (chunk_embedding <=> $1) > 0.7
      ORDER BY asset_id, chunk_embedding <=> $1
      LIMIT $3
    `, [embedding, assetId, limit]);
    
    return Promise.all(
      results.map(r => this.getAssetDetail(r.asset_id))
    );
  }
}

// 3. 定时任务调度器（复用 v6.1，扩展 Assets 处理）
class AssetsAIProcessingScheduler {
  constructor(private processor: AssetsAIBatchProcessor) {}
  
  start(): void {
    // 每 30 分钟处理新上传的素材（频率低于 RSS）
    cron.schedule('*/30 * * * *', () => this.processNewAssets());
    
    // 每小时重试失败的任务
    cron.schedule('0 * * * *', () => this.retryFailedAssets());
    
    // 每天凌晨全量刷新向量化（如有更新）
    cron.schedule('0 3 * * *', () => this.refreshEmbeddings());
  }
  
  private async processNewAssets(): Promise<void> {
    const unprocessedAssets = await this.getUnprocessedAssets({
      limit: this.config.batchSize * this.config.maxConcurrency,
      orderBy: 'created_at DESC'
    });
    
    const batches = chunk(unprocessedAssets, this.config.batchSize);
    await Promise.all(batches.map(batch => this.processor.processAssetBatch(batch)));
  }
}
```

### 5.3 API 接口

```typescript
// 1. 触发 Assets 批量处理
// POST /api/v1/ai/assets/batch-process
interface AssetsBatchProcessRequest {
  assetIds?: string[];      // 指定处理，不传则处理所有未处理
  priority?: 'high' | 'normal' | 'low';
  force?: boolean;          // 强制重新处理
  includeEmbedding?: boolean;  // 是否包含向量化（耗时）
}

interface AssetsBatchProcessResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalAssets: number;
  processedAssets: number;
  failedAssets: number;
  estimatedCompletionTime: string;
}

// 2. 获取 Assets AI 分析结果
// GET /api/v1/assets/:id/ai-analysis
interface AssetAIAnalysisResponse {
  assetId: string;
  quality: AssetQualityScore;
  classification: ThemeClassification;
  duplicate: DuplicateDetection;
  hasEmbedding: boolean;
  analyzedAt: string;
  modelVersion: string;
}

// 3. 语义检索
// POST /api/v1/assets/semantic-search
interface SemanticSearchRequest {
  query: string;
  themeId?: string;         // 按主题过滤
  minQualityScore?: number; // 按质量过滤
  limit?: number;
  threshold?: number;       // 相似度阈值
}

interface SemanticSearchResponse {
  items: {
    assetId: string;
    title: string;
    relevanceScore: number;
    matchedChunks: {
      text: string;
      type: string;
      similarity: number;
    }[];
  }[];
  total: number;
  query: string;
}

// 4. 查找相似素材
// GET /api/v1/assets/:id/similar
interface SimilarAssetsResponse {
  assetId: string;
  similarAssets: {
    assetId: string;
    title: string;
    similarity: number;
    matchType: string;
  }[];
}

// 5. 获取去重结果
// GET /api/v1/assets/:id/duplicates
interface DuplicateCheckResponse {
  assetId: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  similarAssets: {
    assetId: string;
    title: string;
    similarity: number;
  }[];
}

// 6. 复用 v6.1 的推荐接口，扩展支持 Assets
// GET /api/v1/ai/task-recommendations?sourceType=asset
// 复用 v6.1 接口，添加 sourceType 参数
```

---

## 6. 实施计划

### 6.1 Phase 1: 基础设施 (4 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 创建 asset_ai_analysis 表 | 后端 | 0.5d | 表结构正确，索引完备 |
| 扩展 assets 表 | 后端 | 0.5d | 新增字段正确 |
| 创建 asset_embeddings 表（pgvector） | 后端 | 0.5d | 向量索引正确创建 |
| 扩展 ai_task_recommendations 表 | 后端 | 0.5d | 支持 source_type |
| 文件解析服务（PDF/DOCX/图片） | 后端 | 1d | 支持主流格式解析 |
| 分块策略实现 | 后端 | 1d | 语义分块正确 |

### 6.2 Phase 2: 核心处理服务 (6 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| Assets 质量评估 Processor | 后端 | 1.5d | 6维度评分准确 |
| Assets 主题分类 Processor | 后端 | 1.5d | theme_id 匹配准确 |
| 向量化 Processor | 后端 | 1.5d | Embedding 生成正确，存储到 pgvector |
| 去重检测 Processor | 后端 | 1d | 相似度计算准确，重复识别率 >90% |
| 任务推荐 Processor | 后端 | 1d | 推荐结构完整，复用 v6.1 表 |
| 批处理优化 | 后端 | 1d | 长文档分块处理稳定 |

### 6.3 Phase 3: API 与检索 (4 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| Assets Batch Process API | 后端 | 1d | 支持批量触发 |
| 语义检索 API | 后端 | 1.5d | 向量相似度搜索，TOP5 准确率 >85% |
| 相似素材推荐 API | 后端 | 1d | 相似内容推荐准确 |
| 去重检测 API | 后端 | 0.5d | 重复检测接口稳定 |
| 定时任务调度器 | 后端 | 1d | 30分钟/小时/天级任务稳定运行 |

### 6.4 Phase 4: 前端集成 (4 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| Assets 列表展示 AI 分数 | 前端 | 1d | 质量分、主题标签可视化 |
| Asset 详情 AI 分析面板 | 前端 | 1.5d | 完整展示质量、分类、去重结果 |
| 语义检索界面 | 前端 | 1.5d | 支持自然语言搜索素材 |
| 相似素材推荐组件 | 前端 | 1d | 详情页展示相似内容 |

### 6.5 Phase 5: 优化与监控 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| Prompt 调优 | 后端 | 1d | 准确率达标 (>85%) |
| 向量索引优化 | 后端 | 1d | 检索延迟 < 100ms |
| 监控告警 | 后端 | 0.5d | 异常检测、处理延迟告警 |
| 人工反馈闭环 | 后端+前端 | 0.5d | 支持标注、反馈、模型迭代 |

---

## 7. 验收标准

### 7.1 功能验收

| 功能点 | 验收标准 | 测试方法 |
|--------|----------|----------|
| 质量打分 | 6维度评分完整，研报维度准确 | 抽查 30 份研报，人工对比 |
| 主题分类 | theme_id 匹配准确 | 专家标注 50 份对比 |
| 向量化 | 向量生成成功，检索召回率达标 | 测试数据集验证 |
| 去重检测 | 重复内容识别率 >90%，误报率 <5% | 人工验证 100 对相似文档 |
| 语义检索 | TOP5 召回率 >85%，延迟 <100ms | 测试查询集 |
| 任务推荐 | 推荐结构完整，复用 v6.1 表 | 编辑试用反馈 |

### 7.2 性能指标

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| 单文档处理时间 | < 30s (含向量化) | 平均处理时间 |
| 批处理吞吐量 | > 50篇/小时 | 1小时处理量 |
| 语义检索延迟 | P95 < 100ms | 压力测试 |
| 向量存储占用 | < 10MB/千文档 | 存储统计 |
| 系统可用性 | > 99.5% | 月度可用性统计 |

### 7.3 与 v6.1 的协同验收

| 协同点 | 验收标准 | 验证方式 |
|--------|----------|----------|
| 表结构兼容 | ai_task_recommendations 同时支持 RSS 和 Assets | 插入测试数据 |
| 推荐聚合 | Dashboard 同时展示 RSS 和 Assets 推荐 | 前端展示验证 |
| 分类体系一致 | Assets 和 RSS 使用相同的 expert-library 映射 | 对比分类结果 |

---

## 8. 附录

### 8.1 与 v6.1 的协同

```
v6.1 (RSS AI 处理)          v6.2 (Assets AI 处理)
     │                              │
     │  ┌────────────────────────┐  │
     └──┤  Unified AI Pipeline   ├──┘
        │  - 质量评估            │
        │  - 领域分类            │
        │  - 任务推荐            │
        └────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │  ai_task_recommendations │
        │  source_type: 'rss'/'asset' │
        └───────────────────────────┘
                    │
              创作工作台
```

### 8.2 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 向量存储成本过高 | 高 | 分块压缩、定期清理低质量内容向量 |
| Embedding API 延迟高 | 高 | 异步处理、批量 Embedding、本地模型兜底 |
| 去重误伤 | 中 | 人工审核机制、可调节相似度阈值 |
| 长文档处理超时 | 中 | 分片处理、超时重试、降级策略 |

### 8.3 相关文档

- [v6.1 RSS AI 批量处理](./Product-Spec-v6.1-AI-Batch-Processing.md)
- [Assets 现有实现](../api/src/services/assetService.ts)
- [pgvector 文档](https://github.com/pgvector/pgvector)
- [Expert Library 分类体系](../api/src/services/expertLibrary.ts)
