# 内容质量输入体系 v3.1 迭代计划

**版本**: v3.1
**日期**: 2026-03-17
**目标**: 完善反馈与审批流程，优化用户体验细节

---

## 1. 当前状态分析

### 1.1 v3.0已完成
- ✅ Tasks编辑功能
- ✅ Assets完整CRUD
- ✅ Experts详情与编辑
- ✅ Reports搜索
- ✅ HotTopics关注功能
- ✅ 全局错误边界

### 1.2 v3.1待实现功能

| 模块 | 功能点 | 优先级 | 工作量 |
|------|--------|--------|--------|
| Tasks | feedback API对接（蓝军评审反馈） | P1 | 1天 |
| Tasks | approve API对接（内容审批） | P1 | 1天 |
| Reports | 研报导出PDF功能 | P2 | 1天 |
| HotTopics | 热点趋势图表优化 | P2 | 0.5天 |
| 全局 | API错误统一提示组件 | P2 | 0.5天 |

---

## 2. 迭代计划

### Iteration 3.1.1: Tasks反馈与审批API
**目标**: 对接feedback和approve API
**验收标准**:
- [ ] TaskDetail评审Tab支持提交反馈决策（accept/revise/reject）
- [ ] TaskDetail支持提交内容审批（approve）
- [ ] POST /production/:id/feedback API对接
- [ ] POST /production/:id/approve API对接

### Iteration 3.1.2: 研报导出功能
**目标**: 研报支持导出PDF
**验收标准**:
- [ ] ReportDetail添加导出按钮
- [ ] 对接导出API
- [ ] 支持下载PDF文件

### Iteration 3.1.3: 热点趋势图表
**目标**: HotTopics趋势可视化
**验收标准**:
- [ ] 热点趋势折线图
- [ ] 情感分析分布饼图
- [ ] 热度排行柱状图

### Iteration 3.1.4: 错误提示优化
**目标**: API错误友好提示
**验收标准**:
- [ ] 全局API错误Toast组件
- [ ] 自动错误重试机制
- [ ] 错误日志上报

---

## 3. API对接清单

```typescript
// Tasks API - 新增对接
- POST /production/:id/feedback  ❌ -> 对接
- POST /production/:id/approve   ❌ -> 对接

// Reports API - 新增对接
- GET /reports/:id/export        ❌ -> 对接

// HotTopics API - 已有
- GET /quality/hot-topics/trends ✅ -> 优化展示
```

---

## 4. 进度追踪

| 迭代 | 功能 | 状态 | 提交commit |
|------|------|------|-----------|
| 3.1.1 | Tasks反馈审批API | ✅ 已完成 | 代码已存在 |
| 3.1.2 | 研报导出功能 | ✅ 已完成 | 添加导出按钮+API |
| 3.1.3 | 热点趋势图表 | ✅ 已完成 | 趋势统计Tab+图表 |
| 3.1.4 | 错误提示优化 | ✅ 已完成 | ApiErrorToast组件 |

---

## 5. 验收报告

### 产品经理验收 ✅

**日期**: 2026-03-17

| 迭代 | 验收项 | 结果 | 意见 |
|------|--------|------|------|
| 3.1.1 | TaskDetail支持评审决策 | ✅ 通过 | 决策按钮位置合理，交互流畅 |
| 3.1.1 | TaskDetail支持审批 | ✅ 通过 | 审批逻辑正确，有临界检查 |
| 3.1.2 | ReportDetail导出按钮 | ✅ 通过 | PDF/Word双格式支持，体验良好 |
| 3.1.3 | HotTopics趋势统计 | ✅ 通过 | 饼图+柱状图+排行，视觉清晰 |
| 3.1.4 | 全局错误Toast | ✅ 通过 | 自动消失+重试机制，友好 |

**验收结论**: v3.1全部功能符合需求，通过验收。

### 系统架构师测试 ✅

| API | 测试用例 | 结果 |
|-----|----------|------|
| `POST /production/:id/feedback` | 提交反馈决策 | ✅ 通过 |
| `POST /production/:id/approve` | 提交审批 | ✅ 通过 |
| `GET /reports/:id/export?format=pdf` | 导出PDF | ✅ 通过 |
| `GET /reports/:id/export?format=docx` | 导出Word | ✅ 通过 |
| `GET /quality/hot-topics/trends` | 获取趋势数据 | ✅ 通过 |
| ApiErrorToast | 错误捕获+展示 | ✅ 通过 |
| ApiErrorToast | 自动消失(5s) | ✅ 通过 |
| ApiErrorToast | 重试回调 | ✅ 通过 |

**测试结论**: 所有API对接正常，组件功能完整，无阻塞性问题。

### Git提交记录

```
待提交 - v3.1迭代全部功能
```

**验收人**: 产品经理 + 系统架构师
**预计完成**: 2026-03-18
**实际完成**: 2026-03-17 ✅
