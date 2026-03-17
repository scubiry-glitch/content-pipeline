# TaskDetail 完整复刻计划（方案B）

## 任务清单

### Phase 1-6: 基础功能 ✅ 已完成
- [x] 流程可视化（Stage Pipeline）
- [x] 蓝军评审界面完整版
- [x] 选题策划增强
- [x] 素材关联面板
- [x] 引用统计增强
- [x] 操作按钮修复（确认大纲、研究采集、添加链接、文稿重做）

### Phase 7: 问题修复 ⏸️ 等待验收
- [ ] 等待产品经理验收
- [ ] 修复验收发现的问题
- [ ] 回归测试

### Phase 8: P2 高级功能 ⏸️ 等待决策
- [ ] 数据清洗界面
- [ ] 交叉验证结果展示
- [ ] 采集进度实时显示
- [ ] 大纲段落重新生成
- [ ] 大纲版本对比

---

## 当前状态
- **阶段**: 等待验收
- **最后提交**: fe87a6c docs: 更新 TaskDetail 功能缺失清单
- **已完成**: 30/30 基础功能
- **待修复**: 等待反馈
- **待开发**: 5个P2高级功能

---

## 验收检查清单

### 基础功能验证
- [ ] 流程可视化是否正确显示
- [ ] 确认大纲按钮是否正常工作
- [ ] 启动研究采集按钮是否正常工作
- [ ] 添加外部链接功能是否完整
- [ ] 重做文稿生成按钮是否正常工作
- [ ] 蓝军评审决策是否完整
- [ ] 选题策划4维度评分是否正确显示

### 边界情况检查
- [ ] 任务无数据时的空状态显示
- [ ] 操作加载状态是否正确显示
- [ ] 错误提示是否友好
- [ ] 响应式布局是否正常

### API 调用检查
- [ ] POST /production/:id/confirm-outline
- [ ] POST /production/:id/redo/:stage
- [ ] PUT /production/:id (更新外部链接)

---

## 备注
- **暂停原因**: 等待产品经理验收
- **下一步**: 根据验收反馈修复问题
- **P2功能**: 验收通过后决策是否开发

---

# v5.1 专家库整合开发任务

**版本**: v5.1.1
**状态**: Phase 3 全部完成
**最后提交**: 099b14d v5.1 Phase 3 完成

---

## 已完成任务 ✅

### Phase 1.1: 基础功能
- [x] Expert 类型定义（6大属性：Profile, Philosophy, Achievements, ReviewDimensions等）
- [x] ExpertReview 评审结果类型
- [x] ExpertAssignment 专家分配类型
- [x] ExpertMatchRequest 匹配请求类型
- [x] 75位完整专家数据（10特级+65领域）
- [x] matchExperts() 智能匹配算法
- [x] generateExpertOpinion() 专家观点生成
- [x] ExpertReviewPanel 组件
- [x] ExpertLibrary 页面
- [x] CreateTaskModal 专家推荐

### Phase 1.2: 专家工作量调度优化 ✅
- [x] ExpertWorkloadData 接口定义
- [x] workloadStore 工作量数据存储
- [x] getExpertWorkload() 获取专家工作量
- [x] assignExpertWithLoadBalancing() 负载均衡分配
- [x] releaseExpert() 任务完成释放
- [x] CreateTaskModal 显示专家可用性状态

### Phase 1.3: 用户反馈持久化 ✅
- [x] recordExpertFeedback() 记录用户反馈
- [x] getExpertFeedbackStats() 专家反馈统计
- [x] getUserFeedbackHistory() 用户反馈历史
- [x] getExpertRecommendationWeight() 推荐权重
- [x] ExpertReviewPanel 集成反馈持久化
- [x] ExpertLibrary 显示反馈统计

### Phase 2: 体验优化 ✅
- [x] Dashboard 专家洞察组件 (ExpertInsights)
- [x] 热点话题展示（热门/最新/深度）
- [x] 专家详情页历史评审记录时间线
- [x] 模拟历史评审数据生成

### Phase 3: 高级功能 ✅

#### Phase 3.1 热点话题专家解读 ✅
- HotTopicInsights.tsx 完整解读页面
- 5个热点话题（宏观经济/新能源/AI/消费/半导体）
- 特级专家+领域专家联合分析
- AI综合洞察（核心洞察/风险提示/机会识别/行动建议）
- 支持保存/分享/导出PDF
- 相关素材推荐

#### Phase 3.2 素材库专家标注 ✅
- AssetExpertReviewModal.tsx 专家评估弹窗
- 质量分/可信度/相关性 三维评分
- 综合评分圆环展示
- 专家评审列表（可展开详情）
- 使用建议提示
- Assets页面集成专家评估按钮

---

## v5.1.1 验收修复与新功能 ✅

**版本**: v5.1.1
**最后提交**: c172e66 v5.1.1: 修复Phase 3验收问题并添加新功能

### 验收修复
- [x] HotTopicInsights - 报告缓存机制（切换话题保留已生成报告）
- [x] AssetExpertReviewModal - 移动端响应式优化
- [x] ExpertInsights - 导航修复（跳转到解读页而非专家库）

### 新功能
- [x] ExpertComparison - 专家对比功能（2-3位专家观点对比）
- [x] 报告收藏功能 - ❤️我的收藏面板，支持查看/删除
- [x] ExpertLibrary - 添加专家对比入口

---

## 待完成任务 📋

### Phase 4: 进阶优化 (P3)
- [ ] 专家协作网络分析
- [ ] 观点冲突检测与调和
- [ ] 专家知识图谱可视化

## 当前状态
- **版本**: v5.1.1 全部完成
- **最后提交**: c172e66 v5.1.1: 修复Phase 3验收问题并添加新功能
- **已完成**: Phase 1.1 + 1.2 + 1.3 + 2 + 3 + v5.1.1修复
- **待开发**: Phase 4 (P3进阶功能)
