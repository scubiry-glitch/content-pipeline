# 任务详情页面 API 路由分析

## 测试结论

### ✅ 有效的 API (12个)

| # | API 名称 | 方法 | 实际路径 | 状态 |
|---|---------|------|---------|------|
| 1 | 获取任务详情 | GET | `/production/:taskId` | ✅ 正常 |
| 2 | 审批任务 | POST | `/production/:taskId/approve` | ✅ 正常 (业务错误是状态问题) |
| 3 | 重做选题策划 | POST | `/production/:taskId/redo/planning` | ✅ 正常 |
| 4 | 重做深度研究 | POST | `/production/:taskId/redo/research` | ✅ 正常 |
| 5 | 重做文稿生成 | POST | `/production/:taskId/redo/writing` | ✅ 正常 |
| 6 | 重做蓝军评审 | POST | `/production/:taskId/redo/review` | ✅ 正常 |
| 7 | 获取蓝军评审 | GET | `/production/:taskId/reviews` | ✅ 正常 |
| 8 | 提交评审决策 | POST | `/production/:taskId/review-items/:reviewId/decide` | ✅ 正常 |
| 9 | 批量评审决策 | POST | `/production/:taskId/review-items/batch-decide` | ✅ 正常 |
| 10 | 申请重新评审 | POST | `/production/:taskId/review-items/re-review` | ✅ 正常 |
| 11 | 获取热点话题 | GET | `/quality/hot-topics` | ✅ 正常 |
| 12 | 获取情感统计 | GET | `/quality/sentiment/stats` | ✅ 正常 |
| 13 | 获取素材列表 | GET | `/assets` | ✅ 正常 |
| 14 | 获取工作流规则 | GET | `/orchestrator/rules` | ✅ 正常 |
| 15 | 启动研究采集 | POST | `/research/:taskId/collect` | ✅ 正常 |
| 16 | 保存研究配置 | POST | `/research/:taskId/config` | ✅ 正常 |
| 17 | 删除任务 | DELETE | `/production/:taskId` | ✅ 正常 |
| 18 | 隐藏任务 | POST | `/production/:taskId/hide` | ✅ 正常 |
| 19 | 取消隐藏 | POST | `/production/:taskId/unhide` | ✅ 正常 |

### ❌ 不存在的 API (3个)

| # | API 名称 | 前端调用的错误路径 | 正确路径 | 状态 |
|---|---------|------------------|---------|------|
| 1 | 更新任务信息 | `PUT /production/:id` | ❌ 未实现 | 🔴 不存在 |
| 2 | 确认大纲 | `POST /production/:id/confirm-outline` | `POST /production/:id/outline/confirm` | 🟡 路径错误 |
| 3 | 批量处理评审 | `POST /production/:id/reviews/batch-decide` | `POST /production/:id/review-items/batch-decide` | 🟡 路径错误 |

## 需要修复的前端代码

### 修复 1: tasksApi.update
**文件**: `webapp/src/api/client.ts`
**问题**: PUT /production/:id 不存在
**解决方案**: 
- 删除 `tasksApi.update` 方法，或
- 后端添加 PUT /production/:id 路由

### 修复 2: tasksApi.confirmOutline  
**文件**: `webapp/src/api/client.ts`
**当前**: `client.post(/production/${id}/confirm-outline)`
**应改为**: `client.post(/production/${id}/outline/confirm)`

### 修复 3: blueTeamApi.batchDecide
**文件**: `webapp/src/api/client.ts`
**当前**: `client.post(/production/${id}/reviews/batch-decide)`
**应改为**: `client.post(/production/${id}/review-items/batch-decide)`

## 完整的 API 客户端映射

```typescript
// tasksApi
getAll: GET /production
getById: GET /production/:id
create: POST /production
update: ❌ 不存在 (需要后端实现或前端移除)
delete: DELETE /production/:id
approve: POST /production/:id/approve
confirmOutline: POST /production/:id/outline/confirm ❌ 路径错误
hide: POST /production/:id/hide
redoStage: POST /production/:id/redo/:stage

// blueTeamApi
getReviews: GET /production/:id/reviews
submitDecision: POST /production/:id/review-items/:reviewId/decide
batchDecide: POST /production/:id/review-items/batch-decide ❌ 路径错误
requestReReview: POST /production/:id/review-items/re-review

// researchApi
collect: POST /research/:id/collect
saveConfig: POST /research/:id/config

// 其他 API 路径正确
```
