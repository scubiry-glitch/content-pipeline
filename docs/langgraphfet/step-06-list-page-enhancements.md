# Step 6 阶段报告：列表页全面增强

**对应缺口：** 列表页 P0 + P1 — 状态筛选/卡片增强/删除/数据持久化/导出/任务计数

---

## 实施内容

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/LangGraphTasks.tsx` | 重写 | +250 |
| `webapp/src/pages/LangGraphTasks.css` | 新增样式 | +110 |

### 核心功能

#### 1. 两栏布局（侧边栏 + 主区）
- 左侧固定 220px 筛选侧边栏
- 右侧主内容区
- 响应式 grid 布局

#### 2. 状态筛选（P0）
- 8 种状态过滤：全部/待确认大纲/研究中/写作中/评审中/待审批/已完成/失败
- 实时计数徽章
- 选中态高亮

#### 3. 增强任务卡片（P0）
- 进度条 + 百分比显示（0.3s 缓动动画）
- 当前节点显示
- 操作按钮组：查看 / 删除
- 选中态视觉反馈

#### 4. 数据持久化改进（P0）
- 仍以 localStorage 为基础
- 自动从 `langgraphApi.getTaskState()` **同步真实状态**：
  - 初次加载时同步一次（silent）
  - 30s 自动后台刷新
  - 手动「同步状态」按钮
- 同步字段：status / progress / currentNode / updatedAt
- 容错：单个任务请求失败不影响其他任务

#### 5. 删除任务（P0）
- 卡片右侧「删除」按钮
- ConfirmModal 二次确认
- 提示用户后端 checkpoint 不会被清除（可重新访问）

#### 6. 导出 CSV（P1）
- 7 列：Thread ID / Task ID / 主题 / 状态 / 进度 / 创建时间 / 更新时间
- 仅导出当前筛选结果
- BOM 头确保 Excel 中文不乱码

#### 7. 任务计数显示（P1）
- 副标题展示「共 X 个任务」
- 筛选状态下显示当前筛选标签徽章

#### 8. 加载/错误/空状态完善
- 全空时：通用空状态
- 筛选下空：「该状态下暂无任务」
- 同步中：按钮显示「刷新中...」

### 工具函数重构

新增 localStorage 操作工具：
- `getSavedThreads()` — 读取
- `saveThreads(threads)` — 完整覆盖
- `addThread(data)` — 新增
- `removeThread(threadId)` — 删除
- `updateThread(threadId, patch)` — 局部更新

### 保留的独有功能

- ✅ 最大评审轮数选择（1/2/3 轮）
- ✅ 页面副标题描述
- ✅ Thread ID 显示

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 状态筛选 + 计数正确
  - 同步状态后进度条更新
  - 删除任务后从列表移除
  - 导出 CSV 文件可用

---

## 下一步

Step 7: Reviews R6 — 完整审批流（finalize/force/override）
