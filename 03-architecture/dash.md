# Dashboard 迁移到 Webapp 任务计划

## 现状分析

### Dashboard (原生 HTML)
- 技术栈: 原生 HTML + CSS + JS
- 功能模块: 6个主要模块
- 数据交互: DOM 操作 + 原生 JS

### Webapp (React + Vite)
- 技术栈: React + TypeScript + Vite
- 架构: 客户端 SPA
- 状态管理: 待确定

## 迁移任务清单

### Phase 1: 基础设施
- [x] 创建任务计划文档
- [ ] 分析 Dashboard API 依赖
- [ ] 检查 types 定义完整性
- [ ] 创建 Dashboard 路由

### Phase 2: 组件开发
- [ ] ScoreCard 组件 (综合质量分数)
- [ ] ProgressBar 组件 (四维度评分)
- [ ] HotTopics 组件 (热点话题)
- [ ] Recommendations 组件 (智能推荐)
- [ ] Sentiment 组件 (情感分析)
- [ ] Alerts 组件 (实时预警)
- [ ] Suggestions 组件 (优化建议)
- [ ] RssStatus 组件 (RSS源状态)
- [ ] ContentAnalyzer 组件 (内容分析器)

### Phase 3: 数据层
- [ ] 创建 dashboard API client
- [ ] 定义 Dashboard 相关 types
- [ ] 实现数据获取 hooks

### Phase 4: 页面组装
- [ ] 创建 DashboardPage
- [ ] 集成所有组件
- [ ] 添加样式

### Phase 5: 测试验证
- [ ] 功能完整性检查
- [ ] 样式对比验证
- [ ] 性能检查

## 状态
- 当前阶段: Phase 1
- 开始时间: 2026-03-17
- 进度: 0%
