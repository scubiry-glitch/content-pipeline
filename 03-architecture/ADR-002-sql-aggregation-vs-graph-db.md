# 架构设计记录: SQL 聚合 vs 图数据库（"SQL 聚合派" vs "图论派"）

**日期**: 2026-04-11
**状态**: 已批准（追认 v7.0 Content Library 上线时的隐性决策）
**作者**: 架构师

---

## 1. 背景

Content Library（内容资产库）v7.0 已于 2026 年 Q1 上线，实现了事实三元组、实体、信念、实体关系图谱等核心能力。但在实现过程中，团队内部对底层存储选型存在两条明显不同的技术路线，本文将其命名为：

- **SQL 聚合派**：坚持用 PostgreSQL 现有能力（pgvector + tsvector + JOIN/GROUP BY）表达所有语义检索与"关系"需求，实体关系通过事实共现统计派生。
- **图论派**：原始设计稿中提出的 Zep + Neo4j 混合架构，把实体与关系作为一等公民存储在原生图数据库中，用 Cypher 做 2-hop 子图查询。

两条路线在仓库中都留下了痕迹，但**从未被显式对比记录**：

- 图论派的主张出现在早期设计稿 `01-product/content-pipeline-design/content-pipeline-design.md` 第 836–905 行，技术选型表明确写着"我们的方案：Zep + Neo4j 混合架构"。
- 实际落地的却是 SQL 聚合派：`api/src/modules/content-library/migrations/001-content-library.sql` + `api/src/modules/content-library/ContentLibraryEngine.ts` 完全基于 PostgreSQL，没有任何 Neo4j / Cypher / 图数据库驱动。
- 唯一的决策痕迹是 `Agents.md:197` 一行：`❌ 知识图谱(Neo4j)` 被列为 MVP 范围外。

本 ADR 的目的是**追认并文档化**这次选型，把当时的隐性权衡显式化，为未来（v8.x 或更后）重新评估留下清晰的触发条件。

---

## 2. 两派方案对比

### 2.1 总览

| 维度 | SQL 聚合派（已落地） | 图论派（原始愿景） |
|---|---|---|
| 存储 | PostgreSQL `content_facts` 三元组表 + pgvector + tsvector | Neo4j 原生节点/边 + Zep 向量层 |
| 实体关系怎么算出来 | `JOIN content_entities ON cf.subject=ce.canonical_name OR cf.object=ce.canonical_name` + `GROUP BY ... ORDER BY COUNT(cf.id) DESC` | Cypher 2-hop 子图查询：`(:Entity)-[:PUBLISHED]->(:Entity)-[:SUBSTITUTES]->(...)` |
| "关系"的本质 | 事实共现——两个实体在同一条 `content_facts` 行里同时出现即视为有边，强度 = 共现次数 | 显式定义的有向带属性边（`:PUBLISHED {date, document}`、`:SUBSTITUTES {degree, evidence}`） |
| 时序 / 版本 | `is_current` + `superseded_by` 列 | `(:Metric)-[:BELONGS_TO]->` 节点 + 时间戳属性 |
| 检索 | tsvector + pgvector 混排，关系靠 SQL 派生 | Zep 语义召回 Top 20 → Neo4j 子图验证 → 路径出引用 |
| 运维面 | 1 套（PG） | 3 套（PG + Neo4j + Zep） |

### 2.2 SQL 聚合派 — 优缺点

**优点**

1. **零新增基础设施**：已经在用 PostgreSQL，pgvector 扩展解决向量检索，tsvector + zhparser 解决中文 BM25，运维面仅一台库。
2. **事务一致性免费**：facts / entities / beliefs 三张表共享同一事务，写入语义与现有 API 服务完全一致，不需要双写补偿。
3. **MVP 落地快**：`ContentLibraryEngine.getEntityGraph` 一个 SQL 就出结果，不用学 Cypher，不用部署 Neo4j 集群、不用搞 Zep 这条额外的服务链。
4. **可解释**：所有"关系"都能追溯到一行具体的 `content_fact`，不存在黑盒推理。
5. **回填友好**：任意时刻都能从 `content_facts` 重算实体图谱，schema 改动影响面小。

**缺点**

1. **关系是"统计共现"而不是"语义关系"**：`getEntityGraph` 实际返回的是"和我同时出现次数最多的 20 个实体"，没有方向、没有边类型语义。虽然 SQL 里塞了 `cf.predicate as relation`，但 `GROUP BY ... cf.predicate` 会把同一对实体的不同关系拆成多行，强度也被切碎。
2. **多跳查询性能差**：2-hop / 3-hop 在 SQL 里就是自连接 + 自连接，行数爆炸；Neo4j 的原生指针遍历对此正是优势场景。
3. **关系语义贫乏**：`SUBSTITUTES {degree:"partial", evidence:[...]}` 这种带属性的边在 SQL 里只能拆成额外的 join 表，写起来啰嗦，读起来更啰嗦。
4. **实体消歧脆弱**：目前靠 `canonical_name` 字符串相等来 join（`cf.subject = ce.canonical_name`），别名 / 同义词只能塞 `aliases` 数组兜底，没有图上的"指向同一节点"的天然机制。
5. **路径解释能力弱**：图论派承诺的"关系路径验证 → 生成答案 + 引用来源"（设计稿第 853 行）这种"为什么 A 和 B 有关"的链路解释，SQL 聚合给不出来。

### 2.3 图论派 — 优缺点

**优点**

1. **关系是一等公民**：`(:住建部)-[:PUBLISHED {date, document}]->(:保租房REITs)` 的方向、类型、属性都显式存在，下游 Agent 可以直接 pattern match。
2. **多跳查询天然便宜**：Cypher 的 `*1..2`、`shortestPath` 在原生图存储上是指针跳转，不会像 SQL 那样指数爆炸。
3. **支持"关系路径解释"**：能告诉用户"A 影响 B 是因为 A→C→B 这条路径"，对蓝军评审和论据支撑特别有价值。
4. **实体消歧更自然**：别名都指向同一个节点 ID，不会出现"两个 canonical_name 字符串差一个空格就 join 不上"的事故。
5. **和向量层正交可组合**：Zep 负责"找到候选实体"，Neo4j 负责"验证它们的关系结构成立"，是公认对 RAG 幻觉最有效的护栏之一。

**缺点**

1. **运维三倍**：Neo4j 集群（JVM、备份、license）+ Zep 服务，加上原本就要的 PostgreSQL，三套存储意味着三套监控、三套备份、三套故障域。
2. **学习成本高**（设计稿第 840 行原文承认）：团队没人写过 Cypher，BlueTeam Agent 的 SQL prompt 重写成 Cypher prompt 不是平移工作。
3. **跨存储一致性是新问题**：facts 写一份到 PG、再同步到 Neo4j，需要 outbox / CDC，否则两边漂移。
4. **对 MVP 是过度投资**：`Agents.md:197` 把它划出 MVP 是对的——MVP 的瓶颈是"能不能自动产出一篇研报"，不是"能不能多跳推理"。
5. **扩展性一般**（设计稿第 840 行原文）：Neo4j 的水平扩展比 PostgreSQL 弱，等真到了"242 份研报 + 增量 / 月"的体量，分片是个独立大坑。

---

## 3. 决策

**v7.x 及之前的 Content Library 全面采用 SQL 聚合方案**，图论派方案延后到满足 §4 触发条件时再评估。

理由简述：MVP 阶段的真实瓶颈是"端到端生产一篇研报"，而不是"关系图上最优雅"。引入 Neo4j + Zep 会把存储运维面从 1 套变成 3 套，把团队的 prompt 资产从 SQL 重写成 Cypher，对 MVP 的 ROI 明显为负。SQL 聚合派的缺点在当前数据量（< 百万行 facts）下并不致命。

---

## 4. 未来重新评估的触发条件

满足下列任一条，即应重新评估是否引入图数据库：

1. **产品需求升级**：出现"为什么 A 和 B 有关，给我完整路径"这类需求，且尝试用 SQL 递归 CTE / 物化视图仍无法在可接受延迟内满足。
2. **规模上限**：`content_facts` 行数突破千万，或 `getEntityGraph` 的 2-hop 自连接 P95 > 2s。
3. **实体消歧事故频发**：别名表（`content_entities.aliases`）超过 10k 条，或出现"同名异义"导致的线上错配事故。

触发后应：先用 Apache AGE（PostgreSQL 上的图扩展）做低成本验证，再决定是否真正引入独立 Neo4j。

---

## 5. 后果

### 5.1 正面

- 运维面维持 1 套存储，监控 / 备份 / 容灾继续复用现有 PG 基建。
- BlueTeam、选题、写作等 Agent 的数据访问层全部是 SQL，prompt 工程资产继续复用。
- Content Library v7.0 实装周期大幅压缩（实际 15/15 产出物按期上线）。

### 5.2 负面

- **命名误导风险**：`ContentLibraryEngine.getEntityGraph` 返回字段叫 `relations`、产品文案叫"实体关系图谱"，但实际返回的是"共现热度榜"——**有误导用户的风险**。本 ADR 要求立刻处理（见 §6）。
- 未来若出现"多跳关系推理"需求，会有一次较大的存储迁移成本。
- 知识图谱相关的论文级能力（例如规则推理、本体推断）在现有方案下基本无法实现。

---

## 6. 随 ADR 一并执行的整改

1. **API 命名修正**：`ContentLibraryEngine.getEntityGraph`（`api/src/modules/content-library/ContentLibraryEngine.ts:300-341`）的返回字段 `relations` 在 API 文档与前端消费方（`packages/content-library-ui/src/pages/EntityGraph.tsx`）中至少补一段说明："本接口返回的是事实共现统计，不是真正的知识图谱关系。"
2. **产品文案同步**：Content Library 相关的前端页面标题若仍使用"实体关系图谱"，应在 tooltip 中显式说明其共现统计本质。
3. **本 ADR 的存在必须在 `01-product/content-pipeline-design/content-pipeline-design.md` 第 836–905 行旁边加一个指向 `ADR-002` 的链接**（或 "Superseded by ADR-002" 的 admonition），避免新成员再被老设计稿误导。

整改不阻塞本 ADR 的通过，但应在 v7.1 迭代中完成。

---

## 7. 关键文件引用

- 图论派来源：`01-product/content-pipeline-design/content-pipeline-design.md:688-905`（特别是第 836–845 行技术选型表与第 856–896 行 Cypher 数据模型）
- MVP 决策记录：`Agents.md:197`
- SQL 聚合派实现：
  - `api/src/modules/content-library/ContentLibraryEngine.ts:300-341`（`getEntityGraph`）
  - `api/src/modules/content-library/migrations/001-content-library.sql`
- 上线报告：`01-product/Content-Library-v7.0-Implementation-Report.md:57-73`
- 前一版 ADR 模板参考：`03-architecture/ADR-001-v3.4-system-design.md`
