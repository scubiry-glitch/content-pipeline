# Step 8 阶段报告：Reviews 批量修订 Modal（R5）

**对应缺口：** Reviews R5 — 批量修订 Modal

---

## 实施内容

构建一个完整的批量修订 Modal，将 Step 1+2 接受的问题汇总成结构化修订指令，提交后触发下一轮评审。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGReviewsTab.tsx` | 编辑 | +175 |

### 新增功能

#### 1. 触发按钮（"生成修订指令"）
- 位置：评审统计区，与「批量决策」「配置专家」按钮并列
- 仅在存在已接受问题时显示
- 绿色边框 + 数量徽章

#### 2. Modal 结构

**Header：**
- 标题 + 已接受总数描述

**统计行：** 4 列
- 严重 / 中等 / 轻微 各级数量
- 总计

**已接受问题列表（可滚动）：**
- 每条显示：轮次徽章 / 专家名 / severity 徽章 / 问题文本 / 建议
- 最大高度 300px

**补充修订说明（textarea）：** 可选，用户输入额外的指导

**Action 按钮：** 取消 / 提交修订（X 条）

#### 3. 提交逻辑

`submitBatchRevision` 函数：
1. 自动生成结构化指令文本（Markdown 格式）
2. 包含统计标题、用户补充说明、已接受问题列表（按轮次/severity/建议组织）
3. 通过 `onResume(false, instructions)` 提交 — 触发任务打回到下一轮评审
4. 提交后关闭 Modal、清空 feedback

#### 4. 数据收集 — `acceptedItems`

新增 `AcceptedItem` 类型，从 `decisions` 中筛选所有已接受的问题：
```typescript
type AcceptedItem = {
  key: string;
  round: number;
  severity: string;
  question: string;
  suggestion?: string;
  expert: string;
};
```

### 状态管理

新增 3 个状态：
```typescript
const [showRevisionModal, setShowRevisionModal] = useState(false);
const [revisionFeedback, setRevisionFeedback] = useState('');
const [submittingRevision, setSubmittingRevision] = useState(false);
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 接受 ≥1 个问题 → "生成修订指令" 按钮显示
  - 打开 Modal → 列表 + 统计正确
  - 提交后任务进入下一轮

---

## 下一步

Step 9: Planning P4 — Markdown 编辑器（Edit/Preview/Split 三模式）
