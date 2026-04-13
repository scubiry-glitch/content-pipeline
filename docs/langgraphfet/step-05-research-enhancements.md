# Step 5 阶段报告：Research 增强（Re6+Re7+Re8）

**对应缺口：**
- Re6 — 引用与可靠性分级（A/B/C/D）
- Re7 — 工具操作栏
- Re8 — Stage 标题头部 + 策略折叠

---

## 实施内容

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGResearchTab.tsx` | 编辑 | +180 |

### Re8 — Stage 标题头部

- 渐变背景 + 左侧蓝色边条
- "STAGE 2" 徽章 + 标题 "深度研究" + 副标题
- 「查看策略 / 隐藏策略」切换按钮
- 折叠的研究策略说明区（多源采集、事实交叉验证、洞察提炼、可信度评级）

### Re7 — 工具操作栏

页面顶部新增工具栏，展示：
- 数据来源数量
- 洞察数量
- A 级来源数量（彩色突出）
- 「刷新数据」按钮（带加载态）

### Re6 — 引用可靠性分级

1. **可靠度评级函数 `getReliabilityGrade`**：
   - A 级 ≥85%（绿）
   - B 级 ≥70%（蓝）
   - C 级 ≥50%（橙）
   - D 级 <50%（红）

2. **数据表新增"等级"列**：
   - 24x24 方形徽章显示 A/B/C/D
   - 颜色与可靠度等级一致
   - 边框 + 背景配色

3. **数据来源标题栏新增分级摘要**：
   - 实时显示 A/B/C/D 各级数量徽章

### 状态管理

```typescript
const [showStrategy, setShowStrategy] = useState(false);
const [refreshing, setRefreshing] = useState(false);
```

---

## 验证

- ✅ TypeScript 类型检查通过

---

## 下一步

Step 6: 列表页全面增强（状态筛选/卡片增强/删除/数据持久化）
