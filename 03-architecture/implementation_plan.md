# 统一界面架构与标准化组件复用实施方案 (v6.0)

本计划旨在响应您的最新需求，全面统一 Content Production Pipeline 的页面架构、数据处理可视化模型，并最大化复用已确定的高品质组件设计。

## User Review Required

> [!IMPORTANT]
> **请审阅以下重构方案**
> 我们即将进行非常大规模的框架调整，包括顶部/侧边导航的对其、所有 Tab 页面向“输入-处理-输出”三段式范式的转换。如果以下组件复用策略或数据流向存在偏差，请在执行前指出。

## 1. 全局页面框架重塑 (Framework Organization)

### 1.1 双轨导航体系 (Dual-track Navigation)

> 🔗 **全站框架样式（含顶部导航、侧边栏、背景主题色）将 1:1 复用源设计稿**: 
> [pipeline_pro/code.html](file:///Users/scubiry/Documents/Scubiry/lab/pipeline/05-operations/stitch_content_pipeline_design_proposal_prd/pipeline_pro/code.html)

- **Top Navigation (顶部导航)**: 对齐全部页面的顶部导航结构。
  - 左侧：App/Product 标识。
  - 右侧：**将所有设置强相关元素（搜索框、通知、设置齿轮、用户头像）参照 `Deep Research Stage` 设计统一放置在右上角。**
- **Side Navigation (侧边辅助导航)**:
  - 严格映射 /01-product/stage/ 的全链路阶段（Topic Planning -> Deep Research -> Copy Generation -> Expert Review）。
  - 侧边栏视觉吸取新版深色/高对比度悬浮项设计，强化当前所处主阶段的感知感。

### 1.2 右侧内容区统一版式 (Input-Process-Output Paradigm)
取消过去随意的区块摆放，所有流水线页面的右侧核心工作区严格按垂直串联的三个逻辑阶段排布，并在垂直进度线上穿引：
1. **Input (输入源加载与配置)**
2. **Process (AI核心处理与加工流)**
3. **Output (阶段性产物与决策)**

---

## 2. 流水线阶段数据映射与落地图 (Stage Data Alignment)

依据 `/01-product/stage/` 规范及 HTML 设计稿，将各个阶段 PRD 定义的具体步骤精准映射到右侧内容区的三个核心板块中，并明确标注**可复用的高品质组件**：

### Stage 1: Topic Planning (选题策划)
> 🔗 **本阶段专属宿主视图将 1:1 复用源设计稿**:
> [topic_planning_stage_1_refined_pipeline_layout/code.html](file:///Users/scubiry/Documents/Scubiry/lab/pipeline/05-operations/stitch_content_pipeline_design_proposal_prd/topic_planning_stage_1_refined_pipeline_layout/code.html)

- **[Input]** 
  - 🧩 **[样式复用: 输入信息顶卡 Config Card]** (参考 `Copy Generation` 的顶部参数卡片)
  - **步骤 1: 多源情报接入** (RSS 聚合、Web Search 主动发现、社区抓取热搜)。
- **[Process]** 
  - 🧩 **[样式复用: 行内批注与反馈区 Annotation Area]** (参考 `Expert Review`，用于展示新旧观点验证比对)
  - **步骤 1 (续): 数据清洗与归并** (实体链接+去重)。
  - **步骤 2: 质量与热度交叉验证** (来源权威性、内容完整度、跨平台热度验证)。
  - **步骤 3: 竞品分析与空白发现** (覆盖度分析、角度推荐)。
  - **步骤 4: 多因子加权评分与排序** (生成 Top N 推荐)。
- **[Output]** 
  - 🧩 **[样式复用: 内容直播预览舱 Live Preview Markdown]** (参考 `Copy Generation` 的带版本控制侧边栏的正文预览区)
  - 🧩 **[样式复用: 全局操作底栏与通行按钮 Global Action Buttons]** (参考 `Copy Generation` 的底部 Primary/Secondary 组合控制条)
  - **步骤 5: 串流大纲生成** (基于采纳话题流式生成 Macro/Meso/Micro 三层大纲并保存推荐结果)。

### Stage 2: Deep Research (深度研究)
> 🔗 **本阶段专属宿主视图将 1:1 复用源设计稿**:
> [deep_research_stage_data_synthesis/code.html](file:///Users/scubiry/Documents/Scubiry/lab/pipeline/05-operations/stitch_content_pipeline_design_proposal_prd/deep_research_stage_data_synthesis/code.html)

- **[Input]** 
  - 🧩 **[样式复用: 输入信息顶卡 Config Card]**
  - **步骤 1: 数据采集** (Tavily Web搜索、RSS匹配、自有素材库向量检索)。
- **[Process]** 
  - 🧩 **[样式复用: 垂直处理看板 Vertical Progress Board]** (参考 `Deep Research` 的分步处理流)
  - **步骤 2: 数据清洗** (去重 SimHash、格式化、异常检测、标准化)。
  - **步骤 3: 多维度数据分析** (描述统计、时间序列趋势、同比/环比对比、相关性分析)。
  - **步骤 4: 洞察提炼** (基于统计与AI生成：发现型/风险型/机会型/验证型洞察)。
- **[Output]** 
  - 🧩 **[样式复用: 研究报告卡片矩阵 Grid Glass Cards]** (参考 `Deep Research` 呈现提炼后的精美洞察)
  - 🧩 **[样式复用: 全局操作底栏与通行按钮 Global Action Buttons]**
  - **步骤 5: 结果保存与综合呈报** (生成含指标与支持数据池的深度研究报告卡片)。

### Stage 3: Copy Generation (初稿撰写)
> 🔗 **本阶段专属宿主视图将 1:1 复用源设计稿**:
> [copy_generation_stepped_pipeline/code.html](file:///Users/scubiry/Documents/Scubiry/lab/pipeline/05-operations/stitch_content_pipeline_design_proposal_prd/copy_generation_stepped_pipeline/code.html)

- **[Input]** 
  - 🧩 **[样式复用: 输入信息顶卡 Config Card]** (参考 `Copy Generation` 原生设计)
  - **前置设定**: 撰写参数设置 (Audience Persona / Tone & Style) 及 大纲/研究洞库数据带入。
- **[Process]** 
  - 🧩 **[样式复用: AI 流式生成状态栏 Streaming Status Log]** (参考 `Copy Generation` 的逐行闪烁生成流)
  - **步骤 1: 流式初稿分段生成** (带前文上下文的 AI 串行段落生成与状态日志展示)。
  - **步骤 2: 内容润色** (语言流畅度、风格统一、可读性及长难句改写)。
  - **步骤 3: 基础事实核查** (数据点提取与快速核查)。
  - **步骤 4: 格式调整标准化** (排版、图表占位、引用来源插入)。
- **[Output]** 
  - 🧩 **[样式复用: 内容直播预览舱 Live Preview Markdown]**
  - 🧩 **[样式复用: 版本时间轴与比对舱 Version Timeline & Diff Viewer]** (带历史版本时光机)
  - 🧩 **[样式复用: 全局操作底栏与通行按钮 Global Action Buttons]**
  - **步骤 5: 版本保存与预览** (生成最终草稿 v1，Markdown 实时预览区，支持 Auto-Save 时间轴)。

### Stage 4: Expert Review (专家蓝军评审)
> 🔗 **本阶段反馈明细视图主要复用源设计稿**:
> [expert_review_stage_4_detailed_feedback_view/code.html](file:///Users/scubiry/Documents/Scubiry/lab/pipeline/05-operations/stitch_content_pipeline_design_proposal_prd/expert_review_stage_4_detailed_feedback_view/code.html)
> 🔗 **本阶段评审流程进度视图复用源设计稿**:
> [expert_review_stage_4_vertical_journey/code.html](file:///Users/scubiry/Documents/Scubiry/lab/pipeline/05-operations/stitch_content_pipeline_design_proposal_prd/expert_review_stage_4_vertical_journey/code.html)

- **[Input]** 
  - 🧩 **[样式复用: 内容直播预览舱 Live Preview Markdown]** (文本挂载视图)
  - **前置载入**: 富文本交互式待审初稿及全局质检指标 (Readability / Fact-Check 概览)。
- **[Process]** 
  - 🧩 **[样式复用: 行内批注与反馈区 Annotation Area]** (参考 `Expert Review`，区分 severity 提供高亮红/橙/蓝交互条)
  - **步骤 1: 全文事实深度核查** (自动化多源交叉验证数据准度)。
  - **步骤 2: 逻辑链条检查** (AI辅助的论证完整性、前提漏洞与矛盾检测)。
  - **步骤 3: 串行多轮专家评审** (展示流水线进度：Challenger(批判) -> Expander(拓展) -> 真人专家/SME -> Synthesizer(提炼) -> Editor)。
  - **步骤 4: 读者模拟测试** (可选的可读性、受众匹配与完读率预测)。
- **[Output]** 
  - 🧩 **[样式复用: 全局决策底栏 Header Action Bar]** (参考最终采纳与修正的浮层)
  - 🧩 **[样式复用: 版本时间轴与比对舱 Version Timeline & Diff Viewer]** (追踪多轮 Review 后生成的修订稿版本)
  - **步骤 5: 结果汇总与最终决策控制台** (生成含高优警告 Final Review Report，提供 Accept / Override / Reject 出口)。

---

## 3. 组件级设计复用库 (Component Reuse Strategy)

为实现最大化样式复用，我们将抽离以下三个核心高频组件，以支撑全站页面的统一外观：

### 3.1 「统一输入信息顶卡 (Input Config Card)」
- **来源参考**: `Copy Generation - Stepped Pipeline` 中的 "Drafting Configuration" 顶部卡片。
- **复用场景**: 将被用作所有页面的 Input 模块基座，包括：Stage 1 的信源配置、Stage 2 的研究源选择、Stage 3 的内容风格配置。

### 3.2 「内容直播预览舱 (Live Preview Markdown View)」
- **来源参考**: `Copy Generation - Stepped Pipeline` 的 Markdown 预览容器及版本侧边栏。
- **复用场景**: 用于 Stage 1 的大纲生成预览呈现、Stage 3 的草稿书写直播区。统一样式包含头部控制栏（格式化、汇出）及底色。

### 3.3 「行内批注与反馈锚定区 (Inline Annotation Area)」
- **来源参考**: `Expert Review (Stage 4) - Detailed Feedback View` 右侧的标注互动列表（基于红/蓝/橙的警告条）。
- **复用场景**: Stage 4 的蓝军反馈呈现、Stage 1 的新旧观点碰撞比对。

### 3.4 「全局操作底栏与通行按钮 (Global Action Bar & Buttons)」
- **来源参考**: `Copy Generation - Stepped Pipeline` 的底部按钮样式 (Primary/Secondary Button 组合)。
- **复用场景**: 用于控制各个阶段的主次流转操作，例如 Stage 1 的 "Generate Outline"、Stage 2 的 "Start Research" 等全局提交和切换动作。

### 3.5 「版本时间轴与比对舱 (Version Timeline & Diff Viewer)」
- **来源参考**: `Copy Generation - Stepped Pipeline` 右边的历史版本侧边栏（Version History）。
- **复用场景**: 贯穿具有“迭代与修订”性质的 Stage 3 书写阶段与 Stage 4 评审阶段。通过一致的侧边列表与 Diff 对比 UI，统一展示内容演进路线。

## 4. 后端组件整合策略 (Backend Integration for Multi-Source Intelligence)

由于 Stage 1 (Topic Planning) 和 Stage 2 (Deep Research) 均高度依赖多源情报接入（Web Search, RSS, Local Assets），我们采用以下协同策略：

### 4.1 统一抓取底层引擎 (Unified Collector Service)
- **后端抽象**: 建立单一内核的 `CollectorService` (如 API 层定义的 `POST /api/v1/research/:taskId/collect`)，将 Tavily/Serper 搜索、自有 Vector DB 检索、RSS 订阅拉取统一为标准化 Pipeline。
- **阶段适配**: Stage 1 与 Stage 2 调用相同的抓取内核，只是传入参数的区别。Stage 1 偏向宽泛的发散推荐（探索空白与热度），Stage 2 则基于大纲约束（topicId, outline）进行定向深挖与内容抽提。

### 4.2 载荷与 UI 全面对齐
- 前端通过复用的 🧩 **[输入信息顶卡 Config Card]** 生成结构一致的载荷集合（如包含 `sources: ['web', 'rss']`, `keywords: []`）。不再为不同 Stage 重复开发两套抓取配置 UI 表单与 API Parser。

### 4.3 长链接异步推送 (SSE 透传流)
- 多源收集与清洗常有长耗时。后端提供流式响应（Server-Sent Events），将每个来源的抓取、清洗步骤状态（如“已接入 15 篇路透社长文...”）实时推给前端。
- 这一机制直接挂载到前端 🧩 **[垂直处理看板 Vertical Progress Board]** 与状态机 UI 组件上，保证等待感知度最佳化。

### 4.4 统一直播生成引擎 (Unified LLM Streaming Engine)
- **后端抽象**: 针对 Stage 1 (大纲生成)、Stage 3 (分段初稿生成)、Stage 4 (蓝军评审意见生成)，统一抽离出 `StreamingService` 基类引擎。所有 AI 长文本任务通过该引擎统筹 Token 输出与流控。
- **阶段适配**: 后端不再为每个阶段单独写一套流控 WebSocket/SSE 路由，而是将 `taskId`、`stage` 和 `promptContext` 打包传入引擎。
- **前端对齐**: 前端的 🧩 **[内容直播预览舱 Live Preview Markdown]** 组件只需监听同一个标准的 `/api/v1/stream` 订阅频道，即可平滑适配大纲打印、段落书写或专家反馈，极大降低系统复杂度与冗余耦合。

### 4.5 统一版本控制与追溯服务 (Unified Version Control Service)
- **后端抽象**: 为 Stage 1 的多版本大纲、Stage 3 的多次改稿、Stage 4 被蓝军打回后修改的终稿，建立全局统一的 `VersionControlService`。通过 `Draft_vN` 及父子溯源节点结构，确保产出物管理不受限于某个具体子 Stage。
- **前端对齐**: 前端只需调用标准化 `/api/v1/versions/:entity_id` 接口拉取时间轴，再经由 🧩 **[版本时间轴与比对舱]** 组件统一将历史记录可视化，不再为不同实体的保存和比对编写定制化业务代码。

## Verification Plan

### 执行路径
1. 先重构 `Layout.tsx`，将顶部和侧边导航完全替换为统一的最新设计模板。
2. 对 `TaskDetailLayout.tsx` 及对应的 `*.css` 进行改造，封出 `Input / Process / Output` 的基类布局样式。
3. 抽离并发布 `ConfigCard` 等复用组件。
4. 依次更新 Planning, Research, Writing, Reviews 页面的具体内容排版。

### 测试方法
- 前端页面肉眼人工审查，重点核对 Tab 切换时框架的平稳过渡、CSS Variables 渲染是否正确。
- 确认右上角的设置组图标行为正常。
