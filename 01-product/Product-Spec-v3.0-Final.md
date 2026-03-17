# 产品规格: 内容质量输入体系 v3.0 (Final)

**版本**: v3.0 Final
**日期**: 2026-03-18
**状态**: ✅ 已完成 (7轮迭代, 192 tests)
**负责人**: 产品研发运营协作体系

---

## 1. 版本概述

### 1.1 背景
v2.0实现了内容生成流水线，但输出质量受限于输入质量 —— garbage in, garbage out。

### 1.2 目标
构建多维度内容质量输入体系，确保每条内容都有：
- 高质量信息源
- 差异化视角
- 可信度验证
- 受众匹配度分析

### 1.3 成功标准 (已达成)

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 核心测试通过率 | 100% | 149/149 | ✅ |
| RSS源覆盖 | 20+ | 24 | ✅ |
| 质量维度 | 4个 | 4个 | ✅ |
| Dashboard UI | 1个 | 1个 | ✅ |

---

## 2. 已实现功能清单

### 2.1 第一轮: NewsAggregator (21 tests)

**功能**:
- ✅ RSS源管理 (24个源, 7类别)
- ✅ 定时抓取策略 (P0/P1/P2分级)
- ✅ 热点发现算法 (velocity × authority × sentiment × freshness)
- ✅ 事实核查基础 (数据点提取、交叉验证)
- ✅ 差异化分析 (竞品监控、空白发现)

**核心算法**:
```typescript
hotScore = (velocity × 0.3 + authority × 10 × 0.3 + |sentiment| × 100 × 0.2) × freshness
```

**文件**: `content-pipeline/news-aggregator.test.ts`

---

### 2.2 第二轮: AudienceMatcher (21 tests)

**功能**:
- ✅ 阅读难度评估 (beginner/intermediate/advanced)
- ✅ 术语密度计算
- ✅ 受众画像匹配
- ✅ 平台适配建议 (微信/即刻/Twitter/知乎)

**支持平台**:
| 平台 | 内容特点 | 优化重点 |
|------|----------|----------|
| 公众号 | 深度长文 | 标题吸引力、开篇钩子 |
| 知乎 | 问答式、专业 | 结构清晰、引用权威 |
| 即刻 | 短平快 | 金句提炼、观点鲜明 |
| Twitter/X | 碎片化 | 线程组织、关键数据 |

**文件**: `content-pipeline/audience-matcher.test.ts`

---

### 2.3 第三轮: QualityDashboard (22 tests)

**功能**:
- ✅ 综合质量评分 (0-100)
- ✅ 四维度评估 (时效性/可信度/差异化/受众匹配)
- ✅ 实时预警系统
- ✅ 优化建议生成
- ✅ 趋势追踪

**质量维度权重**:
| 维度 | 权重 | 评估因素 |
|------|------|----------|
| 时效性 | 25% | 发布时间、更新频率 |
| 可信度 | 25% | 来源权威性、交叉验证 |
| 差异化 | 25% | 竞品对比、原创性 |
| 受众匹配 | 25% | 难度适配、平台适配 |

**文件**: `content-pipeline/quality-dashboard.test.ts`

---

### 2.4 第四轮: DashboardUI (14 tests)

**功能**:
- ✅ 响应式可视化界面
- ✅ 实时数据展示
- ✅ 热点话题列表
- ✅ RSS源状态监控
- ✅ 内容分析器 (粘贴即分析)

**入口**: `content-pipeline/dashboard/index.html`

**技术栈**: HTML5 + CSS3 + Vanilla JS

---

### 2.5 第五轮: ContentGenerationIntegration (18 tests)

**功能**:
- ✅ 热点数据注入生成提示词
- ✅ 质量约束构建
- ✅ 最优切入角度选择
- ✅ 语言风格适配
- ✅ 生成前质量检查
- ✅ 生成后内容验证
- ✅ 质量反馈循环

**核心流程**:
```
热点数据 → 提示词增强 → 质量约束 → 角度选择 → 风格适配
                                              ↓
质量报告 ← 后验证 ← 数据标记 ← 生成内容 ← AI生成
                                              ↓
                                         发布 → 反馈收集 → 算法优化
```

**文件**: `content-pipeline/content-generation-integration.test.ts`

---

### 2.6 第六轮: RSSDatabaseIntegration (31 tests)

**功能**:
- ✅ 数据库Schema设计 (3表)
- ✅ RSS文章存储与查询
- ✅ 热点话题管理
- ✅ 源状态跟踪
- ✅ 批量抓取与并发控制
- ✅ 内容清洗与编码检测

**数据库表**:
```sql
-- rss_articles: 文章存储
-- rss_sources: 源状态跟踪
-- hot_topics: 热点话题
```

**文件**: `content-pipeline/rss-database-integration.test.ts`

---

### 2.7 第七轮: 素材智能复用 (v3.0.1-3.0.3) (13 tests)

**功能**:
- ✅ 写作场景素材推荐 (v3.0.1)
- ✅ 素材引用统计 (v3.0.2)
- ✅ 智能标签补全 (v3.0.3)

**v3.0.1 写作场景素材推荐**:
```typescript
// 输入监听 + 语义匹配
function recommendAssets(inputText: string): Asset[] {
  const keywords = extractKeywords(inputText);
  return assets.filter(asset =>
    semanticMatch(asset.tags, keywords) > 0.3
  ).sort(byRelevance).slice(0, 5);
}
```
- 防抖处理500ms
- 推荐准确率>70%
- 一键插入引用

**v3.0.2 素材引用统计**:
```typescript
interface AssetUsage {
  assetId: string;
  quoteCount: number;
  lastUsedAt: string;
  usedInTasks: string[];
}
```
- 引用计数准确
- 使用历史可追溯
- 热门素材Top10

**v3.0.3 智能标签补全**:
- 从标题/内容/来源自动提取标签
- 标签准确率>80%
- 批量自动打标签

**文件**:
- `webapp/src/components/AssetRecommendPanel.tsx`
- `webapp/src/hooks/useAssetRecommendation.ts`
- `webapp/src/services/assetUsageService.ts`
- `webapp/src/services/autoTagService.ts`

---

## 3. RSS源配置

**配置文件**: `content-pipeline/config/rss-sources.json`

| 类别 | 数量 | 代表源 | 优先级 |
|------|------|--------|--------|
| tech (科技) | 5 | 36氪(P0)、机器之心(P0)、虎嗅、雷锋网、极客公园 | P0/P1 |
| finance (财经) | 5 | 财新(P0)、第一财经(P0)、华尔街见闻、财联社、证券时报 | P0/P1/P2 |
| general (综合) | 2 | 澎湃新闻、界面新闻 | P1 |
| international (国际) | 2 | TechCrunch、The Verge | P1/P2 |
| industry (行业) | 5 | 新浪科技、凤凰网科技、IT之家、创业邦、21世纪经济报道 | P1/P2 |
| research (研究) | 3 | 199IT互联网数据中心(P0)、艾瑞咨询、易观分析 | P0/P1/P2 |
| social (社交媒体) | 2 | 知乎日报、果壳 | P2 |

**总计**: 24个源

---

## 4. API 接口

### 4.1 内部模块接口

| 模块 | 主要方法 |
|------|----------|
| NewsAggregator | `aggregate()`, `getHotTopics()`, `addSource()` |
| FactChecker | `verifyDataPoint()`, `crossVerify()`, `calculateCredibility()` |
| DifferentiationAnalyzer | `analyzeOriginality()`, `findContentGaps()`, `similarityScore()` |
| AudienceMatcher | `assessDifficulty()`, `calculateTermDensity()`, `matchAudience()` |
| QualityDashboard | `getOverallScore()`, `getAlerts()`, `getSuggestions()` |
| ContentGenerationIntegration | `enrichPromptWithHotData()`, `buildQualityConstraints()`, `verifyGeneratedContent()` |
| RSSDatabaseIntegration | `saveArticle()`, `getLatestArticles()`, `discoverHotTopics()` |
| RSSFetcher | `parseRSS()`, `parseAtom()`, `fetchBatch()` |
| RSSPipeline | `runFetchCycle()`, `createSchedule()` |

### 4.2 REST API (预留)

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v3/hot-topics` | GET | 获取热点话题 |
| `/api/v3/articles` | GET | 获取文章列表 |
| `/api/v3/quality-score` | GET | 获取质量评分 |
| `/api/v3/sources` | GET | 获取RSS源状态 |

---

## 5. 数据库 Schema

详见: `content-pipeline/database/schema.md`

**核心表**:
- `rss_articles`: 文章主表
- `rss_sources`: 源状态表
- `hot_topics`: 热点话题表
- `user_behaviors` (v3.1): 用户行为
- `user_profiles` (v3.1): 用户画像

---

## 6. 文件结构

```
content-pipeline/
├── dashboard/                    # UI界面
│   ├── index.html               # 主页面
│   ├── app.js                   # 前端逻辑
│   └── styles.css               # 样式
├── services/
│   └── RSSFeedManager.ts        # RSS服务
├── config/
│   └── rss-sources.json         # 源配置
├── database/
│   └── schema.md                # 数据库文档
├── server.js                    # 本地服务器
├── news-aggregator.test.ts      # 21 tests
├── audience-matcher.test.ts     # 21 tests
├── quality-dashboard.test.ts    # 22 tests
├── content-generation-integration.test.ts  # 18 tests
├── rss-database-integration.test.ts        # 31 tests
└── smart-recommender.test.ts    # v3.1, 30 tests
```

---

## 7. 测试统计

| 轮次 | 模块 | 测试数 | 状态 |
|------|------|--------|------|
| 1 | NewsAggregator | 21 | ✅ |
| 2 | AudienceMatcher | 21 | ✅ |
| 3 | QualityDashboard | 22 | ✅ |
| 4 | DashboardUI | 14 | ✅ |
| 5 | ContentGenerationIntegration | 18 | ✅ |
| 6 | RSSDatabaseIntegration | 31 | ✅ |
| v3.1-1 | SmartRecommender | 30 | ✅ |
| v3.0.1 | 写作场景素材推荐 | 5 | ✅ |
| v3.0.2 | 素材引用统计 | 4 | ✅ |
| v3.0.3 | 智能标签补全 | 4 | ✅ |
| **累计** | **10模块** | **192** | **✅** |

---

## 8. GitHub提交记录

- [第一轮](https://github.com/scubiry-glitch/content-pipeline/commit/66b0421): NewsAggregator
- [第二轮](https://github.com/scubiry-glitch/content-pipeline/commit/341592c): AudienceMatcher
- [第三轮](https://github.com/scubiry-glitch/content-pipeline/commit/182195d): QualityDashboard
- [第四轮](https://github.com/scubiry-glitch/content-pipeline/commit/1407f72): DashboardUI
- [第五轮](https://github.com/scubiry-glitch/content-pipeline/commit/05882eb): ContentGenerationIntegration
- [第六轮](https://github.com/scubiry-glitch/content-pipeline/commit/41820ed): RSSDatabaseIntegration
- [v3.1第一轮](https://github.com/scubiry-glitch/content-pipeline/commit/df7d01e): SmartRecommender
- [v3.0 Enhanced](https://github.com/scubiry-glitch/content-pipeline/commit/f38387b): 素材智能复用 (v3.0.1-3.0.3)

---

## 9. 使用指南

### 启动仪表盘
```bash
cd content-pipeline
node server.js
# 访问 http://localhost:8080
```

### 运行测试
```bash
cd content-pipeline
npm test
```

---

## 10. 相关文档

- WHY: `/Users/行业研究/demo-project/WHY.md`
- v3.1规划: `./Product-Spec-v3.1.md`
- CHANGELOG: `../CHANGELOG-v3.0.md`
- API文档: `../03-architecture/API-Spec.yaml`

---

**状态**: 已冻结归档
**归档日期**: 2026-03-18
**归档版本**: v3.0.0+v3.0 Enhanced
