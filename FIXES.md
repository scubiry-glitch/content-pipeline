# 修复记录

## 问题 1: 重做选题策划超时

### 现象
前端报错：`timeout of 30000ms exceeded`

### 原因
`redo/planning` 路由是**同步执行**的，等待 LLM 生成大纲（可能需要 30-60 秒），超过前端 30 秒超时限制。

### 修复方案
将 `redo/planning` 改为**异步执行**模式，与其他 redo 路由保持一致：

**文件**: `api/src/routes/production.ts`

```typescript
// 修复前：同步执行，阻塞响应
fastify.post('/:taskId/redo/planning', async (request, reply) => {
  const result = await productionService.redoPlanning(taskId, {...});
  return result; // 可能 30-60 秒后才返回
});

// 修复后：异步执行，立即返回
fastify.post('/:taskId/redo/planning', async (request, reply) => {
  setImmediate(async () => {
    try {
      await productionService.redoPlanning(taskId, {...});
    } catch (error) {
      console.error(...);
    }
  });
  
  return { message: '选题策划重做已启动', taskId, status: 'planning' }; // 立即返回
});
```

### 前端优化
文件: `webapp/src/pages/TaskDetail.tsx`

- 添加更友好的提示信息
- 启动自动轮询（每 3 秒刷新状态，持续 30 秒）

```typescript
alert(`${stageNames[stage]}重做已在后台启动，请稍后刷新查看进度`);
// 启动轮询
const pollInterval = setInterval(() => loadTask(), 3000);
setTimeout(() => clearInterval(pollInterval), 30000);
```

## 重做功能执行模式对比

| 重做类型 | 执行模式 | 响应时间 | 状态 |
|---------|---------|---------|------|
| planning | **异步** | < 1秒 | ✅ 已修复 |
| research | 异步 | < 1秒 | ✅ 正常 |
| writing | 异步 | < 1秒 | ✅ 正常 |
| review | 异步 | < 1秒 | ✅ 正常 |

