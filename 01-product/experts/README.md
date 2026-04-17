# 专家库下游应用质量优化 — 阶段性报告索引

本目录记录"专家库下游应用质量优化计划 (Sprint 1-3)"的 10 个 Step 阶段性报告。每个报告说明：背景、变更点（文件+行号）、接口变化、测试验证、下游收益、已知限制。

## 背景

当前专家库已完成 21 个 nuwa 增强专家（含 `mentalModels`/`heuristics`/`expressionDNA`/`contradictions`/`agenticProtocol`/`rubrics` 等字段），但下游 engine（`ExpertEngine.invoke`、`DebateEngine`、`OutlineReviewer`、`ExpertMatcher`、`feedbackLoop`）几乎没有利用这些结构化数据——它们只在 `promptBuilder` 里作为字符串塞给 LLM。

本系列优化把这些"字符串提示"升级为"可查询、可对比、可聚合的一等公民"，让所有下游应用都受益。

## 阶段列表

| # | Phase | 标题 | 优先级 | 状态 |
|---|---|---|---|---|
| 0 | [phase-00-setup](./phase-00-setup.md) | 拉取 main + 准备目录 | — | ✅ |
| 1 | [phase-01-rubric-scoring](./phase-01-rubric-scoring.md) | Rubrics 驱动的结构化评分输出 | ★★★★★ | ✅ |
| 2 | [phase-02-debate-contradictions](./phase-02-debate-contradictions.md) | DebateEngine 用 contradictions 生成交叉质询 | ★★★★★ | ✅ |
| 3 | [phase-03-heuristics-trigger](./phase-03-heuristics-trigger.md) | Heuristics trigger 匹配，激活最相关规则 | ★★★★ | ✅ |
| 4 | [phase-04-matcher-cognitive](./phase-04-matcher-cognitive.md) | ExpertMatcher 认知互补匹配 | ★★★★ | ✅ |
| 5 | [phase-05-mentalmodels-skeleton](./phase-05-mentalmodels-skeleton.md) | mentalModels 作为分析框架显式骨架 | ★★★★ | ✅ |
| 6 | [phase-06-feedback-dimension](./phase-06-feedback-dimension.md) | feedbackLoop 按 rubric 维度校准 | ★★★ | ✅ |
| 7 | [phase-07-expression-linter](./phase-07-expression-linter.md) | ExpressionDNA linter 后置校验 | ★★★ | ✅ |
| 8 | [phase-08-model-graph](./phase-08-model-graph.md) | 跨专家 MentalModel 索引图 | ★★★ | ✅ |
| 9 | [phase-09-agentic-tool](./phase-09-agentic-tool.md) | agenticProtocol 真实工具调用 | ★★★ | ✅ |
| 10 | [phase-10-model-catalog](./phase-10-model-catalog.md) | Mental Model Library 可查询目录 | ★★ | ✅ |

## 执行约定

- 每完成一个 Phase，立即 commit + push
- Commit 消息格式：`feat(experts): Phase N - {简短描述}`
- 每个 Phase 产出一份对应的 Markdown 报告
- 所有改动必须通过 `cd api && npx tsc --noEmit` 类型检查
