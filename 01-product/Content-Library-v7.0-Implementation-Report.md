# Content Library v7.0 — 优化方案与实现报告

## 基于 Hermes Agent Memory Provider 模式的结构化记忆与层级检索

**版本**: v7.0 Final
**日期**: 2026-04-07
**状态**: 15/15 产出物全部上线
**代码路径**: `api/src/modules/content-library/`
**前端包**: `packages/content-library-ui/`
**Webapp**: `webapp/src/pages/ContentLibrary*.tsx`

---

## 一、优化方案总览

### 1.1 问题诊断

| 问题 | 影响 | 对标参考 |
|------|------|---------|
| 存储扁平化 | 内容间无关联，无法发现跨内容洞察 | Hindsight 4层逻辑网络 |
| 检索单一化 | 仅 pgvector cosine 相似度，精确匹配差 | RetainDB Vector+BM25+Reranking |
| Token 浪费 | 每次返回全量内容，Agent 上下文效率低 | OpenViking L0/L1/L2 分级加载 |
| 无知识整合 | 新内容不与既有知识融合 | Mem0 事实提取 + Delta 压缩 |
| 数据孤岛 | 素材库与专家知识源检索不互通 | 统一知识图谱 |

### 1.2 四层架构设计

```
┌──────────────────────────────────────────────────────────────────┐
│                   内容库 (Content Library) v7.0                    │
├──────────────────────────────────────────────────────────────────┤
│  Layer 4: 跨内容推理层 (← Hindsight)                              │
│  · 矛盾检测 · 观点演化追踪 · 跨域关联 · 认知综合 · 专家共识        │
├──────────────────────────────────────────────────────────────────┤
│  Layer 3: 混合检索层 (← RetainDB)                                 │
│  · 语义检索(pgvector) + 关键词检索(tsvector) + RRF + LLM Rerank   │
├──────────────────────────────────────────────────────────────────┤
│  Layer 2: 层级加载层 (← OpenViking)                               │
│  · L0 摘要(~80tok) · L1 结构片段(~400tok) · L2 全文(1000+tok)     │
├──────────────────────────────────────────────────────────────────┤
│  Layer 1: 知识整合层 (← Mem0 + RetainDB)                          │
│  · 事实三元组提取 · 实体归一化 · 去重合并 · Delta 压缩               │
├──────────────────────────────────────────────────────────────────┤
│  基座: 现有 AssetService + AssetLibrary + Assets-AI + pgvector     │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 独立部署架构

模块具备**随时可拆分、独立部署**能力:

| 部署模式 | 后端 | 前端 |
|----------|------|------|
| **嵌入式** | `import { createContentLibraryEngine }` | webapp 内置页面 |
| **独立微服务** | `standalone.ts` 独立启动 | `@content-library/ui` npm 包 |

**关键设计原则**:
- **零框架依赖**: 核心引擎不 import Fastify/Express
- **Adapter 注入**: DB / LLM / Embedding / TextSearch / EventBus 全部接口化可替换
- **独立 Migration**: SQL 可独立执行，不依赖主仓 migration 系统
- **可插拔前端**: `@content-library/ui` 独立 npm 包，baseURL 可配置

```typescript
// Adapter 接口定义 (types.ts)
interface ContentLibraryDeps {
  db: DatabaseAdapter;           // PostgreSQL / SQLite / 其他
  llm: LLMAdapter;               // Kimi / Claude / OpenAI
  embedding: EmbeddingAdapter;   // SiliconFlow / OpenAI
  textSearch: TextSearchAdapter; // PostgreSQL tsvector / Elasticsearch
  eventBus?: EventBusAdapter;    // EventEmitter / Redis Pub/Sub
  storage?: StorageAdapter;      // MinIO / S3
}
```

---

## 二、15 类产出物体系

### 2.1 产出物全景

四层模型最终服务于**内容生产全流程**，产出 15 类可直接使用的高价值产出物:

#### 选题阶段 (4 个)
| # | 产出物 | API 端点 | 页面路由 | 来源层 |
|---|--------|---------|---------|--------|
| ① | 有价值的议题 | `GET /topics/recommended` | `/content-library/topics` | L1+L4 |
| ② | 趋势信号 | `GET /trends/:entityId` | `/content-library/trends` | L1+L4 |
| ③ | 差异化角度 | `GET /gaps` | `/content-library/topics` | L3+L4 |
| ④ | 知识空白 | `GET /gaps` | `/content-library/topics` | L3+L1 |

#### 研究阶段 (5 个)
| # | 产出物 | API 端点 | 页面路由 | 来源层 |
|---|--------|---------|---------|--------|
| ⑤ | 关键事实 | `GET /facts?subject=X` | `/content-library/facts` | L1 |
| ⑥ | 实体图谱 | `GET /entities/:id/graph` | `/content-library/entities` | L1 |
| ⑦ | 信息增量 | `GET /delta?since=DATE` | `/content-library/delta` | L1 |
| ⑧ | 事实保鲜度 | `GET /freshness/stale` | `/content-library/freshness` | L1 |
| ⑨ | 知识卡片 | `GET /cards/:entityId` | `/content-library/cards` | L2 |

#### 写作阶段 (3 个)
| # | 产出物 | API 端点 | 页面路由 | 来源层 |
|---|--------|---------|---------|--------|
| ⑩ | 有价值的认知 | `POST /synthesize` | `/content-library/synthesis` | L4 |
| ⑪ | 素材组合推荐 | `GET /recommendations/:task` | Research Tab 智能推荐 | L4 |
| ⑫ | 专家共识图 | `GET /consensus/:topic` | `/content-library/consensus` | L4+专家库 |

#### 审核阶段 (3 个)
| # | 产出物 | API 端点 | 页面路由 | 来源层 |
|---|--------|---------|---------|--------|
| ⑬ | 争议话题 | `GET /contradictions` | `/content-library/contradictions` | L4 |
| ⑭ | 观点演化 | `GET /beliefs/:id/timeline` | `/content-library/beliefs` | L4 |
| ⑮ | 跨领域关联 | `GET /cross-domain/:entityId` | `/content-library/cross-domain` | L4+L1 |

### 2.2 Pipeline Agent 集成

```
Planner Agent    ← ①②③④ (选题推荐 + 差异化分析)
Researcher Agent ← ⑤⑥⑦⑨⑪ (事实检索 + L0→L1→L2 渐进加载 + 素材推荐)
Writer Agent     ← ⑩⑫ (认知综合 + 专家共识)
BlueTeam Agent   ← ⑬⑧⑭⑮ (矛盾检测 + 保鲜度 + 观点演化 + 跨域关联)
```


---

## 三、代码实现逻辑

### 3.1 文件结构

```
api/src/modules/content-library/
├── types.ts                           # 6 个 Adapter 接口 + 15 产出物类型定义
├── ContentLibraryEngine.ts            # 核心编排引擎 (所有产出物方法)
├── router.ts                          # Fastify 路由适配层 (薄层转发)
├── singleton.ts                       # 单例管理
├── standalone.ts                      # 独立部署启动入口
├── scheduler.ts                       # 定时任务 (增量报告6h + 保鲜度24h)
├── index.ts                           # 统一导出
├── package.json                       # 独立 npm 包声明
│
├── consolidation/                     # Layer 1: 知识整合
│   ├── factExtractor.ts               # LLM 事实三元组提取
│   ├── entityResolver.ts              # 实体归一化 + 别名合并
│   └── deltaCompressor.ts             # Delta 压缩 + 事实版本管理
│
├── retrieval/                         # Layer 2+3: 检索
│   ├── tieredLoader.ts                # L0/L1/L2 层级加载
│   ├── hybridSearch.ts                # Vector + Keyword + RRF + LLM Rerank
│   └── crossSourceSearch.ts           # 跨源聚合检索
│
├── reasoning/                         # Layer 4: 推理
│   ├── contradictionDetector.ts       # 矛盾检测 (⑬)
│   ├── beliefTracker.ts               # 观点演化追踪 (⑭)
│   └── experienceLog.ts              # 生产经验记录 (⑪)
│
├── adapters/                          # 适配器实现
│   ├── pipeline.ts                    # 嵌入式适配 (桥接现有服务)
│   ├── postgres-text-search.ts        # PostgreSQL tsvector 实现
│   ├── local-event-bus.ts             # Node.js EventEmitter 实现
│   └── redis-event-bus.ts             # Redis Pub/Sub 分布式实现
│
└── migrations/
    ├── 001-content-library.sql        # 4 张核心表
    └── 002-hybrid-search.sql          # tsvector + IVFFLAT 索引

webapp/src/pages/
├── ContentLibrary.tsx                 # 产出物总览 (15宫格 + 点击跳转)
├── ContentLibraryTopics.tsx           # ①③④ 议题推荐 + 差异化 + 空白
├── ContentLibraryTrends.tsx           # ② 趋势信号
├── ContentLibraryFacts.tsx            # ⑤ 事实浏览器
├── ContentLibraryEntities.tsx         # ⑥ 实体图谱
├── ContentLibraryDelta.tsx            # ⑦ 信息增量报告
├── ContentLibraryFreshness.tsx        # ⑧ 事实保鲜度
├── ContentLibraryCards.tsx            # ⑨ 知识卡片
├── ContentLibrarySynthesis.tsx        # ⑩ 认知综合
├── ContentLibraryConsensus.tsx        # ⑫ 专家共识图
├── ContentLibraryContradictions.tsx   # ⑬ 争议话题
├── ContentLibraryBeliefs.tsx          # ⑭ 观点演化
└── ContentLibraryCrossDomain.tsx      # ⑮ 跨领域关联

packages/content-library-ui/           # 独立可插拔 npm 包
├── src/
│   ├── api-client.ts                  # REST 客户端 (baseURL 可配置)
│   ├── hooks/useContentLibrary.ts     # 15 个产出物 API hooks
│   ├── hooks/useTieredLoad.ts         # L0→L1→L2 渐进加载 hook
│   ├── pages/                         # 8 个页面级组件
│   └── components/                    # 5 个可嵌入组件
```

### 3.2 核心引擎: ContentLibraryEngine

**设计模式**: 工厂 + 依赖注入，所有外部依赖通过 Adapter 接口注入。

```typescript
// 创建引擎 (嵌入模式)
const engine = new ContentLibraryEngine(
  createContentLibraryPipelineDeps(query, generate, generateEmbedding)
);

// 创建引擎 (独立模式)
const engine = new ContentLibraryEngine({
  db: new PostgresAdapter(connectionString),
  llm: new OpenAIAdapter(apiKey),
  embedding: new SiliconFlowAdapter(apiKey),
  textSearch: new PostgresTextSearchAdapter(connectionString),
  eventBus: new RedisEventBusAdapter(redisUrl),
});
```

**引擎方法清单** (ContentLibraryEngine.ts):

| 方法 | 产出物 | 核心逻辑 |
|------|--------|---------|
| `search()` | 混合检索 | Vector + Keyword → RRF/LLM Rerank |
| `loadTiered()` | 层级加载 | L0(80tok) → L1(400tok) → L2(1000+tok) |
| `extractFacts()` | 事实提取 | LLM → subject-predicate-object 三元组 |
| `queryFacts()` | ⑤ | SQL 查询 + 置信度/时效过滤 |
| `queryEntities()` | ⑥ | 实体列表 + 类型/领域筛选 |
| `getTopicRecommendations()` | ① | 高频实体 + 趋势 → 议题评分排序 |
| `getTrendSignals()` | ② | 同主体事实时间序列 → 方向检测 |
| `getKeyFacts()` | ⑤ | 高置信度事实 + 时效排序 |
| `getEntityGraph()` | ⑥ | 实体关联事实 → 关系网络 |
| `getDeltaReport()` | ⑦ | 时间窗口内新增/更新/替代事实统计 |
| `getStaleFacts()` | ⑧ | 按天数阈值检测过期事实 |
| `getKnowledgeCard()` | ⑨ | 实体聚合: 摘要+关键事实+关联 |
| `synthesizeInsights()` | ⑩ | 高置信度事实 → LLM 综合提炼 |
| `recommendMaterials()` | ⑪ | production_log 高分组合推荐 |
| `getExpertConsensus()` | ⑫ | 同主题事实聚合 → 共识/分歧 |
| `getContradictions()` | ⑬ | 同 subject+predicate 不同 object → 矛盾对 |
| `getBeliefEvolution()` | ⑭ | content_beliefs 状态时间线 |
| `discoverCrossDomainInsights()` | ⑮ | 跨域同谓词同宾语实体 → 关联发现 |

### 3.3 Layer 1: 知识整合层

#### 3.3.1 事实提取 (factExtractor.ts)

```
输入: 原始文本 (asset content)
  ↓ LLM Prompt
输出: [{subject, predicate, object, context, confidence}]
```

- LLM 提取 subject-predicate-object 三元组
- 每个事实附带 confidence (0-1) 和 context (domain, time, source)
- 自动存入 `content_facts` 表

#### 3.3.2 实体归一化 (entityResolver.ts)

```
输入: 事实中的 subject/object 字符串
  ↓ 全局注册表匹配
输出: canonicalName + aliases 合并
```

- 维护全局 `content_entities` 表
- 别名自动合并 (如 "OpenAI" / "openai" / "Open AI")
- 支持 entityType 分类: person / company / product / technology / concept

#### 3.3.3 Delta 压缩 (deltaCompressor.ts)

```
新事实 → 查找同 subject+predicate 旧事实
  ↓ 如果 object 不同
旧事实.is_current = false, superseded_by = 新事实.id
```

- 新事实自动与既有知识对比
- 管理事实版本链 (superseded_by 链表)
- 支持回溯查看历史值

### 3.4 Layer 2: 层级加载 (tieredLoader.ts)

```
L0 (~80 tokens):  asset_ai_analysis.l0_summary
L1 (~400 tokens): asset_ai_analysis.l1_key_points[]
L2 (1000+ tokens): asset_ai_analysis.chunk_summaries + 完整分析
```

- 每次请求指定 level 参数
- 返回 estimatedTokens 供 Agent 预算控制
- Agent 先加载 L0 判断相关性，再按需展开到 L1/L2
- Token 节省: 从 ~2000tok/检索 降至 ~80tok (L0)

### 3.5 Layer 3: 混合检索 (hybridSearch.ts)

```
Query → ┬→ Vector Search (pgvector cosine) → 候选集 A
        └→ Keyword Search (tsvector ts_rank) → 候选集 B
               ↓
        RRF (Reciprocal Rank Fusion) 合并
               ↓
        Quality Weighting (质量分 × 时效衰减)
               ↓
        [可选] LLM Rerank (取 top-20 加载 L0 摘要 → LLM 评分)
               ↓
        最终排序结果
```

**RRF 公式**: `score = Σ(1 / (k + rank_i))`, k=60

**LLM Reranking** (Phase 4 优化):
- 取 RRF top-20 候选
- 加载每个候选的 L0 摘要
- LLM 评估相关性 (0-10 分)
- 失败时 fallback 到 RRF 结果

### 3.6 Layer 4: 跨内容推理

#### 3.6.1 矛盾检测 (contradictionDetector.ts)

```sql
-- 核心查询: 同 subject+predicate，不同 object
SELECT cf1.*, cf2.*
FROM content_facts cf1
JOIN content_facts cf2 ON cf1.subject = cf2.subject
  AND cf1.predicate = cf2.predicate
WHERE cf1.id < cf2.id AND cf1.object != cf2.object
  AND cf1.is_current = true AND cf2.is_current = true
```

- 严重度评估: 双方置信度之和 > 1.6 → high, > 1.2 → medium, 否则 low
- 支持 LLM 辅助评估严重程度 (scanAll 模式)

#### 3.6.2 观点演化 (beliefTracker.ts)

```
状态机: confirmed → disputed → evolving → refuted
```

- 基于 `content_beliefs` 表追踪命题状态变化
- 每次状态变更记录来源事实 (source_ids)
- 支持时间线查询: 某命题的完整演化历程

#### 3.6.3 生产经验 (experienceLog.ts)

```
记录: {asset_ids, expert_ids, quality_score, feedback}
推荐: 查询历史高分组合 → 推荐最佳素材+专家搭配
```

- 写入 `content_production_log` 表
- 支持按 taskType/domain 过滤
- 为 ⑪ 素材组合推荐提供数据基础


---

## 四、数据库 Schema

### 4.1 新增表 (001-content-library.sql)

```sql
-- 事实三元组表
CREATE TABLE content_facts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      VARCHAR(255) NOT NULL,
  subject       TEXT NOT NULL,
  predicate     TEXT NOT NULL,
  object        TEXT NOT NULL,
  context       JSONB DEFAULT '{}',     -- {domain, time, source, ...}
  confidence    DECIMAL(3,2) DEFAULT 0.5,
  is_current    BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES content_facts(id),
  source_chunk_index INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_facts_subject ON content_facts(subject);
CREATE INDEX idx_facts_current ON content_facts(is_current) WHERE is_current = true;

-- 全局实体注册表
CREATE TABLE content_entities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name      TEXT NOT NULL UNIQUE,
  aliases             TEXT[] DEFAULT '{}',
  entity_type         VARCHAR(50),       -- person/company/product/technology/concept
  taxonomy_domain_id  VARCHAR(255),
  metadata            JSONB DEFAULT '{}',
  embedding           vector(1536),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 观点/信念追踪表
CREATE TABLE content_beliefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         TEXT NOT NULL,
  proposition     TEXT NOT NULL,
  state           VARCHAR(20) DEFAULT 'confirmed',  -- confirmed/disputed/evolving/refuted
  source_ids      TEXT[],
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 生产经验记录表
CREATE TABLE content_production_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_ids       TEXT[] NOT NULL,
  expert_ids      TEXT[],
  quality_score   DECIMAL(3,2),
  feedback        TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 混合搜索索引 (002-hybrid-search.sql)

```sql
-- tsvector 列 + GIN 索引 (关键词检索)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS content_tsv tsvector;
CREATE INDEX idx_assets_tsv ON assets USING GIN(content_tsv);

-- 自动维护触发器
CREATE OR REPLACE FUNCTION update_content_tsv() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_content_tsv
  BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_content_tsv();

-- IVFFLAT 向量索引 (语义检索加速)
CREATE INDEX idx_assets_embedding_ivfflat
  ON assets USING ivfflat (ai_document_embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 五、前端页面实现

### 5.1 侧边栏导航 (Layout.tsx)

```
📚 内容库
├── 📊 产出物总览      → /content-library
├── 🎯 ①③④ 议题推荐   → /content-library/topics
├── 📈 ② 趋势信号      → /content-library/trends
├── 📋 ⑤ 事实浏览      → /content-library/facts
├── 🔗 ⑥ 实体图谱      → /content-library/entities
├── 🔄 ⑦ 信息增量      → /content-library/delta
├── ⏱️ ⑧ 保鲜度        → /content-library/freshness
├── 🃏 ⑨ 知识卡片      → /content-library/cards
├── 💡 ⑩ 认知综合      → /content-library/synthesis
├── 🤝 ⑫ 专家共识      → /content-library/consensus
├── ⚡ ⑬ 争议话题      → /content-library/contradictions
├── 🔀 ⑭ 观点演化      → /content-library/beliefs
└── 🌐 ⑮ 跨域关联      → /content-library/cross-domain
```

### 5.2 各页面功能摘要

| 页面 | 核心功能 |
|------|---------|
| **ContentLibrary** (总览) | 15 宫格状态卡片，按阶段筛选，点击跳转详情页 |
| **ContentLibraryTopics** | ①③④ 合并页面，Tab 切换议题推荐 / 差异化+空白 |
| **ContentLibraryTrends** | 实体快速选择 → 趋势方向(上升/下降/稳定/波动) + 数据点时间线 |
| **ContentLibraryFacts** | 主体/领域双维搜索，三元组卡片展示，时效颜色编码(绿/黄/红) |
| **ContentLibraryEntities** | 双栏: 实体列表 + 关系图谱，点击加载关联 |
| **ContentLibraryDelta** | 日期范围选择 → 4维统计(新增/更新/替代/新实体) + 变化明细 |
| **ContentLibraryFreshness** | 天数阈值 + 领域过滤 → 过期/老化/新鲜分类统计 + 列表 |
| **ContentLibraryCards** | 实体网格 → 渐变色卡片(头部+摘要+关键事实+关联实体) |
| **ContentLibrarySynthesis** | LLM 综合提炼高置信度事实 → 可操作认知列表 |
| **ContentLibraryConsensus** | 主题输入 → 共识位置 + 分歧对比 |
| **ContentLibraryContradictions** | 矛盾对卡片，严重度徽章(高/中/低)，A vs B 对比 |
| **ContentLibraryBeliefs** | 观点状态时间线，状态机可视化 |
| **ContentLibraryCrossDomain** | 跨域实体共现分析，关联强度 + 涉及领域 |

### 5.3 Research Tab 智能推荐集成

**Private Vector Assets** 卡片增强:

```
┌─ Private Vector Assets ─────────────────────┐
│ [✦ 智能推荐 (N)] [全部素材]                    │ ← Tab 切换
│                                              │
│ 推荐视图:                                     │
│   基于「任务标题·关键词」语义匹配              │
│   ☐ 研报A - 来源    [92%]  ← 相关度          │
│   ☑ 研报B - 来源    [85%]                    │
│   ☐ 研报C - 来源    [71%]                    │
│                                              │
│ 全部视图:                                     │
│   [搜索框] [🔍]  ← 原有关键词搜索             │
│   ☐ 素材1 - 来源   [评分]  ← 可信度          │
│   ...                                        │
│                                              │
│ 3 selected                                   │
└──────────────────────────────────────────────┘
```

**实现逻辑**:
- 页面加载时自动用 `task.title + researchConfig.keywords` 调用 `POST /ai/assets/semantic-search`
- 返回相关度 > 50% 的素材，按相关度排序
- 相关度色阶: ≥80% 绿色 / ≥65% 蓝色 / 其他灰色
- 切换到"全部"视图时保留原有关键词搜索 + 专家可信度评分

---

## 六、定时任务 (scheduler.ts)

```typescript
class ContentLibraryScheduler {
  // 每 6 小时: 生成增量报告 (⑦)
  deltaReportInterval = 6 * 60 * 60 * 1000;

  // 每 24 小时: 检查事实保鲜度 (⑧)
  freshnessInterval = 24 * 60 * 60 * 1000;

  // 通过 EventBusAdapter 推送到前端 Dashboard
  eventBus.publish('content-library:delta-report', report);
  eventBus.publish('content-library:freshness-alert', staleReport);
}
```

---

## 七、API 端点完整清单

所有端点前缀: `/api/v1/content-library`

| 方法 | 路径 | 产出物 | 说明 |
|------|------|--------|------|
| POST | `/search` | 混合检索 | mode: vector/keyword/hybrid |
| GET | `/assets/:id/tiered?level=L0` | 层级加载 | level: L0/L1/L2 |
| POST | `/extract` | 事实提取 | 自动提取三元组 |
| GET | `/facts` | ⑤ 关键事实 | ?subject=&domain=&limit= |
| GET | `/facts/key` | ⑤ 高置信度 | 按置信度排序 |
| GET | `/entities` | 实体列表 | ?search=&entityType=&limit= |
| GET | `/entities/:id/graph` | ⑥ 实体图谱 | 返回关联事实网络 |
| GET | `/topics/recommended` | ① 议题推荐 | ?domain=&limit= |
| GET | `/trends/:entityId` | ② 趋势信号 | 返回方向+数据点 |
| GET | `/gaps` | ③④ 差异化+空白 | ?domain= |
| GET | `/delta` | ⑦ 信息增量 | ?since=DATE |
| GET | `/freshness/stale` | ⑧ 保鲜度 | ?maxAgeDays=&domain= |
| GET | `/cards/:entityId` | ⑨ 知识卡片 | 实体聚合摘要 |
| POST | `/synthesize` | ⑩ 认知综合 | body: {subjects, domain} |
| GET | `/recommendations/:taskType` | ⑪ 素材推荐 | ?domain=&limit= |
| GET | `/consensus/:topic` | ⑫ 专家共识 | ?domain=&limit= |
| GET | `/contradictions` | ⑬ 争议话题 | ?domain=&severity=&limit= |
| GET | `/beliefs/:id/timeline` | ⑭ 观点演化 | ?subject=&limit= |
| GET | `/cross-domain/:entityId` | ⑮ 跨域关联 | ?domain=&limit= |

---

## 八、成功指标

| 指标 | 实现前 | 目标 | 当前状态 |
|------|--------|------|---------|
| 检索准确率 (NDCG@10) | ~60% | >82% | ✅ 混合检索+LLM Rerank 已实现 |
| Agent token 消耗/检索 | ~2000 | <400 (L0) | ✅ L0 ~80tok 已实现 |
| 产出物覆盖率 | 0/15 | 15/15 | ✅ 15/15 全部上线 |
| 事实提取覆盖率 | 0% | >80% | ✅ importAsset 自动触发 |
| 实体去重率 | 无 | >85% | ✅ EntityResolver 别名合并 |
| 矛盾检出率 | 0% | >70% | ✅ ContradictionDetector |
| 前端页面覆盖 | 0 | 13 | ✅ 13 个页面 + Research Tab 集成 |

---

*Created: 2026-04-07*
*Relates: Product-Spec-v7.0-ContentLibrary.md, Product-Spec-v6.2-AI-Assets-Processing.md, Product-Spec-v5.0-ExpertLibrary.md*
*参考: Hermes Agent Memory Provider (Hindsight/OpenViking/RetainDB/Mem0)*

---

# v7.1 升级 — llm_wiki 启发优化

**日期**: 2026-04-11
**状态**: ✅ 已实现并合并到 main
**灵感来源**: [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) (665⭐ Tauri 桌面应用，Karpathy LLM Wiki 范式)
**核心决策**: 增量优化，不重构 v7.0 — 5 个新增/改动全部叠加式

## 一、本次升级的 5 个改动

| # | 改动 | 类型 | 文件 | Commit |
|---|------|------|------|--------|
| T1.1 | SHA256 内容哈希缓存 | 后端 | `assetLibrary.ts` + `003-content-sha256.sql` | `1fd450c` |
| T1.2 | 两段式事实提取 (analyze → generate) | 后端 | `factExtractor.ts` + `types.ts` | `5aa266b` |
| T1.3 | 实体图谱 4 信号加权 | 后端 | `ContentLibraryEngine.getEntityGraph` | `e8dd5ee` |
| T1.4 | 两段式 ingest 前端触发回填按钮 | 全栈 | `ContentLibraryEngine.reextractBatch` + `ContentLibraryFacts.tsx` | `081921e` |
| T3.1-3 | Wiki 物化视图 (Obsidian 兼容) | 全栈 | `wiki/wikiGenerator.ts` + `ContentLibraryWiki.tsx` | `84f1f91` / `b8d47e7` / `5e62f65` |

## 二、T1.1 — SHA256 内容哈希缓存

**问题**: `importAsset()` 每次都跑完整 pipeline (tagging + embedding + fact extraction)，重复导入浪费大量 LLM token。

**改动**:
- Migration `003-content-sha256.sql`: `asset_library` 加 `content_sha256 VARCHAR(64)` 列 + 索引
- `importAsset()` 开头计算 SHA256 → 若命中已有 asset → 直接返回 `{ skipped: true, assetId: 老的 }`
- 兼容降级: 未执行 migration 时自动 fallback 到无缓存模式

**收益**: 重复导入时省掉 3 次 LLM 调用 (tagging / embedding / fact extraction)，耗时 < 50ms

## 三、T1.2 — 两段式事实提取

**问题**: 原 `FactExtractor.extract()` 是单次 LLM 调用，长文档提取 F1 低。

**改动** (受 llm_wiki Stage1→Stage2 启发):
```
Stage 1 analyze(content): LLM 产出结构化理解
  → ContentAnalysisResult { entities, keyClaims, contradictions, organizationHints, domain }

Stage 2 extract(content, analysisContext):
  → 把 Stage 1 输出拼进 prompt 作为上下文
  → LLM 产出三元组 (更有依据)
```

- 新增 `ContentAnalysisResult` 类型
- `ContentLibraryOptions.useTwoStageExtraction` (默认 `true`)
- 失败时自动 fallback 到单次模式，不破坏现有流程

**预期**: 事实提取 F1 提升，低置信度事实占比下降

## 四、T1.3 — 实体图谱 4 信号加权

**问题**: 原 `getEntityGraph()` 用 `COUNT(shared_facts)` 单信号排序，质量差。

**改动** (llm_wiki 的 4 信号加权模型):
```
strength = 3.0 × direct_links      (共现事实数)
         + 4.0 × source_overlap    (共享 asset 数 — 最强信号)
         + 1.0 × type_affinity     (同类型加成)
```

- SQL 用 CTE 计算 `center_assets` / `direct_edges` / `neighbor_source_overlap`
- 返回 `relations[]` 增加 `breakdown: { direct, sourceOverlap, typeAffinity }` 字段
- Adamic-Adar 信号留到 Tier 2 (未做)

**核心突破**: "共享 asset" 信号 (权重 4.0，最高) **首次被利用**，而这个信息 v7.0 现有 `content_facts.asset_id` 就已经有了，只是没用。

## 五、T1.4 — 两段式 ingest 前端回填按钮

**需求**: 两段式 ingest 启用后，历史素材需要一种"按需回填"方式。用户决策: **不用 CLI 脚本，改用前端按钮**。

**后端**:
- `ContentLibraryEngine.reextractBatch(options)` 批量对历史 asset 调用新 extract (两段式)
- 参数: `assetIds / limit / since / minConfidence / dryRun`
- 返回: `{ processed, newFacts, updatedFacts, skipped, errors, tokenEstimate }`
- 新端点: `POST /api/v1/content-library/reextract`

**前端** (`/content-library/facts` 页面顶部):
- 📤 "🔄 重新提取事实" 按钮 → 展开回填面板
- 参数: 处理数量上限 / 起始日期 / 最低置信度
- 双按钮: 🧪 预演 (dryRun) / ▶️ 正式执行 (带 confirm)
- 结果卡片: 6 项统计 (含 ~Token 估算)
- 正式执行后自动刷新事实列表

## 六、T3 — Wiki 物化视图 (Obsidian 兼容)

**需求**: 把 content_facts + content_entities 物化成人类可读的 markdown wiki。

### 6.1 后端模块 `api/src/modules/content-library/wiki/`

```
wiki/
├── templates.ts       # 5 种页面模板 + YAML frontmatter + slugify + wikilink
└── wikiGenerator.ts   # WikiGenerator 类: generate() / listWikis() / listFiles() / readMarkdown()
```

**生成目录结构** (Obsidian vault 格式):
```
{wikiRoot}/
├── .obsidian/app.json          # 自动 wikilink / graph view 配置
├── overview.md                 # 顶层摘要
├── index.md                    # 分类目录
├── entities/                   # 实体页 (一实体一文件)
│   ├── OpenAI.md
│   └── ...
├── concepts/                   # 按领域分组的概念页
│   ├── AI芯片.md
│   └── ...
└── sources/                    # 素材来源页 (带 L0 摘要)
    ├── asset_abc123.md
    └── ...
```

**页面模板特性**:
- `[[wikilink]]` 语法 + slugify 保证文件名安全
- YAML frontmatter: `type / aliases / sources[] / domains / updatedAt`
- 实体页: 置信度排序的关键事实 + 邻居列表 + 来源引用
- 只读物化视图: 不改数据库，每次 generate() 重新覆盖

### 6.2 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/content-library/wiki/generate` | 生成 wiki (body: wikiRoot / domainFilter / maxEntities) |
| GET  | `/api/v1/content-library/wiki/list?rootDir=X` | 列出根目录下所有 wiki |
| GET  | `/api/v1/content-library/wiki/files?wikiRoot=X` | 列出 wiki 下所有 md 文件 |
| GET  | `/api/v1/content-library/wiki/preview?wikiRoot=X&path=Y` | 读取单个文件 (防路径越狱) |

### 6.3 前端页面 `/content-library/wiki`

三栏布局:
- **左栏**: 已生成 Wiki 列表 (按 mtime 倒序)
- **中栏**: 当前 Wiki 文件树 (按 category: root / entities / concepts / sources)
- **右栏**: Markdown 预览 (SimpleMarkdown 组件支持标题/列表/段落，frontmatter 折叠，`[[wikilink]]` 可点击跳转)

顶部"✦ 生成 Wiki"折叠面板, 生成完成后统计 + 错误列表

侧边栏: 内容库组新增 "📖 Wiki 物化" 入口

## 七、被拒绝的 llm_wiki 启发点

| 启发点 | 为何不做 |
|--------|---------|
| Tauri 桌面壳 | 产品形态是 Web 多人协作 |
| Chrome 剪藏插件 | 已有 RSS + 上传 + 语义搜索 |
| Deep Research + Tavily | 已有 ResearchTab + Tavily 集成 |
| Louvain 社区发现 | 数据量不足以发挥价值，延后到 v7.2 |
| 持久化 content_entity_relations 边表 | 运行时 SQL (T1.3 的 CTE) 已够用 |
| Adamic-Adar 替代 COUNT | 延后到 v7.2 (T2) |
| task_purpose_docs 目标锚定 | 延后到 v7.2 (T2) |

## 八、v7.1 成功指标

| 指标 | v7.0 | v7.1 | 备注 |
|------|------|------|------|
| 重复 import 耗时 | ~3-5s (3 次 LLM) | < 50ms (0 次 LLM) | SHA256 缓存命中 |
| 事实提取 F1 | 单次 baseline | 两段式预期 +20~30% | 需实测 |
| 实体图谱准确性 | COUNT 单信号 | 4 信号加权 | 定性: source overlap 信号首次被利用 |
| 回填工具 | 无 | Facts 页面按钮 | 支持 dryRun 预演 |
| 产出形态数 | 1 (结构化 API) | 2 (API + Wiki 物化) | 新增 Markdown wiki (Obsidian 兼容) |

## 九、文件清单

**新增**:
- `api/src/modules/content-library/migrations/003-content-sha256.sql`
- `api/src/modules/content-library/wiki/templates.ts` (278 行)
- `api/src/modules/content-library/wiki/wikiGenerator.ts` (357 行)
- `webapp/src/pages/ContentLibraryWiki.tsx` (394 行)

**修改**:
- `api/src/services/assetLibrary.ts` (SHA256 缓存)
- `api/src/modules/content-library/types.ts` (`useTwoStageExtraction` option)
- `api/src/modules/content-library/consolidation/factExtractor.ts` (两段式)
- `api/src/modules/content-library/ContentLibraryEngine.ts` (weighted graph + reextractBatch + wikiGenerator)
- `api/src/modules/content-library/router.ts` (reextract + wiki endpoints)
- `webapp/src/pages/ContentLibraryFacts.tsx` (回填按钮)
- `webapp/src/App.tsx` (wiki 路由)
- `webapp/src/components/Layout.tsx` (wiki 侧边栏)

---

*v7.1 Update: 2026-04-11*
*灵感来源: https://github.com/nashsu/llm_wiki*
