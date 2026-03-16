# 内容生产流水线 v3.0 版本更新说明

**版本**: v3.0
**发布日期**: 2026-03-16
**累计测试**: 149/149 passed

---

## 📋 版本概览

v3.0聚焦**内容质量输入体系**，构建从信息抓取、质量评估到内容生成的完整链路。共完成6轮迭代，新增127个测试用例。

```
迭代路线图:
[RSS源配置] → [新闻抓取] → [事实核查] → [差异化分析] → [受众匹配]
                                                    ↓
[内容生成] ← [质量注入] ← [生成联动] ← [质量仪表盘]
                                                    ↓
                                        [数据库集成 + 实时抓取]
```

---

## 🎯 六轮迭代总览

| 轮次 | 模块 | 测试数 | 核心功能 |
|------|------|--------|----------|
| 1 | NewsAggregator | 21 | RSS聚合、热点发现、事实核查、差异化分析 |
| 2 | AudienceMatcher | 21 | 阅读难度评估、术语密度、平台适配 |
| 3 | QualityDashboard | 22 | 综合质量评分、实时预警、优化建议 |
| 4 | DashboardUI | 14 | 可视化仪表盘、实时数据展示 |
| 5 | ContentGenerationIntegration | 18 | 质量数据注入生成流程、反馈循环 |
| 6 | RSSDatabaseIntegration | 31 | 数据库Schema、RSS抓取、热点存储 |

---

## 🚪 功能入口清单

### 1. 可视化仪表盘 (Dashboard)

**入口文件**: `content-pipeline/dashboard/index.html`

| 功能区域 | 入口位置 | 说明 |
|----------|----------|------|
| 综合质量分数 | 主面板顶部 | 78分基准，实时更新 |
| 时效性监控 | 四大维度卡片 | 新鲜度评分(0-100) |
| 可信度监控 | 四大维度卡片 | 来源可信度评分 |
| 差异化监控 | 四大维度卡片 | 竞品差异化评分 |
| 受众匹配 | 四大维度卡片 | 读者匹配度评分 |
| 🔥 热点话题 | 左上面板 | 实时热点TOP10 |
| ⚠️ 实时预警 | 左上面板旁 | 质量预警与建议 |
| 📰 RSS源状态 | 右下面板 | 24个源健康状态 |
| 💡 优化建议 | 右下面板旁 | AI优化建议列表 |
| 📝 内容分析器 | 底部面板 | 粘贴内容即时分析 |

**打开方式**:
```bash
# 方式1: 直接打开
open content-pipeline/dashboard/index.html

# 方式2: 启动本地服务器
cd content-pipeline/dashboard && python -m http.server 8080
# 访问 http://localhost:8080
```

---

### 2. 新闻抓取模块 (NewsAggregator)

**入口文件**: `content-pipeline/news-aggregator.test.ts`

| 类 | 入口方法 | 功能 |
|----|----------|------|
| `NewsAggregator` | `aggregate()` | 聚合多源新闻 |
| | `getHotTopics(limit)` | 获取热点话题 |
| | `addSource(source)` | 添加RSS源 |
| `FactChecker` | `verifyDataPoint(claim)` | 验证数据点 |
| | `crossVerify(claim, sources)` | 多源交叉验证 |
| | `calculateCredibility(source)` | 计算可信度 |
| `DifferentiationAnalyzer` | `analyzeOriginality(content)` | 原创性分析 |
| | `findContentGaps(competitors)` | 发现内容空白 |
| | `similarityScore(a, b)` | 相似度计算 |

**热点发现算法**:
```typescript
hotScore = (velocity × 0.3 + authority × 10 × 0.3 + |sentiment| × 100 × 0.2) × freshness
```

---

### 3. 受众匹配模块 (AudienceMatcher)

**入口文件**: `content-pipeline/audience-matcher.test.ts`

| 类 | 入口方法 | 功能 |
|----|----------|------|
| `AudienceMatcher` | `assessDifficulty(content)` | 评估阅读难度 |
| | `calculateTermDensity(content)` | 计算术语密度 |
| | `matchAudience(content, profiles)` | 匹配受众画像 |
| | `getPlatformSuggestions(content)` | 平台适配建议 |

**受众分级**:
- `beginner`: 入门级，低密度术语
- `intermediate`: 进阶级，中等密度
- `advanced`: 专家级，高密度术语

**支持平台**: 微信公众号、即刻、Twitter、知乎

---

### 4. 质量仪表盘模块 (QualityDashboard)

**入口文件**: `content-pipeline/quality-dashboard.test.ts`

| 类 | 入口方法 | 功能 |
|----|----------|------|
| `QualityDashboard` | `getOverallScore()` | 获取综合质量分 |
| | `getAlerts()` | 获取实时预警 |
| | `getSuggestions()` | 获取优化建议 |
| | `trackTrend(metric, days)` | 趋势追踪 |

**质量维度权重**:
| 维度 | 权重 | 评估因素 |
|------|------|----------|
| 时效性 | 25% | 发布时间、更新频率 |
| 可信度 | 25% | 来源权威性、交叉验证 |
| 差异化 | 25% | 竞品对比、原创性 |
| 受众匹配 | 25% | 难度适配、平台适配 |

---

### 5. 内容生成联动模块 (ContentGenerationIntegration)

**入口文件**: `content-pipeline/content-generation-integration.test.ts`

| 类 | 入口方法 | 功能 |
|----|----------|------|
| `ContentGenerationIntegration` | `enrichPromptWithHotData(prompt, topic)` | 热点数据注入提示词 |
| | `buildQualityConstraints(context)` | 构建质量约束 |
| | `selectOptimalAngle(differentiation)` | 选择切入角度 |
| | `adaptStyleForAudience(audience)` | 调整语言风格 |
| | `preGenerationCheck(input)` | 生成前质量检查 |
| | `verifyGeneratedContent(content)` | 生成后验证 |
| `QualityFeedbackLoop` | `collectFeedback(content)` | 收集发布反馈 |
| | `analyzeCorrelation(data)` | 分析质量与表现相关性 |
| | `calculateAdjustment(feedback)` | 算法参数调优 |

**生成流程**:
```
热点数据 → 提示词增强 → 质量约束 → 角度选择 → 风格适配
                                              ↓
质量报告 ← 后验证 ← 数据标记 ← 生成内容 ← AI生成
                                              ↓
                                         发布 → 反馈收集 → 算法优化
```

---

### 6. RSS数据库集成模块 (RSSDatabaseIntegration)

**入口文件**: `content-pipeline/rss-database-integration.test.ts`

#### 6.1 数据库操作 (RSSDatabaseIntegration)

| 方法 | 功能 |
|------|------|
| `initSchema()` | 初始化数据库Schema |
| `saveArticle(article)` | 存储RSS文章 |
| `getLatestArticles(limit)` | 获取最新文章 |
| `searchArticles(keyword)` | 关键词搜索 |
| `updateSourceLastFetch(id, time)` | 更新源抓取时间 |
| `recordSourceError(id, error)` | 记录源错误 |
| `getSourcesNeedingFetch()` | 获取待抓取源 |
| `saveHotTopic(topic)` | 存储热点话题 |
| `getTodayHotTopics()` | 获取今日热点 |
| `getArticleStats()` | 文章统计 |
| `getSourceHealth()` | 源健康状态 |

#### 6.2 RSS抓取器 (RSSFetcher)

| 方法 | 功能 |
|------|------|
| `parseRSS(xml, sourceId)` | 解析RSS XML |
| `parseAtom(xml, sourceId)` | 解析Atom格式 |
| `fetchBatch(sources, options)` | 批量抓取 |
| `fetchWithRetry(url, options)` | 带重试的抓取 |
| `respectRateLimit(sourceId, interval)` | 限速控制 |
| `cleanHtml(html)` | HTML清洗 |
| `extractSummary(html, maxLength)` | 提取摘要 |
| `detectAndConvertEncoding(buffer)` | 编码检测转换 |

#### 6.3 RSS流水线 (RSSPipeline)

| 方法 | 功能 |
|------|------|
| `runFetchCycle()` | 执行完整抓取周期 |
| `discoverHotTopics()` | 发现热点话题 |
| `getHotTopicsByCategory()` | 按类别聚合热点 |
| `createSchedule(cron)` | 创建定时任务 |
| `triggerManualFetch(sourceIds)` | 手动触发抓取 |

**数据库Schema**:
- `rss_articles` - 文章存储
- `rss_sources` - 源状态跟踪
- `hot_topics` - 热点话题

---

### 7. RSS源配置

**配置文件**: `content-pipeline/config/rss-sources.json`

| 类别 | 数量 | 代表源 |
|------|------|--------|
| tech (科技) | 5 | 36氪(P0)、机器之心(P0)、虎嗅、雷锋网、极客公园 |
| finance (财经) | 5 | 财新(P0)、第一财经(P0)、华尔街见闻、财联社、证券时报 |
| general (综合) | 2 | 澎湃新闻、界面新闻 |
| international (国际) | 2 | TechCrunch、The Verge |
| industry (行业) | 5 | 新浪科技、凤凰网科技、IT之家、创业邦、21世纪经济报道 |
| research (研究) | 3 | 199IT互联网数据中心(P0)、艾瑞咨询、易观分析 |
| social (社交媒体) | 2 | 知乎日报、果壳 |

**优先级说明**:
- `P0`: 核心源，15分钟抓取间隔
- `P1`: 重要源，30分钟抓取间隔
- `P2`: 普通源，60分钟抓取间隔

---

### 8. RSS服务管理器

**入口文件**: `content-pipeline/services/RSSFeedManager.ts`

| 方法 | 功能 |
|------|------|
| `loadConfig()` | 加载源配置 |
| `getActiveSources()` | 获取活跃源 |
| `getCoreSources()` | 获取P0核心源 |
| `getSourcesByCategory(category)` | 按类别获取 |
| `addSource(source)` | 添加新源 |
| `updateSourceStatus(id, status)` | 更新源状态 |
| `fetchArticles(sourceId)` | 抓取文章 |
| `fetchAllArticles()` | 抓取所有源 |
| `filterByKeywords(articles, keywords)` | 关键词过滤 |
| `calculateHotScore(article, source)` | 计算热点分数 |
| `discoverHotTopics(limit)` | 发现热点 |
| `getStats()` | 统计信息 |
| `generateReport()` | 生成报告 |

---

## 📊 数据流图

```
┌─────────────────────────────────────────────────────────────────┐
│                         内容质量输入体系                          │
└─────────────────────────────────────────────────────────────────┘

[ RSS源层 ]          [ 数据处理层 ]           [ 质量评估层 ]
     │                      │                       │
     ▼                      ▼                       ▼
┌─────────┐    ┌─────────────────────┐    ┌─────────────────┐
│ 24个RSS │───▶│ RSSFetcher          │───▶│ FactChecker     │
│ 7个类别 │    │ - RSS/Atom解析       │    │ - 数据点验证    │
│ 3级优先 │    │ - 并发控制           │    │ - 交叉验证      │
└─────────┘    │ - 内容清洗           │    │ - 可信度评分    │
               └─────────────────────┘    └─────────────────┘
                        │                          │
                        ▼                          ▼
               ┌─────────────────────┐    ┌─────────────────┐
               │ RSSDatabase         │◀───│ Differentiation │
               │ - 文章存储          │    │ Analyzer        │
               │ - 热点存储          │    │ - 竞品监控      │
               │ - 源状态跟踪        │    │ - 原创性分析    │
               └─────────────────────┘    │ - 空白发现      │
                        │                 └─────────────────┘
                        ▼
               ┌─────────────────────┐
               │ RSSPipeline         │
               │ - 定时抓取          │
               │ - 热点发现          │
               │ - 质量计算          │
               └─────────────────────┘
                        │
                        ▼
[ 应用层 ]             [ 展示层 ]              [ 生成层 ]
     │                      │                       │
     ▼                      ▼                       ▼
┌─────────┐    ┌─────────────────────┐    ┌─────────────────┐
│ Dashboard│◀───│ QualityDashboard    │───▶│ ContentGen      │
│ - UI展示 │    │ - 综合评分          │    │ Integration     │
│ - 实时刷 │    │ - 预警系统          │    │ - 提示词增强    │
│ - 分析器 │    │ - 优化建议          │    │ - 质量约束      │
└─────────┘    └─────────────────────┘    │ - 风格适配      │
                                          └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ QualityFeedback │
                                          │ Loop            │
                                          │ - 反馈收集      │
                                          │ - 相关性分析    │
                                          │ - 算法优化      │
                                          └─────────────────┘
```

---

## 🚀 快速开始

### 启动仪表盘
```bash
cd content-pipeline/dashboard
open index.html
```

### 运行测试
```bash
cd content-pipeline
npm test
```

### 查看数据库Schema
```bash
cat content-pipeline/database/schema.md
```

### 查看RSS配置
```bash
cat content-pipeline/config/rss-sources.json
```

---

## 📈 版本统计

| 指标 | 数值 |
|------|------|
| 总测试数 | 149 |
| 通过率 | 100% |
| 新增模块 | 6 |
| RSS源数 | 24 |
| 数据库表 | 3 |
| UI页面 | 1 |
| GitHub提交 | 6轮 |

---

## 🔗 GitHub提交记录

- [第一轮](https://github.com/scubiry-glitch/content-pipeline/commit/66b0421): NewsAggregator (21 tests)
- [第二轮](https://github.com/scubiry-glitch/content-pipeline/commit/341592c): AudienceMatcher (21 tests)
- [第三轮](https://github.com/scubiry-glitch/content-pipeline/commit/182195d): QualityDashboard (22 tests)
- [第四轮](https://github.com/scubiry-glitch/content-pipeline/commit/1407f72): DashboardUI (14 tests)
- [第五轮](https://github.com/scubiry-glitch/content-pipeline/commit/05882eb): ContentGenerationIntegration (18 tests)
- [第六轮](https://github.com/scubiry-glitch/content-pipeline/commit/41820ed): RSSDatabaseIntegration (31 tests)

---

*文档版本: v3.0.0*
*最后更新: 2026-03-16*
