Context
内容生产流水线有 9 个独立 skills 和一套 API 服务层，但缺少一个将它们串联起来的编排层。现有 skills 各自独立运行，没有文档说明它们之间的数据交接规范和调用顺序。专家评审环节更是只存在于 API 代码中，没有 SKILL.md。
目标：创建 skills/pipeline-orchestrator/ 编排技能，定义完整的 5 阶段流水线调用链和数据接口规范。

方案：新建 pipeline-orchestrator Skill
文件结构
skills/pipeline-orchestrator/
├── SKILL.md                          # 主编排技能（流程 + 决策逻辑）
└── references/
    ├── stage-interfaces.md           # 各阶段数据交接的详细 TypeScript 接口
    ├── skill-map.md                  # 阶段 × Skill 映射速查表
    └── review-fallback-prompts.md    # Mode B 自评审的 prompt 模板
两种运行模式
模式说明适用场景Mode A: API-Backed通过 REST 端点调用现有 PipelineService，数据持久化到 PostgreSQLWeb 应用 / DashboardMode B: Skill-ChainClaude Code 直接按序调用各 SKILL.md，无需 API 服务器CLI 独立生产 / 轻量场景

5 阶段流水线编排
Stage 0: 大纲规划 (Planning)

Skill: consulting-analysis Phase 1
产出: 分析框架文档（章节骨架 + 数据需求 + 搜索关键词 + 可视化规划）
人类检查点: 大纲确认后方可进入下一阶段
API 对应: PipelineService.createTask() → POST /api/v1/production/:taskId/outline/confirm
关键文件: skills/consulting-analysis/SKILL.md (Phase 1 部分)

Stage 1: 深度调研 (Research)

Skills（按需组合）:

deep-research — 必选，执行 Phase 1 产出的搜索关键词
github-deep-research — 当主题涉及开源/GitHub 项目时
data-analysis — 当用户提供 Excel/CSV 数据文件时


产出: 数据包（ResearchData: insights + dataPackage + analysis）
API 对应: PipelineService.research()
关键文件: skills/deep-research/SKILL.md, skills/data-analysis/SKILL.md

Stage 2: 撰写 (Writing) — 两步走

Step A: 调用 chart-visualization 预生成所有图表（基于 Phase 1 的可视化规划 + Stage 1 的数据）
Step B: 调用 consulting-analysis Phase 2（输入：分析框架 + 数据摘要 + 图表文件路径 → 输出：完整报告）
API 对应: PipelineService.write()
关键文件: skills/chart-visualization/SKILL.md, skills/consulting-analysis/SKILL.md (Phase 2 部分)

Stage 3: 专家评审 (Review)

Mode A (API-Backed): 调用串行评审端点

POST /api/v1/production/:taskId/sequential-review/configure
POST /api/v1/production/:taskId/sequential-review/start
5 轮评审：挑战者(AI) → 专家A(CDT) → 拓展者(AI) → 专家B(CDT) → 提炼者(AI)


Mode B (Skill-Chain 自评审 fallback): 在 references/review-fallback-prompts.md 中提供 3 角色 prompt 模板

Challenger: 找逻辑漏洞、数据可靠性问题
Expander: 补充关联因素、国际对比
Synthesizer: 结构优化、金句提炼、消除冗余
每轮评审后修订，最多 2 轮，质量门槛：无 high-severity 问题


关键文件: api/src/services/sequentialReview.ts, api/src/services/blueTeam.ts

Stage 4: 多格式输出 (Output) — 扇出并行
根据 target_formats 并行调用（各 skill 独立，无依赖）：
目标格式Skill说明Markdown直出终稿即 MarkdownPPTXppt-generation报告内容 → 幻灯片结构 → AI 逐页图像 → 组装播客 MP3podcast-generation终稿 → 双主持人对话脚本 → TTS 合成视频 MP4video-generation关键发现 → 视频脚本 → AI 生成

各阶段数据交接规范
写入 references/stage-interfaces.md，核心接口：
交接点数据结构存储位置Stage 0 → 1OutlineToResearchHandoff（outline + dataRequirements + searchKeywords）tasks.outline JSONBStage 1 → 2ResearchToWritingHandoff（insights + dataPackage + chartData）tasks.research_data JSONBStage 2 → 3WritingToReviewHandoff（draftContent + draftId + chartFilePaths）draft_versions 表Stage 3 → 4ReviewToOutputHandoff（finalDraft + reviewReport + targetFormats）tasks.final_draft
接口类型定义参考 api/src/langgraph/state.ts 中已有的 OutlineData, ResearchData, BlueTeamRoundData 等。

SKILL.md 内容大纲

Overview — 流水线总览、两种运行模式
Pipeline Architecture — 5 阶段流程图（Mermaid），对应 LangGraph 7 节点图
Stage 0: Planning — consulting-analysis P1 调用方式、大纲确认检查点
Stage 1: Research — Skill 选择逻辑（何时用 deep-research / github-deep-research / data-analysis）
Stage 2: Writing — 先图表后报告的两步法
Stage 3: Review — Mode A (API) vs Mode B (自评审 fallback)
Stage 4: Output — 多格式扇出、各 skill 调用参数
Data Handoff — 指向 references/stage-interfaces.md
End-to-End Example — 完整示例：从"AI 投资趋势分析"主题走完全流程
Quality Gates — 每阶段质量门槛（大纲评分、研究数据非空、稿件最低长度、评审通过）
Error Handling — 各阶段失败恢复策略


实施步骤

创建 skills/pipeline-orchestrator/SKILL.md — 主编排技能
创建 references/stage-interfaces.md — 数据交接 TypeScript 接口（从 langgraph/state.ts 提取并扩展）
创建 references/skill-map.md — 阶段 × Skill 速查表
创建 references/review-fallback-prompts.md — Mode B 自评审 3 角色 prompt 模板（从 sequentialReview.ts 的角色定义提取）

关键参考文件
文件用途api/src/langgraph/state.ts权威数据接口类型定义api/src/langgraph/graph.ts权威流水线图定义（7 节点）api/src/services/pipeline.tsPipelineService 5 阶段编排逻辑api/src/services/sequentialReview.ts串行评审系统（角色定义、评审流程）api/src/services/blueTeam.ts蓝军对抗评审skills/consulting-analysis/SKILL.md跨两阶段的核心 skill（P1=大纲, P2=报告）skills/deep-research/SKILL.md调研方法论skills/chart-visualization/SKILL.md图表生成
验证方式

结构验证: 确认 SKILL.md frontmatter 格式正确，description 能被 Claude 自动触发
引用验证: 确认所有 references/ 文件中的接口定义与 langgraph/state.ts 一致
端到端测试: 用一个测试主题（如"AI 投资趋势分析"），在 Mode B 下走完 Stage 0→4，验证各阶段数据能正确流转