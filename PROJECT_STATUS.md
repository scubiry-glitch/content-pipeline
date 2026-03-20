# 项目状态总览 - 内容生产流水线

**最后更新**: 2026-03-16
**项目路径**: `/Users/行业研究/demo-project/`
**代码路径**: `/Users/行业研究/demo-project/content-pipeline/`

---

## 🎯 项目阶段

```
[立项] ──▶ [访谈] ──▶ [研讨] ──▶ [冻结] ──▶ [开发] ──▶ [归档]
   ✓         ✓         ✓         ⬜         ⬜         ⬜
```

**当前阶段**: v3.0 第五轮迭代完成 (ContentGenerationIntegration 内容生成联动)

---

## 📊 关键指标

| 维度 | 指标 | 现状 | 目标 |
|------|------|------|------|
| **产品** | 功能规格完成度 | 80% | 100% |
| **技术** | 核心测试通过率 | ✅ 97/97 | 100% |
| **运营** | SOP文档化 | ✅ 完成 | 100% |
| **进度** | Demo里程碑 | ⬜ 3/19 | 准时 |

---

## 📁 文档资产

### 核心文档 ✅
| 文档 | 路径 | 状态 |
|------|------|------|
| WHY | `WHY.md` | ✅ 已冻结引用 |
| 产品规格 | `01-product/Product-Spec.md` | ✅ v2.0 |
| API规格 | `03-architecture/API-Spec.yaml` | ✅ OpenAPI 3.0 |
| 内容质量输入框架 | `01-product/content-quality-input-framework.md` | 🆕 新建 |
| v3.0技术方案 | `03-architecture/v3.0-alpha-technical-design.md` | 🔄 待评审 |
| 协作指南 | `CLAUDE.md` | ✅ 已创建 |
| 文档约定 | `DOCUMENT_CONVENTIONS.md` | ✅ 已创建 |

### 运营文档 ✅
| 文档 | 路径 | 状态 |
|------|------|------|
| 权限矩阵 | `05-operations/权限矩阵.md` | ✅ |
| 运营SOP | `05-operations/运营SOP.md` | ✅ |
| 成功指标 | `05-operations/成功指标.md` | ✅ |

### 待补充 ⬜
| 文档 | 优先级 | 说明 |
|------|--------|------|
| v3.0技术方案冻结 | P0 | 架构评审后冻结 |
| 系统架构图 | P1 | ✅ 已包含在技术方案中 |
| ADR记录 | P2 | 03-architecture/ADR/ |
| 开发环境搭建 | P1 | ✅ docker-compose.yml 已创建 |
| 测试指南 | P2 | 04-development/testing.md |

---

## 💻 代码资产

### 核心实现
| 组件 | 路径 | 测试 | 状态 |
|------|------|------|------|
| ContentPipeline | `content-pipeline/pipeline.test.ts` | 22/22 ✅ | ✅ 稳定 |
| NewsAggregator | `content-pipeline/news-aggregator.test.ts` | 21/21 ✅ | ✅ 新增 |
| AudienceMatcher | `content-pipeline/audience-matcher.test.ts` | 21/21 ✅ | ✅ 新增 |
| QualityDashboard | `content-pipeline/quality-dashboard.test.ts` | 22/22 ✅ | ✅ 新增 |
| **DashboardUI** | `content-pipeline/dashboard/` | **14/14 ✅** | 🆕 **新增UI** |
| **ContentGenerationIntegration** | `content-pipeline/content-generation-integration.test.ts` | **18/18 ✅** | ✅ 新增 |
| **RSSDatabaseIntegration** | `content-pipeline/rss-database-integration.test.ts` | **31/31 ✅** | 🆕 **新增DB层** |
| extractTableName | `content-pipeline/pipeline.test.ts` | 5/5 ✅ | ✅ 稳定 |
| 连接池 | `content-pipeline/pool.ts` | 集成 | ✅ 可用 |

### 技术债务
| 问题 | 优先级 | 计划 |
|------|--------|------|
| 代码与测试同文件 | P2 | 分离到 src/ 和 tests/ |
| 缺少正式 DB Schema 文档 | P2 | 创建 database/schema.md |
| 缺少部署自动化 | P3 | CI/CD 流程 |

---

## 🚦 近期任务

### 本周 (3/17-3/23) - 内容质量优先 Sprint ✅ 完成
- [x] Day 0: 内容质量输入框架设计
- [x] Day 1-2: 新闻抓取模块 MVP (RSS聚合 + 热点发现) ✅
- [x] Day 3: 事实核查基础 (数据点验证 + 来源检查) ✅
- [x] Day 4: 竞品监控 + 差异化分析 ✅
- [x] Day 5: 读者匹配度 + 平台适配建议 ✅
- [x] Day 6-7: 整合输入质量仪表盘 ✅

### GitHub提交
- [第一轮](https://github.com/scubiry-glitch/content-pipeline/commit/66b0421): NewsAggregator + FactChecker + DifferentiationAnalyzer (21 tests)
- [第二轮](https://github.com/scubiry-glitch/content-pipeline/commit/341592c): AudienceMatcher + 改进 (21 tests)
- [第三轮](https://github.com/scubiry-glitch/content-pipeline/commit/182195d): QualityDashboard + RSS集成 + 流水线联动 (22 tests)
- [第四轮](https://github.com/scubiry-glitch/content-pipeline/commit/1407f72): DashboardUI 可视化界面 (14 tests)
- [第五轮](https://github.com/scubiry-glitch/content-pipeline/commit/05882eb): ContentGenerationIntegration 内容生成联动 (18 tests)
- [第六轮](https://github.com/scubiry-glitch/content-pipeline/commit/41820ed): RSSDatabaseIntegration 数据库集成与实时抓取 (31 tests)

### 阻塞项
| 问题 | 状态 | 负责人 |
|------|------|--------|
| 242份研报预处理 | ⬜ 等待 | 运营经理 |
| 蓝军评审标准量化 | ⬜ 等待 | 王校长 |

---

## 🔗 快速链接

| 资源 | 路径 |
|------|------|
| 原始 WHY | `docs/WHY.md` |
| 产品规格 | `01-product/Product-Spec.md` |
| API 文档 | `03-architecture/API-Spec.yaml` |
| 运营 SOP | `05-operations/运营SOP.md` |
| 代码仓库 | `content-pipeline/` |
| 质量仪表盘 | `content-pipeline/dashboard/index.html` |
| 测试状态 | `content-pipeline/TEST_STATUS.md` |
| 使用洞察 | `file:///Users/scubiry/.claude/usage-data/report.html` |

---

## 📋 目录结构

```
/Users/行业研究/demo-project/
├── WHY.md                          ⭐
├── CLAUDE.md                       ⭐
├── PROJECT_STATUS.md               ⭐ 本文件
├── DOCUMENT_CONVENTIONS.md         ⭐
├── 01-product/                     ⭐
├── 03-architecture/                ⭐
├── 05-operations/                  ⭐
├── 00-work/                        📋
├── 02-design/                      📋
├── 04-development/                 📋
├── 07-archive/                     📦
└── content-pipeline/               💻 代码
```

**图例**: ⭐核心文档  📋过程文档  💻代码  📦归档

---

*维护: 系统自动生成 + 人工更新*
*更新频率: 每日站会时*

## 2026-03-19 Assets 页面路由重构

### 变更内容
- **拆分 Assets 页面**：将原来的单页面 tab 切换改为独立的子路由结构
- **新增路由**：
  - `/assets` - 素材库（默认）
  - `/assets/reports` - 研报中心
  - `/assets/popular` - 热门素材 Top10
  - `/assets/rss` - RSS 订阅
  - `/assets/bindings` - 目录绑定

### 新文件
- `webapp/src/pages/AssetsLayout.tsx` - 布局组件，包含子导航

### 修改文件
- `webapp/src/pages/Assets.tsx` - 精简为仅素材库功能
- `webapp/src/App.tsx` - 更新为嵌套路由结构
- `webapp/src/pages/Reports.tsx` - 修复导航路径
- `webapp/src/pages/ReportCompare.tsx` - 修复导航路径
- `webapp/src/pages/ReportDetail.tsx` - 修复返回路径
- `webapp/src/pages/Dashboard.tsx` - 修复快捷入口路径
- `webapp/src/components/GlobalSearch.tsx` - 修复搜索结果路径

### 效果
- 每个子页面都有独立的 URL，可直接访问和刷新
- 浏览器前进/后退正常工作
- 导航菜单自动高亮当前子页面

## 2026-03-19 Assets 页面路由重构完成

### 变更摘要
将 `/assets` 页面的 tabs 拆分为独立的子路由，每个 tab 成为独立的子页面。

### 路由结构
```
/assets              → 素材库 (默认子页面)
/assets/reports      → 研报中心
/assets/popular      → 热门素材 Top10
/assets/rss          → RSS 订阅
/assets/bindings     → 目录绑定
/assets/:id          → 素材详情
```

### 新增文件
- `webapp/src/pages/AssetsLayout.tsx` - 布局组件，包含子导航

### 修改文件
| 文件 | 变更内容 |
|------|----------|
| `App.tsx` | 使用嵌套路由结构 `<Route path="assets" element={<AssetsLayout />}>`, 添加子路由 |
| `Assets.tsx` | 精简为仅素材库功能，移除 tab 切换逻辑 |
| `Layout.tsx` | 子导航添加"研报"选项 |
| `Reports.tsx` | 修复导航路径为 `/assets/reports`, 添加 `qualityScore` 字符串转数字 |
| `ReportDetail.tsx` | 修复返回路径, 添加 `qualityScore` 类型转换 |
| `ReportCompare.tsx` | 修复导航路径为 `/assets/*` |
| `Dashboard.tsx` | 修复快捷入口路径 |
| `GlobalSearch.tsx` | 修复搜索结果路径 |

### 数据类型修复
API 返回的数值字段为字符串类型，前端已添加 `parseFloat()` 转换：
- `Assets.tsx`: `quality_score` string → number
- `Reports.tsx`: `qualityScore` string → number  
- `ReportDetail.tsx`: `qualityScore` string → number
- `RSSAssets.tsx`: `relevance_score` string → number

### 验证状态
- ✅ 所有子路由可正常访问 (200)
- ✅ TypeScript 编译无错误
- ✅ 后端 API 数据正常返回
- ✅ 页面能正确展示后端数据

## 2026-03-19 Assets 路由拆分 - 最终验证完成

### 路由结构 ✅
```
/assets              → 素材库 (Assets.tsx)
/assets/reports      → 研报中心 (Reports.tsx)  
/assets/popular      → 热门素材 Top10 (PopularAssets.tsx)
/assets/rss          → RSS 订阅 (RSSAssets.tsx)
/assets/bindings     → 目录绑定 (Bindings.tsx)
```

### 验证结果 ✅
| 检查项 | 状态 |
|--------|------|
| TypeScript 编译 | ✅ 无错误 |
| 所有子路由 HTTP 200 | ✅ 5/5 |
| 后端 API 数据正常 | ✅ 4/4 |
| 前端页面渲染数据 | ✅ 已验证 |
| 数据类型转换 | ✅ 已处理 |

### 数据类型修复
- `quality_score` (Assets): string → number ✅
- `qualityScore` (Reports): string → number ✅  
- `relevance_score` (RSS): string → number ✅

### 服务访问
- 前端: http://localhost:5174/
- 后端: http://localhost:3000/


## 2026-03-19 Assets 路由拆分 - 验证完成

### 完成状态 ✅

| 检查项 | 状态 |
|--------|------|
| 路由拆分 | ✅ 5 个独立子路由 |
| HTTP 状态码 | ✅ 全部 200 |
| 后端 API 数据 | ✅ 正常返回 |
| 前端数据渲染 | ✅ 正确展示 |
| TypeScript 编译 | ✅ 0 错误 |
| 数据类型转换 | ✅ 已处理 |

### 路由映射
```
/assets              → Assets.tsx (素材库)
/assets/reports      → Reports.tsx (研报中心)
/assets/popular      → PopularAssets.tsx (热门素材)
/assets/rss          → RSSAssets.tsx (RSS订阅)
/assets/bindings     → Bindings.tsx (目录绑定)
```

### 数据类型修复
- `Assets.tsx`: quality_score string → number
- `Reports.tsx`: qualityScore string → number
- `RSSAssets.tsx`: relevance_score string → number

### 服务状态
- 前端: http://localhost:5173/
- 后端: http://localhost:3000/

