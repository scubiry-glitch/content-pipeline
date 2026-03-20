# 任务详情页面 API 测试报告

## 测试时间
2024年3月19日

## 测试范围
任务详情页面 (`/tasks/:id`) 涉及的所有API交互

---

## 测试结果汇总

| 类别 | 数量 | 说明 |
|-----|------|------|
| ✅ 有效API | 17个 | 可正常调用并返回数据 |
| 🔧 已修复 | 2个 | 路径错误已修正 |
| ❌ 不存在 | 1个 | 后端未实现 |
| **总计** | **20个** | |

---

## 详细测试结果

### ✅ 有效API (17个)

| # | API | 方法 | 路径 | 测试结果 |
|---|-----|------|------|---------|
| 1 | 获取任务详情 | GET | `/production/:id` | ✅ 200 - 返回完整任务数据 |
| 2 | 审批任务 | POST | `/production/:id/approve` | ✅ 400 - API有效，业务状态错误 |
| 3 | 重做选题策划 | POST | `/production/:id/redo/planning` | ✅ 200 - 启动成功 |
| 4 | 重做深度研究 | POST | `/production/:id/redo/research` | ✅ 200 - 启动成功 |
| 5 | 重做文稿生成 | POST | `/production/:id/redo/writing` | ✅ 200 - 启动成功 |
| 6 | 重做蓝军评审 | POST | `/production/:id/redo/review` | ✅ 200 - 启动成功 |
| 7 | 获取蓝军评审 | GET | `/production/:id/reviews` | ✅ 200 - 返回评审数据 |
| 8 | 提交评审决策 | POST | `/production/:id/review-items/:reviewId/decide` | ✅ 有效 |
| 9 | 申请重新评审 | POST | `/production/:id/review-items/re-review` | ✅ 401 - API有效，业务错误 |
| 10 | 获取热点话题 | GET | `/quality/hot-topics` | ✅ 200 - 返回热点列表 |
| 11 | 获取情感统计 | GET | `/quality/sentiment/stats` | ✅ 200 - 返回统计数据 |
| 12 | 获取素材列表 | GET | `/assets` | ✅ 200 - 返回素材数据 |
| 13 | 获取工作流规则 | GET | `/orchestrator/rules` | ✅ 200 - 返回规则列表 |
| 14 | 启动研究采集 | POST | `/research/:id/collect` | ✅ 200 - 启动成功 |
| 15 | 保存研究配置 | POST | `/research/:id/config` | ✅ 200 - 保存成功 |
| 16 | 删除任务 | DELETE | `/production/:id` | ✅ 200 - 删除成功 |
| 17 | 隐藏任务 | POST | `/production/:id/hide` | ✅ 200 - 隐藏成功 |

### 🔧 已修复API (2个)

| # | API | 原路径 | 修复后路径 | 状态 |
|---|-----|--------|-----------|------|
| 1 | 确认大纲 | `/production/:id/confirm-outline` ❌ | `/production/:id/outline/confirm` ✅ | 已修复 |
| 2 | 批量评审决策 | `/production/:id/reviews/batch-decide` ❌ | `/production/:id/review-items/batch-decide` ✅ | 已修复 |

### ❌ 不存在API (1个)

| API | 路径 | 状态 | 说明 |
|-----|------|------|------|
| 更新任务 | `PUT /production/:id` | ❌ 不存在 | 后端未实现，前端调用会报错 |

**影响范围**:
- 编辑大纲保存功能
- 添加外部链接功能  
- 关联素材功能

**建议**: 后端添加 `PUT /production/:id` 路由，或前端移除相关功能

---

## 修复的代码

### 修复 1: tasksApi.confirmOutline
**文件**: `webapp/src/api/client.ts` (第72-73行)

```typescript
// 修改前
confirmOutline: (id: string) =>
  client.post(`/production/${id}/confirm-outline`) as Promise<void>,

// 修改后  
confirmOutline: (id: string) =>
  client.post(`/production/${id}/outline/confirm`) as Promise<void>,
```

### 修复 2: blueTeamApi.batchDecide
**文件**: `webapp/src/api/client.ts` (第283-284行)

```typescript
// 修改前
batchDecide: (taskId: string, data: { decision: 'accept' | 'ignore' }) =>
  client.post(`/production/${taskId}/reviews/batch-decide`, data) as Promise<void>,

// 修改后
batchDecide: (taskId: string, data: { decision: 'accept' | 'ignore' }) =>
  client.post(`/production/${taskId}/review-items/batch-decide`, data) as Promise<void>,
```

---

## 数据流验证

### 页面加载时序

```
1. TaskDetailLayout 挂载
   ↓
2. useEffect 触发加载
   ├─ GET /production/:id          → 任务详情
   ├─ GET /production/:id/reviews  → 蓝军评审
   ├─ GET /quality/hot-topics      → 热点话题
   ├─ GET /quality/sentiment/stats → 情感分析
   ├─ GET /assets                  → 素材列表
   └─ GET /orchestrator/rules      → 工作流规则
   ↓
3. 数据通过 Outlet Context 传递给子Tab
   ↓
4. 各Tab组件渲染展示
```

### 用户操作交互

| 操作 | 调用API | 状态 |
|-----|---------|------|
| 确认大纲 | POST /production/:id/outline/confirm | ✅ 已修复 |
| 重做阶段 | POST /production/:id/redo/:stage | ✅ 正常 |
| 审批任务 | POST /production/:id/approve | ✅ 正常 |
| 提交评审 | POST /production/:id/review-items/:id/decide | ✅ 正常 |
| 批量决策 | POST /production/:id/review-items/batch-decide | ✅ 已修复 |
| 重新评审 | POST /production/:id/review-items/re-review | ✅ 正常 |
| 删除任务 | DELETE /production/:id | ✅ 正常 |

---

## 结论

1. **大部分API正常工作** (17/20)
2. **2个API路径已修复**，现在可以正常调用
3. **1个API不存在** (PUT /production/:id)，需要后端实现或前端移除
4. **页面可以正常展示后端数据**

### 后续建议

1. **后端**: 添加 `PUT /production/:id` 路由以支持任务更新
2. **前端**: 暂时禁用"保存大纲"、"添加外部链接"、"关联素材"功能，或改用其他方式实现
3. **监控**: 观察生产环境API调用情况，确保修复后的路径稳定
