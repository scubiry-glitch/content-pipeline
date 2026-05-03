# 质量 v2 · 计划主文档

## 背景

会议纪要流水线（`api/src/modules/meeting-notes/`）的 22 个 sub-dim 物理表多数已有数据，但前端仍大面积显示"数据待生成"或硬编码 mock。来源诊断：

- 4 个 sub-dim 物理数据已生成但**后端缺 GET 路由**（consensus_track / concept_drift / topic_lineage / external_experts）
- 1 个**后端路由查错表**（model_hitrate）
- 2 个**前端组件没接 API**（本场新认知摘要 / 证据分布）
- 3 个**完全 mock 数据**仍在前端硬编码（高危假设 / 证据分布数字 / 反常沉默）
- 2 个 longitudinal sub-dim **数据未自动生成**（决策树 / 信念轨迹）
- 1 类**静态产品文案**（"机制价值" / "批判：沉默..."）硬编码在组件里

并发现并修复 1 处工程 bug：scope-level run 完成后不写 `mn_axis_versions` 快照（已 patch + 验证）。

## 目标

让前端"数据待生成"状态在跑过相应 axis run 后**自动消失**；mock 数据替换成真实 API；产品文案与代码解耦。整个工作按阶段走，每阶段独立 design doc + 独立 commit，便于回滚 / code review。

## 阶段列表

| 阶段 | 主题 | 改动范围 | 设计文档 | 质量提升效果 |
|---|---|---|---|---|
| **Phase 0** | scope-level snapshot bug fix（已应用 + 验证） | `runEngine.ts` 多会议 finalize 加 versionStore.snapshot | `phase-0-snapshot-fix.md` | scope 级 run 完成后 `mn_axis_versions` 自动 +N 行（之前只 projects 有快照，people / knowledge 永远空）。前端"版本对比 / 历史回看"功能从 100% 失效 → 100% 可用 |
| **Phase 1** | 4 条 sub-dim GET 路由 | `router.ts` 加 GET /scopes/:id/{consensus-tracks,concept-drifts,topic-lineage,external-experts} | `phase-1-subdim-routes.md` | 4 个 sub-dim 物理表的数据从"已生成但前端取不到" → "前端可读"。覆盖率：4 / 22 = 18% sub-dim 可见性恢复 |
| **Phase 2** | 4 个 PendingSubdimTab → 真实 API | `AxisKnowledge.tsx` + api client | `phase-2-frontend-pending-tabs.md` | 知识 axis tab 4 个一直显示"数据待生成"的 → 真实数据。配合 Phase 1 完成知识 axis 子维度可见性闭环 |
| **Phase 3** | model_hitrate 后端查表修复 | `longitudinal/mentalModelHitRate.ts` 改读 `mn_model_hitrates` | `phase-3-model-hitrate-fix.md` | "6 个月命中率校准"从读错表（per-meeting 视图当 6m 滚窗）→ 读正确的 scope 级 6m 滚窗表。修一个数据正确性 bug |
| **Phase 4** | 本场新认知摘要 + 证据分布前端接入 | AxisKnowledge.tsx Cognition tab + Evidence 段调 API | `phase-4-cognition-evidence.md` | 2 个组件从"前端没接 API + 假数据" → 真实读取。证据等级（A/B/C/D）数字反映真相，Cognition 摘要按 generality_score 排序 |
| **Phase 5** | 高危假设 mock 替换 | AxisProjects.tsx ASSUMPTIONS 数组 → `/scopes/:id/assumptions` | `phase-5-mock-assumptions.md` | 移除 hardcoded "AS-04 / AS-02 / LP 反弹 / 配额"等 mock 文案，改读真实 mn_assumptions verification_state；首页"高危假设"组件从 demo 阶段 → 生产可用 |
| **Phase 6** | 证据分布 mock 替换 | AxisKnowledge.tsx EVIDENCE_GRADES 数组 → real | `phase-6-mock-evidence.md` | 移除硬编码 A 7 / B 11 / C 9 / D 4 假数字，按 scope 真实聚合显示 |
| **Phase 7** | 反常沉默 mock 替换 | MeetingToday.tsx + _fixtures.ts → `/meetings/:id/silence` | `phase-7-mock-silence.md` | 移除 hardcoded "陈汀 / Wei Tan / 林雾"假参与者；首页 today 页从演示数据 → 当日真实异常发言信号 |
| **Phase 8** | longitudinal 自动联动 | `runEngine.ts` multi-meeting finalize 内追加 `computeLongitudinal({kind:'all'})` | `phase-8-longitudinal-auto.md` | scope 级 run 完成后自动写 `mn_decision_tree_snapshots` / `mn_belief_drift_series`，前端"决策树 / 信念轨迹"两个 tab 不再需要单独触发，从手动操作 → 自动可见 |
| **Phase 9** | 产品文案 i18n 抽离 | `webapp/src/i18n/commentary.ts` + 替换硬编码 | `phase-9-commentary-i18n.md` | "机制价值"、"批判：沉默也会误报"等产品教育文案从代码内嵌 → i18n 配置文件，后续多语 / 文案 A/B 测试无需改代码 |

## 总体效果

- **可见性**：6 个跨会 sub-dim（model_hitrate / consensus_track / concept_drift / topic_lineage / external_experts / 决策树+信念轨迹）从"数据已生但前端拿不到" → 100% 可见
- **真实性**：高危假设 / 证据分布 / 反常沉默 三个核心组件从 mock fixture → 真实 DB 数据；产品文案从硬编码 → 配置驱动
- **自动化**：scope-level run 写完 sub-dim 数据后，axis_versions 快照 + longitudinal 派生数据**自动生成**；用户重算一次 = 所有衍生视图同时更新
- **修一个 bug**：model_hitrate 数据正确性问题

## 工作流程（每阶段）

1. 写阶段 design doc（`phase-N-<topic>.md`）：背景、改动范围、改动文件、回归验证步骤
2. 写代码
3. 回归：`tsc --noEmit` 通过；如阶段涉及 worker 重启，restart 后跑一次 smoke run；如涉及前端，dev server 起来手验关键路径
4. 选择性 `git add`（只提交本阶段相关文件）
5. `git commit -m "<phase>: <topic>"`
6. 进下一阶段

## 不做 / 边界

- 不动 `mn_concept_drifts` 全库 0 行问题（已起独立工单交付到新 session）
- 不动 CEO rehash 指数（等 PR12+ 落地）
- 不动 `data/content-wiki/...` 自动生成的 .md 文件（保持 WIP）
- 不动其他 28 个工作树里的非本任务文件

## 验收

所有 9 个阶段提交完后：
- 前端 `AxisKnowledge` / `AxisProjects` / `AxisPeople` / `MeetingToday` 中**没有"数据待生成"占位**（除非真无数据）
- 没有硬编码 `ASSUMPTIONS` / `EVIDENCE_GRADES` / `MOCK_ITEMS` / `_fixtures.PARTICIPANTS` 引用
- scope=topic/project 跑 axis=all 之后，`mn_axis_versions` 自动 +3 行（people/projects/knowledge），longitudinal 表自动 +1+ 行
- `tsc --noEmit` 全程通过
