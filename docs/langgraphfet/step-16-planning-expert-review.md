# Step 16 阶段报告：Planning 专家评审面板（P7）

**对应缺口：** Planning P7 — 专家评审面板

---

## 实施内容

集成已有的 expertService 实现完整的专家评审面板：智能匹配 + 观点生成。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGPlanningTab.tsx` | 编辑 | +145 |

### 核心流程

```
点击「生成专家评审」
  ↓
matchExperts({ topic, importance: 0.7 })
  → 返回 domainExperts + seniorExpert
  ↓
outline → markdown 文本
  ↓
对每个专家调用 generateExpertOpinion(expert, text, 'outline')
  → 返回 ExpertReview { opinion, suggestions, confidence, ... }
  ↓
渲染专家列表 + 评审意见
```

### UI 组件

#### 1. 折叠面板触发

- 标题 + 展开/收起图标
- 副标题：「基于专家库智能匹配并生成大纲评审意见」

#### 2. 触发按钮（无评审时）

- 中央居中按钮 + 提示文案
- 点击后进入加载态

#### 3. 匹配专家列表

- 卡片化展示（最多 5 个）
- 头像（首字母 + 渐变背景）
- 特级专家黄色边框 vs 领域专家普通边框
- 名称 + 等级 + 采纳率
- 重新生成按钮

#### 4. 专家评审卡片

每位专家一张评审卡片：
- 头部：图标 + 专家名 + 置信度 + 差异化标签
- 评审观点（opinion 文本）
- 改进建议（带左侧主色边条的列表）

### 状态管理

```typescript
const [showExpertReview, setShowExpertReview] = useState(false);
const [matchedExperts, setMatchedExperts] = useState<Expert[]>([]);
const [expertReviews, setExpertReviews] = useState<ExpertReview[]>([]);
const [generatingReviews, setGeneratingReviews] = useState(false);
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 点击生成 → 加载态 → 显示专家与评审
  - 重新生成 → 替换内容
  - 折叠/展开正常

---

## 下一步

Step 17: Research Re2-Re4 — 多源引擎/语义搜索/可信度
