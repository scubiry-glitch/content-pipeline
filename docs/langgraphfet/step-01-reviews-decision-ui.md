# Step 1 阶段报告：Reviews 问题决策 UI（R3）

**日期：** 2026-04-13
**分支：** `claude/align-langgraph-tasks-page-lV7W9`
**对应缺口：** Reviews R3 — 每条评审问题的 accept/ignore 决策 UI

---

## 目标

为 LangGraph Reviews Tab 的每条评审问题添加 **接受/忽略/重置** 操作按钮，让用户可以追踪每条蓝军意见的处理状态。

由于 LG 后端目前没有 review_decisions 端点，决策状态使用 **localStorage 客户端持久化**，按 `threadId` 分组保存。后续可平滑迁移到后端 API。

---

## 实施内容

### 1. 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGReviewsTab.tsx` | 编辑 | +148 |

### 2. 新增功能

#### 决策状态管理
- 新增 `Decision` 类型：`'accepted' | 'ignored' | 'pending'`
- `loadDecisions(threadId)` / `saveDecisions(threadId, decisions)` — localStorage 工具函数
- `getQuestionKey(round, index, question)` — 生成稳定的问题唯一 key（防止顺序变化导致状态丢失）

#### 决策 UI
- 每条非 `praise` 类型的问题卡片下方新增三个按钮：
  - **✓ 接受** — 标记为已采纳意见
  - **✕ 忽略** — 标记为已忽略意见
  - **重置** — 清除决策状态（仅在已决策时显示）
- 按钮状态视觉反馈：选中状态高亮 + 边框颜色变化
- 已忽略问题卡片整体降低不透明度（`opacity: 0.6`）
- 卡片头部新增决策状态徽章（已接受 / 已忽略）

#### 决策进度面板
在评审统计区域新增 **决策进度卡片**，展示：
- 已接受数量（绿色徽章）
- 已忽略数量（灰色徽章）
- 待处理数量（橙色徽章）
- 完成率百分比

### 3. 设计要点

1. **稳定 key 生成**：使用 `r${round}_i${index}_${question.slice(0,20)}` 而非纯索引，避免后续评审轮次新增问题时旧决策错位。
2. **per-thread 隔离**：localStorage 按 `lg-review-decisions:${threadId}` 分组，不同任务互不影响。
3. **praise 类型不可决策**：表扬类型的问题不显示决策按钮，仅作为正向反馈展示。
4. **降级容错**：localStorage 读取失败时返回空对象，不影响页面渲染。

---

## 验证

- ✅ TypeScript 类型检查通过（`npx tsc --noEmit`）
- 待手动验证：浏览器中操作按钮 → 决策状态正确持久化 → 刷新页面后状态保留

---

## 下一步

Step 2: Reviews R4 — 批量选择模式（多选 + 一键全部接受/忽略）
