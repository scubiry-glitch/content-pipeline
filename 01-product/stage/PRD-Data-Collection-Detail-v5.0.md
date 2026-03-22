# 产品需求文档: 数据采集流程详细设计 v5.0

**版本**: v5.0
**日期**: 2026-03-23
**状态**: 📝 详细设计文档
**依赖**: PRD-Production-Pipeline-v5.0.md

---

## 1. 数据采集流程概览

### 1.1 流程架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         深度研究数据采集流程                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │  任务触发    │ ← 用户点击"开始采集"或自动触发                              │
│  └──────┬──────┘                                                            │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 1:     │     │ 输入: taskId, outline, config                   │   │
│  │ 提取关键词   │ →   │ 输出: keywords[] (最多5个)                       │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      步骤 2-4: 并行采集                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ Web搜索采集  │  │ RSS采集      │  │ 素材库采集   │                 │   │
│  │  │ (可选)       │  │ (可选)       │  │ (可选)       │                 │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │   │
│  │         └─────────────────┼─────────────────┘                        │   │
│  └───────────────────────────┼─────────────────────────────────────────┘   │
│                              ▼                                              │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 5:     │     │ 处理: 去重 → 过滤 → 排序 → 截断                 │   │
│  │ 数据清洗    │ →   │ 规则: 可信度≥minCredibility, 最多maxResults条   │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 6:     │     │ 存储: research_annotations 表                   │   │
│  │ 保存结果    │ →   │ 冲突处理: ON CONFLICT UPDATE                    │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 7:     │     │ 更新: tasks.research_data 字段                  │   │
│  │ 任务更新    │ →   │ 统计: bySource 分布                            │   │
│  └─────────────┘     └─────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心数据结构

#### ResearchConfig - 采集配置

```typescript
interface ResearchConfig {
  // 是否自动采集
  autoCollect: boolean;
  
  // 采集源列表
  sources: ('web' | 'rss' | 'asset' | 'news')[];
  
  // 最大结果数 (默认 20)
  maxResults: number;
  
  // 最低可信度阈值 (默认 0.5)
  minCredibility: number;
  
  // 自定义关键词列表
  keywords: string[];
  
  // 排除关键词列表
  excludeKeywords: string[];
  
  // 时间范围
  timeRange: '1d' | '7d' | '30d' | '90d' | 'all';
}
```

**配置示例**:
```json
{
  "autoCollect": true,
  "sources": ["web", "rss", "asset"],
  "maxResults": 20,
  "minCredibility": 0.5,
  "keywords": ["保租房定价", "住房福利模式"],
  "excludeKeywords": ["广告", "推广"],
  "timeRange": "30d"
}
```

#### CollectedContent - 采集内容

```typescript
interface CollectedContent {
  // 唯一标识
  id: string;
  
  // 来源名称 (如: "36氪", "Web Search")
  source: string;
  
  // 来源类型
  sourceType: 'web' | 'rss' | 'asset' | 'news';
  
  // 标题
  title: string;
  
  // URL (素材库可能为空)
  url?: string;
  
  // 完整内容 (素材库才有)
  content?: string;
  
  // 摘要
  summary: string;
  
  // 可信度 (0-1)
  credibility: number;
  
  // 相关度分数 (0-1)
  relevanceScore: number;
  
  // 发布时间
  publishedAt?: Date;
  
  // 标签
  tags: string[];
}
```

---

## 2. 详细步骤设计

### 步骤 1: 关键词提取

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | outline (大纲对象) |
| 输出 | keywords[] (最多 5 个关键词) |
| 优先级 | P0 |

#### 提取规则

```typescript
function extractKeywordsFromOutline(outline: any): string[] {
  const keywords: string[] = [];
  
  // 1. 提取主题
  if (outline.topic) {
    keywords.push(outline.topic);
  }
  
  // 2. 提取一级章节标题
  if (outline.sections) {
    for (const section of outline.sections) {
      if (section.title) {
        keywords.push(section.title);
      }
      // 3. 提取二级章节标题
      if (section.subsections) {
        for (const sub of section.subsections) {
          if (sub.title) {
            keywords.push(sub.title);
          }
        }
      }
    }
  }
  
  // 4. 去重并限制数量
  return [...new Set(keywords)].slice(0, 5);
}
```

#### 示例

**输入大纲**:
```json
{
  "topic": "保租房REITs市场分析",
  "sections": [
    {
      "title": "保租房定价机制研究",
      "subsections": [
        { "title": "租金定价模型" },
        { "title": "政府补贴政策" }
      ]
    },
    {
      "title": "全球住房福利模式对比"
    }
  ]
}
```

**输出关键词**:
```
[
  "保租房REITs市场分析",
  "保租房定价机制研究",
  "租金定价模型",
  "政府补贴政策",
  "全球住房福利模式对比"
]
```

---

### 步骤 2: 网页搜索采集

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | keywords[], ResearchConfig |
| 输出 | CollectedContent[] |
| 依赖 | WebSearch 服务 (Tavily/Serper API) |
| 优先级 | P0 |

#### 采集策略

```typescript
async function collectFromWeb(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const items: CollectedContent[] = [];
  const webSearch = getWebSearchService();
  
  // 最多使用前 3 个关键词
  for (const keyword of keywords.slice(0, 3)) {
    try {
      // 每个关键词搜索 5 条结果
      const results = await webSearch.search({
        query: keyword,
        maxResults: 5,
      });
      
      for (const result of results) {
        items.push({
          // ID 生成: web- + URL base64 前16位
          id: `web-${Buffer.from(result.url).toString('base64').slice(0, 16)}`,
          source: result.source || 'Web Search',
          sourceType: 'web',
          title: result.title,
          url: result.url,
          summary: result.content?.slice(0, 500) || '',
          credibility: result.credibility?.score || 0.6,
          relevanceScore: calculateRelevance(result.title, keyword),
          publishedAt: result.publishedAt ? new Date(result.publishedAt) : undefined,
          tags: [keyword],
        });
      }
    } catch (error) {
      console.error(`[Research] Web search failed for "${keyword}":`, error);
    }
  }
  
  return items;
}
```

#### 相关度计算算法

```typescript
function calculateRelevance(text: string, keyword: string): number {
  const textLower = text.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  // 完全匹配
  if (textLower === keywordLower) return 1.0;
  
  // 包含匹配
  if (textLower.includes(keywordLower)) return 0.8;
  
  // 词频计算
  const words = keywordLower.split(/\s+/);
  const matches = words.filter(w => textLower.includes(w)).length;
  return 0.4 + (matches / words.length) * 0.4;
}
```

**相关度评分标准**:
| 匹配类型 | 分数 | 说明 |
|---------|------|------|
| 完全匹配 | 1.0 | 标题完全等于关键词 |
| 包含匹配 | 0.8 | 标题包含完整关键词 |
| 部分匹配 | 0.4-0.8 | 匹配关键词中的部分词汇 |
| 无匹配 | 0.4 | 基础分 |

---

### 步骤 3: RSS 采集

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | keywords[], ResearchConfig |
| 输出 | CollectedContent[] |
| 依赖 | rss_items 表 |
| 优先级 | P0 |

#### 采集策略

```typescript
async function collectFromRSS(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  // 时间范围映射
  const timeRanges: Record<string, string> = {
    '1d': '1 day',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    'all': '365 days',
  };
  
  const timeFilter = timeRanges[config.timeRange] || '30 days';
  
  // SQL 查询
  const result = await query(
    `SELECT
      id, source_name, title, link, summary,
      published_at, relevance_score, tags
    FROM rss_items
    WHERE published_at > NOW() - INTERVAL '${timeFilter}'
      AND (
        title ILIKE $1 OR summary ILIKE $1 OR
        title ILIKE $2 OR summary ILIKE $2 OR
        ...
      )
    ORDER BY relevance_score DESC
    LIMIT $n`,
    [...keywords.map(k => `%${k}%`), config.maxResults]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    source: row.source_name,
    sourceType: 'rss',
    title: row.title,
    url: row.link,
    summary: row.summary || '',
    credibility: parseFloat(row.relevance_score) || 0.6,
    relevanceScore: parseFloat(row.relevance_score) || 0.5,
    publishedAt: row.published_at,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  }));
}
```

#### 查询逻辑

| 条件 | 说明 |
|------|------|
| 时间过滤 | `published_at > NOW() - INTERVAL '30 days'` |
| 关键词匹配 | `title ILIKE '%keyword%' OR summary ILIKE '%keyword%'` |
| 排序规则 | `ORDER BY relevance_score DESC` |
| 数量限制 | `LIMIT maxResults` |

---

### 步骤 4: 素材库采集

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | keywords[], ResearchConfig |
| 输出 | CollectedContent[] |
| 依赖 | assets 表 |
| 优先级 | P0 |

#### 采集策略

```typescript
async function collectFromAssets(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const result = await query(
    `SELECT
      id, title, content, source,
      quality_score, tags, created_at
    FROM assets
    WHERE (
      title ILIKE $1 OR content ILIKE $1 OR
      title ILIKE $2 OR content ILIKE $2 OR
      ...
    )
    ORDER BY quality_score DESC
    LIMIT $n`,
    [...keywords.map(k => `%${k}%`), config.maxResults]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    source: row.source || '素材库',
    sourceType: 'asset',
    title: row.title,
    url: null, // 素材库没有 URL
    content: row.content?.slice(0, 1000),
    summary: row.content?.slice(0, 300) || '',
    credibility: parseFloat(row.quality_score) || 0.7,
    relevanceScore: parseFloat(row.quality_score) || 0.5,
    publishedAt: row.created_at,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  }));
}
```

**素材库特点**:
- 无 URL，使用素材 ID 作为标识
- 包含完整内容（截取前 1000 字符）
- 可信度基于 quality_score
- 发布时间为 created_at

---

### 步骤 5: 去重排序

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | CollectedContent[] (所有来源合并) |
| 输出 | CollectedContent[] (去重过滤后) |
| 处理链 | 去重 → 过滤 → 排序 → 截断 |
| 优先级 | P0 |

#### 处理流程

```typescript
// 1. 按 URL 去重
const uniqueItems = deduplicateByUrl(allItems);

// 2. 过滤 + 排序 + 截断
const sortedItems = uniqueItems
  .filter(item => item.credibility >= config.minCredibility)  // 可信度过滤
  .sort((a, b) => b.relevanceScore - a.relevanceScore)        // 相关度排序
  .slice(0, config.maxResults);                                // 数量截断
```

#### 去重逻辑

```typescript
function deduplicateByUrl(items: CollectedContent[]): CollectedContent[] {
  const seen = new Set<string>();
  return items.filter(item => {
    // 素材库没有 URL，保留
    if (!item.url) return true;
    
    // URL 已存在，跳过
    if (seen.has(item.url)) return false;
    
    // 记录 URL
    seen.add(item.url);
    return true;
  });
}
```

**去重规则**:
| 情况 | 处理 |
|------|------|
| 有 URL 且重复 | 保留第一个，跳过后续 |
| 有 URL 且不重复 | 保留 |
| 无 URL (素材库) | 全部保留 |

#### 过滤规则

| 条件 | 说明 |
|------|------|
| 可信度阈值 | `item.credibility >= config.minCredibility` |
| 默认值 | minCredibility = 0.5 |

**可信度等级**:
| 分数 | 等级 | 说明 |
|------|------|------|
| 0.8-1.0 | A | 高可信度 |
| 0.6-0.8 | B | 中等可信度 |
| 0.5-0.6 | C | 基础可信度 |
| < 0.5 | - | 被过滤 |

#### 排序规则

```typescript
.sort((a, b) => b.relevanceScore - a.relevanceScore)
```

按相关度分数降序排列。

---

### 步骤 6: 保存结果

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | taskId, CollectedContent[] |
| 输出 | void |
| 存储表 | research_annotations |
| 优先级 | P0 |

#### 存储逻辑

```typescript
async function saveCollectedContent(
  taskId: string,
  items: CollectedContent[]
): Promise<void> {
  for (const item of items) {
    await query(
      `INSERT INTO research_annotations (
        task_id, type, url, title, credibility, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (task_id, url) DO UPDATE SET
        title = $4,
        credibility = $5,
        updated_at = NOW()`,
      [
        taskId,
        item.sourceType === 'asset' ? 'asset' : 'url',
        item.url || item.id,
        item.title,
        JSON.stringify({
          level: item.credibility > 0.8 ? 'A' : item.credibility > 0.6 ? 'B' : 'C',
          score: item.credibility
        }),
      ]
    );
  }
}
```

#### 存储字段映射

| CollectedContent | research_annotations | 说明 |
|-----------------|---------------------|------|
| sourceType | type | 'asset' 或 'url' |
| url / id | url | URL 或素材 ID |
| title | title | 标题 |
| credibility | credibility | JSON 格式 `{level, score}` |

#### 冲突处理

使用 `ON CONFLICT (task_id, url) DO UPDATE`:
- 如果同一任务下相同 URL 已存在，更新标题和可信度
- 避免重复插入

---

### 步骤 7: 更新任务

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | CollectedContent[], bySource 统计 |
| 输出 | { totalCollected, bySource, items } |
| 更新字段 | tasks.research_data |
| 优先级 | P0 |

#### 统计逻辑

```typescript
// 按来源统计
const bySource: Record<string, number> = {};
sortedItems.forEach(item => {
  bySource[item.sourceType] = (bySource[item.sourceType] || 0) + 1;
});

// 返回结果
return {
  totalCollected: sortedItems.length,
  bySource,
  items: sortedItems,
};
```

**返回结构**:
```json
{
  "totalCollected": 15,
  "bySource": {
    "web": 5,
    "rss": 6,
    "asset": 4
  },
  "items": [...]
}
```

---

## 3. 数据库存储设计

### 3.1 表结构

#### research_annotations (研究采集结果表)

```sql
CREATE TABLE research_annotations (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  type VARCHAR(20) NOT NULL, -- 'url' | 'asset'
  url TEXT NOT NULL,
  title VARCHAR(500),
  credibility JSONB, -- { level: 'A'|'B'|'C', score: number }
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, url)
);

CREATE INDEX idx_research_annotations_task ON research_annotations(task_id);
CREATE INDEX idx_research_annotations_type ON research_annotations(type);
```

#### tasks (任务表 - 扩展字段)

```sql
-- 研究配置字段
ALTER TABLE tasks ADD COLUMN research_config JSONB;

-- 研究数据字段
ALTER TABLE tasks ADD COLUMN research_data JSONB;
```

### 3.2 配置存储格式

**tasks.research_config**:
```json
{
  "autoCollect": true,
  "sources": ["web", "rss", "asset"],
  "maxResults": 20,
  "minCredibility": 0.5,
  "keywords": ["保租房", "REITs"],
  "excludeKeywords": [],
  "timeRange": "30d"
}
```

**tasks.research_data**:
```json
{
  "totalCollected": 15,
  "bySource": {
    "web": 5,
    "rss": 6,
    "asset": 4
  },
  "lastCollectedAt": "2026-03-23T10:30:00Z"
}
```

---

## 4. 接口设计

### 4.1 触发采集

```yaml
POST /api/v1/research/:taskId/collect

Request:
  body:
    config: ResearchConfig  # 可选，不传则使用默认配置

Response:
  {
    "message": "采集任务已启动",
    "taskId": "task_xxx",
    "jobId": "job_xxx"
  }
```

### 4.2 获取采集结果

```yaml
GET /api/v1/research/:taskId/collected

Query:
  limit: number    # 默认 20
  offset: number   # 默认 0
  source: string   # 可选过滤: web/rss/asset

Response:
  {
    "items": [
      {
        "id": "web_xxx",
        "source": "36氪",
        "sourceType": "web",
        "title": "...",
        "url": "...",
        "summary": "...",
        "credibility": 0.85,
        "relevanceScore": 0.92,
        "publishedAt": "2026-03-20T10:00:00Z",
        "tags": ["保租房"]
      }
    ],
    "total": 15,
    "pagination": {
      "limit": 20,
      "offset": 0,
      "hasMore": false
    }
  }
```

### 4.3 获取/更新研究配置

```yaml
GET /api/v1/research/:taskId/config

Response:
  {
    "autoCollect": true,
    "sources": ["web", "rss"],
    "maxResults": 20,
    "minCredibility": 0.5,
    "keywords": [],
    "excludeKeywords": [],
    "timeRange": "30d"
  }

POST /api/v1/research/:taskId/config

Request:
  body:
    config: ResearchConfig

Response:
  {
    "success": true,
    "config": ResearchConfig
  }
```

---

## 5. 性能与限制

### 5.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 单次采集耗时 | < 30s | 3 个关键词 × 每来源 5-20 条结果 |
| 数据库查询 | < 500ms | RSS + Assets 查询 |
| Web 搜索 | < 3s/关键词 | Tavily/Serper API 调用 |
| 并发处理 | 5 任务 | 同时进行的采集任务数 |

### 5.2 限制规则

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 最大关键词数 | 5 | 超出部分截断 |
| Web 搜索关键词 | 3 | 只使用前 3 个关键词 |
| 每关键词结果 | 5 | Web 搜索每词最多 5 条 |
| 默认最大结果 | 20 | 最终返回条数 |
| 时间范围 | 30d | 默认只查 30 天内数据 |
| 可信度阈值 | 0.5 | 低于此值被过滤 |

---

## 6. 错误处理

### 6.1 错误类型

| 错误 | 处理策略 | 日志级别 |
|------|---------|---------|
| Web 搜索失败 | 跳过该关键词，继续其他 | error |
| 数据库连接失败 | 整体失败，返回错误 | error |
| 关键词为空 | 返回空结果 | warn |
| 结果为空 | 正常返回空数组 | info |

### 6.2 错误日志

```typescript
console.error(`[Research] Web search failed for "${keyword}":`, error);
```

---

## 7. 扩展设计

### 7.1 未来扩展

| 功能 | 优先级 | 说明 |
|------|--------|------|
| News API 采集 | P1 | 接入新闻 API 补充来源 |
| 语义搜索 | P1 | 使用 Embedding 进行语义匹配 |
| 自动关键词扩展 | P2 | 使用 LLM 扩展相关关键词 |
| 采集调度队列 | P2 | 使用 BullMQ 管理采集任务 |
| 采集结果去重优化 | P2 | 使用 SimHash 进行内容去重 |

---

## 8. 附录

### 8.1 代码文件位置

| 文件 | 路径 |
|------|------|
| 采集服务 | `api/src/services/deepResearchCollector.ts` |
| Web 搜索 | `api/src/services/webSearch.ts` |
| 路由接口 | `api/src/routes/research.ts` |
| 数据库连接 | `api/src/db/connection.ts` |

### 8.2 相关文档

- [PRD-Production-Pipeline-v5.0.md](./PRD-Production-Pipeline-v5.0.md) - 总体需求文档
- [AGENTS.md](../../AGENTS.md) - Agent 架构设计
- [DEPLOY.md](../../DEPLOY.md) - 部署配置

---

**文档维护**: 本文档由研发团队维护
**更新频率**: 每迭代更新一次
**下次评审**: 2026-04-06
