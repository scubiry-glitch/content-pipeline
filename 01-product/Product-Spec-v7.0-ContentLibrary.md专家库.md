基于 Hermes Agent Memory Provider 模式的结构化记忆与层级检索升级
版本: v7.0-ContentLibrary
日期: 2026-04-06
状态: 架构提案
依赖: v6.2 Assets AI 处理、v6.3 统一分类字典、v5.0 专家库

Context
当前内容库（素材库）存在几个关键问题：存储扁平化、检索手段单一（仅 pgvector cosine）、无跨内容推理能力、无层级加载机制导致 token 浪费、与专家库知识源数据孤岛。
用户希望借鉴 Hermes Agent 的 Memory Provider 模式（Hindsight / OpenViking / RetainDB / Holographic 等），对内容库进行系统性升级。
关键约束: 内容库模块必须具备随时可拆分、独立部署的能力——既能嵌入现有 content-pipeline 运行，也能作为独立微服务部署，零框架耦合。

1. 现状差距分析
差距问题对标参考G1无结构化知识网络，内容间无实体关联/因果链/观点演化Hindsight 4层逻辑网络G2无层级加载，每次返回全量内容，token 浪费严重OpenViking L0/L1/L2G3仅 pgvector 语义检索，无关键词匹配和重排序RetainDB Vector+BM25+RerankingG4新内容入库不与既有知识融合，无事实去重/版本追踪Mem0 事实提取 + RetainDB delta 压缩G5asset_library 和 expert_knowledge_sources 检索不互通Hindsight 统一知识图谱
可复用基础设施（不重建）

pgvector + HNSW 索引（assets-ai/schema.sql）
DocumentChunkingService（已支持 abstract/toc/body/conclusion/chart 分块）
EmbeddingService 多 provider 降级架构
专家库 Adapter 模式（expert-library/types.ts）
v6.3 统一分类字典 Domain→Theme→Tag


2. 目标架构：四层模型
┌─────────────────────────────────────────────────────────────────┐
│                   内容库 (Content Library) v7.0                   │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: 跨内容推理层 (← Hindsight)                             │
│  · 知识图谱 · 观点演化追踪 · 因果链 · 矛盾检测                     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 混合检索层 (← RetainDB)                                │
│  · 语义检索 + 关键词检索 + RRF/LLM 重排序 + 质量加权               │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: 层级加载层 (← OpenViking)                              │
│  · L0 摘要索引(~80tok) · L1 结构片段(~400tok) · L2 全文(1000+tok) │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: 知识整合层 (← Mem0 + RetainDB)                         │
│  · 事实三元组提取 · 实体归一化 · 去重合并 · Delta 压缩              │
├─────────────────────────────────────────────────────────────────┤
│  基座: 现有 AssetService + AssetLibrary + Assets-AI + pgvector    │
└─────────────────────────────────────────────────────────────────┘

3. 各层详细设计
3.1 Layer 1: 知识整合层
对标: Mem0 事实提取 + RetainDB delta 压缩
从导入内容中提取结构化事实三元组，实体归一化，增量压缩：
输入: "2026Q1全球AI芯片市场规模180亿美元，NVIDIA占62%"
输出:
  - (全球AI芯片市场, 规模, 180亿美元) [时间=2026Q1]
  - (NVIDIA, 市场份额, 62%) [领域=AI芯片, 时间=2026Q1]
新增表:

content_facts — 结构化事实（subject/predicate/object + context JSONB + embedding + 版本链）
content_entities — 全局实体注册表（canonical_name + aliases + entity_type + taxonomy关联）

3.2 Layer 2: 层级加载层
对标: OpenViking L0/L1/L2（减少 80-90% token 消耗）
层级内容~Token加载时机L0标题+50字摘要+标签+质量分80始终（浏览/筛选）L1核心观点+关键数据+结论300-500按需（相关性确认后）L2完整内容/分块全文1000+深度引用时
复用现有 asset_ai_analysis 字段，新增 l0_summary、l1_key_points 列。
3.3 Layer 3: 混合检索层
对标: RetainDB Vector + BM25 + Reranking
查询 → ┬─ Semantic (pgvector cosine) → Top-K
       ├─ Keyword (tsvector ts_rank) → Top-K
       └─ 合并 → RRF Reranking → 质量加权 → 最终排序

PostgreSQL tsvector + GIN 索引实现 BM25 等效
中文分词用 zhparser 或 pg_jieba
默认 RRF 融合，高优查询启用 LLM reranking
打通 asset_embeddings + expert_knowledge_sources 跨源联合检索

3.4 Layer 4: 跨内容推理层
对标: Hindsight 4层逻辑网络
网络Hindsight 原型内容库适配World Facts世界事实content_facts 表Agent ExperiencesAgent 经验content_production_log — 素材组合→产出质量记录Entity Summaries实体摘要content_entities.metadata 动态概况Evolving Beliefs演化信念content_beliefs — 命题状态(confirmed/disputed/refuted)+历史
核心能力：矛盾检测（ContradictionDetector）、观点演化追踪（BeliefTracker）、生产经验学习（ExperienceLog）。

4. 产出物体系：四层模型驱动内容生产
四层模型的最终目的是产出可直接用于内容生产的高价值素材。每一层沉淀的数据向上汇聚，最终输出 15 类可消费的产出物。
4.1 产出物全景
┌─────────────────────────────────────────────────────────────────────────┐
│                    内容生产者可直接使用的产出物                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─── 选题阶段 ──────────────────────────────────────────────────────┐ │
│  │ ① 有价值的议题    ② 趋势信号    ③ 差异化角度建议                   │ │
│  │ ④ 知识空白/盲区                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              ↓                                          │
│  ┌─── 研究阶段 ──────────────────────────────────────────────────────┐ │
│  │ ⑤ 关键事实        ⑥ 实体关系图谱    ⑦ 信息增量报告                 │ │
│  │ ⑧ 事实保鲜度报告  ⑨ 高密度知识卡片                                │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              ↓                                          │
│  ┌─── 写作阶段 ──────────────────────────────────────────────────────┐ │
│  │ ⑩ 有价值的认知    ⑪ 最佳素材组合推荐  ⑫ 专家共识/分歧图           │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              ↓                                          │
│  ┌─── 审核阶段 ──────────────────────────────────────────────────────┐ │
│  │ ⑬ 争议话题        ⑭ 观点演化脉络    ⑮ 跨领域关联洞察              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
4.2 产出物详细定义 × 来源层 × 使用场景
#产出物来源层生成方式内容生产中怎么用①有价值的议题L1 实体趋势 + L4 推理实体事实密度 × 时效性 × 空白度加权排序Planner Agent 选题推荐列表的核心输入②趋势信号L1 事实时序 + L4 演化同一实体/指标的 content_facts 按时间聚合，检测方向性变化判断"该不该现在写"——时机窗口评估③差异化角度建议L3 混合检索 + L4 空白检测检索竞品已覆盖内容，找出未被覆盖的实体-谓词组合避免同质化，找到独特切入点④知识空白/盲区L3 覆盖率分析 + L1 实体注册表有实体注册但缺乏事实支撑的区域发现"别人没写过但值得写"的机会⑤关键事实L1 知识整合FactExtractor 提取的高置信度三元组（confidence>0.8）Researcher Agent 研究时的可靠论据来源⑥实体关系图谱L1 实体注册表 + content_facts 关联基于共现关系和因果关系构建实体间连线写作时理解"这个公司和哪些概念/人物/事件有关"⑦信息增量报告L1 Delta 压缩按时间窗口（日/周/月）统计新增/更新/推翻的事实每周选题会的信息输入——"这周发生了什么新变化"⑧事实保鲜度报告L1 版本链扫描 content_facts 中 is_current=true 但 created_at 超期的记录提醒编辑"这篇文章引用的数据已过时，需要更新"⑨高密度知识卡片L2 层级加载 L1 级单实体的 L1 摘要：核心数据 + 最新事实 + 关键关系，~300 token快速 briefing / 会议准备 / 写作时的速查卡⑩有价值的认知L4 跨内容推理跨多篇内容的 content_facts 聚合 → LLM 综合提炼文章的核心论点来源——"我们发现了什么别人没发现的"⑪最佳素材组合推荐L4 经验库content_production_log 中高评分任务的素材+专家组合模式Writer Agent 自动推荐"写这类文章最好用这些素材"⑫专家共识/分歧图L4 + 专家库联动多个专家对同一议题的 invoke 结果聚合比对增加文章深度——"业界对此分为两派"⑬争议话题L4 矛盾检测ContradictionDetector 发现的事实对立对BlueTeam 审核时重点关注项 / 争议选题灵感⑭观点演化脉络L4 BeliefTrackercontent_beliefs 表的状态变更历史时间线写"复盘类/演变类"文章的结构骨架⑮跨领域关联洞察L4 跨源推理 + L1 实体不同 taxonomy_domain 下的实体通过事实间接关联发现意外关联——"芯片短缺→新能源交付延迟"
4.3 产出物 × Pipeline Agent 集成
产出物不只是被动查询，而是主动注入到现有 Agent 工作流：
Planner Agent（选题规划）
  输入 ← ① 议题推荐 + ② 趋势信号 + ③ 差异化建议 + ④ 知识空白
  决策: 选什么题、什么角度、什么时机

Researcher Agent（研究执行）
  输入 ← ⑤ 关键事实 + ⑥ 实体图谱 + ⑦ 信息增量 + ⑨ 知识卡片
  方式: L0 快速扫描 → L1 按需展开 → L2 深度引用（token 节省 80%）

Writer Agent（内容写作）
  输入 ← ⑩ 核心认知 + ⑪ 最佳素材组合 + ⑫ 专家共识/分歧
  效果: 有论点、有论据、有多元视角

BlueTeam Agent（质量评审）
  输入 ← ⑬ 争议标记 + ⑧ 事实保鲜度 + ⑭ 观点演化脉络
  效果: 精准定位风险点，而非全文泛审
4.4 产出物 API 端点设计
GET  /api/v1/content-library/topics/recommended     → ① 议题推荐
GET  /api/v1/content-library/trends/:entity_id       → ② 趋势信号
GET  /api/v1/content-library/gaps                    → ③④ 差异化 + 空白
GET  /api/v1/content-library/facts?subject=X         → ⑤ 关键事实
GET  /api/v1/content-library/entities/:id/graph      → ⑥ 实体图谱
GET  /api/v1/content-library/delta?since=2026-03-30  → ⑦ 信息增量
GET  /api/v1/content-library/freshness/stale         → ⑧ 过期事实
GET  /api/v1/content-library/cards/:entity_id        → ⑨ 知识卡片
POST /api/v1/content-library/synthesize              → ⑩ 认知综合
GET  /api/v1/content-library/recommendations/:task   → ⑪ 素材组合推荐
GET  /api/v1/content-library/consensus/:topic        → ⑫ 专家共识图
GET  /api/v1/content-library/contradictions          → ⑬ 争议话题
GET  /api/v1/content-library/beliefs/:id/timeline    → ⑭ 观点演化
GET  /api/v1/content-library/cross-domain/:entity_id → ⑮ 跨领域关联

5. 独立部署架构 + 模块结构
5.1 核心原则：可嵌入 / 可独立 / 可拆分
参照专家库模式（expert-library/index.ts 第1-3行注释），内容库设计为双模运行，前端为独立可插拔 npm 包：
部署模式 A — 嵌入式（当前）:
  后端: content-pipeline/api → import { createContentLibraryEngine } from './modules/content-library'
  前端: content-pipeline/webapp → import { ContentLibraryPages } from '@content-library/ui'
  · 共享 Fastify 实例、数据库连接池、LLM Router
  · 前端组件直接嵌入现有 webapp 路由
  · 零额外进程，最低运维成本

部署模式 B — 独立微服务（未来拆分）:
  后端: content-library-service → import { createContentLibraryEngine, createStandaloneServer } from 'content-library'
  前端: npm install @content-library/ui（可选安装，或仅用 Swagger/OpenAPI）
  · 独立进程、独立端口、独立数据库（或共享库 + schema 隔离）
  · 通过 HTTP/gRPC 与 pipeline 通信
5.2 实现独立部署的关键设计
设计要素实现方式参照零框架依赖核心逻辑不 import Fastify/Express，router.ts 仅作薄适配层专家库 ExpertEngine 不依赖 FastifyAdapter 注入所有外部依赖（DB/LLM/Embedding/Storage/EventBus）通过接口注入ExpertLibraryDeps 模式独立 Migration所有 SQL 在 migrations/ 目录，可独立执行，不依赖主项目 migration 工具专家库 001-expert-library.sql独立入口standalone.ts 提供 createStandaloneServer() 直接启动 HTTP 服务新增独立 package.json模块目录下可选 package.json，拆分时直接发布为 npm 包新增事件解耦模块间通信通过 EventBusAdapter（嵌入=本地 EventEmitter，独立=Redis Pub/Sub 或 HTTP 回调）新增可插拔前端前端作为独立 npm 包 @content-library/ui，后端模块不包含任何前端代码新增
5.3 前端包架构（@content-library/ui）
前端与后端完全解耦，作为独立 npm 包发布：
packages/content-library-ui/
├── package.json                    # @content-library/ui
├── src/
│   ├── index.ts                    # 统一导出所有页面 + 组件
│   ├── api-client.ts               # API 客户端（baseURL 可配，适配嵌入/独立）
│   ├── types.ts                    # 前端类型（从后端 types.ts 同步或共享）
│   ├── pages/
│   │   ├── ContentDashboard.tsx    # 产出物总览仪表盘（15类产出物入口）
│   │   ├── FactExplorer.tsx        # ⑤关键事实浏览 + ⑧保鲜度标记
│   │   ├── EntityGraph.tsx         # ⑥实体关系图谱可视化
│   │   ├── TrendTimeline.tsx       # ②趋势信号 + ⑭观点演化时间线
│   │   ├── TopicRecommender.tsx    # ①议题推荐 + ③差异化建议 + ④知识空白
│   │   ├── ContradictionBoard.tsx  # ⑬争议话题看板
│   │   └── KnowledgeCards.tsx      # ⑨高密度知识卡片浏览
│   ├── components/
│   │   ├── FactCard.tsx            # 事实三元组卡片
│   │   ├── BeliefBadge.tsx         # 命题状态标签（confirmed/disputed/refuted）
│   │   ├── TieredContentView.tsx   # L0→L1→L2 渐进展开组件
│   │   ├── DeltaReport.tsx         # ⑦信息增量报告组件
│   │   └── ConsensusChart.tsx      # ⑫专家共识/分歧图表
│   └── hooks/
│       ├── useContentLibrary.ts    # API 调用 hooks
│       └── useTieredLoad.ts        # L0→L1→L2 按需加载 hook
集成方式：
typescript// 嵌入模式: webapp/src/App.tsx
import { ContentDashboard, EntityGraph, FactExplorer } from '@content-library/ui';

// 配置 API 地址（嵌入=相对路径，独立=绝对 URL）
import { configure } from '@content-library/ui';
configure({ apiBaseUrl: '/api/v1/content-library' });  // 嵌入
configure({ apiBaseUrl: 'https://cl.example.com/api/v1/content-library' });  // 独立
关键设计约束：

前端包不依赖后端模块的任何代码（通过 REST API 通信）
前端包不依赖宿主应用的状态管理（自带 React Query / zustand 等轻量状态）
前端包导出的是页面级组件（可直接挂载到路由）和组件级组件（可嵌入已有页面）

5.4 Adapter 接口定义（types.ts）
typescript// 复用专家库已有接口
import type { DatabaseAdapter, LLMAdapter, StorageAdapter } from '../expert-library/types.js';

// 新增接口
export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EventBusAdapter {
  /** 发布事件（嵌入=EventEmitter, 独立=Redis/HTTP） */
  publish(event: string, payload: any): Promise<void>;
  /** 订阅事件 */
  subscribe(event: string, handler: (payload: any) => Promise<void>): void;
}

export interface TextSearchAdapter {
  /** 全文检索（嵌入=PostgreSQL tsvector, 独立=可换 Elasticsearch/Meilisearch） */
  search(query: string, options?: { limit?: number; filters?: Record<string, any> }): Promise<SearchResult[]>;
  index(id: string, content: string, metadata?: Record<string, any>): Promise<void>;
}

/** 注入 ContentLibraryEngine 的全部外部依赖 */
export interface ContentLibraryDeps {
  db: DatabaseAdapter;           // 复用专家库接口
  llm: LLMAdapter;               // 复用专家库接口
  embedding: EmbeddingAdapter;   // 新增
  textSearch: TextSearchAdapter; // 新增（可替换实现）
  eventBus?: EventBusAdapter;    // 可选（嵌入模式可省略）
  storage?: StorageAdapter;      // 复用专家库接口
}
5.5 工厂函数
typescript// index.ts — 双模导出
export function createContentLibraryEngine(deps: ContentLibraryDeps, options?: ContentLibraryOptions): ContentLibraryEngine;
export function createRouter(engine: ContentLibraryEngine): FastifyPluginAsync;  // 嵌入模式
export function createStandaloneServer(config: StandaloneConfig): Promise<{ start: () => Promise<void>; stop: () => Promise<void> }>;  // 独立模式
5.6 模块目录结构（后端 + 前端）
api/src/modules/content-library/
├── index.ts                      # 统一导出 + 工厂函数（双模）
├── types.ts                      # 所有类型 + Adapter 接口（零外部依赖）
├── ContentLibraryEngine.ts       # 核心调度（仅依赖 types.ts 中的 Adapter）
├── standalone.ts                 # 独立部署入口（创建 HTTP server + 注入适配器）
├── package.json                  # 可选：拆分为独立 npm 包时使用
├── consolidation/
│   ├── factExtractor.ts          # 事实三元组提取
│   ├── entityResolver.ts         # 实体归一化
│   └── deltaCompressor.ts        # 增量压缩
├── retrieval/
│   ├── tieredLoader.ts           # L0/L1/L2 层级加载
│   ├── hybridSearch.ts           # 混合检索
│   └── crossSourceSearch.ts      # 跨源联合检索
├── reasoning/
│   ├── contradictionDetector.ts  # 矛盾检测
│   ├── beliefTracker.ts          # 观点演化追踪
│   └── experienceLog.ts          # 生产经验记录
├── adapters/
│   ├── postgres-text-search.ts   # TextSearchAdapter 的 PostgreSQL tsvector 实现
│   ├── local-event-bus.ts        # EventBusAdapter 的本地 EventEmitter 实现
│   └── redis-event-bus.ts        # EventBusAdapter 的 Redis Pub/Sub 实现
├── migrations/
│   ├── 001-content-library.sql   # 核心表（可独立执行）
│   └── 002-hybrid-search.sql     # 全文检索索引
├── router.ts                     # Fastify 路由适配（薄层，仅转发到 Engine）
└── __tests__/                    # 独立测试（mock 所有 Adapter）

packages/content-library-ui/          # 可插拔前端包（@content-library/ui）
├── package.json
├── src/
│   ├── index.ts                      # 统一导出
│   ├── api-client.ts                 # REST 客户端（baseURL 可配）
│   ├── pages/                        # 7 个页面级组件
│   │   ├── ContentDashboard.tsx      # 产出物总览
│   │   ├── FactExplorer.tsx          # 事实浏览 + 保鲜度
│   │   ├── EntityGraph.tsx           # 实体关系图谱
│   │   ├── TrendTimeline.tsx         # 趋势 + 观点演化
│   │   ├── TopicRecommender.tsx      # 议题 + 差异化 + 空白
│   │   ├── ContradictionBoard.tsx    # 争议看板
│   │   └── KnowledgeCards.tsx        # 知识卡片
│   ├── components/                   # 可嵌入组件
│   └── hooks/                        # API hooks

6. 分阶段实施
Phase 1: 模块骨架 + 层级加载 + 混合检索（2周，P0）

1.0 创建独立部署骨架：types.ts（全部 Adapter 接口）、index.ts（双模工厂函数）、standalone.ts、package.json
1.1 实现 adapters/postgres-text-search.ts 和 adapters/local-event-bus.ts
1.2 TieredLoader: 从现有 asset_ai_analysis 组装 L0/L1
1.3 tsvector 列 + GIN 索引 + HybridSearchService (Vector + BM25 + RRF)
1.4 Migration SQL（独立可执行）+ Fastify router（薄层）
1.5 验证独立部署：standalone.ts 可单独启动并响应 HTTP 请求
验证: NDCG@10 提升>20%，token 消耗下降>50%，独立部署模式可启动

Phase 2: 知识整合（2周，P1）

FactExtractor + content_facts 表
EntityResolver + content_entities 表
DeltaCompressor 增量压缩
Hook 进 AssetLibraryService.importAsset() 流程
验证: 实体去重>85%，事实提取 F1>0.75

Phase 3: 跨内容推理 + 产出物 API + 前端包（3周，P2）

ContradictionDetector → 产出⑬争议话题
BeliefTracker → 产出⑭观点演化脉络
ExperienceLog → 产出⑪最佳素材组合推荐
跨源联合检索 → 产出⑮跨领域关联洞察
认知综合引擎 → 产出⑩有价值的认知
专家共识聚合 → 产出⑫专家共识/分歧图
全部 15 个产出物 API 端点上线
与 Planner/Researcher/Writer/BlueTeam Agent 集成
前端: 创建 @content-library/ui 包骨架，实现 ContentDashboard + FactExplorer + KnowledgeCards 三个核心页面
前端: TieredContentView 组件（L0→L1→L2 渐进展开）
验证: 矛盾检出>70%，素材利用率>60%，4 个 Agent 均可消费产出物

Phase 4: 前端完善 + 优化与个性化（2周，P3）

前端: EntityGraph（实体图谱可视化）、TrendTimeline（趋势+演化时间线）、TopicRecommender、ContradictionBoard
前端: ConsensusChart + DeltaReport 组件
前端: 集成到 webapp/ 现有路由（嵌入模式验证）
LLM-based Reranking 替代 RRF
用户偏好建模（Honcho 模式）
产出物推送机制：定时生成⑦信息增量报告、⑧保鲜度报告，推送到运营 Dashboard
性能调优


7. 关键文件
用途路径现有导入流程（需 hook）api/src/services/assetLibrary.ts现有 DB schemaapi/src/services/assets-ai/schema.sqlAdapter 接口模板api/src/modules/expert-library/types.ts现有 Embedding 服务api/src/services/assets-ai/embedding.ts专家知识检索（Phase 3 打通）api/src/modules/expert-library/knowledgeService.tsAssetService CRUDapi/src/services/assetService.ts

8. 风险与缓解
风险缓解LLM 事实提取不准confidence>0.7 才入库 + 人工抽审tsvector 中文分词差zhparser/pg_jieba 扩展content_facts 膨胀归档旧版本 + 分区表跨源检索延迟并行查询 + Redis 缓存热门结果模块耦合风险严格 Adapter 模式，现有代码路径不受影响拆分时数据迁移独立 migration SQL + 可选 schema 隔离（content_library.*）；拆分时只需 pg_dump 指定表独立部署网络开销EventBusAdapter 抽象层，嵌入=零开销本地调用，独立=Redis Pub/Sub 异步解耦

9. 验证方式

Phase 1 测试: 对比纯向量 vs 混合检索的 NDCG@10；测量 L0 vs L2 的 token 消耗
Phase 2 测试: 导入样本研报，验证事实提取准确率和实体去重率
Phase 3 测试: 导入矛盾信息源，验证矛盾检测召回率
集成测试: Researcher Agent 使用 TieredLoader 完成一次完整选题研究，对比改造前后质量

10. 交付物

产出文档：01-product/Product-Spec-v7.0-ContentLibrary.md（基于此方案展开为正式产品规格）
后端模块：api/src/modules/content-library/（独立可部署，Adapter 注入）
前端包：packages/content-library-ui/（@content-library/ui，可插拔 npm 包）
Migration SQL：独立可执行，不依赖主项目迁移工具
API 文档：15 个产出物端点的 OpenAPI 补充定义
集成指南：嵌入模式 / 独立部署模式的配置文档