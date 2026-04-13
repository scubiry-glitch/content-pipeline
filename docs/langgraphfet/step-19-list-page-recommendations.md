# Step 19 阶段报告：列表页智能推荐（素材推荐 + 专家匹配）

**对应缺口：** 列表页 14-15 — 创建弹窗的智能素材推荐和专家匹配

---

## 实施内容

为 LangGraphTasks 页面的创建任务弹窗添加智能推荐区域，根据用户输入的选题自动推荐相关素材和匹配专家。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/LangGraphTasks.tsx` | 编辑 | +110 |

### 核心功能

#### 1. 防抖搜索

```typescript
useEffect(() => {
  if (!showCreate || !topic.trim() || topic.trim().length < 3) {
    setRecommendedAssets([]);
    setMatchedExperts([]);
    return;
  }
  const t = setTimeout(async () => { ... }, 600);
  return () => clearTimeout(t);
}, [showCreate, topic]);
```

- 600ms 防抖
- 触发条件：弹窗打开 + topic ≥ 3 字符

#### 2. 素材推荐

- 调用 `assetsApi.search(关键词)`（取 topic 第一个分词）
- 显示前 3 个素材
- 每条显示：图标 + 标题（截断）+ 质量分（绿/橙）

#### 3. 专家匹配

- 调用 `matchExperts({ topic, importance: 0.7 })`
- 显示 1-3 位专家（领域 + 特级）
- 专家胶囊：首字母头像 + 名称
- 特级专家黄色边框 + ★ 标记

### UI 特点

- 加载态显示「🔍 正在匹配相关素材和专家...」
- 推荐区域插入在错误提示之上
- 限制高度避免弹窗溢出
- 与既有创建弹窗设计风格一致

### 状态管理

```typescript
const [recommendedAssets, setRecommendedAssets] = useState<Asset[]>([]);
const [matchedExperts, setMatchedExperts] = useState<Expert[]>([]);
const [searchingRecs, setSearchingRecs] = useState(false);
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 输入 ≥3 字符触发推荐
  - 防抖正常
  - 素材/专家显示

---

## 下一步

Step 20: Quality Q6 — DeepAnalysisPanel
