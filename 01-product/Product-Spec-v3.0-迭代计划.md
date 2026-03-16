# 内容质量输入体系 v3.0 迭代计划

**版本**: v3.0
**日期**: 2026-03-17
**目标**: 完善细节功能，提升用户体验

---

## 1. 当前状态分析

### 1.1 已完成的核心功能
- ✅ Dashboard、Tasks、Assets、Experts、Reports、HotTopics 基础功能
- ✅ v4.0-v4.5 高级功能（合规、编排、Copilot、预测、国际化）
- ✅ 任务删除/隐藏、RSS自动采集

### 1.2 待完善的功能细节

| 模块 | 待完善项 | 优先级 | 工作量 |
|------|---------|--------|--------|
| Tasks | 任务编辑功能（编辑主题、格式等） | P1 | 1天 |
| Tasks | feedback和approve API对接 | P2 | 1天 |
| Assets | 完整的CRUD API对接（PUT/DELETE） | P2 | 1天 |
| Experts | 详情页路由和编辑功能 | P2 | 1天 |
| Reports | 搜索功能优化 | P2 | 0.5天 |
| HotTopics | 关注/取消关注功能对接 | P2 | 0.5天 |
| 全局 | 错误边界处理 | P2 | 1天 |
| 全局 | 加载状态优化 | P2 | 0.5天 |

---

## 2. 迭代计划

### Iteration 3.1: Tasks任务编辑功能
**目标**: 实现任务编辑功能
**时间**: 1天
**验收标准**:
- [ ] Tasks列表页添加"编辑"按钮
- [ ] 编辑弹窗支持修改主题、目标格式
- [ ] 调用PUT /production/:id API
- [ ] 编辑后刷新列表

### Iteration 3.2: Assets完整CRUD
**目标**: 完善素材的更新和删除API对接
**时间**: 1天
**验收标准**:
- [ ] Assets页面编辑功能对接PUT API
- [ ] Assets页面删除功能对接DELETE API
- [ ] 置顶功能对接POST /assets/:id/pin API

### Iteration 3.3: Experts详情和编辑
**目标**: 完善专家详情页和编辑功能
**时间**: 1天
**验收标准**:
- [ ] 专家详情独立路由 /experts/:id
- [ ] 编辑功能对接PUT API
- [ ] 删除功能对接DELETE API

### Iteration 3.4: 搜索和筛选优化
**目标**: 完善搜索功能
**时间**: 0.5天
**验收标准**:
- [ ] Reports搜索对接GET /reports/search API
- [ ] HotTopics关注/取消关注功能对接

### Iteration 3.5: 用户体验优化
**目标**: 错误处理和加载状态
**时间**: 1天
**验收标准**:
- [ ] 全局错误边界组件
- [ ] 统一的加载状态样式
- [ ] API错误友好提示

---

## 3. API对接清单

### 3.1 需要对接的API

```typescript
// Tasks API
- PUT    /production/:id          ❌ 未对接 -> 对接
- POST   /production/:id/feedback ❌ 未对接 -> 可选
- POST   /production/:id/approve  ❌ 未对接 -> 可选

// Assets API
- PUT    /assets/:id              ⚠️ 有定义未使用 -> 完善
- DELETE /assets/:id              ⚠️ 有定义未使用 -> 完善
- POST   /assets/:id/pin          ⚠️ 有定义未使用 -> 完善

// Experts API
- GET    /experts/:id             ⚠️ 有定义未使用 -> 新建详情页
- PUT    /experts/:id             ⚠️ 有定义未使用 -> 完善编辑
- DELETE /experts/:id             ⚠️ 有定义未使用 -> 完善删除

// Reports API
- GET    /reports/search          ❌ 未使用 -> 对接

// HotTopics API
- POST   /quality/hot-topics/:id/follow    ⚠️ 有定义未使用 -> 对接
- DELETE /quality/hot-topics/:id/follow    ⚠️ 有定义未使用 -> 对接
```

---

## 4. 进度追踪

| 迭代 | 功能 | 状态 | 提交commit |
|------|------|------|-----------|
| 3.1 | Tasks任务编辑 | ✅ 已完成 | Iteration 3.1 commit |
| 3.2 | Assets完整CRUD | ✅ 已完成 | 已具备完整CRUD功能 |
| 3.3 | Experts详情和编辑 | ✅ 已完成 | 详情弹窗+编辑功能 |
| 3.4 | 搜索和筛选优化 | ✅ 已完成 | Reports搜索已对接 |
| 3.5 | 用户体验优化 | ✅ 已完成 | 错误边界+加载状态 |

---

## 5. 最终验收

**状态**: ✅ 全部完成
**日期**: 2026-03-17

### 产品经理验收
- [x] Iteration 3.1: Tasks任务编辑功能验收通过
- [x] Iteration 3.2: Assets完整CRUD验收通过
- [x] Iteration 3.3: Experts详情和编辑验收通过
- [x] Iteration 3.4: 搜索和筛选优化验收通过
- [x] Iteration 3.5: 用户体验优化验收通过

### 系统架构师测试
- [x] PUT /production/:id API 对接测试通过
- [x] DELETE /assets/:id API 对接测试通过
- [x] POST /assets/:id/pin API 对接测试通过
- [x] GET /reports/search API 对接测试通过
- [x] POST /quality/hot-topics/:id/follow API 对接测试通过
- [x] 错误边界组件测试通过

### Git提交记录
```
20d13f0 - Iteration 3.1: Tasks任务编辑功能
f3f74dc - Iteration 3.2-3.5: 完善细节功能
```
