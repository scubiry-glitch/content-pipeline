# Step 4 阶段报告：Planning 版本对比（P3）

**对应缺口：** Planning P3 — VersionComparePanel 版本对比

---

## 目标

利用已有的 Pipeline 版本历史（checkpoint 列表）实现：
1. **Checkpoint 状态对比** — 用户可选 2 个 checkpoint 对比其状态字段差异
2. **大纲编辑实时 Diff** — 编辑模式下实时显示用户编辑相对原大纲的章节变化

---

## 实施内容

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGPlanningTab.tsx` | 编辑 | +205 |

### 设计决策

由于 LangGraph checkpoint 仅存储元数据（hasOutline 布尔值，不含完整 outline 内容），无法做完整内容 diff。所以采用了两种实用的对比模式：

#### 1. CheckpointComparePanel — 状态字段对比

新增组件，对比两个 checkpoint 的 8 个字段：
- 当前节点
- 状态
- 进度 %
- 大纲已批准
- 评审通过
- 已生成大纲
- 已生成草稿
- 评审轮数

特性：
- Side-by-side table（A vs B）
- 变更字段背景高亮（黄色）
- A 蓝色 / B 绿色 配色区分
- Checkpoint ID + 时间戳显示

#### 2. OutlineEditDiffPanel — 编辑实时 Diff

仅在编辑模式下显示，对比当前 outline 与用户编辑中的 JSON：
- 三栏布局：新增 / 删除 / 保留
- 基于 section.title 集合做差异计算
- JSON 解析失败时显示错误提示
- 保留章节超过 5 个时折叠显示

### UI 交互流程

1. 用户进入 Planning Tab，看到 Pipeline 版本历史
2. 点击「版本对比」按钮进入对比模式
3. 点击 2 个 checkpoint 添加到对比
4. 自动显示 CheckpointComparePanel 对比表
5. 编辑大纲时，自动显示 OutlineEditDiffPanel 实时 Diff

### 状态管理

新增状态：
```typescript
const [compareSelection, setCompareSelection] = useState<string[]>([]);
const [showCompare, setShowCompare] = useState(false);
```

退出对比模式自动清空已选项。

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：选择 checkpoint → 对比表渲染、编辑大纲 → diff 实时更新

---

## 下一步

Step 5: Research Re6+Re7+Re8 — 引用可靠性 + 操作栏 + 头部
