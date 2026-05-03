# Phase 0 · scope-level snapshot bug fix（已应用 + 验证）

## 背景

scope=project/client/topic 跑完后，`mn_axis_versions` 没有被写入新版本号。前端"版本对比"功能拿不到 vN，跨会聚合视图全空。

根因：`api/src/modules/meeting-notes/runs/runEngine.ts` 在 `if (!payload.meetingId)` 多会议 finalize 块（约 2273-2333 行）里只跑了 composeAnalysis + wiki generators，**没调 `versionStore.snapshot()`**。snapshot 调用只存在于单会议路径（`if (payload.meetingId)`，2257-2266 行）。结果：

- per-meeting 物理表（mn_commitments / mn_judgments / ...）有数据
- scope 级 snapshot 表 mn_axis_versions 永远停留在历史的 v1（甚至空）
- 前端按"版本号 vN"查的接口返回空

## 改动

文件：`api/src/modules/meeting-notes/runs/runEngine.ts`

位置：紧跟 MeetingScopeGenerator 之后（原文件 2333 行处插入），仍然在 `if (allMeetingIds.length > 0)` 块内。

行为：
1. `for mid of allMeetingIds`: 调 `this.getMeetingAxes(mid)` 拿 per-meeting axis 结构
2. 决定 `axesForSnapshot`：`payload.axis === 'all'` → people/projects/knowledge/meta；其他 axis → 单 axis；longitudinal → 跳过
3. 对每个 axis 折叠 per-meeting blocks（数组型 concat + 加 `__meeting_id` tag；对象型按 meetingId 索引），格式与 router.ts:POST /versions 的 `captureOne` 完全对齐
4. 调 `versionStore.snapshot({ runId, scopeKind, scopeId, axis, data })`
5. snapshot.data._meta 加 `autoFromRun: payload.runId` 字段，便于审计

错误隔离：外层 try/catch 捕获 getMeetingAxes 异常；内层 try/catch 捕获单 axis snapshot 异常；任何失败不阻塞 run finalize。

## 回归验证

1. ✅ `cd api && npx tsc --noEmit` exit 0
2. ✅ pm2 restart mn-worker
3. ✅ smoke test run `9104378c-54f7-4dd5-be22-b3c1984ff7f6` (Scope A `f8fe9833…` / axis=knowledge / preset=lite) succeeded
4. ✅ `SELECT axis, version_label, snapshot->'_meta'->>'autoFromRun' FROM mn_axis_versions WHERE created_at > NOW()-INTERVAL '15 min'` 命中 1 行：knowledge v2，autoFromRun=9104378c…

## 不影响

- 单会议路径（scope=meeting）原有 snapshot 逻辑没动
- claude-cli / api-oneshot 模式（独立分支，不走 multi-axis else）没动
- versionStore.ts 的 INSERT 逻辑没动

## 后续

Phase 8 会再借这同一位置追加 `computeLongitudinal({ scopeId, kind: 'all' })`，让决策树 / 信念轨迹也自动生成。

## 提交内容

代码本身已在历史 commit `2a4588e (feat(mn): scope dirty marker + bindMeeting/unbindMeeting hook + runEngine 清 dirty)` 中提交，本 phase 仅追加文档：

- `docs/质量v2/PLAN.md`（主计划）
- `docs/质量v2/phase-0-snapshot-fix.md`（本文）

> 复盘：本次 session 在不知情情况下重新走了一次"修 bug → 验证"流程；过程中第一次 smoke run（54478b7d）没产生 axis_versions 行，第二次（9104378c）产生了。差异原因可能是首次 pm2 restart 后 worker 多次重启造成进程切换的竞态，第二次稳定后 F-snap 块按预期触发。最终验证通过。
