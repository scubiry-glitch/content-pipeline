# Backend Change Log · 接口改动影响清单

记录 `api/v1/meeting-notes/*` 路由改动对其他消费方的影响。Phase 15 每个子项都要在这里登记一条，并在对应的回归 commit 里勾掉 checklist。

**规则回顾**（见 `/root/.claude/plans/serialized-cuddling-hare.md` · Phase 15 "存量接口改动的硬约束"）：
- 仅允许 append field / add query param / new route
- 破坏兼容必须新开 `/v2` 或 `?expand=...`
- 每条改动都需"回归 commit": `chore(regression): verify <route> across consumers`

---

## 2026-04-24 · 15.0 · 初始化 Change Log

- 改动类型：docs only
- 兼容性：forward-compat
- **待回归检查**（TODO）：
  - [x] 无外部消费方（本文件首次引入）

---

## 2026-04-24 · 15.7 · `POST/GET/PUT/DELETE /schedules` · 全新路由

- 改动类型：new route
- 兼容性：forward-compat · 无既有消费方
- **待回归检查**（TODO）：
  - [x] 无既有消费方 · 新增路由
- 前端已加 `meetingNotesApi.{listSchedules,createSchedule,updateSchedule,deleteSchedule}`；GenerationCenter · ScheduleView 降级 mock 标记说明后端未上线

---

## 2026-04-24 · 15.1 · `GET /meetings/:id/speech-metrics` · 全新路由

- 改动类型：new route
- 兼容性：forward-compat · 无既有消费方
- **待回归检查**（TODO）：
  - [x] 无既有消费方 · 新增路由
- 前端已加 `meetingNotesApi.getSpeechMetrics`；AxisPeople · Speech tab 降级 mock

---

## 2026-04-24 · 15.2 · `GET /meetings/:id/decision-quality` · 全新路由

- 改动类型：new route
- 兼容性：forward-compat · 无既有消费方
- **待回归检查**（TODO）：
  - [x] 无既有消费方 · 新增路由
- 前端已加 `meetingNotesApi.getDecisionQuality`；AxisMeta · Quality tab 降级 mock

---

## 2026-04-24 · 15.6 · `GET /runs/:id` · 扩 tokens/cost/progress

- 改动类型：append field（`tokens: {input, output}`, `costUsd`, `progress`, `currentStep`）
- 兼容性：forward-compat · 旧字段保留
- **待回归检查**（TODO）：
  - [ ] `webapp/src/pages/meeting-notes/**` 轮询 `getRun` 的调用点 · `grep -r 'getRun'` 验证读字段位置
  - [ ] `content-pipeline` 其他模块未引用（已确认仅 webapp 内 `prototype/meeting` 和 `pages/meeting-notes`）
  - [ ] `api/src/modules/meeting-notes/runs/*` 后端 handler append 字段不影响序列化
- 前端已加 adapter · 不破坏旧 response shape · 新字段显示为 `—` 即 fallback 正常

---

## 2026-04-24 · 15.5 · `GET /versions/:a/diff?vs=:b` · 结构化输出

- 改动类型：**可能 break** · 返回 shape 从 string 或 flat object 改为 `{ added, removed, changed: [{path, before, after}] }`
- 兼容性：**破坏兼容 · 需走 `?structured=1` 参数开关** (建议后端提供 flag，老调用仍得 flat)
- **待回归检查**（TODO）：
  - [ ] `webapp/src/pages/meeting-notes/**` 搜索 `diffVersions` 使用点
  - [ ] `batch-ops/**` 脚本 · `grep -r '/versions/.*diff'`
  - [ ] 后端 handler 默认 shape 保持；新 shape 仅在 `?structured=1` 时返回
- 前端已加 adapter  · `diffVersions(a, b, { structured: true })` 并对返回做 shape 检测；老 string/flat 形态 fallback 到 mock 对比表

---

## 2026-04-24 · 15.3 · `GET /scopes/:id/longitudinal/belief_drift` · 扩 response shape

- 改动类型：append field（`{ points[], band, confidence_trace }`）
- 兼容性：forward-compat · 当前无其他消费方（路由仅 `/meeting/longitudinal` 使用）
- **待回归检查**（TODO）：
  - [ ] `pages/meeting-notes/**` 是否消费 longitudinal 接口 · `grep -r 'getLongitudinal\|/longitudinal/'`
  - [ ] 后端 handler append 字段不破坏旧消费方
- 前端 adapter 已在 `LongitudinalView.tsx · BeliefDrift` 读新字段；缺失时回落 mock

---

## 2026-04-24 · 15.4 · `GET /scopes/:id/longitudinal/decision_tree` · 扩 response shape

- 改动类型：append field（`{ nodes, edges, current, pending[] }`）
- 兼容性：forward-compat
- **待回归检查**（TODO）：
  - [ ] 同 15.3
- 前端 adapter 已在 `LongitudinalView.tsx · DecisionTree`

---

## Tier B · 算法/口径类 — 已落地

从 migrations SQL 读取 schema 后，发现 mn_* 表已完整定义。新增全新路由族（全部 append-only · 无破坏性）：

| # | 路由 | 数据源表 | Phase commit |
|---|------|----------|---------------|
| B.4  | GET /scopes/:id/commitments | mn_commitments | 15.9  |
| B.7  | GET /scopes/:id/provenance?decisionId= | mn_decisions (based_on_ids 递归) | 15.8 |
| B.7' | GET /scopes/:id/decisions | mn_decisions | 15.8 |
| B.8  | GET /scopes/:id/assumptions | mn_assumptions | 15.8 |
| B.9  | GET /scopes/:id/open-questions | mn_open_questions | 15.8 |
| B.10 | GET /scopes/:id/risks | mn_risks | 15.8 |
| B.11 | GET /scopes/:id/judgments | mn_judgments | 15.10 |
| B.12 | GET /scopes/:id/mental-models/hit-rate | mn_mental_model_hit_stats | 15.10 |
| B.15 | GET /meetings/:id/necessity-audit | mn_meeting_necessity | 15.11 |

#1 tension classification 未落地 · DB 无专用表，仍是 LLM 推断，保留 mock

## Tier C · LLM/信号类（Phase 15.15 实施）

- [x] #2 consensus fork · VariantThreads · 接 getMeetingDetail view=C（append field）
- [x] #3 nebula edges · VariantThreads · 同上
- [x] #1 tension classification · VariantEditorial/Workbench · 接 GET /meetings/:id/tensions（新路由）
- [x] #5 silence · AxisPeople Silence（Phase 15.12 已完成）
- [x] #13 biases · AxisKnowledge（Phase 15.13 已完成）
- [x] #16 emotion curve · AxisMeta Emotion（Phase 15.11/15.14 已完成）

---

## 2026-04-25 · 15.15 · C.1/C.2/C.3 · 张力/共识叉/焦点星云

### C.1 · `GET /meetings/:id/tensions` · 全新路由

- 改动类型：new route（migration 010）
- 兼容性：forward-compat · 无既有消费方
- **待回归检查**（TODO）：
  - [x] `/pages/meeting-notes/**` — 无此接口消费
  - [x] `api/meetingNotes.ts` — 新增 `getMeetingTensions`，无既有方法改动
  - [x] batch-ops / 脚本 — 无
- 前端：VariantEditorial + VariantWorkbench 加 tension probe + `tensionMock` 降级；
  SecTension / WBTension 加 `isMock` prop + `<MockBadge />`

### C.2 + C.3 · `GET /meetings/:id/detail?view=C` · append field

- 改动类型：append field（在 C view 响应追加 `consensus[]` + `focusMap[]`）
- 兼容性：forward-compat（只加字段，旧消费方忽略新字段）
- **待回归检查**（TODO）：
  - [x] `/pages/meeting-notes/MeetingDetail`（旧版）— 消费 `/meetings/:id/detail?view=A`，不消费 C；无影响
  - [x] 旧 4 个 Axis 页（`/pages/meeting-notes/`）— 不调用 detail API；无影响
  - [x] `content-pipeline` 其他模块 — `grep -r "meeting-notes" api/src/` 确认无其他消费方
  - [x] batch-ops / 脚本 — 无
- 前端：VariantThreads useEffect 扩展读 `data.consensus` + `data.focusMap`；
  ConsensusGraph + FocusNebula 从 hardcoded `<MockBadge />` 改为 `{isMock && <MockBadge />}`

---

## 汇总回归（Phase 15 收尾）

- [x] Tier A · 15.0-15.7 全部 commit（2026-04-24）
  - 15.0 初始化 Change Log
  - 15.1 speech metrics（AxisPeople · Speech）
  - 15.2 decision quality（AxisMeta · Quality）
  - 15.3 belief_drift schema（LongitudinalView · BeliefDrift）
  - 15.4 decision_tree schema（LongitudinalView · DecisionTree）
  - 15.5 diffVersions structured（GenerationCenter · Versions）
  - 15.6 getRun tokens/cost（FlowProcessing + QueueView）
  - 15.7 schedule CRUD（GenerationCenter · ScheduleView）
- [x] Tier B · 15.8-15.10 全部 commit（2026-04-24）
- [x] Tier C · 15.11-15.15 全部 commit（2026-04-25）
  - 15.11+15.14 necessity + emotion curve（AxisMeta）
  - 15.12 silence（AxisPeople）
  - 15.13 biases（AxisKnowledge）
  - 15.15 tension / consensus / focusMap（C.1/C.2/C.3 · 本 commit）
- [x] `GET /meetings/:id/detail?view=C` append field — 回归检查通过（无旧消费方）
- [ ] `chore(regression): verify <route> across consumers` · 在后端 15.5/15.6/15.3/15.4 真实上线后跑
- [ ] 最终 `docs(meeting-proto): Phase 15 收尾 · 接口改动对外影响验证通过`

## 本轮 Phase 15.8-15.14 接口改动一览

全部 **新路由** · 无 既有消费方 · forward-compat：

- router.ts 总计新增 11 条路由（Phase 15.7 的 schedule 除外）
- meetingNotes.ts 新增 ~15 个方法
- 前端 adapter 模式一致：useEffect probe → 成功则 setIsMock(false) + 更新 state；失败/空/forceMock → fallback mock + `<MockBadge />`
