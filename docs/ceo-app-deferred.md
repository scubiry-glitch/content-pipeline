# CEO 应用 · 已知延期项

记录原型设计未画完整、需要补设计稿后才能实施的功能。

---

## WarRoom ② Sandbox 兵棋推演子页

**位置**：`/ceo/internal/ceo/war-room` 第 ② block

**当前状态**：
- 前端 `webapp/src/prototype/ceo/internal/rooms/WarRoom/SandboxList.tsx` 显示 3 张推演卡 fixture (Q2 投资 / LP 沟通 / Halycon 6 月后果)
- 卡片可见但无法点开详情
- 顶部「+ 启动新推演」按钮为 stub

**为什么延期**：
- 原型 `07-archive/会议纪要 (20260501)/war-room.html` 中只画到 list 入口，没有画"推演详情子页"
- 推演逻辑（候选生成 / 分支可视化 / 决策路径）需要更详细的产品设计

**被点名记录**：
- 用户 2026-04-30 / 05-01 多次提及，确认延期至原型补全

**重启条件**：
1. 补一份 sandbox 详情子页设计稿（候选 → 分支树 → 决策路径 → 验证）
2. 决定数据源：纯 LLM 生成（轻）vs 人工 + LLM 协作（重）
3. 决定持久化：临时计算（贴 mn_runs.metadata）vs 独立表（ceo_sandbox_runs）

**联动**：
- 当前 SandboxList 顶部"+ 启动新推演"按钮已改为弹 toast `📐 兵棋推演子页 · 待原型补齐`

---

## g1 ASR 真接

**位置**：`api/src/modules/ceo/pipelines/runHandlers.ts::handleG1`

**当前状态**：g1 在 R2-6 实装为「委托给 mn 的 enqueue」，但 mn 的 ingest pipeline 当前要求有上传的 audio/transcript 文件。CEO 视角直接触发 g1 没有附带文件，需要先选会议。

**重启条件**：
- 在 PersonDrawer 或 Boardroom 加"挑选会议"流程，把 meeting_id 作为 g1 入参传给 mn
- 或者改为 read-only 触发：g1 仅在 mn 完成 ingest 后由 mn 事件触发 (`mn.meeting.parsed`) 自动入队 ceo run

---

## 维护说明

每次发现"原型未画 / 设计未定 / 跨依赖未就位"的功能，新增到本文。
不要让前端代码里堆 `// TODO` 或 `console.log('coming soon')`，要么实装要么记到这。
