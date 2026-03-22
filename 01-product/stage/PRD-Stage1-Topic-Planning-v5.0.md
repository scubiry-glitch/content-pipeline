# 产品需求文档: 阶段 1 - 选题策划详细设计 v5.1

**版本**: v5.1
**日期**: 2026-03-23
**状态**: 📝 详细设计文档 (已更新: 新增 Web Search + 社区抓取)
**对应阶段**: 阶段 1 - 选题策划
**依赖**: PRD-Production-Pipeline-v5.0.md

**v5.1 更新内容**:
- ✅ 新增 Web Search 主动发现能力
- ✅ 新增小红书/微博/知乎等社区话题抓取
- ✅ 新增多源话题归并层
- ✅ 更新热度验证为跨平台交叉验证模型
- ✅ 新增相关数据表结构设计
- ✅ 新增相关 API 接口设计

---

## 1. 选题策划流程概览

### 1.1 流程架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段 1: 选题策划流程                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │  系统触发    │ ← 定时任务(每15分钟) / 手动触发                            │
│  └──────┬──────┘                                                            │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    数据源层: 多源话题发现                                  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ││
│  │  │ RSS 聚合     │  │ Web Search  │  │ 社区抓取     │  │ 热搜聚合     │   ││
│  │  │ (订阅推送)   │  │ (主动搜索)   │  │ (社媒监控)   │  │ (榜单监控)   │   ││
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   ││
│  │         └─────────────────┴─────────────────┴─────────────────┘         ││
│  │                                    │                                    ││
│  │                           ┌────────▼────────┐                          ││
│  │                           │   话题归并层     │                          ││
│  │                           │  (实体链接+去重) │                          ││
│  │                           └────────┬────────┘                          ││
│  └────────────────────────────────────┼────────────────────────────────────┘│
│                                       ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 1: 质量评估                                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 来源权威性   │→│ 内容完整度   │→│ 综合评分     │                 │   │
│  │  │ 评估        │  │ 评估        │  │ (0-100)     │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 2: 热度验证                                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ RSS热度      │  │ 搜索热度     │  │ 社媒热度     │                 │   │
│  │  │ + Web验证    │  │ 交叉验证     │  │ 情感计算     │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 3: 竞品分析                                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 竞品监控     │→│ 覆盖度分析   │→│ 空白发现     │                 │   │
│  │  │ (全渠道)     │  │ (主题聚类)   │  │ (角度推荐)   │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 4: 评分排序                                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 多因子加权   │→│ 智能排序     │→│ 生成推荐     │                 │   │
│  │  │ 评分        │  │ (Top N)     │  │ 列表        │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 5:     │     │ 存储: hot_topics / topics 表                    │   │
│  │ 保存结果    │ →   │ 更新: 选题推荐列表                              │   │
│  └─────────────┘     └─────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心数据结构

#### RSSSource - RSS源配置

```typescript
interface RSSSource {
  id: string;
  name: string;           // 源名称 (如: "36氪")
  url: string;            // RSS地址
  category: string;       // 分类 (tech/finance/life)
  priority: 'p0' | 'p1' | 'p2';  // 优先级
  isActive: boolean;
  updateInterval: number; // 更新间隔(分钟)
  lastCrawledAt?: Date;
  createdAt: Date;
}
```

**优先级定义**:
| 级别 | 抓取频率 | 示例来源 |
|------|---------|---------|
| P0 | 实时 | 官方公告、证监会 |
| P1 | 15分钟 | 头部财经媒体 |
| P2 | 30分钟 | 垂直媒体 |

#### HotTopic - 热点话题

```typescript
interface HotTopic {
  id: string;
  title: string;
  source: string;         // 来源平台
  sourceUrl?: string;     // 原文链接
  hotScore: number;       // 热度分 (0-100)
  trend: 'up' | 'stable' | 'down';  // 趋势
  sentiment: 'positive' | 'neutral' | 'negative';  // 情感
  qualityScore: number;   // 质量分
  differentiationScore: number;  // 差异化分
  relatedReports: string[];      // 关联研报ID
  isFollowed: boolean;           // 是否被关注
  publishedAt: Date;
  createdAt: Date;
}
```

#### Topic - 选题

```typescript
interface Topic {
  id: string;
  title: string;
  source: 'rss' | 'hot_topic' | 'competitor' | 'manual';
  sourceId?: string;      // 来源ID
  hotScore: number;       // 热度分
  qualityScore: number;   // 质量分
  differentiationScore: number;  // 差异化分
  comprehensiveScore: number;    // 综合评分
  status: 'pending' | 'approved' | 'rejected' | 'in_progress';
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  recommendedAngles: string[];   // 推荐切入角度
  gaps: string[];                // 空白点
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. 详细步骤设计

### 步骤 1: RSS 聚合

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | RSSSource 配置列表 |
| 输出 | RSSItem[] (抓取的文章列表) |
| 触发 | 定时任务(每15分钟) / 手动触发 |
| 依赖 | RSSHub / 直接RSS源 |
| 优先级 | P0 |

#### 采集流程

```typescript
async function collectRSSItems(sources: RSSSource[]): Promise<RSSItem[]> {
  const allItems: RSSItem[] = [];
  
  for (const source of sources.filter(s => s.isActive)) {
    try {
      // 1. 抓取RSS
      const feed = await rssParser.parseURL(source.url);
      
      // 2. 解析条目
      const items = feed.items.map(item => ({
        id: generateId(),
        sourceId: source.id,
        sourceName: source.name,
        title: item.title,
        link: item.link,
        summary: item.contentSnippet?.slice(0, 500) || '',
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        tags: extractTags(item.title + ' ' + item.contentSnippet),
      }));
      
      // 3. 去重
      const newItems = await filterDuplicates(items);
      
      allItems.push(...newItems);
      
      // 4. 更新最后抓取时间
      await updateLastCrawled(source.id);
      
    } catch (error) {
      console.error(`[RSS] Failed to fetch ${source.name}:`, error);
    }
  }
  
  return allItems;
}
```

#### 去重逻辑

```typescript
async function filterDuplicates(items: RSSItem[]): Promise<RSSItem[]> {
  const duplicates = await query(
    `SELECT link FROM rss_items WHERE link = ANY($1)`,
    [items.map(i => i.link)]
  );
  
  const existingLinks = new Set(duplicates.rows.map(r => r.link));
  
  // 同时检查标题相似度
  return items.filter(item => {
    if (existingLinks.has(item.link)) return false;
    
    // 标题相似度检测
    for (const existing of existingLinks) {
      if (calculateSimilarity(item.title, existing) > 0.9) {
        return false;
      }
    }
    
    return true;
  });
}
```

#### 分类规则

```typescript
function classifyContent(title: string, summary: string): string {
  const text = (title + ' ' + summary).toLowerCase();
  
  const categories = [
    { name: 'finance', keywords: ['金融', '财经', '股票', '投资', '基金'] },
    { name: 'tech', keywords: ['科技', 'AI', '互联网', '芯片', '新能源'] },
    { name: 'realestate', keywords: ['房地产', '楼市', '房价', '保租房', 'REITs'] },
    { name: 'policy', keywords: ['政策', '监管', '央行', '证监会', '国务院'] },
  ];
  
  let maxScore = 0;
  let bestCategory = 'other';
  
  for (const cat of categories) {
    const score = cat.keywords.filter(k => text.includes(k)).length;
    if (score > maxScore) {
      maxScore = score;
      bestCategory = cat.name;
    }
  }
  
  return bestCategory;
}
```

---

### 步骤 1.4: 流式大纲生成 (Streaming Outline Generation)

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | 选题主题、背景信息、知识库洞见、新角度 |
| 输出 | 流式生成的大纲章节 + 实时进度 |
| 处理 | 分层递进生成，带上下文传递 |
| 优先级 | P0 |

#### 流式生成架构

```
用户输入选题 → 并行生成洞察+角度 → 流式生成大纲
                                              ↓
                    ┌─────────────────────────────────────────┐
                    │           流式大纲生成器                 │
                    │  ┌─────────┐ → ┌─────────┐ → ┌────────┐ │
                    │  │ 宏观层  │ → │ 中观层  │ → │ 微观层 │ │
                    │  │ 生成中  │   │ 生成中  │   │ 生成中 │ │
                    │  └────┬────┘   └────┬────┘   └───┬────┘ │
                    │       │             │            │      │
                    │       └─────────────┴────────────┘      │
                    │                   │                      │
                    │              实时推送进度                 │
                    │                   ↓                      │
                    │         WebSocket / SSE                 │
                    └─────────────────────────────────────────┘
```

#### 核心特性

```typescript
interface StreamingOutlineConfig {
  taskId: string;
  topic: string;
  context?: string;
  knowledgeInsights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
  comments?: string[];
  options?: {
    enableStreaming: boolean;      // 是否启用流式
    streamInterval: number;        // 推送间隔(ms)
    includeContext: boolean;       // 是否带上文
    saveProgress: boolean;         // 是否保存中间进度
  };
}

interface OutlineLayer {
  id: string;
  name: 'macro' | 'meso' | 'micro';
  title: string;
  sections: OutlineSection[];
  status: 'pending' | 'generating' | 'completed' | 'error';
  generatedAt?: Date;
}

interface OutlineProgress {
  currentLayer: 'macro' | 'meso' | 'micro' | 'insights' | 'angles';
  layerProgress: {
    macro: number;
    meso: number;
    micro: number;
  };
  status: 'pending' | 'processing' | 'completed' | 'error';
  layers: OutlineLayer[];
  accumulatedOutline: OutlineSection[];
  insights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
}

type OutlineProgressCallback = (progress: OutlineProgress) => void | Promise<void>;
```

#### 分层生成流程

```typescript
async function generateOutlineStreaming(
  config: StreamingOutlineConfig,
  onProgress: OutlineProgressCallback
): Promise<OutlineGenerationResult> {
  
  const { topic, knowledgeInsights, novelAngles, comments } = config;
  
  // 1. 初始化三层结构
  const layers: OutlineLayer[] = [
    { id: 'macro', name: 'macro', title: '宏观视野层', sections: [], status: 'pending' },
    { id: 'meso', name: 'meso', title: '中观解剖层', sections: [], status: 'pending' },
    { id: 'micro', name: 'micro', title: '微观行动层', sections: [], status: 'pending' },
  ];
  
  // 2. 顺序生成各层（带上下文传递）
  let accumulatedContext = '';
  
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    layer.status = 'generating';
    
    // 推送进度 - 开始生成当前层
    await onProgress({
      currentLayer: layer.name,
      layerProgress: calculateLayerProgress(layers),
      status: 'processing',
      layers,
      accumulatedOutline: flattenLayers(layers),
      insights: knowledgeInsights,
      novelAngles,
    });
    
    // 生成当前层
    const generatedSections = await generateLayerWithContext({
      layer,
      topic,
      context: accumulatedContext,
      knowledgeInsights,
      novelAngles,
      comments,
      previousLayers: layers.slice(0, i),
    });
    
    layer.sections = generatedSections;
    layer.status = 'completed';
    layer.generatedAt = new Date();
    
    // 更新累计上下文
    accumulatedContext += buildLayerContext(layer);
    
    // 推送进度 - 当前层完成
    await onProgress({
      currentLayer: i === layers.length - 1 ? 'completed' : layers[i + 1].name,
      layerProgress: calculateLayerProgress(layers),
      status: i === layers.length - 1 ? 'completed' : 'processing',
      layers,
      accumulatedOutline: flattenLayers(layers),
      insights: knowledgeInsights,
      novelAngles,
    });
    
    // 保存中间进度
    if (config.options?.saveProgress) {
      await saveOutlineProgress({
        taskId: config.taskId,
        layers,
        currentLayerIndex: i,
      });
    }
  }
  
  // 3. 生成数据需求
  const dataRequirements = await analyzeDataRequirements(
    topic, 
    flattenLayers(layers)
  );
  
  return {
    outline: flattenLayers(layers),
    layers,
    dataRequirements,
    insights: knowledgeInsights,
    novelAngles,
  };
}
```

#### 带上下文的层生成

```typescript
async function generateLayerWithContext(params: {
  layer: OutlineLayer;
  topic: string;
  context: string;
  knowledgeInsights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
  comments?: string[];
  previousLayers?: OutlineLayer[];
}): Promise<OutlineSection[]> {
  
  const { layer, topic, context, knowledgeInsights, novelAngles, comments, previousLayers } = params;
  
  // 筛选与当前层相关的洞察
  const relevantInsights = filterInsightsByLayer(knowledgeInsights, layer.name);
  
  // 筛选与当前层相关的角度
  const relevantAngles = filterAnglesByLayer(novelAngles, layer.name);
  
  const prompt = buildLayerPrompt({
    layer,
    topic,
    context,
    insights: relevantInsights,
    angles: relevantAngles,
    comments,
    previousLayers,
  });
  
  const result = await llmRouter.generate(prompt, 'planning', {
    temperature: 0.7,
    maxTokens: 3000,
  });
  
  return parseAndValidateOutline(result.content);
}

function buildLayerPrompt(params: {
  layer: OutlineLayer;
  topic: string;
  context: string;
  insights?: KnowledgeInsight[];
  angles?: NovelAngle[];
  comments?: string[];
  previousLayers?: OutlineLayer[];
}): string {
  const { layer, topic, context, insights, angles, comments, previousLayers } = params;
  
  const layerGuides = {
    macro: {
      focus: '政策导向、经济周期、国际比较、宏观趋势',
      requirement: '提供全局视野，建立分析框架',
    },
    meso: {
      focus: '产业链分析、区域差异、商业模式、竞争格局',
      requirement: '承上启下，将宏观趋势落到产业层面',
    },
    micro: {
      focus: '标杆案例、数据验证、行动建议、操作细节',
      requirement: '具体可执行，给出明确建议',
    },
  };
  
  const guide = layerGuides[layer.name];
  
  return `
你是一位资深产业研究专家，正在为"${topic}"撰写研究报告大纲。

【当前层级】${layer.title}
${guide.requirement}

【本层关注点】
${guide.focus}

${previousLayers?.length ? `
【已生成的上层结构】
${previousLayers.map(l => `${l.title}:
${l.sections.map(s => `- ${s.title}`).join('\n')}`).join('\n\n')}
` : ''}

${context ? `
【前文上下文】
${context}
` : ''}

${insights?.length ? `
【相关知识洞见】
${insights.map((i, idx) => `${idx + 1}. [${i.type}] ${i.content}`).join('\n')}
` : ''}

${angles?.length ? `
【建议采用的新角度】
${angles.map((a, idx) => `${idx + 1}. ${a.angle}: ${a.rationale}`).join('\n')}
` : ''}

${comments?.length ? `
【用户反馈】
${comments.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}
` : ''}

【输出要求】
请生成 ${layer.title} 的章节结构，输出JSON格式：
{
  "sections": [
    {
      "title": "章节标题",
      "level": 1,
      "content": "核心论述要点",
      "subsections": [
        {
          "title": "子章节",
          "level": 2,
          "content": "子章节要点"
        }
      ]
    }
  ]
}

要求：
1. 本层生成 2-3 个一级章节
2. 每个一级章节包含 2-3 个子章节
3. 必须承接上文逻辑（如有上层结构）
4. 融入相关洞见和新角度
5. 考虑用户反馈进行调整
`;
}
```

#### 实时推送机制

```typescript
// WebSocket 连接管理
class OutlineStreamingManager {
  private connections = new Map<string, WebSocket>();
  
  register(taskId: string, ws: WebSocket) {
    this.connections.set(taskId, ws);
  }
  
  async pushProgress(taskId: string, progress: OutlineProgress) {
    const ws = this.connections.get(taskId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'progress',
        data: progress,
      }));
    }
  }
  
  async pushLayerComplete(taskId: string, layer: OutlineLayer) {
    const ws = this.connections.get(taskId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'layer_complete',
        data: layer,
      }));
    }
  }
  
  unregister(taskId: string) {
    this.connections.delete(taskId);
  }
}

// SSE 推送（备用方案）
async function streamOutlineSSE(
  req: Request,
  res: Response,
  config: StreamingOutlineConfig
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  await generateOutlineStreaming(config, (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  });
  
  res.write('data: [DONE]\n\n');
  res.end();
}
```

#### 数据库存储

```sql
-- 大纲生成进度表
CREATE TABLE outline_generation_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'running',
  current_layer VARCHAR(20),  -- macro/meso/micro/completed
  layers JSONB DEFAULT '[]',
  accumulated_outline JSONB DEFAULT '[]',
  insights JSONB DEFAULT '[]',
  novel_angles JSONB DEFAULT '[]',
  layer_progress JSONB DEFAULT '{"macro":0,"meso":0,"micro":0}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(task_id)
);

-- 大纲版本表（记录每次生成的版本）
CREATE TABLE outline_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  outline JSONB NOT NULL,
  layers JSONB,
  insights JSONB,
  novel_angles JSONB,
  data_requirements JSONB,
  generated_by VARCHAR(50),  -- user/system
  generation_mode VARCHAR(20) DEFAULT 'streaming',  -- streaming/batch
  layer_progress JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_outline_versions_task ON outline_versions(task_id, version DESC);
```

---

### 步骤 1.5: Web Search 主动发现

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | 种子关键词 / 热点话题 / 配置规则 |
| 输出 | WebSearchResult[] (搜索结果条目) |
| 触发 | 定时任务(每30分钟) / 手动触发 / RSS发现话题后自动触发 |
| 依赖 | Tavily API / Serper API / DuckDuckGo |
| 优先级 | P1 |

#### 搜索策略

```typescript
interface WebSearchConfig {
  seedKeywords: string[];      // 种子关键词
  timeRange: '1h' | '24h' | '7d' | '30d';  // 时间范围
  maxResults: number;          // 最大结果数
  searchEngines: ('google' | 'bing' | 'news')[];
}

// 搜索模式
enum SearchMode {
  TRENDING = 'trending',       // 发现新兴热点
  VERIFY = 'verify',           // 验证RSS发现的话题
  GAP_FILL = 'gap_fill',       // 填补RSS覆盖盲区
  COMPETITOR = 'competitor',   // 竞品覆盖检测
}

async function executeWebSearch(
  mode: SearchMode,
  input: string | HotTopic
): Promise<WebSearchResult[]> {
  switch (mode) {
    case SearchMode.TRENDING:
      return searchTrendingTopics();
    case SearchMode.VERIFY:
      return verifyTopicWithSearch(input as HotTopic);
    case SearchMode.GAP_FILL:
      return searchForGapTopics();
    case SearchMode.COMPETITOR:
      return searchCompetitorCoverage(input as string);
  }
}
```

#### 热点验证搜索

```typescript
async function verifyTopicWithSearch(hotTopic: HotTopic): Promise<VerifiedResult> {
  // 1. 多维度搜索验证
  const [generalSearch, newsSearch, socialSearch] = await Promise.all([
    // 全网搜索
    webSearch.search(hotTopic.title, {
      timeRange: '24h',
      maxResults: 10,
      includeAnswer: true,
    }),
    // 新闻搜索
    webSearch.search(`${hotTopic.title} news`, {
      timeRange: '24h',
      maxResults: 5,
      searchType: 'news',
    }),
    // 讨论搜索
    webSearch.search(`${hotTopic.title} discussion OR forum`, {
      timeRange: '7d',
      maxResults: 5,
    }),
  ]);
  
  // 2. 交叉验证热度
  const crossPlatformMetrics = {
    searchMentions: generalSearch.results.length,
    newsCoverage: newsSearch.results.length,
    discussionVolume: socialSearch.results.length,
    authoritySources: countAuthoritySources(generalSearch.results),
  };
  
  // 3. 热度修正
  const verifiedHotScore = calculateVerifiedScore(
    hotTopic.hotScore,
    crossPlatformMetrics
  );
  
  // 4. 发现新角度
  const newAngles = extractNovelAngles([
    ...generalSearch.results,
    ...newsSearch.results,
  ]);
  
  return {
    topic: hotTopic,
    verifiedScore: verifiedHotScore,
    crossPlatformData: crossPlatformMetrics,
    novelAngles: newAngles,
    confidence: calculateConfidence(crossPlatformMetrics),
  };
}
```

#### 趋势话题主动发现

```typescript
async function discoverTrendingTopics(): Promise<WebSearchResult[]> {
  // 1. 构建趋势发现查询
  const trendQueries = [
    '"热议" OR "热搜" OR "爆火" 今天',
    '"新规定" OR "新政策" 发布 2024',
    '"财报" OR "业绩" 超预期 OR 不及预期',
    '"融资" OR "IPO" OR "上市" 最新',
  ];
  
  const allResults: WebSearchResult[] = [];
  
  for (const query of trendQueries) {
    const results = await webSearch.search(query, {
      timeRange: '24h',
      maxResults: 10,
    });
    allResults.push(...results.results);
  }
  
  // 2. 去重并聚类
  const uniqueResults = deduplicateByUrl(allResults);
  const topicClusters = clusterBySemanticSimilarity(uniqueResults);
  
  // 3. 筛选高潜力话题
  return topicClusters
    .filter(cluster => cluster.items.length >= 3)  // 至少3个来源
    .map(cluster => ({
      title: extractTopicTitle(cluster),
      sources: cluster.items.map(i => i.url),
      discoverySource: 'web_search',
      hotScore: estimateHotScoreFromSearch(cluster),
    }));
}
```

---

### 步骤 1.6: 社区话题抓取

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | 社区平台配置 / 热门榜单API / 关键词监控 |
| 输出 | CommunityTopic[] (社区热门话题) |
| 触发 | 定时任务(每15分钟) / 实时Webhook |
| 依赖 | 各平台API/爬虫 |
| 优先级 | P1 |

#### 支持平台

| 平台 | 数据源 | 抓取方式 | 更新频率 |
|------|--------|----------|----------|
| 小红书 | 热搜榜、话题榜 | API/爬虫 | 15分钟 |
| 微博 | 热搜榜、话题榜 | 官方API | 实时 |
| 知乎 | 热榜、搜索建议 | API | 15分钟 |
| 抖音 | 热榜、挑战榜 | 第三方API | 30分钟 |
| B站 | 热门、热搜 | API | 30分钟 |
| 即刻 | 圈子热门 | API | 30分钟 |
| 雪球 | 热股、热帖 | API | 15分钟 |

#### 数据结构

```typescript
interface CommunityTopic {
  id: string;
  title: string;              // 话题标题
  platform: string;           // 来源平台
  platformId: string;         // 平台原始ID
  platformUrl: string;        // 原始链接
  
  // 热度指标
  hotScore: number;           // 平台热度分 (0-100)
  platformRank?: number;      // 榜单排名
  engagement: {
    views?: number;           // 浏览量
    likes?: number;           // 点赞数
    comments?: number;        // 评论数
    shares?: number;          // 分享数
  };
  
  // 内容特征
  contentType: 'text' | 'image' | 'video' | 'mixed';
  keyOpinions: string[];      // 关键观点摘要
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  
  // 元数据
  tags: string[];             // 平台标签
  creatorInfo?: {             // 创作者信息
    name: string;
    followers?: number;
    verified?: boolean;
  };
  
  publishedAt: Date;
  crawledAt: Date;
}

interface CommunityCrawlConfig {
  platform: string;
  enabled: boolean;
  sources: ('hot' | 'trending' | 'search' | 'follow')[];
  keywords?: string[];        // 监控关键词
  minEngagement: number;      // 最低互动门槛
  categoryFilter?: string[];  // 分类过滤
}
```

#### 小红书抓取示例

```typescript
async function crawlXiaohongshuTopics(): Promise<CommunityTopic[]> {
  const topics: CommunityTopic[] = [];
  
  // 1. 抓取热搜榜
  const hotSearch = await xhsClient.getHotSearch();
  for (const item of hotSearch.slice(0, 20)) {
    topics.push({
      id: `xhs_hot_${item.id}`,
      title: item.keyword,
      platform: 'xiaohongshu',
      platformId: item.id,
      platformUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.keyword)}`,
      hotScore: calculateXHSScore(item.hotIndex),
      platformRank: item.rank,
      engagement: {
        views: item.viewCount,
        likes: item.likeCount,
      },
      contentType: 'mixed',
      keyOpinions: await extractKeyOpinions(item.keyword, 'xiaohongshu'),
      sentiment: await analyzeSentiment(item.keyword, 'xiaohongshu'),
      tags: item.tags || [],
      publishedAt: new Date(),
      crawledAt: new Date(),
    });
  }
  
  // 2. 抓取话题榜
  const trendingTopics = await xhsClient.getTrendingTopics();
  for (const item of trendingTopics.slice(0, 15)) {
    topics.push({
      id: `xhs_topic_${item.id}`,
      title: item.topicName,
      platform: 'xiaohongshu',
      platformId: item.id,
      platformUrl: item.topicUrl,
      hotScore: calculateXHSScore(item.participationCount),
      platformRank: item.rank,
      engagement: {
        views: item.viewCount,
        comments: item.discussionCount,
      },
      contentType: 'mixed',
      keyOpinions: await extractTopicOpinions(item.id),
      sentiment: 'neutral',
      tags: [item.category],
      publishedAt: new Date(),
      crawledAt: new Date(),
    });
  }
  
  return topics;
}

// 提取关键观点
async function extractKeyOpinions(keyword: string, platform: string): Promise<string[]> {
  // 抓取热门笔记/帖子摘要
  const posts = await fetchTopPosts(keyword, platform, 10);
  
  // 使用LLM提取关键观点
  const opinions = await llm.extractOpinions(
    posts.map(p => p.content).join('\n---\n')
  );
  
  return opinions.slice(0, 5);  // 返回Top5观点
}
```

#### 微博热搜抓取

```typescript
async function crawlWeiboHotSearch(): Promise<CommunityTopic[]> {
  const hotList = await weiboClient.getHotSearch();
  
  return hotList
    .filter(item => item.category !== '娱乐')  // 过滤纯娱乐话题
    .map(item => ({
      id: `weibo_${item.mid}`,
      title: item.topic,
      platform: 'weibo',
      platformId: item.mid,
      platformUrl: item.link,
      hotScore: normalizeWeiboScore(item.raw_hot),
      platformRank: item.rank,
      engagement: {
        views: item.read_count,
        comments: item.discussion_count,
      },
      contentType: 'mixed',
      keyOpinions: [],  // 异步填充
      sentiment: item.emotion || 'neutral',
      tags: [item.category],
      publishedAt: new Date(item.createtime),
      crawledAt: new Date(),
    }));
}
```

#### 多源话题归并

```typescript
async function mergeTopicsFromAllSources(
  rssTopics: RSSTopic[],
  webTopics: WebSearchResult[],
  communityTopics: CommunityTopic[]
): Promise<UnifiedTopic[]> {
  const allTopics = [
    ...rssTopics.map(t => ({ ...t, source: 'rss' as const })),
    ...webTopics.map(t => ({ ...t, source: 'web_search' as const })),
    ...communityTopics.map(t => ({ ...t, source: 'community' as const })),
  ];
  
  // 1. 实体链接 - 识别同一话题的不同表述
  const entityGroups = await entityLinking(allTopics);
  
  // 2. 合并同一话题的多源数据
  const unifiedTopics: UnifiedTopic[] = entityGroups.map(group => {
    const titles = group.map(t => t.title);
    const canonicalTitle = selectCanonicalTitle(titles);
    
    // 聚合热度
    const aggregatedHotScore = aggregateHotScore(group);
    
    // 收集所有来源
    const sources = group.map(t => ({
      type: t.source,
      platform: (t as any).platform,
      url: (t as any).link || (t as any).platformUrl,
      hotScore: t.hotScore,
    }));
    
    // 聚合关键观点
    const allOpinions = group
      .flatMap(t => (t as any).keyOpinions || [])
      .filter(Boolean);
    
    return {
      id: generateId(),
      title: canonicalTitle,
      hotScore: aggregatedHotScore,
      sources,
      crossPlatform: {
        rss: sources.some(s => s.type === 'rss'),
        web: sources.some(s => s.type === 'web_search'),
        community: sources.some(s => s.type === 'community'),
      },
      keyOpinions: allOpinions.slice(0, 10),
      firstSeenAt: Math.min(...group.map(t => t.publishedAt.getTime())),
      crawledAt: new Date(),
    };
  });
  
  return unifiedTopics;
}

// 实体链接算法
async function entityLinking(topics: any[]): Promise<any[][]> {
  // 1. 基于标题相似度初步聚类
  const similarityMatrix = buildSimilarityMatrix(topics);
  
  // 2. 使用LLM进行实体消歧
  const clusters: any[][] = [];
  const processed = new Set<string>();
  
  for (const topic of topics) {
    if (processed.has(topic.id)) continue;
    
    const cluster = [topic];
    processed.add(topic.id);
    
    for (const other of topics) {
      if (processed.has(other.id)) continue;
      
      // 相似度阈值 + LLM验证
      if (similarityMatrix[topic.id][other.id] > 0.7) {
        const isSame = await llm.verifySameTopic(topic.title, other.title);
        if (isSame) {
          cluster.push(other);
          processed.add(other.id);
        }
      }
    }
    
    clusters.push(cluster);
  }
  
  return clusters;
}
```

---

### 步骤 2: 质量评估

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | RSSItem / 热点内容 |
| 输出 | qualityScore (0-100), credibilityLevel |
| 处理 | 多维度加权评分 |
| 优先级 | P0 |

#### 评分模型

```typescript
interface QualityAssessment {
  sourceAuthority: number;    // 来源权威性 (30%)
  contentCompleteness: number; // 内容完整度 (25%)
  freshness: number;          // 时效性 (20%)
  spread: number;             // 传播度 (15%)
  objectivity: number;        // 客观性 (10%)
  overall: number;            // 综合分
}

function assessQuality(item: RSSItem): QualityAssessment {
  // 1. 来源权威性 (30%)
  const sourceAuthority = calculateSourceAuthority(item.sourceName);
  
  // 2. 内容完整度 (25%)
  const contentCompleteness = assessCompleteness(item);
  
  // 3. 时效性 (20%)
  const freshness = calculateFreshness(item.publishedAt);
  
  // 4. 传播度 (15%)
  const spread = estimateSpread(item);
  
  // 5. 客观性 (10%)
  const objectivity = assessObjectivity(item.title + ' ' + item.summary);
  
  // 加权计算
  const overall = 
    sourceAuthority * 0.3 +
    contentCompleteness * 0.25 +
    freshness * 0.2 +
    spread * 0.15 +
    objectivity * 0.1;
  
  return {
    sourceAuthority,
    contentCompleteness,
    freshness,
    spread,
    objectivity,
    overall: Math.round(overall * 100),
  };
}
```

#### 来源权威性评估

```typescript
const authorityScores: Record<string, number> = {
  // P0 - 官方机构
  '证监会': 1.0,
  '央行': 1.0,
  '国务院': 1.0,
  
  // P1 - 头部媒体
  '财新': 0.95,
  '第一财经': 0.95,
  '华尔街日报': 0.95,
  
  // P2 - 垂直媒体
  '36氪': 0.85,
  '虎嗅': 0.85,
  '机器之心': 0.85,
  
  // 默认
  'default': 0.6,
};

function calculateSourceAuthority(sourceName: string): number {
  return authorityScores[sourceName] || authorityScores['default'];
}
```

#### 内容完整度评估

```typescript
function assessCompleteness(item: RSSItem): number {
  let score = 0;
  
  // 有标题
  if (item.title && item.title.length > 10) score += 0.3;
  
  // 有摘要/正文
  if (item.summary && item.summary.length > 100) score += 0.3;
  
  // 有发布时间
  if (item.publishedAt) score += 0.2;
  
  // 有标签
  if (item.tags && item.tags.length > 0) score += 0.2;
  
  return score;
}
```

---

### 步骤 3: 多源热度验证

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | UnifiedTopic[] (来自RSS+Web+社区) |
| 输出 | HotTopic[] (带热度分的话题) |
| 算法 | 多源交叉验证热度模型 |
| 优先级 | P0 |

#### 多源热度计算模型

```typescript
interface MultiSourceHotScore {
  // 各源原始热度
  rssScore: number;
  webSearchScore: number;
  communityScore: number;
  
  // 交叉验证指标
  crossPlatformValidation: {
    sourceCount: number;      // 覆盖平台数 (1-3)
    consistencyScore: number; // 一致性分数
    authorityBoost: number;   // 权威源加权
  };
  
  // 最终热度
  finalScore: number;
  confidence: number;         // 可信度
}

function calculateMultiSourceHotScore(topic: UnifiedTopic): MultiSourceHotScore {
  // 1. 各源热度归一化
  const rssScore = (topic.sources.find(s => s.type === 'rss')?.hotScore || 0) * 0.3;
  const webScore = (topic.sources.find(s => s.type === 'web_search')?.hotScore || 0) * 0.35;
  const communityScore = (topic.sources.find(s => s.type === 'community')?.hotScore || 0) * 0.35;
  
  // 2. 交叉验证计算
  const sourceCount = [
    topic.crossPlatform.rss,
    topic.crossPlatform.web,
    topic.crossPlatform.community,
  ].filter(Boolean).length;
  
  // 多源一致性奖励
  const consistencyMultiplier = {
    1: 0.6,    // 单一来源，可信度降低
    2: 1.0,    // 双源验证，标准可信度
    3: 1.2,    // 三源交叉，热度加成
  }[sourceCount] || 0.6;
  
  // 3. 权威源加权
  const authorityBoost = topic.sources.some(s => 
    ['证监会', '央行', '国务院', '财新', '第一财经'].includes(s.platform || '')
  ) ? 1.15 : 1.0;
  
  // 4. 最终热度计算
  const baseScore = rssScore + webScore + communityScore;
  const finalScore = Math.min(100, baseScore * consistencyMultiplier * authorityBoost);
  
  // 5. 可信度评估
  const confidence = calculateConfidence({
    sourceCount,
    dataFreshness: Date.now() - topic.firstSeenAt,
    opinionDiversity: topic.keyOpinions.length,
  });
  
  return {
    rssScore,
    webSearchScore: webScore,
    communityScore,
    crossPlatformValidation: {
      sourceCount,
      consistencyScore: consistencyMultiplier,
      authorityBoost,
    },
    finalScore: Math.round(finalScore),
    confidence: Math.round(confidence * 100) / 100,
  };
}

function calculateHotTopics(unifiedTopics: UnifiedTopic[]): HotTopic[] {
  return unifiedTopics.map(topic => {
    const multiScore = calculateMultiSourceHotScore(topic);
    
    // 趋势判断（基于多源时间序列）
    const trend = determineMultiSourceTrend(topic.sources);
    
    // 情感分析（聚合各源情感）
    const sentiment = aggregateMultiSourceSentiment(topic);
    
    return {
      id: topic.id,
      title: topic.title,
      hotScore: multiScore.finalScore,
      trend,
      sentiment,
      multiSourceScore: multiScore,
      sources: topic.sources,
      crossPlatform: topic.crossPlatform,
      keyOpinions: topic.keyOpinions,
      confidence: multiScore.confidence,
    };
  }).sort((a, b) => b.hotScore - a.hotScore);
}
```

#### 趋势判断算法

```typescript
function determineMultiSourceTrend(sources: TopicSource[]): 'up' | 'stable' | 'down' {
  // 按平台分别计算趋势
  const trendsBySource: Record<string, number[]> = {};
  
  for (const source of sources) {
    if (!trendsBySource[source.type]) {
      trendsBySource[source.type] = [];
    }
    trendsBySource[source.type].push(source.hotScore);
  }
  
  // 加权计算整体趋势
  const trendScores: number[] = [];
  
  for (const [type, scores] of Object.entries(trendsBySource)) {
    if (scores.length >= 2) {
      const growth = (scores[scores.length - 1] - scores[0]) / scores[0];
      trendScores.push(growth);
    }
  }
  
  if (trendScores.length === 0) return 'stable';
  
  const avgTrend = trendScores.reduce((a, b) => a + b, 0) / trendScores.length;
  
  if (avgTrend > 0.15) return 'up';
  if (avgTrend < -0.15) return 'down';
  return 'stable';
}
```

#### 趋势判断算法

```typescript
function determineTrend(items: RSSItem[]): 'up' | 'stable' | 'down' {
  // 按小时分组统计
  const hourlyCounts = groupByHour(items);
  
  // 取最近3个时间点
  const recent = hourlyCounts.slice(-3);
  
  if (recent.length < 3) return 'stable';
  
  // 计算增长率
  const growth1 = (recent[1] - recent[0]) / recent[0];
  const growth2 = (recent[2] - recent[1]) / recent[1];
  
  // 连续上升 > 20%
  if (growth1 > 0.2 && growth2 > 0.2) return 'up';
  
  // 连续下降 > 20%
  if (growth1 < -0.2 && growth2 < -0.2) return 'down';
  
  return 'stable';
}
```

---

### 步骤 4: 竞品分析

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | 竞品账号列表, HotTopic[] |
| 输出 | 竞品分析报告, 差异化建议 |
| 处理 | 内容抓取 → 聚类分析 → 空白发现 |
| 优先级 | P1 |

#### 分析流程

```typescript
async function analyzeCompetitors(
  competitors: Competitor[],
  hotTopics: HotTopic[]
): Promise<CompetitorAnalysis> {
  // 1. 抓取竞品内容
  const competitorContents: Record<string, Content[]> = {};
  for (const competitor of competitors) {
    competitorContents[competitor.id] = await fetchCompetitorContent(competitor);
  }
  
  // 2. 主题覆盖度分析
  const coverage = analyzeTopicCoverage(competitorContents, hotTopics);
  
  // 3. 角度分析
  const angles = analyzeContentAngles(competitorContents);
  
  // 4. 发现空白
  const gaps = identifyGaps(coverage, angles);
  
  // 5. 生成建议
  const recommendations = generateRecommendations(gaps);
  
  return {
    coverage,
    angles,
    gaps,
    recommendations,
    differentiationScore: calculateDifferentiationScore(coverage),
  };
}
```

#### 空白发现算法

```typescript
function identifyGaps(
  coverage: TopicCoverage,
  angles: ContentAngles
): string[] {
  const gaps: string[] = [];
  
  // 检查热点覆盖空白
  for (const hotTopic of coverage.hotTopics) {
    if (hotTopic.coverageRate < 0.3) {
      gaps.push(`热点"${hotTopic.title}"未被充分覆盖`);
    }
  }
  
  // 检查角度空白
  const allAngles = ['政策解读', '数据分析', '案例研究', '国际对比', '趋势预测'];
  for (const angle of allAngles) {
    if (!angles.coveredAngles.includes(angle)) {
      gaps.push(`缺少"${angle}"角度的内容`);
    }
  }
  
  return gaps;
}
```

---

### 步骤 5: 评分排序

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | HotTopic[], 竞品分析结果 |
| 输出 | 排序后的 Topic[] |
| 算法 | 多因子加权排序 |
| 优先级 | P0 |

#### 综合评分模型

```typescript
function calculateComprehensiveScore(
  hotTopic: HotTopic,
  competitorAnalysis: CompetitorAnalysis,
  resourceMatch: ResourceMatch
): number {
  const scores = {
    // 热点分 (30%)
    hotScore: hotTopic.hotScore * 0.3,
    
    // 质量分 (25%)
    qualityScore: hotTopic.qualityScore * 0.25,
    
    // 差异化分 (20%)
    differentiationScore: (100 - hotTopic.competitorCoverage) * 0.2,
    
    // 时效分 (15%)
    timelinessScore: calculateTimelinessScore(hotTopic.publishedAt) * 0.15,
    
    // 资源匹配度 (10%)
    resourceMatchScore: resourceMatch.score * 0.1,
  };
  
  return Object.values(scores).reduce((a, b) => a + b, 0);
}
```

#### 排序规则

```typescript
function sortTopics(topics: Topic[]): Topic[] {
  return topics
    .filter(t => t.qualityScore >= 60)  // 过滤低质量
    .sort((a, b) => {
      // 优先按综合分
      if (b.comprehensiveScore !== a.comprehensiveScore) {
        return b.comprehensiveScore - a.comprehensiveScore;
      }
      // 其次按热度
      return b.hotScore - a.hotScore;
    })
    .slice(0, 50);  // 最多50个推荐
}
```

---

### 步骤 6: 保存结果

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | HotTopic[], Topic[] |
| 输出 | void |
| 存储表 | hot_topics, topics |
| 优先级 | P0 |

#### 存储逻辑

```typescript
async function saveHotTopics(topics: HotTopic[]): Promise<void> {
  for (const topic of topics) {
    await query(
      `INSERT INTO hot_topics (
        id, title, source, hot_score, trend, sentiment,
        quality_score, differentiation_score, is_followed,
        published_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (id) DO UPDATE SET
        hot_score = $4,
        trend = $5,
        updated_at = NOW()`,
      [
        topic.id,
        topic.title,
        topic.source,
        topic.hotScore,
        topic.trend,
        topic.sentiment,
        topic.qualityScore,
        topic.differentiationScore,
        topic.isFollowed,
        topic.publishedAt,
      ]
    );
  }
}

async function saveRecommendedTopics(topics: Topic[]): Promise<void> {
  for (const topic of topics) {
    await query(
      `INSERT INTO topics (
        id, title, source, source_id,
        hot_score, quality_score, differentiation_score, comprehensive_score,
        status, priority, tags, recommended_angles, gaps,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        topic.id,
        topic.title,
        topic.source,
        topic.sourceId,
        topic.hotScore,
        topic.qualityScore,
        topic.differentiationScore,
        topic.comprehensiveScore,
        topic.status,
        topic.priority,
        JSON.stringify(topic.tags),
        JSON.stringify(topic.recommendedAngles),
        JSON.stringify(topic.gaps),
      ]
    );
  }
}
```

---

## 3. 数据库存储设计

### 3.1 表结构

#### rss_sources (RSS源表)

```sql
CREATE TABLE rss_sources (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500) NOT NULL,
  category VARCHAR(50),
  priority VARCHAR(10) DEFAULT 'p2',
  is_active BOOLEAN DEFAULT true,
  update_interval INTEGER DEFAULT 30,
  last_crawled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rss_sources_active ON rss_sources(is_active);
CREATE INDEX idx_rss_sources_priority ON rss_sources(priority);
```

#### rss_items (RSS文章表)

```sql
CREATE TABLE rss_items (
  id VARCHAR(50) PRIMARY KEY,
  source_id VARCHAR(50) REFERENCES rss_sources(id),
  source_name VARCHAR(100),
  title VARCHAR(500),
  link VARCHAR(1000) UNIQUE,
  summary TEXT,
  content TEXT,
  published_at TIMESTAMP,
  relevance_score DECIMAL(3,2),
  tags JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rss_items_source ON rss_items(source_id);
CREATE INDEX idx_rss_items_published ON rss_items(published_at);
CREATE INDEX idx_rss_items_relevance ON rss_items(relevance_score DESC);
```

#### hot_topics (热点表)

```sql
CREATE TABLE hot_topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500),
  source VARCHAR(100),
  source_url VARCHAR(1000),
  hot_score INTEGER CHECK (hot_score >= 0 AND hot_score <= 100),
  trend VARCHAR(10) CHECK (trend IN ('up', 'stable', 'down')),
  sentiment VARCHAR(10),
  quality_score INTEGER,
  differentiation_score INTEGER,
  is_followed BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_hot_topics_score ON hot_topics(hot_score DESC);
CREATE INDEX idx_hot_topics_trend ON hot_topics(trend);
```

#### web_search_results (Web搜索结果表)

```sql
CREATE TABLE web_search_results (
  id VARCHAR(50) PRIMARY KEY,
  query VARCHAR(500),
  search_mode VARCHAR(50),      -- trending/verify/gap_fill/competitor
  search_engine VARCHAR(50),
  
  -- 结果内容
  title VARCHAR(500),
  url VARCHAR(1000),
  snippet TEXT,
  content TEXT,
  
  -- 元数据
  published_at TIMESTAMP,
  source_domain VARCHAR(200),
  is_authority_source BOOLEAN DEFAULT false,
  
  -- 关联
  related_topic_id VARCHAR(50),
  
  -- 质量指标
  relevance_score DECIMAL(3,2),
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_web_search_topic ON web_search_results(related_topic_id);
CREATE INDEX idx_web_search_query ON web_search_results(query);
CREATE INDEX idx_web_search_date ON web_search_results(published_at);
```

#### community_topics (社区话题表)

```sql
CREATE TABLE community_topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500),
  platform VARCHAR(50),         -- xiaohongshu/weibo/zhihu/douyin/bilibili
  platform_id VARCHAR(100),
  platform_url VARCHAR(1000),
  
  -- 热度指标
  hot_score INTEGER,
  platform_rank INTEGER,
  
  -- 互动数据
  view_count BIGINT,
  like_count BIGINT,
  comment_count BIGINT,
  share_count BIGINT,
  
  -- 内容特征
  content_type VARCHAR(20),
  key_opinions JSONB,
  sentiment VARCHAR(20),
  tags JSONB,
  
  -- 创作者信息
  creator_name VARCHAR(200),
  creator_followers BIGINT,
  creator_verified BOOLEAN,
  
  -- 分类与过滤
  category VARCHAR(50),
  is_filtered BOOLEAN DEFAULT false,
  filter_reason VARCHAR(200),
  
  published_at TIMESTAMP,
  crawled_at TIMESTAMP DEFAULT NOW(),
  
  -- 关联
  unified_topic_id VARCHAR(50)
);

CREATE INDEX idx_community_platform ON community_topics(platform);
CREATE INDEX idx_community_hot_score ON community_topics(hot_score DESC);
CREATE INDEX idx_community_published ON community_topics(published_at);
CREATE INDEX idx_community_unified ON community_topics(unified_topic_id);
CREATE INDEX idx_community_category ON community_topics(category);
```

#### unified_topics (归并话题表)

```sql
CREATE TABLE unified_topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500),
  canonical_title VARCHAR(500),
  
  -- 聚合热度
  hot_score INTEGER,
  confidence DECIMAL(3,2),
  
  -- 来源分布
  has_rss_source BOOLEAN DEFAULT false,
  has_web_source BOOLEAN DEFAULT false,
  has_community_source BOOLEAN DEFAULT false,
  source_count INTEGER,
  
  -- 来源详情
  sources JSONB,                -- [{type, platform, url, hotScore}]
  
  -- 内容聚合
  key_opinions JSONB,
  cross_platform_sentiment VARCHAR(20),
  
  -- 时间
  first_seen_at TIMESTAMP,
  last_updated_at TIMESTAMP,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/processing/completed
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_unified_hot_score ON unified_topics(hot_score DESC);
CREATE INDEX idx_unified_status ON unified_topics(status);
CREATE INDEX idx_unified_sources ON unified_topics(has_rss_source, has_web_source, has_community_source);
```

#### topics (选题表)

```sql
CREATE TABLE topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500),
  source VARCHAR(50),
  source_id VARCHAR(50),
  unified_topic_id VARCHAR(50) REFERENCES unified_topics(id),
  
  -- 多源热度
  hot_score INTEGER,
  web_verified_score INTEGER,
  community_score INTEGER,
  
  quality_score INTEGER,
  differentiation_score INTEGER,
  comprehensive_score INTEGER,
  
  status VARCHAR(20) DEFAULT 'pending',
  priority VARCHAR(10),
  tags JSONB,
  recommended_angles JSONB,
  gaps JSONB,
  
  -- 来源追踪
  discovery_sources JSONB,      -- [rss, web_search, xiaohongshu, weibo...]
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_topics_status ON topics(status);
CREATE INDEX idx_topics_score ON topics(comprehensive_score DESC);
CREATE INDEX idx_topics_priority ON topics(priority);
CREATE INDEX idx_topics_unified ON topics(unified_topic_id);
```

---

## 4. 接口设计

### 4.1 RSS 管理接口

```yaml
GET    /api/v1/quality/rss-sources
POST   /api/v1/quality/rss-sources
PUT    /api/v1/quality/rss-sources/:id
DELETE /api/v1/quality/rss-sources/:id
POST   /api/v1/quality/rss-sources/crawl    # 手动触发抓取
```

### 4.2 热点追踪接口

```yaml
GET    /api/v1/quality/hot-topics
GET    /api/v1/quality/hot-topics/:id
POST   /api/v1/quality/hot-topics/:id/follow
DELETE /api/v1/quality/hot-topics/:id/follow
GET    /api/v1/quality/hot-topics/trends

# 多源热点
GET    /api/v1/quality/hot-topics/unified           # 获取归并后的热点列表
GET    /api/v1/quality/hot-topics/by-source         # 按来源筛选热点
GET    /api/v1/quality/hot-topics/cross-platform    # 获取跨平台验证的热点
```

### 4.3 Web Search 接口

```yaml
# 搜索配置
GET    /api/v1/quality/web-search/config
PUT    /api/v1/quality/web-search/config

# 搜索执行
POST   /api/v1/quality/web-search/execute           # 执行搜索
POST   /api/v1/quality/web-search/verify/:topicId   # 验证指定话题
POST   /api/v1/quality/web-search/discover          # 发现新话题

# 搜索结果
GET    /api/v1/quality/web-search/results
GET    /api/v1/quality/web-search/results/:id
DELETE /api/v1/quality/web-search/results/:id

# 搜索统计
GET    /api/v1/quality/web-search/stats
GET    /api/v1/quality/web-search/trends
```

### 4.4 社区话题接口

```yaml
# 平台配置
GET    /api/v1/quality/community/platforms         # 获取支持的社区平台
POST   /api/v1/quality/community/platforms/:platform/enable
POST   /api/v1/quality/community/platforms/:platform/disable

# 社区话题
GET    /api/v1/quality/community/topics             # 获取社区话题列表
GET    /api/v1/quality/community/topics/:id
GET    /api/v1/quality/community/topics/by-platform # 按平台筛选

# 平台特定接口
GET    /api/v1/quality/community/xiaohongshu/hot    # 小红书热搜
GET    /api/v1/quality/community/weibo/hot          # 微博热搜
GET    /api/v1/quality/community/zhihu/hot          # 知乎热榜
GET    /api/v1/quality/community/douyin/hot         # 抖音热榜

# 话题操作
POST   /api/v1/quality/community/topics/:id/verify  # 验证话题真实性
POST   /api/v1/quality/community/topics/:id/extract-opinions  # 提取观点
```

### 4.3 选题管理接口

```yaml
GET    /api/v1/topics                       # 获取推荐选题列表
POST   /api/v1/topics                       # 创建选题
GET    /api/v1/topics/:id
POST   /api/v1/topics/:id/approve           # 批准选题
POST   /api/v1/topics/:id/reject            # 拒绝选题
POST   /api/v1/topics/:id/convert-to-task   # 选题转任务
```

### 4.5 竞品分析接口

```yaml
GET    /api/v1/quality/competitors
POST   /api/v1/quality/competitors          # 添加竞品
GET    /api/v1/quality/competitors/analysis # 获取分析报告
GET    /api/v1/quality/gaps                 # 获取空白点列表

# 全渠道竞品监控
GET    /api/v1/quality/competitors/coverage # 竞品覆盖分析
POST   /api/v1/quality/competitors/search   # 搜索竞品内容
```

---

## 5. 性能与限制

### 5.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **数据抓取层** ||
| RSS抓取耗时 | < 5分钟 | 全量源抓取 |
| Web Search耗时 | < 30秒 | 单次搜索(10结果) |
| 社区抓取耗时 | < 3分钟 | 全平台抓取 |
| 多源归并耗时 | < 1分钟 | 实体链接+去重 |
| **处理层** ||
| 热点计算耗时 | < 30秒 | 聚类+评分 |
| 热度验证耗时 | < 45秒 | Web交叉验证 |
| 竞品分析耗时 | < 2分钟 | 全渠道抓取+分析 |
| 排序推荐耗时 | < 5秒 | 综合计算+排序 |
| **并发能力** ||
| 并发RSS源 | 50个 | 同时抓取 |
| 并发Web Search | 5个 | 避免API限流 |
| 并发社区平台 | 3个 | 平台限制考虑 |
| 端到端延迟 | < 10分钟 | 从触发到推荐列表 |

### 5.2 限制规则

| 限制项 | 值 | 说明 |
|--------|-----|------|
| **RSS** ||
| RSS源数量 | 100个 | 最大配置数 |
| 单源抓取频率 | P0:实时 P1:15min P2:30min | 根据优先级 |
| **Web Search** ||
| 每小时搜索配额 | 100次 | Tavily/Serper限制 |
| 单次最大结果 | 20条 | 控制成本 |
| 搜索关键词长度 | < 100字符 | 避免复杂查询 |
| 热点验证窗口 | 24小时 | 搜索时间范围 |
| **社区抓取** ||
| 抓取平台数 | 7个 | 小红书/微博/知乎/抖音/B站/即刻/雪球 |
| 单平台抓取频率 | 15分钟 | 最小间隔 |
| 单平台话题数 | 50个 | 每次抓取上限 |
| 话题保留时间 | 48小时 | 社区话题时效性强 |
| **通用** ||
| 热点保留时间 | 7天 | 过期自动清理 |
| 推荐选题数 | 50个 | 最多推荐 |
| 评分最低阈值 | 60分 | 低于不展示 |
| 跨源归并阈值 | 0.7 | 实体链接相似度 |

---

## 6. 附录

### 6.1 相关代码文件

| 文件 | 路径 | 说明 |
|------|------|------|
| **数据采集** ||
| RSS采集服务 | `api/src/services/rssCollector.ts` | RSS源抓取 |
| Web Search服务 | `api/src/services/webSearchService.ts` | 主动搜索发现 |
| 社区抓取服务 | `api/src/services/communityCrawler.ts` | 社媒平台抓取 |
| 小红书爬虫 | `api/src/crawlers/xiaohongshu.ts` | 小红书特定实现 |
| 微博API | `api/src/crawlers/weibo.ts` | 微博热搜抓取 |
| **话题处理** ||
| 话题归并 | `api/src/services/topicUnification.ts` | 实体链接与去重 |
| 热点分析 | `api/src/services/hotTopicService.ts` | 多源热度计算 |
| 竞品分析 | `api/src/services/competitorAnalysis.ts` | 全渠道竞品监控 |
| **路由** ||
| RSS路由 | `api/src/routes/rss.ts` | RSS管理API |
| 热点路由 | `api/src/routes/v34-hot-topics.ts` | 热点追踪API |
| Web Search路由 | `api/src/routes/webSearch.ts` | 搜索API |
| 社区话题路由 | `api/src/routes/communityTopics.ts` | 社媒话题API |

### 6.2 相关文档

- [PRD-Production-Pipeline-v5.0.md](./PRD-Production-Pipeline-v5.0.md)
- [PRD-Data-Collection-Detail-v5.0.md](./PRD-Data-Collection-Detail-v5.0.md)

---

**文档维护**: 产品研发运营协作体系
**更新频率**: 每迭代更新
**下次评审**: 2026-04-06
