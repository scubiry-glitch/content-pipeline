# Product Spec v7.0 — 内容库 (Content Library)

## 基于 Hermes Agent Memory Provider 模式的结构化记忆与层级检索升级

**版本**: v7.0
**日期**: 2026-04-06
**状态**: Phase 1 已实现
**依赖**: v6.2 Assets AI 处理、v6.3 统一分类字典、v5.0 专家库
**代码路径**: `api/src/modules/content-library/`
**前端包**: `packages/content-library-ui/` (Phase 3+)

---

## 1. 背景与动机

当前内容库（素材库）存在以下关键问题:

| 问题 | 影响 | 对标参考 |
|------|------|---------|
| 存储扁平化 | 内容间无关联，无法发现跨内容洞察 | Hindsight 4层逻辑网络 |
| 检索单一化 | 仅 pgvector cosine 相似度，精确匹配差 | RetainDB Vector+BM25+Reranking |
| Token 浪费 | 每次返回全量内容，Agent 上下文效率低 | OpenViking L0/L1/L2 分级加载 |
| 无知识整合 | 新内容不与既有知识融合 | Mem0 事实提取 + Delta 压缩 |
| 数据孤岛 | 素材库与专家知识源检索不互通 | 统一知识图谱 |

**参考系统**: NousResearch Hermes Agent 的 Memory Provider 插件体系
- **Hindsight**: 结构化记忆基底 (4层逻辑网络、91% LongMemEval 准确率)
- **OpenViking**: 层级检索 (L0/L1/L2，减少 80-90% token 消耗)
- **RetainDB**: 混合搜索 (Vector + BM25 + Reranking，最强检索精度)
- **Mem0**: 自动事实提取 + 语义搜索
- **Honcho**: 跨会话用户建模

---

## 2. 目标架构: 四层模型

```
┌──────────────────────────────────────────────────────────────────┐
│                   内容库 (Content Library) v7.0                    │
├──────────────────────────────────────────────────────────────────┤
│  Layer 4: 跨内容推理层 (← Hindsight)                              │
│  · 知识图谱 · 观点演化追踪 · 因果链 · 矛盾检测                      │
├──────────────────────────────────────────────────────────────────┤
│  Layer 3: 混合检索层 (← RetainDB)                                 │
│  · 语义检索 + 关键词检索 + RRF/LLM 重排序 + 质量加权                │
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

---

## 3. 产出物体系: 15 类可消费产出物

四层模型最终服务于**内容生产**，产出 15 类可直接使用的高价值素材:

### 选题阶段
| # | 产出物 | 来源层 | 使用场景 |
|---|--------|--------|---------|
| ① | 有价值的议题 | L1+L4 | Planner Agent 选题推荐 |
| ② | 趋势信号 | L1+L4 | 时机窗口评估 |
| ③ | 差异化角度建议 | L3+L4 | 避免同质化 |
| ④ | 知识空白/盲区 | L3+L1 | 发现未覆盖机会 |

### 研究阶段
| # | 产出物 | 来源层 | 使用场景 |
|---|--------|--------|---------|
| ⑤ | 关键事实 | L1 | 可靠论据来源 |
| ⑥ | 实体关系图谱 | L1 | 理解关联网络 |
| ⑦ | 信息增量报告 | L1 | 每周变化速览 |
| ⑧ | 事实保鲜度报告 | L1 | 过期数据预警 |
| ⑨ | 高密度知识卡片 | L2 | 快速 briefing 速查 |

### 写作阶段
| # | 产出物 | 来源层 | 使用场景 |
|---|--------|--------|---------|
| ⑩ | 有价值的认知 | L4 | 核心论点生成 |
| ⑪ | 最佳素材组合推荐 | L4 | 自动推荐素材+专家 |
| ⑫ | 专家共识/分歧图 | L4+专家库 | 多元视角呈现 |

### 审核阶段
| # | 产出物 | 来源层 | 使用场景 |
|---|--------|--------|---------|
| ⑬ | 争议话题 | L4 | 风险点定位 |
| ⑭ | 观点演化脉络 | L4 | 复盘类文章骨架 |
| ⑮ | 跨领域关联洞察 | L4+L1 | 发现意外关联 |

### Pipeline Agent 集成

```
Planner Agent  ← ①②③④
Researcher Agent ← ⑤⑥⑦⑨ (L0→L1→L2 渐进加载)
Writer Agent   ← ⑩⑪⑫
BlueTeam Agent ← ⑬⑧⑭
```

---

## 4. 独立部署架构

模块具备**随时可拆分、独立部署**能力:

| 部署模式 | 后端 | 前端 |
|----------|------|------|
| **嵌入式** | `import { createContentLibraryEngine } from './modules/content-library'` | `import { ContentDashboard } from '@content-library/ui'` |
| **独立微服务** | `standalone.ts` 独立启动 HTTP 服务 | `@content-library/ui` 可选安装 |

### 关键设计

- **零框架依赖**: 核心引擎不 import Fastify/Express
- **Adapter 注入**: DB / LLM / Embedding / TextSearch / EventBus 全部可替换
- **独立 Migration**: SQL 可独立执行
- **可插拔前端**: `@content-library/ui` 独立 npm 包，7 个页面 + 可嵌入组件

### Adapter 接口

```typescript
interface ContentLibraryDeps {
  db: DatabaseAdapter;           // PostgreSQL / 其他
  llm: LLMAdapter;               // Kimi / Claude / OpenAI
  embedding: EmbeddingAdapter;   // SiliconFlow / OpenAI
  textSearch: TextSearchAdapter; // PostgreSQL tsvector / Elasticsearch
  eventBus?: EventBusAdapter;    // EventEmitter / Redis Pub/Sub
  storage?: StorageAdapter;      // MinIO / S3
}
```

---

## 5. API 端点

所有端点前缀: `/api/v1/content-library`

| 方法 | 路径 | 产出物 | 阶段 |
|------|------|--------|------|
| POST | `/search` | 混合检索 | Phase 1 |
| GET | `/assets/:id/tiered?level=L0` | 层级加载 | Phase 1 |
| POST | `/extract` | 事实提取 | Phase 2 |
| GET | `/facts?subject=X` | ⑤ 关键事实 | Phase 1 |
| GET | `/entities` | 实体列表 | Phase 1 |
| GET | `/topics/recommended` | ① 议题推荐 | Phase 1 |
| GET | `/trends/:entityId` | ② 趋势信号 | Phase 1 |
| GET | `/entities/:id/graph` | ⑥ 实体图谱 | Phase 1 |
| GET | `/delta?since=DATE` | ⑦ 信息增量 | Phase 1 |
| GET | `/freshness/stale` | ⑧ 过期事实 | Phase 1 |
| GET | `/cards/:entityId` | ⑨ 知识卡片 | Phase 1 |
| POST | `/synthesize` | ⑩ 认知综合 | Phase 3 |
| GET | `/recommendations/:task` | ⑪ 素材推荐 | Phase 3 |
| GET | `/consensus/:topic` | ⑫ 专家共识 | Phase 3 |
| GET | `/contradictions` | ⑬ 争议话题 | Phase 1 |
| GET | `/beliefs/:id/timeline` | ⑭ 观点演化 | Phase 3 |
| GET | `/cross-domain/:entityId` | ⑮ 跨域关联 | Phase 3 |

---

## 6. 数据库 Schema

### 新增表

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `content_facts` | 结构化事实三元组 | subject, predicate, object, context, confidence, is_current, superseded_by |
| `content_entities` | 全局实体注册表 | canonical_name, aliases, entity_type, taxonomy_domain_id, embedding |
| `content_beliefs` | 观点/信念追踪 | proposition, current_stance, supporting_facts, history |
| `content_production_log` | 生产经验记录 | asset_ids, expert_ids, output_quality_score |

### 扩展字段

| 表名 | 新增字段 | 用途 |
|------|---------|------|
| `asset_ai_analysis` | `l0_summary` | L0 层 50 字摘要 |
| `asset_ai_analysis` | `l1_key_points` | L1 层核心要点数组 |
| `asset_ai_analysis` | `l1_token_count` | L1 层预估 token 数 |
| `assets` | `content_tsv` | PostgreSQL 全文检索向量 |

---

## 7. 前端包: @content-library/ui

独立可插拔 npm 包，与后端完全解耦。

### 页面级组件
| 组件 | 对应产出物 | 阶段 |
|------|-----------|------|
| ContentDashboard | 15类产出物总览入口 | Phase 3 |
| FactExplorer | ⑤关键事实 + ⑧保鲜度 | Phase 3 |
| EntityGraph | ⑥实体关系图谱 | Phase 4 |
| TrendTimeline | ②趋势 + ⑭演化时间线 | Phase 4 |
| TopicRecommender | ①议题 + ③差异化 + ④空白 | Phase 4 |
| ContradictionBoard | ⑬争议看板 | Phase 4 |
| KnowledgeCards | ⑨知识卡片 | Phase 3 |

### 可嵌入组件
- `TieredContentView` — L0→L1→L2 渐进展开
- `FactCard` — 事实三元组卡片
- `BeliefBadge` — 命题状态标签
- `DeltaReport` — 信息增量报告
- `ConsensusChart` — 专家共识/分歧图

---

## 8. 实施计划

| Phase | 周期 | 优先级 | 内容 |
|-------|------|--------|------|
| **Phase 1** | 2周 | P0 | 模块骨架 + 层级加载 + 混合检索 + Migration + Router |
| **Phase 2** | 2周 | P1 | 事实提取 + 实体注册 + Delta 压缩 + Hook importAsset |
| **Phase 3** | 3周 | P2 | 跨内容推理 + 全部产出物 API + 前端核心页面 |
| **Phase 4** | 2周 | P3 | 前端完善 + LLM Reranking + 用户建模 + 推送机制 |

---

## 9. 成功指标

| 指标 | 现状 | 目标 | 阶段 |
|------|------|------|------|
| 检索准确率 (NDCG@10) | ~60% | >82% | Phase 1 |
| Agent token 消耗/检索 | ~2000 | <400 (L0) | Phase 1 |
| 事实提取覆盖率 | 0% | >80% | Phase 2 |
| 实体去重率 | 无 | >85% | Phase 2 |
| 矛盾检出率 | 0% | >70% | Phase 3 |
| 素材利用率 | <30% | >60% | Phase 3 |

---

*Relates: 01-product/Product-Spec-v6.2-AI-Assets-Processing.md, 01-product/Product-Spec-v5.0-ExpertLibrary.md*
*参考: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers/*
