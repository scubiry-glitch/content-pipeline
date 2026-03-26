# 产品需求文档: Hot-Topics 与 Assets 联动 + 社区素材多渠道 v6.0

**版本**: v6.0  
**日期**: 2026-03-27  
**状态**: 📝 需求文档  
**负责人**: 产品研发运营协作体系  
**优先级**: P0  

---

## 1. 文档概述

### 1.1 背景

当前系统已具备 RSS 自动抓取、热点追踪、素材库管理三大核心能力，但存在以下问题：

1. **数据孤岛**：`hot_score`（热度）和 `quote_count`（引用）是两个独立指标，热点内容与素材库缺乏联动
2. **社区素材单一**：社区话题抓取仅支持基础展示，未与素材库打通形成内容沉淀
3. **热门生成缺失**：缺乏基于多维度数据（热度+引用+时效）的智能排序和热门素材生成机制

### 1.2 目标

构建热点内容与素材库的联动体系，实现：
- **双向关联**：热点话题 ↔ 素材库双向打通，建立内容血缘
- **多渠道聚合**：扩展社区素材搜集渠道，支持热门素材自动生成
- **智能排序**：综合热度、引用、时效的多维排序算法
- **任务推荐**：基于热点+素材智能推荐创作任务

### 1.3 成功标准

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 热点-素材关联覆盖率 | 0% | > 80% | 关联记录数 / RSS 导入素材数 |
| 热点素材曝光率 | 低 | 提升 50% | PopularAssets 页面 RSS 素材点击占比 |
| 素材发现效率 | 人工检索 5min | < 30s | 从热点到相关素材的平均跳转时间 |
| 社区素材入库率 | 仅展示 | 100% 自动入库 | 社区话题自动生成素材比例 |

---

## 2. 产品架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           内容采集层 (Multi-Source)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   RSS源     │  │  社区平台    │  │   Web搜索   │  │   研报上传   │           │
│  │  (已有)     │  │  (扩展)     │  │  (已有)     │  │  (已有)     │           │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │
│         │                │                │                │                  │
│         └────────────────┴────────────────┴────────────────┘                  │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    话题归一化与融合 (Topic Unification)                   │  │
│  │         多源确认 │ 语义相似 │ 热点聚合 │ 趋势分析                          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                     │                                           │
└─────────────────────────────────────┼───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           数据关联层 (Linkage Layer)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐  │
│  │   Hot Topics    │◄───────►│  hot_topic_     │◄───────►│    Assets       │  │
│  │   (rss_items)   │         │  assets 关联表   │         │   (素材库)       │  │
│  │                 │         │                 │         │                 │  │
│  │  • hot_score    │         │  • match_score  │         │  • quote_count  │  │
│  │  • trend        │         │  • match_reason │         │  • hot_score    │  │
│  │  • sentiment    │         │                 │         │  • trend        │  │
│  └─────────────────┘         └─────────────────┘         └─────────────────┘  │
│           ▲                                                        ▲          │
│           │                                                        │          │
│           └────────────────────┬───────────────────────────────────┘          │
│                                │                                               │
│                                ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    热门素材生成器 (Popular Assets Generator)              │  │
│  │                                                                             │
│  │   Hybrid Score = α·quote_count + β·hot_score + γ·time_decay              │  │
│  │                                                                             │  │
│  │   输出: /assets/popular (综合排序)                                        │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           应用层 (Application Layer)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐           │
│  │  HotTopics页    │    │ PopularAssets页 │    │  TaskDetail页   │           │
│  │                 │    │                 │    │                 │           │
│  │ • 相关素材推荐  │    │ • 热点素材专区  │    │ • 素材智能推荐  │           │
│  │ • 一键创建任务  │    │ • 多维度排序    │    │ • 热点关联提示  │           │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流向

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              数据采集流程                                     │
└──────────────────────────────────────────────────────────────────────────────┘

Phase 1: 多源采集
├── RSS Feed → rss_items (hot_score, trend, sentiment)
├── Community → community_topics (platform, engagement, sentiment)
├── Web Search → web_search_results (relevance, source)
└── Manual Upload → assets (quote_count, quality_score)

Phase 2: 归一化处理
├── Topic Unification → unified_topics (多源确认)
├── Semantic Matching → topic_similarity (语义相似度)
└── Hot Score Calculation → normalized_hot_score

Phase 3: 素材入库
├── RSS Items → assets (content_type='text/rss')
├── Community Topics → assets (content_type='text/community')
├── Web Results → assets (content_type='text/web')
└── Asset Enrichment (hot_score, trend, sentiment同步)

Phase 4: 关联建立
├── Direct Link (RSS→Asset) → hot_topic_assets (match_score=1.0)
├── Tag Matching → hot_topic_assets (match_score=0.6-0.9)
├── Semantic Similarity → hot_topic_assets (match_score=0.5-0.8)
└── Manual Association → hot_topic_assets (match_score=custom)

Phase 5: 热门生成
├── Hybrid Score Calculation
│   ├── quote_count (normalized, weight=0.6)
│   ├── hot_score (normalized, weight=0.3)
│   └── time_decay (exponential, weight=0.1)
├── Ranking & Filtering
└── Output → /assets/popular
```

---

## 3. 功能规格

### 3.1 热点-素材双向关联 (FR-6.0-001)

#### 3.1.1 关联表设计

```sql
-- hot_topic_assets: 热点与素材的关联表
CREATE TABLE hot_topic_assets (
  id SERIAL PRIMARY KEY,
  hot_topic_id VARCHAR(50) NOT NULL,    -- rss_items.id
  asset_id VARCHAR(50) NOT NULL,        -- assets.id
  match_score DECIMAL(3,2) DEFAULT 0.5, -- 匹配度 0-1
  match_reason TEXT[] DEFAULT '{}',     -- 匹配理由
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_hot_topic_asset UNIQUE (hot_topic_id, asset_id)
);
```

**匹配理由 (match_reason)**:
- `direct_import`: RSS 直接导入
- `tag_match`: 标签匹配
- `semantic_similarity`: 语义相似
- `manual_link`: 人工关联
- `topic_unified`: 话题归一化关联

#### 3.1.2 关联建立策略

| 策略 | 触发条件 | 匹配度 | 理由 |
|------|----------|--------|------|
| 直接关联 | RSS 导入时自动生成 asset | 1.0 | direct_import |
| 标签匹配 | 标签重叠度 > 50% | 0.6-0.9 | tag_match |
| 语义匹配 | Embedding 相似度 > 0.8 | 0.7-0.95 | semantic_similarity |
| 归一化关联 | Topic Unification 识别为同一话题 | 0.8-1.0 | topic_unified |
| 人工关联 | 用户手动关联 | 0.5-1.0 | manual_link |

#### 3.1.3 API 接口

```typescript
// GET /api/v1/hot-topics/:id/related-assets
interface RelatedAssetsResponse {
  hotTopicId: string;
  hotTopicTitle: string;
  relatedAssets: {
    asset: Asset;
    matchScore: number;
    matchReason: string[];
    relationType: 'direct' | 'semantic' | 'tag';
  }[];
  total: number;
}

// GET /api/v1/assets/:id/related-hot-topics
interface RelatedHotTopicsResponse {
  assetId: string;
  assetTitle: string;
  relatedHotTopics: {
    hotTopic: HotTopic;
    relevanceScore: number;
    matchReason: string[];
  }[];
  total: number;
}

// POST /api/v1/hot-topics/:id/link-asset
interface LinkAssetRequest {
  assetId: string;
  matchScore?: number;
  matchReason?: string[];
}
```

### 3.2 社区素材多渠道扩展 (FR-6.0-002)

#### 3.2.1 平台配置扩展

| 平台 | 状态 | 数据源 | 内容类型 | 入库策略 |
|------|------|--------|----------|----------|
| 小红书 | 已支持 | 热门笔记 | text/image | 自动入库 |
| 微博 | 已支持 | 热搜话题 | text | 自动入库 |
| 知乎 | 已支持 | 热榜问题 | text | 自动入库 |
| B站 | 已支持 | 热门视频 | text/video | 自动入库 |
| 即刻 | 新增 | 圈子热门 | text | 自动入库 |
| 雪球 | 新增 | 热股讨论 | text | 自动入库 |
| 虎嗅 | 新增 | 热门文章 | text | 自动入库 |
| 36氪 | 新增 | 热门报道 | text | 自动入库 |
| 钛媒体 | 新增 | 热门报道 | text | 自动入库 |

#### 3.2.2 社区素材入库流程

```typescript
// 社区话题 → 素材转换
interface CommunityToAssetConverter {
  // 输入
  topic: CommunityTopic;
  
  // 处理
  convert(): Asset {
    return {
      id: `community-${topic.platform}-${topic.id}`,
      title: topic.title,
      content: this.extractContent(topic),
      content_type: `text/community`,
      source: topic.platform,
      source_url: topic.platformUrl,
      tags: [...topic.tags, topic.platform, 'community'],
      
      // 热度数据同步
      hot_score: this.calculateHotScore(topic),
      trend: this.calculateTrend(topic),
      sentiment: topic.sentiment,
      
      // 互动数据存入 metadata
      metadata: {
        engagement: topic.engagement,
        platformRank: topic.platformRank,
        creatorInfo: topic.creatorInfo,
        keyOpinions: topic.keyOpinions,
      }
    };
  }
}
```

#### 3.2.3 热度计算 (社区)

```typescript
function calculateCommunityHotScore(topic: CommunityTopic): number {
  const { views = 0, likes = 0, comments = 0, shares = 0 } = topic.engagement;
  
  // 加权互动分
  const engagementScore = 
    views * 0.001 +      // 阅读权重低
    likes * 0.01 +       // 点赞
    comments * 0.05 +    // 评论权重高
    shares * 0.1;        // 分享权重最高
  
  // 平台排名加权
  const rankWeight = topic.platformRank 
    ? Math.max(0, 1 - (topic.platformRank - 1) * 0.1)  // 排名越靠前权重越高
    : 0.5;
  
  // 创作者影响力
  const creatorWeight = topic.creatorInfo?.followers 
    ? Math.min(topic.creatorInfo.followers / 10000, 2)  // 最多 2 倍加成
    : 1;
  
  // 综合计算
  const rawScore = engagementScore * rankWeight * creatorWeight;
  
  // 归一化到 0-100
  return Math.min(100, Math.round(rawScore));
}
```

### 3.3 热门素材生成 (FR-6.0-003)

#### 3.3.1 Hybrid Score 算法

```typescript
interface HybridScoreConfig {
  quoteWeight: number;    // 引用权重 (默认 0.6)
  hotWeight: number;      // 热度权重 (默认 0.3)
  timeWeight: number;     // 时效权重 (默认 0.1)
}

function calculateHybridScore(
  asset: Asset, 
  config: HybridScoreConfig = { quoteWeight: 0.6, hotWeight: 0.3, timeWeight: 0.1 }
): number {
  // 1. 引用分数 (归一化)
  const maxQuotes = 100;  // 假设最大引用 100 次
  const quoteScore = Math.min(asset.quote_count / maxQuotes, 1);
  
  // 2. 热度分数 (已归一化 0-100)
  const hotScore = (asset.hot_score || 0) / 100;
  
  // 3. 时效分数 (时间衰减)
  const hoursAgo = (Date.now() - new Date(asset.created_at).getTime()) / (1000 * 60 * 60);
  const timeDecay = Math.exp(-hoursAgo / 168);  // 7天半衰期
  
  // 综合计算
  const hybridScore = 
    quoteScore * config.quoteWeight +
    hotScore * config.hotWeight +
    timeDecay * config.timeWeight;
  
  return Math.round(hybridScore * 100);
}
```

#### 3.3.2 排序策略

| 排序方式 | 适用场景 | 算法 |
|----------|----------|------|
| 综合热门 | 默认 | Hybrid Score |
| 引用最多 | 经典内容 | quote_count DESC |
| 热度最高 | 时效内容 | hot_score DESC |
| 最新发布 | 新鲜内容 | created_at DESC |
| 趋势上升 | 潜力内容 | trend='up' + hot_score |

#### 3.3.3 热门素材专区

```typescript
// /assets/popular 页面结构
interface PopularAssetsPage {
  // 筛选器
  filters: {
    sortBy: 'hybrid' | 'quote_count' | 'hot_score' | 'time';
    sourceType: 'all' | 'rss' | 'community' | 'uploaded';
    timeRange: '24h' | '7d' | '30d' | 'all';
    category?: string;  // 领域分类
  };
  
  // 内容分区
  sections: {
    hotAssets: {        // 热点素材专区
      title: '🔥 热点素材';
      description: '来自 RSS 和社区的热门内容';
      items: Asset[];
      maxItems: 10;
    };
    trendingAssets: {   // 趋势上升
      title: '📈 趋势上升';
      filter: { trend: 'up' };
      items: Asset[];
    };
    popularByQuotes: {  // 引用热门
      title: '⭐ 引用热门';
      sortBy: 'quote_count';
      items: Asset[];
    };
  };
}
```

### 3.4 前端联动实现 (FR-6.0-004)

#### 3.4.1 HotTopicDetail 页面增强

```tsx
// 新增：相关素材区块
<RelatedAssetsSection 
  hotTopicId={topic.id}
  layout="horizontal"      // horizontal | grid | list
  maxItems={5}
  showMatchReason={true}   // 显示匹配理由
  actions={['view', 'quote', 'create-task']}
  onViewAll={() => navigate(`/assets/popular?related_to=${topic.id}`)}
/>

// 新增：一键创建任务
<CreateTaskFromHotTopic 
  topic={topic}
  suggestedAssets={relatedAssets}
  suggestedAngles={aiGeneratedAngles}  // AI 生成的切入角度
/>
```

#### 3.4.2 PopularAssets 页面增强

```tsx
// 新增：筛选器
<FilterBar>
  <SortSelector 
    value={sortBy}
    options={[
      { key: 'hybrid', label: '综合热门', icon: '🔥' },
      { key: 'quote_count', label: '引用最多', icon: '⭐' },
      { key: 'hot_score', label: '热度最高', icon: '📈' },
      { key: 'created_at', label: '最新发布', icon: '🆕' },
    ]}
  />
  <SourceFilter 
    options={['all', 'rss', 'community', 'uploaded']}
  />
  <TimeRangeFilter 
    options={['24h', '7d', '30d', 'all']}
  />
</FilterBar>

// 新增：热点素材专区
<HotAssetsSection 
  title="🔥 热点素材"
  subtitle="来自 RSS 抓取的热门内容"
  filter={{ sourceType: 'rss', minHotScore: 50 }}
  sortBy="hot_score"
  maxItems={10}
  showTrendIndicator={true}
  onViewAll={() => navigate('/assets/popular?filter=rss&sort=hot_score')}
/>
```

#### 3.4.3 AssetDetail 页面增强

```tsx
// 新增：相关热点区块
<RelatedHotTopicsSection 
  assetId={asset.id}
  maxItems={3}
  showSentiment={true}
  onTopicClick={(topic) => navigate(`/hot-topics/${topic.id}`)}
/>

// 新增：素材热度趋势
<AssetHotTrendChart 
  assetId={asset.id}
  days={7}
  metrics={['hot_score', 'quote_count', 'views']}
/>
```

### 3.5 智能任务推荐 (FR-6.0-005)

基于热点+素材组合，智能推荐创作任务：

```typescript
interface TaskRecommendation {
  id: string;
  sourceHotTopicId: string;
  
  // 推荐内容
  suggestedTitle: string;           // 建议标题
  suggestedFormat: 'report' | 'article' | 'brief';  // 建议格式
  priority: 'high' | 'medium' | 'low';
  
  // 内容建议
  contentSuggestion: {
    angle: string;                  // 切入角度
    keyPoints: string[];            // 核心观点
    targetAudience: string;         // 目标读者
    estimatedReadTime: number;      // 预计阅读时长
    relatedAssets: string[];        // 建议引用的素材
  };
  
  // 竞争分析
  competitiveAnalysis: {
    similarTopics: string[];
    differentiationOpportunity: string;
    contentGap: string[];
  };
  
  // 专家推荐
  suggestedExperts: {
    domain: string[];
    roles: ('fact_checker' | 'logic_checker' | 'domain_expert' | 'reader_rep')[];
  };
}

// 生成推荐
function generateTaskRecommendation(
  hotTopic: HotTopic, 
  relatedAssets: Asset[]
): TaskRecommendation {
  // 1. 分析热点特征
  const topicAnalysis = analyzeTopic(hotTopic);
  
  // 2. 分析素材质量
  const assetAnalysis = analyzeAssets(relatedAssets);
  
  // 3. 生成推荐 (AI 驱动)
  return aiGenerateRecommendation(topicAnalysis, assetAnalysis);
}
```

---

## 4. 技术实现

### 4.1 数据库 Schema

```sql
-- ============================================
-- 1. 热点与素材关联表
-- ============================================
CREATE TABLE hot_topic_assets (
  id SERIAL PRIMARY KEY,
  hot_topic_id VARCHAR(50) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  match_score DECIMAL(3,2) DEFAULT 0.5,
  match_reason TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_hot_topic_asset UNIQUE (hot_topic_id, asset_id)
);

CREATE INDEX idx_hta_hot_topic ON hot_topic_assets(hot_topic_id);
CREATE INDEX idx_hta_asset ON hot_topic_assets(asset_id);
CREATE INDEX idx_hta_match_score ON hot_topic_assets(match_score DESC);

-- ============================================
-- 2. Assets 表扩展
-- ============================================
ALTER TABLE assets ADD COLUMN IF NOT EXISTS hot_score INTEGER DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS trend VARCHAR(20) DEFAULT 'stable';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) DEFAULT 'neutral';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_hot_updated TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_assets_hot_score ON assets(hot_score DESC) WHERE hot_score > 0;
CREATE INDEX idx_assets_trend ON assets(trend);

-- ============================================
-- 3. 社区话题扩展 (支持更多平台)
-- ============================================
ALTER TABLE community_topics ADD COLUMN IF NOT EXISTS asset_id VARCHAR(50);
ALTER TABLE community_topics ADD COLUMN IF NOT EXISTS converted_to_asset BOOLEAN DEFAULT FALSE;

-- ============================================
-- 4. 热门素材缓存表 (加速查询)
-- ============================================
CREATE TABLE popular_assets_cache (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  hybrid_score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  sort_type VARCHAR(20) NOT NULL,  -- hybrid | quote_count | hot_score
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_asset_sort UNIQUE (asset_id, sort_type)
);

CREATE INDEX idx_pac_rank ON popular_assets_cache(sort_type, rank);
```

### 4.2 核心服务

```typescript
// 1. 热点-素材关联服务
class HotTopicAssetLinkageService {
  // 建立直接关联 (RSS 导入时)
  async createDirectLink(rssItemId: string, assetId: string): Promise<void>;
  
  // 标签匹配关联
  async createTagBasedLinks(topicId: string, threshold: number = 0.5): Promise<void>;
  
  // 语义匹配关联
  async createSemanticLinks(topicId: string, threshold: number = 0.8): Promise<void>;
  
  // 获取相关素材
  async getRelatedAssets(topicId: string, options: QueryOptions): Promise<RelatedAsset[]>;
  
  // 获取相关热点
  async getRelatedHotTopics(assetId: string, options: QueryOptions): Promise<RelatedHotTopic[]>;
}

// 2. 社区素材转换服务
class CommunityToAssetService {
  // 转换社区话题为素材
  async convertTopic(topic: CommunityTopic): Promise<Asset>;
  
  // 批量转换
  async batchConvert(topics: CommunityTopic[]): Promise<Asset[]>;
  
  // 定时任务：自动转换新话题
  async autoConvertUnprocessed(options: { limit: number }): Promise<void>;
}

// 3. 热门素材生成服务
class PopularAssetsGenerator {
  // 计算 Hybrid Score
  calculateHybridScore(asset: Asset, config?: HybridConfig): number;
  
  // 生成热门榜单
  async generateRanking(options: RankingOptions): Promise<PopularAsset[]>;
  
  // 缓存热门榜单
  async cacheRanking(sortType: string, assets: PopularAsset[]): Promise<void>;
  
  // 定时刷新
  async refreshAllRankings(): Promise<void>;
}
```

### 4.3 定时任务

```typescript
// 1. 热度数据同步 (每 30 分钟)
async function syncHotScoreToAssets() {
  // 同步 rss_items.hot_score → assets.hot_score
  // 同步 trend, sentiment
}

// 2. 社区素材自动转换 (每小时)
async function autoConvertCommunityTopics() {
  // 查询未转换的 community_topics
  // 自动转换为 assets
  // 建立 hot_topic_assets 关联
}

// 3. 关联自动计算 (每 2 小时)
async function autoCalculateLinkages() {
  // 对新导入的 RSS 进行标签匹配
  // 进行语义相似度计算
  // 建立 hot_topic_assets 记录
}

// 4. 热门榜单刷新 (每 15 分钟)
async function refreshPopularAssetsCache() {
  // 重新计算所有 hybrid_score
  // 更新 popular_assets_cache
}
```

---

## 5. 实施计划

### 5.1 Phase 1: 数据层 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 创建 hot_topic_assets 表 | 后端 | 0.5d | 表结构正确，索引完备 |
| 扩展 assets 表 | 后端 | 0.5d | 新增字段正确，索引有效 |
| 编写数据迁移脚本 | 后端 | 1d | 历史数据迁移完成 |
| 社区话题扩展字段 | 后端 | 0.5d | 支持 asset_id 关联 |
| 创建缓存表 | 后端 | 0.5d | popular_assets_cache 可用 |

### 5.2 Phase 2: API 层 (5 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 热点-素材关联服务 | 后端 | 2d | HotTopicAssetLinkageService 完成 |
| 社区素材转换服务 | 后端 | 1.5d | CommunityToAssetService 完成 |
| 热门素材生成服务 | 后端 | 1.5d | PopularAssetsGenerator 完成 |
| 相关素材查询接口 | 后端 | 1d | /hot-topics/:id/related-assets 可用 |
| 增强 /assets/popular | 后端 | 1d | 支持 hybrid 排序和筛选 |

### 5.3 Phase 3: 前端层 (5 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| HotTopicDetail 相关素材区块 | 前端 | 1.5d | RelatedAssetsSection 组件完成 |
| PopularAssets 筛选器和专区 | 前端 | 2d | 筛选器 + 热点素材专区完成 |
| AssetDetail 相关热点区块 | 前端 | 1d | RelatedHotTopicsSection 组件完成 |
| 一键创建任务功能 | 前端 | 1d | CreateTaskFromHotTopic 完成 |
| 数据可视化 | 前端 | 0.5d | 热度趋势图表完成 |

### 5.4 Phase 4: 自动化 (3 天)

| 任务 | 负责人 | 工时 | 验收标准 |
|------|--------|------|----------|
| 热度数据同步定时任务 | 后端 | 0.5d | 每 30 分钟同步 |
| 社区素材自动转换 | 后端 | 1d | 每小时自动转换 |
| 关联自动计算 | 后端 | 1d | 每 2 小时自动关联 |
| 热门榜单刷新 | 后端 | 0.5d | 每 15 分钟刷新 |

---

## 6. 附录

### 6.1 与 AI 批量处理的协同

本 PRD 与 AI 批量处理是互补关系：

| 功能 | AI 批量处理 | 本 PRD (v6.0) |
|------|-------------|---------------|
| 内容理解 | AI 分析文章质量、分类、情感 | - |
| 内容关联 | - | 建立 HotTopic ↔ Asset 双向关联 |
| 排序优化 | AI 评分作为热度因子 | Hybrid 排序算法 |
| 任务推荐 | AI 生成任务建议 | 基于关联素材推荐 |
| 社区处理 | AI 内容理解 | 多平台采集+入库 |

**实施顺序建议**：
1. 先实现本 PRD Phase 1-3（数据层 + API + 基础前端）
2. 再实现 AI 批量处理（质量打分、分类、情感）
3. 最后整合 AI 评分到 Hybrid 排序算法中

### 6.2 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 关联计算性能问题 | 高 | 使用缓存表 + 异步计算 |
| 社区平台接口变更 | 中 | 抽象采集层，快速适配 |
| 热门榜单更新延迟 | 中 | 缩短定时任务周期 + 实时更新触发 |
| 数据一致性 | 中 | 添加数据校验 + 补偿机制 |

### 6.3 相关文档

- [Hot-Topics 现有实现](../api/src/services/hotTopicService.ts)
- [Community Crawler](../api/src/services/communityCrawler.ts)
- [Topic Unification](../api/src/services/topicUnification.ts)
- [Popular Assets](../webapp/src/pages/PopularAssets.tsx)
- [关联方案计划](../.kimi/plans/batwoman-stargirl-terra.md)
