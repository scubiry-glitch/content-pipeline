# Step 14 阶段报告：Reviews 顺序评审面板（R7）

**对应缺口：** Reviews R7 — SequentialPanel（按专家组织的顺序评审视图）

---

## 实施内容

为 Reviews Tab 添加视图切换 Tab，提供两种数据组织方式：
- **并行评审** — 默认，按轮次组织（横向：每轮所有专家的意见）
- **顺序评审** — 按专家组织（纵向：每个专家跨多轮的所有意见）

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGReviewsTab.tsx` | 编辑 | +160 |

### Tab 切换 UI

- 位于评审区域顶部
- 两个 tab 按钮带图标（view_module / view_stream）
- 选中态下划线 + 颜色高亮

### Sequential View 实现

#### 数据重组

```typescript
type SeqItem = { round: number; index: number; q: any; expert: string };

// 1. 展平所有问题
rounds.forEach((round) => {
  round.questions.forEach((q, j) => {
    allItems.push({ round: round.round, index: j, q, expert: q.expertName || ... });
  });
});

// 2. 按 expert 分组
const byExpert: Record<string, SeqItem[]> = {};
allItems.forEach((it) => {
  if (!byExpert[it.expert]) byExpert[it.expert] = [];
  byExpert[it.expert].push(it);
});
```

#### 渲染

每个专家分组：
- **专家头部**: 渐变背景 + 图标 + 名称 + 统计（"X 条意见 · 跨 Y 轮评审"）
- **问题列表**（缩进 20px）:
  - R1/R2/R3 轮次徽章
  - severity 徽章
  - 决策状态徽章（与 Step 1 共享）
  - 问题文本
  - 建议（如有）

### 与既有功能集成

- 复用 Step 1+2 的 `decisions` 状态 — 顺序视图中也显示决策徽章
- 复用 `getQuestionKey` 生成稳定 key
- 已忽略问题 opacity: 0.6 视觉降级
- 复用 `EXPERT_STYLES` / `SEVERITY_STYLES` 配色

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 视图切换：并行 ↔ 顺序
  - 顺序视图正确按专家分组
  - 决策状态在两个视图中一致

---

## 下一步

Step 15: Planning P1+P2 — 多源发现 + AI 排名
