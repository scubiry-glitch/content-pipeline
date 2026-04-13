# Step 17 阶段报告：Research 多源引擎 + 语义搜索 + 可信度（Re2-Re4）

**对应缺口：**
- Re2 — 三数据源面板（Web/RSS/Private Assets）
- Re3 — 语义搜索资产推荐
- Re4 — 数据可信度评分

---

## 实施内容

为 Research Tab 添加可折叠的「多源数据引擎」面板，集成 RSS / 热点话题 / 资产搜索三大数据源。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGResearchTab.tsx` | 编辑 | +185 |

### Re2 — 三数据源摘要卡片

3 列网格（自适应）：
- **RSS 订阅源**（蓝色边）— `rssSourcesApi.getAll()` 拿数量
- **热点话题**（红色边）— `hotTopicsApi.getAll({ limit: 8 })`
- **私有素材**（绿色边）— `assetsApi.search()` 用主题首关键词

每张卡片显示：图标 + 大数字 + 描述。

### Re3 — 语义搜索

- 输入框 + 搜索按钮
- 回车键触发
- 调用 `assetsApi.search(query)`
- 加载态文本反馈

### Re4 — 可信度评级

```typescript
const getAssetCredibility = (asset: Asset) => {
  const score = asset.quality_score || 50;
  if (score >= 85) return { grade: 'A', color: '#22c55e' };
  if (score >= 70) return { grade: 'B', color: '#3b82f6' };
  if (score >= 50) return { grade: 'C', color: '#f59e0b' };
  return { grade: 'D', color: '#ef4444' };
};
```

资产列表每行显示：
- 32x32 等级方形徽章（A/B/C/D）
- 资产标题
- 元信息：类型 + 可信度% + 标签前 2 个

### 状态管理

```typescript
const [showMultiSource, setShowMultiSource] = useState(false);
const [rssCount, setRssCount] = useState<number>(0);
const [hotTopicsList, setHotTopicsList] = useState<any[]>([]);
const [recommendedAssets, setRecommendedAssets] = useState<Asset[]>([]);
const [multiSourceLoading, setMultiSourceLoading] = useState(false);
const [assetSearchQuery, setAssetSearchQuery] = useState('');
const [searching, setSearching] = useState(false);
```

按需加载（折叠展开时触发）。

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 展开面板触发数据加载
  - 搜索框工作正常
  - 可信度评级正确分级

---

## 下一步

Step 18: Research Re5 — 数据处理面板
