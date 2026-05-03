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

| 阶段 | 主题 | 改动范围 | 设计文档 |
|---|---|---|---|
| **Phase 0** | scope-level snapshot bug fix（已应用 + 验证） | `runEngine.ts` 多会议 finalize 加 versionStore.snapshot | `phase-0-snapshot-fix.md` |
| **Phase 1** | 4 条 sub-dim GET 路由 | `router.ts` 加 GET /scopes/:id/{consensus-tracks,concept-drifts,topic-lineage,external-experts} | `phase-1-subdim-routes.md` |
| **Phase 2** | 4 个 PendingSubdimTab → 真实 API | `AxisKnowledge.tsx` + api client | `phase-2-frontend-pending-tabs.md` |
| **Phase 3** | model_hitrate 后端查表修复 | `longitudinal/mentalModelHitRate.ts` 改读 `mn_model_hitrates` | `phase-3-model-hitrate-fix.md` |
| **Phase 4** | 本场新认知摘要 + 证据分布前端接入 | AxisKnowledge.tsx Cognition tab + Evidence 段调 API | `phase-4-cognition-evidence.md` |
| **Phase 5** | 高危假设 mock 替换 | AxisProjects.tsx ASSUMPTIONS 数组 → `/scopes/:id/assumptions` | `phase-5-mock-assumptions.md` |
| **Phase 6** | 证据分布 mock 替换 | AxisKnowledge.tsx EVIDENCE_GRADES 数组 → real | `phase-6-mock-evidence.md` |
| **Phase 7** | 反常沉默 mock 替换 | MeetingToday.tsx + _fixtures.ts → `/meetings/:id/silence` | `phase-7-mock-silence.md` |
| **Phase 8** | longitudinal 自动联动 | `runEngine.ts` multi-meeting finalize 内追加 `computeLongitudinal({kind:'all'})` | `phase-8-longitudinal-auto.md` |
| **Phase 9** | 产品文案 i18n 抽离 | `webapp/src/i18n/commentary.ts` + 替换硬编码 | `phase-9-commentary-i18n.md` |

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
