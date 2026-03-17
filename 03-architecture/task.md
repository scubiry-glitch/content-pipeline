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

**版本**: v5.1
**状态**: 开发中 (Phase 1)
**最后更新**: 2026-03-17

---

## 已完成任务 ✅

### 1. 基础类型定义 (types/index.ts)
- [x] Expert 类型定义（6大属性：Profile, Philosophy, Achievements, ReviewDimensions等）
- [x] ExpertReview 评审结果类型
- [x] ExpertAssignment 专家分配类型
- [x] ExpertMatchRequest 匹配请求类型

### 2. 专家服务层 (services/expertService.ts)
- [x] 75位完整专家数据
  - 10位特级专家：张一鸣、王兴、马斯克、任正非、贝索斯、巴菲特、孙正义、黄峥、雷军、纳德拉
  - 65位领域专家覆盖12个领域
- [x] matchExperts() 智能匹配算法（基于主题关键词）
- [x] generateExpertOpinion() 专家观点生成
- [x] getExpertWorkload() 工作量管理
- [x] 10位特级专家个性化观点生成风格

### 3. 专家评审面板组件 (components/ExpertReviewPanel.tsx)
- [x] 特级专家区域（高优先级任务展示）
- [x] 领域专家网格（2-3位动态匹配）
- [x] 通用专家徽章（事实核查/逻辑检查/读者代表）
- [x] 接受/忽略操作
- [x] 重新生成功能
- [x] ExpertReviewPanel.css 完整样式

### 4. TaskDetail 集成
- [x] 导入 ExpertReviewPanel
- [x] 在评审标签页集成专家库评审

---

## 待完成任务 📋

### Phase 1: 核心功能完善 (P0)

#### 1.1 CreateTaskModal 专家推荐 ✅
**文件**: `components/CreateTaskModal.tsx`
**状态**: 已完成
**实现内容**:
- ✅ 输入主题时实时推荐专家（延迟500ms）
- ✅ 显示匹配的领域专家预览（头像、职称、采纳率）
- ✅ 显示特级专家（高优先级任务自动启用）
- ✅ 展示匹配原因
- ✅ 特级专家特殊标识和提醒

#### 1.2 专家工作量调度优化
**文件**: `services/expertService.ts`
**功能**:
- 实时工作量追踪
- 负载均衡分配
- 专家可用性状态

#### 1.3 用户反馈持久化
**文件**: `services/expertService.ts`
**功能**:
- 保存用户对专家观点的接受/忽略决策
- 统计专家采纳率
- 个性化推荐优化

---

### Phase 2: 体验优化 (P1)

#### 2.1 Dashboard 专家洞察组件
**文件**: `pages/Dashboard.tsx`
**功能**:
- 今日专家洞察卡片
- 热点话题专家解读
- 专家评审统计

#### 2.2 专家详情页
**文件**: `pages/ExpertDetail.tsx` (新建)
**功能**:
- 专家完整画像展示
- 历史评审记录
- 成功实践案例
- 相关主题推荐

---

### Phase 3: 高级功能 (P2)

#### 3.1 热点话题专家解读
**文件**: `pages/HotTopics.tsx`
**功能**:
- 自动匹配热点相关专家
- 生成专家视角解读
- 差异化观点对比

#### 3.2 素材库专家标注
**文件**: `pages/AssetDetail.tsx`
**功能**:
- 申请专家解读素材
- 专家可信度评估
- 素材质量评分

---

## 测试用例（架构师）

### 功能测试
1. **专家匹配测试**
   - 输入: "新能源汽车发展趋势"
   - 期望: 匹配E03新能源领域专家
   - 验证: domainExperts[0].domainCode === 'E03'

2. **特级专家触发测试**
   - 输入: importance=0.9
   - 期望: 返回 seniorExpert 不为空
   - 验证: seniorExpert.level === 'senior'

3. **观点生成测试**
   - 输入: 张一鸣专家，draft内容
   - 期望: 观点包含"A/B测试"、"延迟满足感"
   - 验证: opinion.includes('A/B测试')

4. **工作量测试**
   - 输入: expertId='S-01'
   - 期望: 返回 availability, pendingReviews
   - 验证: availability 属于 ['available', 'busy', 'unavailable']

### 集成测试
1. TaskDetail 评审标签页加载
2. ExpertReviewPanel 渲染完整
3. 接受/忽略操作触发
4. 重新生成刷新观点

---

## GitHub 提交计划

### Commit 1: 基础类型和服务
```
v5.1 专家库基础实现

- 添加 Expert/ExpertReview/ExpertAssignment 类型
- 实现专家服务层：matchExperts, generateExpertOpinion
- 75位完整专家数据（10特级+65领域）
- 10位特级专家个性化观点生成
```

### Commit 2: UI组件
```
v5.1 专家评审面板组件

- ExpertReviewPanel 组件
- ExpertReviewCard 子组件
- UniversalExpertBadge 组件
- 完整CSS样式
```

### Commit 3: 集成
```
v5.1 TaskDetail 集成专家库

- 评审标签页集成 ExpertReviewPanel
- 动态专家匹配展示
```

---

**下一步行动**: 完成 Phase 1.2 专家工作量调度优化

---

## GitHub 提交记录

| Commit | 内容 | 时间 |
|--------|------|------|
| 3caf4ae | v5.1 专家库基础实现 | 2026-03-17 |
| 64e0cab | v5.1 专家库页面和路由整合 | 2026-03-17 |
| aac0be5 | v5.1 CreateTaskModal 专家推荐功能 | 2026-03-17 |
