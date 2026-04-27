# P3 · 版本回滚闭环

## Why

上一轮已实现「重算前自动快照到 mn_axis_versions」。但快照只是「写得进去」，没有「读得回来」——LLM 重算翻车后，用户必须手工写 SQL 把 snapshot JSON 反向解构回各 mn_* 表，没人这么做。等于备份是死的。P3 把它变成活的：一个 POST /versions/:id/restore 把 snapshot 反写回 axis 表，前端在 4 轴页面挂时间轴 UI。

P0 给了 source 列，restore 写回的行标 `source='restored'`，与 manual_import / llm_extracted 共存不冲突。

## What

后端：`POST /versions/:id/restore` 把 mn_axis_versions.snapshot JSONB 反写到 mn_*。

前端：把现有但未挂载的 `webapp/src/components/meeting-notes/VersionTimeline.tsx` 接到 4 轴页面，每行显示 vN + 时间 + diff 概要 + 「回滚」按钮。

## Files

- 后端新增：`api/src/modules/meeting-notes/runs/versionRestore.ts`（restore 编排器）
- 后端改：`api/src/modules/meeting-notes/router.ts`（新 POST /versions/:id/restore）
- 后端 engine：`api/src/modules/meeting-notes/MeetingNotesEngine.ts`（暴露 `restoreVersion(id)` 方法）
- 前端 API：`webapp/src/api/meetingNotes.ts`（`restoreVersion(id)`）
- 前端组件：`webapp/src/prototype/meeting/_axisShared.tsx`（在 DimShell 里挂 VersionTimeline）

## Restore 算法

输入：versionId
1. SELECT snapshot, scope_kind, scope_id, axis FROM mn_axis_versions WHERE id = $1
2. snapshot 形状 = `{ [axis]: { [subDim]: [...]/{} } }`（与 P3 上轮 POST /versions 写入形状一致）
3. 列出涉及的 meeting ids（scope_kind=meeting 时单个；project 时 mn_scope_members；library 时 assets 全量）
4. 事务内对每个 axis × subDim：
   - 数组型（commitments/decisions/...）：先 `DELETE FROM mn_X WHERE meeting_id = ANY(...) AND source IN ('restored','llm_extracted')`（不动 manual_import），再 `INSERT INTO mn_X (..., source) VALUES (..., 'restored')` 逐行写回 snapshot 中的项
   - 单例型（evidence_grades/decision_quality/...）：`INSERT ... ON CONFLICT (meeting_id) DO UPDATE WHERE source != 'manual_import'`
5. 写一行 mn_runs（triggered_by='manual', metadata.kind='restore', metadata.fromVersionId=$1）
6. 写一行 mn_axis_versions（基于 restore 后的当前状态，label 为 `restored-from-vN`）以保留时间轴线性
7. 返回：被覆盖行数、跳过行数（manual_import 保留）、新版本 id

## API

```http
POST /api/v1/meeting-notes/versions/:id/restore
Body: { dryRun?: boolean }    # dryRun=true 只返回会改动多少行不真改
Response: {
  fromVersion: { id, label, axis, scopeKind, scopeId },
  affected: { axis: { subDim: { deleted, inserted, skipped } } },
  newVersionId: string,
  newVersionLabel: string
}
```

## 前端 UI

挂在每个 axis 页右侧栏（DimShell 已有 RegenerateOverlay）：
- VersionTimeline：顺序列出最近 N 版（v15、v14、v13…），每行 `[标签] [作者/runKind] [diff 概要 +12 -3 ~5] [回滚]`
- 点「回滚」→ 二次确认弹窗（类似 AxisRegeneratePanel）：「将把 ${count} 行写回到 ${vN} 状态。manual_import 行保留。继续？」
- 复选框 + 输入「回滚」二次确认（与重算同等防误点）
- 成功后 toast「已回滚到 v15，新版本 v18 已快照」

## 验证

```bash
# 1. dryRun
curl -X POST .../versions/${V_ID}/restore -d '{"dryRun":true}'
# expect: affected counts, no DB change

# 2. 真实 restore
curl -X POST .../versions/${V_ID}/restore -d '{}'
# expect: newVersionLabel="restored-from-v15"

# 3. 验证 manual_import 行未被动
SELECT source, count(*) FROM mn_judgments WHERE source = 'manual_import';
# 应等于 restore 前的数

# 4. UI 流程
# 浏览器打开 /meeting/axes/knowledge → 右侧时间轴看到 v15/v16/v17 →
# 点 v15 「回滚」→ 确认 → toast → 页面数据回到 v15 状态
```

## 风险

- restore 是**单向**操作（写回会覆盖现有 LLM 数据），但因为它本身又快照成新版本（步 6），实际上是可逆的（再 restore 回新版本即可）
- snapshot 形状若跨版本演化（schema migration），restore 老版本可能字段不全 —— 加 schema_version 字段的能力以后再加

---

## 精修 · 实现细节锁定

### Snapshot 格式升级（破坏性 → 引入 `_meta.snapshotVersion=1`）

旧 snapshot 形状 `{ [axis]: { [subDim]: [...]/{} } }` 把多 meeting 的数组 concat 后**丢失了 meeting_id 归属**——restore 不知道每条 row 该写回哪场会议。

新形状（仍然兼容旧 diff，因为 flatten 只看 `it.id`）：

```json
{
  "_meta": {
    "snapshotVersion": 1,
    "meetingIds": ["1ace56ff-...", "eff87d6c-..."],
    "scopeKind": "project",
    "scopeId": "f6cf3f51-..."
  },
  "knowledge": {
    "judgments": [
      { "id": "...", "__meeting_id": "1ace56ff-...", "text": "...", ... }
    ],
    "evidence_grades": {
      "1ace56ff-...": { "dist_a": 3, ... },
      "eff87d6c-...": { "dist_a": 2, ... }
    }
  }
}
```

数组型 subDim 每条 row 加 `__meeting_id` 字段。单例型 subDim（evidence_grades / decision_quality / meeting_necessity / affect_curve）用 meeting_id 做 key（已经是这样）。

### 改动 1：POST /versions 加 tagging

`router.ts` `POST /versions` handler 内 `captureOne(...)`：
- concat 数组前给每条 item 加 `__meeting_id`
- 包外加 `_meta` 块

### 改动 2：POST /versions/:id/restore（新路由）

```http
POST /api/v1/meeting-notes/versions/:id/restore
Body: { dryRun?: boolean }
Response: {
  fromVersion: { id, label, axis, scopeKind, scopeId },
  affected: { [axis]: { [subDim]: { deleted, inserted, skipped } } },
  newVersionId: string,
  newVersionLabel: string,        // "restored-from-vN"
  newRunId: string
}
```

算法：
1. SELECT snapshot, scope_kind, scope_id, axis FROM mn_axis_versions WHERE id=$1
2. 校验 `snapshot._meta.snapshotVersion === 1`，否则 422 LEGACY_SNAPSHOT
3. 拿 `meetingIds = snapshot._meta.meetingIds`
4. 遍历 axes × subDims：按 mn_* 表的列做反写
5. dryRun=true：只算 deleted/inserted 计数，不真改 → 返回 affected
6. dryRun=false：BEGIN TRANSACTION → 各表 DELETE WHERE meeting_id=ANY AND source IN ('llm_extracted','restored') → INSERT each item with source='restored' → 写新 mn_runs(triggered_by='manual', metadata.kind='restore', fromVersionId=$1) → 写新 mn_axis_versions(label='restored-from-vN'，data 直接复用 snapshot) → COMMIT

### 改动 3：subDim → INSERT 字段映射表

需要在 router 里硬编码每个 subDim 写哪些列。给个简洁映射：

```ts
const RESTORE_SCHEMA: Record<string, {
  table: string;
  scope: 'meeting' | 'singleton' | 'global';  // global=mn_judgments 跨 meeting 用 linked_meeting_ids
  cols: string[];   // 从 snapshot row 取的字段名（不含 source/meeting_id 由系统补）
  uniqKey?: string[];  // for singleton: meeting_id；for upsert：UNIQUE 列
}> = {
  'people.commitments':    { table: 'mn_commitments', scope: 'meeting',
    cols: ['id', 'person_id', 'text', 'due_at', 'state', 'progress'] },
  'people.role_trajectory':{ table: 'mn_role_trajectory_points', scope: 'meeting',
    cols: ['person_id', 'role_label', 'confidence'], uniqKey: ['person_id', 'meeting_id'] },
  // ... 其它 14 个
};
```

(把 mn_judgments 当 'global'：用 `linked_meeting_ids` overlap，全删 source IN(...) 的 → 全 INSERT)

### 改动 4：前端

- `meetingNotes.ts` 加 `restoreVersion(id, body)`
- 不在本 iteration 接 VersionTimeline UI（留给下一轮 polish）

### 兼容性

- 现有 v1/v2/... 老 snapshot 没 `_meta.snapshotVersion`，restore 路由直接 422 LEGACY_SNAPSHOT，提示用户「先用新版本再试 restore」
- 重新跑一次 POST /versions（弹窗自动触发）就有了新版本
- 不删旧 snapshot
