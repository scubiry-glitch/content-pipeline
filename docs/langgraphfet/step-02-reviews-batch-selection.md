# Step 2 阶段报告：Reviews 批量选择模式（R4）

**对应缺口：** Reviews R4 — 批量选择模式（多选 + 一键全部接受/忽略）

---

## 目标

在 Step 1 决策 UI 基础上，添加 **批量决策** 能力：
- 切换批量模式，每个问题卡片显示选择 checkbox
- 工具栏支持全选 / 反选 / 批量接受 / 批量忽略 / 批量重置

---

## 实施内容

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGReviewsTab.tsx` | 编辑 | +148 |

### 新增功能

1. **批量模式切换按钮** — 头部新增 `批量决策 / 退出批量` 切换按钮（带蓝色高亮态）
2. **批量工具栏**（仅在批量模式下显示）：
   - 全选 checkbox（已选 X/Y 计数）
   - 批量接受按钮
   - 批量忽略按钮
   - 批量重置按钮
3. **问题卡片选择 checkbox** — 批量模式下每个非 praise 类型的卡片显示选择框
4. **选中态视觉反馈** — 选中的卡片显示蓝色阴影描边
5. **selectableKeys 计算** — 自动收集所有非 praise 问题的稳定 key
6. **退出批量自动清空** — 关闭批量模式时清空已选

### 新增状态

```typescript
const [batchMode, setBatchMode] = useState(false);
const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
```

### 新增函数

- `batchUpdate(decision)` — 批量更新已选项的决策状态
- `toggleSelection(key)` — 切换单条选择
- `selectAll(keys)` / `clearSelection()` — 全选 / 清空

---

## 验证

- ✅ TypeScript 类型检查通过
- ✅ 与 Step 1 的单条决策共享 decisions 状态，互不冲突

---

## 下一步

Step 3: Quality Q3+Q4+Q7 — 维度柱状图、质量告警、工具操作栏
