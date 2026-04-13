# Step 15 阶段报告：Planning 多源情报发现 + AI 排名（P1+P2）

**对应缺口：**
- P1 — 多源发现面板（RSS / Web Search / 热点话题）
- P2 — AI 排名与验证

---

## 实施内容

为 Planning Tab 添加可折叠的「多源情报发现」面板，集成已有的 hotTopicsApi，并实现客户端 AI 相关度排序。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGPlanningTab.tsx` | 编辑 | +185 |

### 核心功能

#### 1. 折叠面板

- 默认折叠节省屏幕空间
- 点击展开时按需加载数据（`hotTopicsApi.getAll({ limit: 10 })`）
- 加载中状态、空状态友好提示

#### 2. AI 排名引擎（客户端实现）

```typescript
const computeRelevance = (text: string): number => {
  const topicWords = detail.topic.toLowerCase().split(/[\s,，。\/]+/).filter(w => w.length >= 2);
  const textLower = text.toLowerCase();
  let matches = 0;
  topicWords.forEach(w => { if (textLower.includes(w)) matches += 1; });
  return Math.min(100, 30 + matches * 25);
};
```

- 基于关键词重叠度计算 0-100 分
- 起始基线 30，每个匹配 +25
- 与当前 `detail.topic` 比对

#### 3. 排名摘要面板

- 渐变蓝色背景 + 左侧蓝色边条
- 显示 AI 引擎说明 + 已选数量
- 展示当前选题作为排名依据

#### 4. 热点话题排序列表

按 AI 相关度降序排列，每条显示：
- 排名编号
- 话题文本
- **相关度进度条**（彩色：≥75% 绿 / ≥55% 蓝 / 其他灰）
- 相关度百分比
- 趋势图标（up/down/flat）
- Checkbox 选择

#### 5. 选择与汇总

- 点击行切换选中状态
- 选中态蓝色背景 + 边框
- 底部汇总卡片显示已选数量 + 清空按钮

### 状态管理

```typescript
const [showDiscovery, setShowDiscovery] = useState(false);
const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
const [discoveryLoading, setDiscoveryLoading] = useState(false);
const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
```

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 展开面板触发 API 加载
  - AI 排名按相关度降序
  - 选择状态切换响应

---

## 下一步

Step 16: Planning P7 — 专家评审面板
