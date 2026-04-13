# Step 11 阶段报告：Research 多源引擎配置 UI（Re1）

**对应缺口：** Research Re1 — 多源引擎配置 UI

---

## 实施内容

新增完整的研究引擎配置面板，支持数据源选择、参数调整和关键词管理，配置以 localStorage 持久化。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGResearchTab.tsx` | 编辑 | +200 |

### 数据模型

```typescript
interface ResearchConfig {
  autoCollect: boolean;
  maxResults: number;
  minCredibility: number;  // 0-1
  timeRange: '7d' | '30d' | '90d' | '1y';
  keywords: string[];
  excludeKeywords: string[];
  sources: { web; rss; assets; hotTopics };
}
```

### UI 组件

#### 1. 研究配置按钮
- 头部新增「研究配置」按钮，与「查看策略」按钮并列
- 选中态背景蓝色高亮

#### 2. 配置面板（折叠）

**数据源开关（4 个 toggle 卡片）：**
- 🌐 全网搜索（Tavily AI）
- 📡 RSS 订阅
- 📚 私有素材（向量库）
- 🔥 热点话题

每个卡片包含图标+标签+描述，选中态颜色高亮。

**参数配置（4 列网格）：**
- 自动采集开关
- 最大结果数（5-50）
- 最低可信度滑块（0-100%，实时显示百分比）
- 时间范围下拉（7d/30d/90d/1y）

**关键词输入：**
- 关键词（CSV 格式）
- 排除关键词

#### 3. 持久化

按 threadId 隔离保存到 localStorage：
- `loadResearchConfig(threadId)`
- `saveResearchConfig(threadId, config)`

合并默认配置以兼容字段缺失情况。

### 状态管理

```typescript
const [showConfig, setShowConfig] = useState(false);
const [config, setConfig] = useState<ResearchConfig>(DEFAULT_RESEARCH_CONFIG);
const [keywordsInput, setKeywordsInput] = useState('');
const [excludeInput, setExcludeInput] = useState('');
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 配置切换 → 数据源开关响应
  - 滑块/输入响应正确
  - 保存配置 → 关闭面板 → 重新打开后保留

---

## 下一步

Step 12: Writing W3+W4 — 修订时间线 + 版本对比
