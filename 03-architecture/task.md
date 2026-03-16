# TaskDetail 完整复刻计划（方案B）

## 任务清单

### Phase 1: 流程可视化（Stage Pipeline）✅ 已完成
- [x] 1.1 Stage1 流程展示：RSS聚合 → 质量评估 → 热点分析 → 竞品分析 → 评分排序
- [x] 1.2 Stage2 流程展示：数据采集 → 清洗 → 分析 → 洞察
- [x] 1.3 Stage3/4 流程展示
- [x] 1.4 流程状态指示器（进行中/已完成/失败）

### Phase 2: 蓝军评审界面完整版 ✅ 已完成
- [x] 2.1 评审统计概览卡片（严重问题/改进建议/亮点/总数）
- [x] 2.2 处理进度条（已接受/已忽略/待处理）
- [x] 2.3 专家评审分工展示（4角色卡片）
- [x] 2.4 评审项决策按钮（接受/手动处理/忽略）
- [x] 2.5 批量决策功能（全部接受/全部忽略）
- [x] 2.6 严重问题强制校验（未处理不能进入确认环节）
- [x] 2.7 重新评审功能

### Phase 3: 选题策划增强 ✅ 已完成
- [x] 3.1 4维度评分可视化（圆环图+进度条）
- [x] 3.2 竞品分析面板（差异化建议）
- [x] 3.3 竞品研报列表
- [x] 3.4 市场空白点展示
- [x] 3.5 知识库洞见展示
- [x] 3.6 新研究角度建议
- [x] 3.7 大纲编辑功能

### Phase 4: 素材关联面板 ✅ 已完成
- [x] 4.1 素材选择器弹窗
- [x] 4.2 已关联素材展示
- [x] 4.3 快速添加素材按钮

### Phase 5: 引用统计增强 ✅ 已完成
- [x] 5.1 外部链接引用统计
- [x] 5.2 素材库引用统计
- [x] 5.3 可信度分级展示（A/B/C/D）

### Phase 6: API接口更新 ✅ 已完成
- [x] 6.1 blueTeamApi.submitDecision
- [x] 6.2 blueTeamApi.batchDecide
- [x] 6.3 blueTeamApi.requestReReview
- [x] 6.4 blueTeamApi.canProceed
- [x] 6.5 tasksApi.confirmOutline
- [x] 6.6 tasksApi.redoStage

## 当前状态
- 开始时间: 2026-03-17
- 完成时间: 2026-03-17
- 当前Phase: 已完成 Phase 1-6
- 已完成: 30/30 ✅

## 提交记录
- 2026-03-17: 完成Phase 1-6全部功能

## 主要更新内容

### 1. TaskDetail.tsx (重构)
- 新增6个Tab: overview, planning, research, writing, reviews, quality
- 新增流程可视化组件 renderStagePipeline()
- 新增选题策划Tab renderPlanningTab()
- 新增完整蓝军评审界面 renderReviewsTab()
- 新增素材关联弹窗 renderAssetModal()
- 新增评审决策处理函数
- 新增大纲编辑功能

### 2. TaskDetail.css (新增600+行样式)
- 流程可视化样式
- 蓝军评审统计卡片样式
- 专家评审分工卡片样式
- 4维度评分圆环图样式
- 竞品分析面板样式
- 素材选择弹窗样式
- 响应式适配

### 3. client.ts (API更新)
- blueTeamApi 新增 submitDecision, batchDecide, requestReReview, canProceed
- tasksApi 新增 confirmOutline, redoStage

## 复刻完成度
对比原 /Users/行业研究/demo-project/webapp/index.html:
- ✅ 流程可视化（Stage Pipeline）- 100%
- ✅ 蓝军评审决策界面 - 100%
- ✅ 4维度评分可视化 - 100%
- ✅ 竞品分析面板 - 100%
- ✅ 知识库洞见 - 100%
- ✅ 大纲编辑功能 - 100%
- ✅ 素材关联面板 - 100%
- ✅ 信源分级（A/B/C/D）- 100%
