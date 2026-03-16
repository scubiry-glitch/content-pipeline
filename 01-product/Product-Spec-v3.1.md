# 内容质量输入体系 v3.1 产品规格文档

**版本**: v3.1
**日期**: 2026-03-16
**状态**: 规划中
**基于**: v3.0 六轮迭代成果 (149 tests passed)

---

## 1. 版本概述

### 1.1 v3.0 成果回顾

v3.0完成了内容质量输入体系的基础建设：

| 模块 | 测试数 | 核心能力 |
|------|--------|----------|
| NewsAggregator | 21 | RSS聚合、热点发现、事实核查 |
| AudienceMatcher | 21 | 阅读难度、受众匹配、平台适配 |
| QualityDashboard | 22 | 质量评分、实时预警、优化建议 |
| DashboardUI | 14 | 可视化仪表盘 |
| ContentGenerationIntegration | 18 | 质量数据注入生成流程 |
| RSSDatabaseIntegration | 31 | 数据库存储、RSS抓取、热点存储 |

**累计**: 149/149 tests passed, 24个RSS源, 3个数据库表

### 1.2 v3.1 升级目标

在v3.0基础上，v3.1聚焦**智能化**与**开放性**：

1. **智能推荐** - 基于阅读行为的个性化热点推荐
2. **多语言** - 英文RSS源接入与自动翻译
3. **情感分析** - 市场情绪指标与异常预警
4. **研报关联** - 热点话题与研报智能匹配
5. **API开放** - 对外提供标准化数据接口

---

## 2. 功能规格

### 2.1 智能推荐系统 (SmartRecommender)

#### 需求描述
基于用户历史阅读行为和互动数据，为用户推荐个性化热点话题，提升内容生产效率。

#### 功能列表

| ID | 功能 | 优先级 | 描述 |
|----|------|--------|------|
| SR-001 | 用户行为追踪 | P0 | 记录阅读、收藏、分享行为 |
| SR-002 | 兴趣画像构建 | P0 | 基于行为生成用户兴趣标签 |
| SR-003 | 协同过滤推荐 | P1 | 相似用户的热点偏好推荐 |
| SR-004 | 内容相似度推荐 | P1 | 基于历史喜好的内容推荐 |
| SR-005 | 推荐解释 | P2 | 说明推荐理由（"基于您的科技偏好"） |

#### 算法规格

```typescript
interface RecommendationEngine {
  // 用户兴趣向量
  userInterestVector: Map<string, number>; // topic -> weight

  // 推荐计算
  calculateRecommendation(
    userId: string,
    hotTopics: HotTopic[],
    limit: number
  ): RecommendedTopic[];

  // 反馈学习
  recordFeedback(
    userId: string,
    topicId: string,
    action: 'view' | 'like' | 'share' | 'ignore'
  ): void;
}

// 推荐分数计算
recommendationScore =
  contentRelevance * 0.4 +      // 内容与用户兴趣匹配度
  collaborativeScore * 0.3 +    // 协同过滤分数
  trendingScore * 0.2 +         // 热度趋势
  diversityBonus * 0.1;         // 多样性奖励
```

---

### 2.2 多语言支持 (MultiLanguageSupport)

#### 需求描述
接入英文RSS源，支持自动翻译，扩大信息来源范围。

#### 功能列表

| ID | 功能 | 优先级 | 描述 |
|----|------|--------|------|
| ML-001 | 英文源接入 | P0 | 接入TechCrunch、The Verge等英文源 |
| ML-002 | 自动翻译 | P0 | 标题+摘要自动翻译成中文 |
| ML-003 | 原文保留 | P0 | 保留原文链接供参考 |
| ML-004 | 翻译质量评分 | P1 | 评估翻译可信度 |
| ML-005 | 双语展示 | P1 | 中英文对照展示 |

#### 数据源配置

```json
{
  "international_enhanced": {
    "name": "国际英文增强",
    "sources": [
      { "id": "techcrunch", "priority": "P1", "language": "en" },
      { "id": "theverge", "priority": "P2", "language": "en" },
      { "id": "wsj_tech", "priority": "P1", "language": "en" },
      { "id": "ft_china", "priority": "P1", "language": "en" },
      { "id": "bloomberg", "priority": "P0", "language": "en" }
    ]
  }
}
```

---

### 2.3 情感分析增强 (SentimentAnalyzer)

#### 需求描述
分析热点话题的市场情绪，识别过度乐观/悲观，提供情绪预警。

#### 功能列表

| ID | 功能 | 优先级 | 描述 |
|----|------|--------|------|
| SA-001 | 情感极性分析 | P0 | 判断正面/负面/中性 |
| SA-002 | 情感强度计算 | P0 | 量化情感强烈程度 |
| SA-003 | 市场情绪指标 | P1 | 聚合多个话题的情绪指数 |
| SA-004 | 情绪异常预警 | P1 | 情绪剧烈变化时预警 |
| SA-005 | 情绪趋势图 | P2 | 展示情绪变化曲线 |

#### 算法规格

```typescript
interface SentimentAnalysis {
  // 单篇文章情感
  articleSentiment: {
    polarity: 'positive' | 'negative' | 'neutral';
    intensity: number; // 0-100
    keywords: string[]; // 情感关键词
  };

  // 话题聚合情感
  topicSentiment: {
    overall: number; // -100 to 100
    confidence: number; // 置信度
    distribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
    trend: 'rising' | 'stable' | 'falling';
  };

  // 市场情绪指数 (Market Sentiment Index)
  msi: {
    value: number; // 0-100, 50为中性
    level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
    change24h: number;
  };
}
```

---

### 2.4 研报自动关联 (ReportMatcher)

#### 需求描述
将热点话题与研报库中的相关报告智能匹配，提供深度分析参考。

#### 功能列表

| ID | 功能 | 优先级 | 描述 |
|----|------|--------|------|
| RM-001 | 关键词提取 | P0 | 提取话题核心关键词 |
| RM-002 | 研报索引构建 | P0 | 构建研报关键词索引 |
| RM-003 | 相似度匹配 | P0 | 计算话题与研报的相似度 |
| RM-004 | 推荐研报列表 | P1 | 按相关度排序推荐 |
| RM-005 | 引用片段提取 | P1 | 提取研报中相关段落 |

#### 匹配算法

```typescript
interface ReportMatcher {
  // 关键词提取 (使用TF-IDF + 命名实体识别)
  extractKeywords(content: string): Keyword[];

  // 相似度计算 (使用余弦相似度 + 语义相似度)
  calculateSimilarity(
    topicKeywords: Keyword[],
    reportKeywords: Keyword[]
  ): number;

  // 研报推荐
  findRelatedReports(
    topic: HotTopic,
    limit: number
  ): MatchedReport[];
}

interface MatchedReport {
  reportId: string;
  title: string;
  similarity: number;
  relevantSections: string[];
  recommendation: 'highly_relevant' | 'relevant' | 'reference';
}
```

---

### 2.5 API开放接口 (PublicAPI)

#### 需求描述
提供标准化REST API，允许第三方系统接入内容质量数据。

#### API列表

| 端点 | 方法 | 描述 | 优先级 |
|------|------|------|--------|
| `/api/v3.1/hot-topics` | GET | 获取热点话题列表 | P0 |
| `/api/v3.1/topics/:id` | GET | 获取话题详情 | P0 |
| `/api/v3.1/search` | GET | 搜索文章 | P1 |
| `/api/v3.1/sentiment` | GET | 获取市场情绪 | P1 |
| `/api/v3.1/recommendations` | GET | 获取推荐话题 | P1 |
| `/api/v3.1/webhook` | POST | 注册Webhook回调 | P2 |

#### API规格示例

```yaml
# GET /api/v3.1/hot-topics
parameters:
  - name: category
    in: query
    schema:
      type: string
      enum: [tech, finance, general]
  - name: limit
    in: query
    schema:
      type: integer
      default: 10
      maximum: 100
  - name: language
    in: query
    schema:
      type: string
      enum: [zh, en, all]
      default: zh

response:
  type: object
  properties:
    data:
      type: array
      items:
        $ref: '#/components/schemas/HotTopic'
    meta:
      type: object
      properties:
        total: integer
        timestamp: string
```

---

## 3. 迭代计划

### 迭代1: 智能推荐系统 (预计7天)

**目标**: 实现基础推荐功能

| 阶段 | 任务 | 负责人 | 验收标准 |
|------|------|--------|----------|
| Day 1-2 | 用户行为追踪 | 开发 | 行为数据入库 |
| Day 3-4 | 兴趣画像算法 | 开发 | 画像准确性>70% |
| Day 5-6 | 推荐引擎 | 开发 | 推荐多样性>50% |
| Day 7 | 集成测试 | 架构师 | 测试通过率100% |

### 迭代2: 多语言支持 (预计5天)

**目标**: 接入英文RSS源

| 阶段 | 任务 | 负责人 | 验收标准 |
|------|------|--------|----------|
| Day 1-2 | 英文源接入 | 开发 | 5个英文源正常抓取 |
| Day 3-4 | 翻译服务集成 | 开发 | 翻译延迟<2s |
| Day 5 | 双语展示UI | 开发 | UI显示正常 |

### 迭代3: 情感分析 (预计5天)

**目标**: 情绪分析与预警

| 阶段 | 任务 | 负责人 | 验收标准 |
|------|------|--------|----------|
| Day 1-2 | 情感分析模型 | 开发 | 准确率>80% |
| Day 3-4 | 市场情绪指数 | 开发 | MSI计算正确 |
| Day 5 | 预警系统 | 开发 | 异常及时预警 |

### 迭代4: 研报关联 (预计5天)

**目标**: 热点-研报智能匹配

| 阶段 | 任务 | 负责人 | 验收标准 |
|------|------|--------|----------|
| Day 1-2 | 关键词提取 | 开发 | 提取准确率>75% |
| Day 3-4 | 匹配算法 | 开发 | Top5相关度>0.7 |
| Day 5 | 推荐展示 | 开发 | 推荐列表正常显示 |

### 迭代5: API开放 (预计5天)

**目标**: 标准化API服务

| 阶段 | 任务 | 负责人 | 验收标准 |
|------|------|--------|----------|
| Day 1-2 | API设计实现 | 开发 | 接口符合OpenAPI规范 |
| Day 3-4 | 认证限流 | 开发 | 支持API Key + 限流 |
| Day 5 | 文档部署 | 开发 | API文档可访问 |

---

## 4. 技术方案

### 4.1 架构调整

```
新增组件:
┌─────────────────────────────────────────────────────────┐
│                      v3.1 新增层                         │
├─────────────────────────────────────────────────────────┤
│  SmartRecommender  │  MultiLanguageSupport              │
│  - 用户行为追踪     │  - 英文RSS抓取                     │
│  - 协同过滤        │  - 翻译服务                        │
│  - 推荐引擎        │  - 双语展示                        │
├─────────────────────────────────────────────────────────┤
│  SentimentAnalyzer  │  ReportMatcher                    │
│  - 情感分析模型     │  - 关键词提取                      │
│  - MSI计算         │  - 相似度匹配                      │
│  - 预警系统        │  - 研报推荐                        │
├─────────────────────────────────────────────────────────┤
│  PublicAPI                                             │
│  - RESTful API                                         │
│  - 认证鉴权                                            │
│  - 限流监控                                            │
└─────────────────────────────────────────────────────────┘
```

### 4.2 数据库变更

```sql
-- 用户行为表
CREATE TABLE user_behaviors (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  topic_id VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL, -- view/like/share/ignore
  timestamp TIMESTAMP DEFAULT NOW()
);

-- 用户画像表
CREATE TABLE user_profiles (
  user_id VARCHAR(50) PRIMARY KEY,
  interests JSONB, -- {topic: weight}
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 翻译缓存表
CREATE TABLE translation_cache (
  hash VARCHAR(64) PRIMARY KEY,
  original TEXT NOT NULL,
  translated TEXT NOT NULL,
  language VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 情感分析结果表
CREATE TABLE sentiment_analysis (
  topic_id VARCHAR(50) PRIMARY KEY,
  polarity VARCHAR(10),
  intensity INTEGER,
  msi INTEGER,
  analyzed_at TIMESTAMP DEFAULT NOW()
);

-- 研报匹配关系表
CREATE TABLE topic_report_matches (
  id SERIAL PRIMARY KEY,
  topic_id VARCHAR(50) NOT NULL,
  report_id VARCHAR(50) NOT NULL,
  similarity FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. 验收标准

### 5.1 功能验收

| 模块 | 验收项 | 通过标准 |
|------|--------|----------|
| 智能推荐 | 推荐准确率 | > 60% |
| 多语言 | 翻译可用性 | 95%成功率 |
| 情感分析 | 分析准确率 | > 80% |
| 研报关联 | 推荐相关度 | Top5 > 0.7 |
| API | 接口稳定性 | 99%可用性 |

### 5.2 性能指标

| 指标 | 目标值 |
|------|--------|
| API响应时间 | P99 < 200ms |
| 推荐计算延迟 | < 100ms |
| 翻译延迟 | < 2s |
| 情感分析延迟 | < 500ms |

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 翻译API不稳定 | 中 | 中 | 实现缓存+降级策略 |
| 推荐算法冷启动 | 高 | 中 | 使用内容推荐过渡 |
| 情感分析准确率不足 | 中 | 中 | 引入模型微调 |
| API滥用 | 中 | 高 | 严格限流+监控 |

---

**文档状态**: 待冻结
**下一步**: 架构师评审 → 开发迭代 → 测试验收

