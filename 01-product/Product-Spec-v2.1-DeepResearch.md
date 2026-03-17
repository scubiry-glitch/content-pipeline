# 产品规格: 深度研究自动采集 v2.1

**版本**: v2.1
**日期**: 2026-03-16
**状态**: ✅ 已完成
**负责人**: 产品研发运营协作体系
**优先级**: P0

---

## 1. 版本概述

### 1.1 背景

在 v2.0 深度研究阶段，研究员需要手动搜索和收集相关资料，效率低下。v2.1 引入自动采集功能，根据大纲配置自动抓取相关内容。

### 1.2 目标

实现研究自动采集配置，支持多源内容抓取：
- Web 搜索自动采集
- RSS 订阅内容匹配
- 素材库智能推荐

### 1.3 成功标准

| 指标 | 目标 |
|------|------|
| 采集配置成功率 | >95% |
| 关键词提取准确率 | >80% |
| 采集内容相关性 | >70% |
| 响应时间 | <3秒 |

---

## 2. 功能清单

### 2.1 采集配置 (Research Config)

**功能**:
- ✅ 采集开关配置（自动/手动）
- ✅ 采集源选择（web/rss/asset）
- ✅ 最大采集数量设置
- ✅ 最低可信度阈值
- ✅ 自定义关键词
- ✅ 排除关键词
- ✅ 时间范围选择

**配置结构**:
```typescript
interface ResearchConfig {
  autoCollect: boolean;              // 自动采集开关
  sources: ('web' | 'rss' | 'asset' | 'news')[];  // 采集源
  maxResults: number;                // 最大结果数
  minCredibility: number;            // 最低可信度
  keywords: string[];                // 自定义关键词
  excludeKeywords: string[];         // 排除关键词
  timeRange: '1d' | '7d' | '30d' | '90d' | 'all';  // 时间范围
}
```

**默认配置**:
```json
{
  "autoCollect": true,
  "sources": ["web", "rss"],
  "maxResults": 20,
  "minCredibility": 0.5,
  "keywords": [],
  "excludeKeywords": [],
  "timeRange": "30d"
}
```

---

### 2.2 关键词提取 (Keyword Extraction)

**功能**:
- ✅ 从 topic 提取主题关键词
- ✅ 从 sections 提取章节关键词
- ✅ 从 subsections 提取子主题关键词
- ✅ 自动去重和限制数量

**提取规则**:
```typescript
function extractKeywordsFromOutline(outline: Outline): string[] {
  const keywords: string[] = [];

  // 1. 提取主题
  if (outline.topic) keywords.push(outline.topic);

  // 2. 提取章节标题
  if (outline.sections) {
    for (const section of outline.sections) {
      if (section.title) keywords.push(section.title);
      // 3. 提取子章节
      if (section.subsections) {
        for (const sub of section.subsections) {
          if (sub.title) keywords.push(sub.title);
        }
      }
    }
  }

  // 去重并限制数量
  return [...new Set(keywords)].slice(0, 5);
}
```

---

### 2.3 多源采集 (Multi-Source Collection)

#### 2.3.1 Web 搜索采集

**功能**:
- ✅ 基于关键词进行 Web 搜索
- ✅ 结果去重
- ✅ 可信度评分
- ✅ 相关度计算

**实现**:
```typescript
async function collectFromWeb(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const items: CollectedContent[] = [];
  const webSearch = getWebSearchService();

  for (const keyword of keywords.slice(0, 3)) {
    const results = await webSearch.search({
      query: keyword,
      maxResults: 5,
    });

    for (const result of results) {
      items.push({
        id: `web-${hash(result.url)}`,
        source: result.source || 'Web Search',
        sourceType: 'web',
        title: result.title,
        url: result.url,
        summary: result.content?.slice(0, 500),
        credibility: result.credibility?.score || 0.6,
        relevanceScore: calculateRelevance(result.title, keyword),
        tags: [keyword],
      });
    }
  }
  return items;
}
```

#### 2.3.2 RSS 采集

**功能**:
- ✅ 从 RSS 数据库检索相关内容
- ✅ 时间范围过滤
- ✅ 关键词匹配
- ✅ 按相关度排序

**SQL 查询**:
```sql
SELECT id, source_name, title, link, summary,
       published_at, relevance_score, tags
FROM rss_items
WHERE published_at > NOW() - INTERVAL '${timeFilter}'
  AND (title ILIKE '%keyword%' OR summary ILIKE '%keyword%')
ORDER BY relevance_score DESC
LIMIT ${maxResults}
```

#### 2.3.3 素材库采集

**功能**:
- ✅ 从素材库检索相关内容
- ✅ 质量评分排序
- ✅ 关键词匹配

**实现**:
```typescript
async function collectFromAssets(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const result = await query(
    `SELECT id, title, content, source, quality_score, tags
     FROM assets
     WHERE title ILIKE '%keyword%' OR content ILIKE '%keyword%'
     ORDER BY quality_score DESC
     LIMIT $1`,
    [config.maxResults]
  );

  return result.rows.map(row => ({
    id: row.id,
    sourceType: 'asset',
    title: row.title,
    credibility: parseFloat(row.quality_score) || 0.7,
    relevanceScore: parseFloat(row.quality_score) || 0.5,
    // ...
  }));
}
```

---

### 2.4 结果处理 (Result Processing)

**功能**:
- ✅ 按 URL 去重
- ✅ 可信度过滤
- ✅ 按相关度排序
- ✅ 限制返回数量

**处理流程**:
```typescript
// 1. 去重
const uniqueItems = deduplicateByUrl(allItems);

// 2. 过滤和排序
const sortedItems = uniqueItems
  .filter(item => item.credibility >= config.minCredibility)
  .sort((a, b) => b.relevanceScore - a.relevanceScore)
  .slice(0, config.maxResults);

// 3. 保存到数据库
await saveCollectedContent(taskId, sortedItems);
```

---

## 3. API 接口

### 3.1 研究配置接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/research/:taskId/config` | GET | 获取研究配置 |
| `/api/v1/research/:taskId/config` | POST | 保存研究配置 |

**获取配置响应**:
```json
{
  "autoCollect": true,
  "sources": ["web", "rss", "asset"],
  "maxResults": 20,
  "minCredibility": 0.5,
  "keywords": ["人工智能", "大模型"],
  "excludeKeywords": ["游戏"],
  "timeRange": "30d"
}
```

**保存配置请求**:
```json
{
  "autoCollect": true,
  "sources": ["web", "rss"],
  "maxResults": 30,
  "minCredibility": 0.6,
  "keywords": ["AI", "GPT"],
  "excludeKeywords": [],
  "timeRange": "7d"
}
```

### 3.2 采集接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/research/:taskId/collect` | POST | 触发自动采集 |
| `/api/v1/research/:taskId/collected` | GET | 获取采集结果 |

**触发采集响应**:
```json
{
  "message": "Research collection started in background",
  "taskId": "task_abc123",
  "config": {
    "autoCollect": true,
    "sources": ["web", "rss", "asset"],
    "maxResults": 10
  }
}
```

**获取结果响应**:
```json
{
  "items": [
    {
      "id": "web-abc123",
      "type": "url",
      "url": "https://example.com/article",
      "title": "AI发展趋势分析",
      "credibility": {
        "level": "A",
        "score": 0.95
      },
      "created_at": "2024-03-15T10:30:00Z"
    }
  ],
  "total": 10
}
```

---

## 4. 数据库 Schema

### 4.1 任务表扩展

```sql
-- 添加研究配置字段到 tasks 表
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS research_config JSONB;

-- 添加研究数据字段
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS research_data JSONB;
```

### 4.2 研究标注表

```sql
CREATE TABLE IF NOT EXISTS research_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('url', 'asset')),
  url TEXT,
  asset_id VARCHAR(50) REFERENCES assets(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  credibility JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(task_id, url)
);

-- 创建索引
CREATE INDEX idx_research_annotations_task ON research_annotations(task_id);
```

---

## 5. 文件结构

```
api/src/
├── services/
│   └── deepResearchCollector.ts    # 深度研究采集服务
├── routes/
│   └── research.ts                 # 研究路由
└── db/
    └── connection.ts               # 数据库连接（含 schema）
```

---

## 6. 使用流程

### 6.1 配置采集

```bash
# 1. 获取默认配置
curl http://localhost:3000/api/v1/research/task-123/config \
  -H "Authorization: Bearer dev-token"

# 2. 保存自定义配置
curl -X POST http://localhost:3000/api/v1/research/task-123/config \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "autoCollect": true,
    "sources": ["web", "rss", "asset"],
    "maxResults": 20,
    "minCredibility": 0.5,
    "keywords": ["人工智能", "大模型"],
    "excludeKeywords": [],
    "timeRange": "30d"
  }'
```

### 6.2 执行采集

```bash
# 触发自动采集
curl -X POST http://localhost:3000/api/v1/research/task-123/collect \
  -H "Authorization: Bearer dev-token"

# 查询采集结果
curl http://localhost:3000/api/v1/research/task-123/collected?limit=10 \
  -H "Authorization: Bearer dev-token"
```

---

## 7. 测试计划

| 模块 | 测试数 | 说明 |
|------|--------|------|
| 配置管理 | 4 | 获取/保存配置 |
| 关键词提取 | 3 | 大纲解析 |
| Web 采集 | 3 | 搜索、去重、评分 |
| RSS 采集 | 2 | 时间过滤、匹配 |
| Asset 采集 | 2 | 质量排序 |
| 结果处理 | 2 | 过滤、排序、保存 |
| API 集成 | 4 | 端点测试 |
| **总计** | **20** | |

---

## 8. 版本历史

| 版本 | 日期 | 修改内容 |
|-----|------|---------|
| v2.1 | 2026-03-16 | 深度研究自动采集功能 |

---

**状态**: 已完成 ✅
**提交**: c55cf97 v2.1: 深度研究自动采集功能
