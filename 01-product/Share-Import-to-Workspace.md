# 会议纪要分享 + 添加到我的工作区 · 设计稿

| 字段 | 值 |
|---|---|
| 状态 | DRAFT · 待评审 |
| 作者 | Claude (assistant) |
| 创建于 | 2026-05-05 |
| 触发场景 | A 把上海客户的 3 场会议纪要分享给 B,B 想"也放进 phase2-iso3 工作区"独立打磨 |

---

## 1. 用户故事

**演员**: A(原作者,在 default 工作区) · B(读者,默认在 phase2-iso3 工作区)

1. A 在 `/meeting/:id/a` 复制分享链接,发给 B
2. B 点开链接 → `/shared/:token` 公开只读视图(已存在)
3. B 决定要在自己工作区独立加工 → 点击 "📥 **添加到我的工作区**" 按钮
4. 系统克隆该会议(asset + 全部 axis 数据 + 必要的 scope 关联)到 B 当前工作区,跳转到 B 工作区下的新会议详情页
5. B 之后的 axes 重算 / 编辑均独立,不影响 A

> 与方案 1(批量 workspace_id 迁移)的区别:**copy-on-import**,A/B 各自一份,互不干扰;不需要决定共享 scope 归属

---

## 2. 现状盘点

### 2.1 分享(已有)

| 表 | 字段 |
|---|---|
| `mn_meeting_shares` | `id, meeting_id, share_token (uuid), mode (link\|targeted), targets jsonb, created_by, created_at, expires_at` |

API:

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/meetings/:id/shares` | session | 创建分享 token |
| GET | `/meetings/:id/shares` | session | 列分享 |
| DELETE | `/meetings/:id/shares/:shareId` | session | 撤销 |
| GET | `/shared/:token` | 公开 | 凭 token 拿 view A detail(只读) |

前端:`SharedMeetingPage.tsx` / `SharedMeetingDetailShell.tsx`

### 2.2 工作区作用域

`assets.workspace_id` + 所有 `mn_*` 表均带 `workspace_id`(由 `withWorkspace.ts` 守护)。跨工作区写入会被拦截。

### 2.3 现有缺口

- 已登录的 B 在 `/shared/:token` 没有"复制到我的工作区"入口
- 没有 server 端的 "clone meeting" 流程

---

## 3. 设计

### 3.1 UX 流程

```
A 在自己 ws (default)        B 在自己 ws (phase2-iso3)
─────────────────────        ───────────────────────────────
/meeting/:id/a               /shared/:token (登录态)
  ↓ 点 "🔗 分享"                ↓ 点 "📥 添加到我的工作区"
弹层: 复制 token              确认弹层(显示目标 ws + 包含项目)
                                ↓ 确认
                              POST /shared/:token/import
                                → 后端克隆 → 返回新 meetingId
                                ↓
                              navigate(/meeting/:newId/a) (B 自己 ws)
```

按钮位置:`SharedMeetingDetailShell.tsx` 顶部右侧,旁边 "在新窗口打开"。仅登录用户可见;游客显示"登录后可添加到工作区"。

### 3.2 后端 API

**新增**:`POST /shared/:token/import`

```ts
// auth: session required
// body: { workspaceId?: string }   省略时落到 currentWorkspace
// response 201:
//   { meetingId: string, importedCounts: { assets:1, axisRows: number, scopes: number } }
// 错误:
//   404 share/meeting not found · 410 expired · 409 already imported (用 idempotency)
```

行为(单事务):

1. 校验 share 未过期
2. **生成新的 meeting UUID** = `newId`
3. **复制 asset**:`INSERT INTO assets (id=newId, workspace_id=B.ws, ...rest)` 沿用原始 metadata;在 `metadata.imported_from = { sourceMeetingId, shareId, importedAt, sourceWorkspaceId }` 留溯源
4. **复制 axis 数据**:对所有 18 张带 `meeting_id` 的 mn_* 表(列表见附录)生成 `INSERT ... SELECT` 把 `meeting_id` 改为 `newId`、`workspace_id` 改为 `B.ws`,**保留其余字段原样**
5. **scope 处理**(关键决策):
   - **不复制**原 client/project/topic scope 实体,只把 binding 关系建到 B 工作区下的 scope
   - 对每个原绑定 scope `(kind, name)`,在 B.ws 找同 `(kind, name)` 的 scope:
     - 找到 → 复用,`INSERT INTO mn_scope_members (scope_id=found, meeting_id=newId)`
     - 未找到 → 在 B.ws 新建一个同名 scope(slug 同 source),再 bind
   - 这样 B 可以选择把多场导入的会议归到自己工作区的同名"上海"客户下
6. 写 audit `meeting.imported`(source / target ws / shareId / actor)

**幂等**: 同一 (shareId, target_workspace, user) 已 import 过 → 返回原 newId(409 with `existingId`)。可在 `assets.metadata.imported_from.shareId` 上做查询,免新建表。

### 3.3 前端组件

```
webapp/src/prototype/meeting/
  SharedMeetingDetailShell.tsx
    ↓ 新增 ImportToWorkspaceButton
  ImportToWorkspaceModal.tsx (新)
    - 显示目标 workspace (用户 currentWorkspace,可下拉切换 user.workspaces)
    - 列出"将复制":会议本身 · N 条 axis 数据 · M 个 scope 绑定
    - 主按钮 "复制到 [ws.name]" 调 POST /shared/:token/import
    - 成功后 navigate('/meeting/:newId/a')
```

webapp/src/api/meetingNotes.ts 加一个 `importSharedMeeting(token, workspaceId?)`。

### 3.4 涉及表(附录)

会议级 axis 表(均带 meeting_id + workspace_id):
- `mn_assumptions`, `mn_cognitive_biases`, `mn_consensus_items`, `mn_consensus_sides`,
  `mn_counterfactuals`, `mn_decisions`, `mn_evidence_grades`, `mn_external_experts`,
  `mn_judgments`, `mn_meeting_necessity`, `mn_mental_model_invocations`,
  `mn_open_questions`, `mn_role_trajectory_points`, `mn_silence_signals`,
  `mn_speech_quality`, `mn_tension_moments`, `mn_tensions`, `mn_topic_lineage`,
  `mn_risks`, `mn_focus_map`, `mn_affect_curve`, `mn_decision_quality`

**不复制**:
- `mn_runs`(执行历史无需带过去;新 ws 自己重跑就有了)
- `mn_meeting_shares`(B 要不要再分享自己决定)
- `mn_axis_versions`(版本快照粘在原 ws,导入即"重新开始")
- 跨会议聚合表(`mn_belief_drift_series` / `mn_consensus_tracks` 等是 scope 级,不绑单 meeting)

---

## 4. 边界 / 待定

| # | 问题 | 倾向 |
|---|---|---|
| Q1 | 导入后原 share 还能访问吗? | 是。不影响 A 端 |
| Q2 | A 之后再修改自己 ws 的会议,B 的副本是否同步? | **不同步**。fork-once 模型,简单可控 |
| Q3 | 如果 B 多次点 import,是覆盖还是新建? | 幂等返回原 newId(见 3.2 第 6 点) |
| Q4 | scope 复用 vs 新建,要给 B 选项还是后端自动决定? | 默认自动,**Modal 里可展开"选择已有 scope / 新建"高级选项** |
| Q5 | mn_people 是 scope 级还是 meeting 级? 要不要复制? | **复制**:LLM 输出的 person 通常被该 meeting 直接引用 |
| Q6 | 分享时附带"转移"模式? | v2 再说 |

---

## 5. 实现拆分(按 PR)

| PR | 内容 | 文件 |
|---|---|---|
| PR-1 | 后端 `POST /shared/:token/import` + 单元测试 | `api/src/modules/meeting-notes/router.ts` + `services/import.ts` |
| PR-2 | 前端按钮 + Modal + API 客户端 | `webapp/src/prototype/meeting/SharedMeetingDetailShell.tsx`, 新建 `ImportToWorkspaceModal.tsx`, `webapp/src/api/meetingNotes.ts` |
| PR-3 | (可选)Modal 中"高级 scope 选择" + import audit 列表 UI | 同上 |

预估工时:PR-1 ~3h,PR-2 ~2h,PR-3 ~2h。

---

## 6. 验收

- [ ] B 在 `/shared/:token` 看到 "添加到我的工作区"
- [ ] 点击 → 跳到 `/meeting/:newId/a`,在 B 当前工作区
- [ ] 三轴 tabs 都能渲染(数据已复制)
- [ ] 原 A 的会议在 default ws 完全无变化
- [ ] B 之后再导入同一 share → 跳到已导入的副本(不重复)
- [ ] audit log 有 `meeting.imported` 事件
