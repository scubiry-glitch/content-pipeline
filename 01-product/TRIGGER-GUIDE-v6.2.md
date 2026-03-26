# v6.2 Assets AI 批量处理 - 触发时机指南

**版本**: v6.2  
**日期**: 2026-03-27  

---

## 📋 触发方式概览

Assets AI 分析可以通过以下 **3 种方式**触发：

```
┌─────────────────────────────────────────────────────────────┐
│                    触发方式                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. 🕐 定时自动触发 (推荐)                                    │
│    └── 每30分钟自动扫描未处理素材                            │
├─────────────────────────────────────────────────────────────┤
│ 2. 🔧 手动 API 触发                                         │
│    └── 按需触发，支持批量指定                                │
├─────────────────────────────────────────────────────────────┤
│ 3. 🎬 上传时自动触发 (可选)                                  │
│    └── Asset 上传完成后自动触发分析                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 定时自动触发（推荐）

### 工作原理

```
每 30 分钟
    ↓
扫描 ai_processing_status = 'pending' 的 Assets
    ↓
批量处理 (默认每批 10 个)
    ↓
更新 ai_processing_status = 'completed' / 'failed'
```

### 配置

```typescript
// 默认配置
{
  processingIntervalMinutes: 30,  // 每30分钟处理一次
  batchSize: 10,                  // 每批处理10个
  enableVectorization: true,      // 启用向量化
  qualityThreshold: 70,           // 质量阈值
  maxRetries: 3,                  // 最大重试次数
  retryIntervalMinutes: 60,       // 失败后1小时重试
}
```

### 启动方式

**自动启动**（服务启动时）：
```bash
npm run dev
# 输出:
# 📄 Assets AI 批量处理定时任务已启动（每30分钟）
```

**手动控制**：
```typescript
import { assetsAIScheduler } from './services/assets-ai/scheduler.js';

// 启动调度器
assetsAIScheduler.start();

// 停止调度器
assetsAIScheduler.stop();

// 查看状态
const status = assetsAIScheduler.getStatus();
console.log(status);
// { isRunning: true, config: {...} }

// 更新配置
assetsAIScheduler.updateConfig({
  processingIntervalMinutes: 15,  // 改为每15分钟
  batchSize: 20,                  // 每批处理20个
});
```

---

## 2. 手动 API 触发

### 触发所有未处理素材

```bash
curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json"
```

**响应**：
```json
{
  "jobId": "assets-ai-batch-1711501234567",
  "status": "processing",
  "totalAssets": 15,
  "message": "Started processing 15 assets"
}
```

### 触发指定素材

```bash
curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["asset_001", "asset_002", "asset_003"]
  }'
```

### 强制重新处理（已分析过的）

```bash
curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["asset_001"],
    "force": true
  }'
```

### 自定义处理参数

```bash
curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "includeEmbedding": true,
    "config": {
      "batchSize": 5,
      "qualityThreshold": 75
    }
  }'
```

---

## 3. 上传时自动触发（可选）

### 方案：在 Asset 上传 API 中集成

修改 `assets.ts` 路由，在文件上传完成后自动触发分析：

```typescript
// api/src/routes/assets.ts

import { assetsAIScheduler } from '../services/assets-ai/scheduler.js';

// 在文件上传完成后
fastify.post('/upload', async (request, reply) => {
  // ... 上传文件处理 ...
  
  // 保存 asset 到数据库
  const asset = await saveAsset({
    title,
    fileUrl,
    fileType,
    // ai_processing_status 默认为 'pending'
  });
  
  // 可选：立即触发分析（适合小文件）
  // assetsAIScheduler.triggerManualProcessing([asset.id]);
  
  // 或等待定时任务处理
  
  return { assetId: asset.id, status: 'pending_analysis' };
});
```

### 异步队列方案（推荐生产环境）

使用 BullMQ 实现异步队列：

```typescript
// 创建队列
const assetsAIQueue = new Queue('assets-ai-processing');

// 上传后添加到队列
assetsAIQueue.add('analyze', {
  assetId: asset.id,
  priority: 'normal',
});

// Worker 处理
const worker = new Worker('assets-ai-processing', async (job) => {
  const { assetId } = job.data;
  await assetsBatchProcessor.processBatch([assetId]);
});
```

---

## 🔄 处理状态流转

```
                    ┌─────────────────┐
                    │    上传 Asset    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
     ┌──────────────│     pending     │◄──────────┐
     │              │   (等待处理)     │           │
     │              └────────┬────────┘           │
     │                       │                     │
     │    ┌──────────────────┼──────────────────┐  │
     │    │                  │                  │  │
     │    ▼                  ▼                  ▼  │
     │ ┌────────┐      ┌──────────┐      ┌────────┐│
     │ │processing│    │processing│    │processing││
     │ │ (定时)   │    │ (手动)   │    │ (上传)   ││
     │ └────┬────┘    └────┬─────┘    └───┬────┘│
     │      │              │              │     │
     │      └──────────────┼──────────────┘     │
     │                     │                     │
     │                     ▼                     │
     │              ┌──────────────┐            │
     │              │   completed  │            │
     │              │   (分析完成)  │            │
     │              └──────────────┘            │
     │                                          │
     │                     │                    │
     │                     │ 失败               │
     │                     ▼                    │
     │              ┌──────────────┐            │
     └─────────────►│    failed    │────────────┘
                    │  (等待重试)  │
                    └──────────────┘
```

---

## 📊 查询处理状态

### 查看 Asset 分析状态

```bash
# 获取单个 Asset 的分析结果
curl http://localhost:3006/api/v1/ai/assets/assets/:id/ai-analysis \
  -H "Authorization: Bearer $API_KEY"

# 查询分析结果列表
curl "http://localhost:3006/api/v1/ai/assets/analysis-results?limit=20" \
  -H "Authorization: Bearer $API_KEY"

# 只看未处理的
curl "http://localhost:3006/api/v1/ai/assets/analysis-results?hasTaskRecommendation=false" \
  -H "Authorization: Bearer $API_KEY"
```

### 查看处理统计

```bash
curl http://localhost:3006/api/v1/ai/assets/stats \
  -H "Authorization: Bearer $API_KEY"
```

**响应**：
```json
{
  "totalAnalyzed": 156,
  "analyzedToday": 23,
  "averageQualityScore": 72,
  "pendingRecommendations": 8
}
```

---

## ⚡ 性能建议

### 1. 批量处理 vs 实时处理

| 场景 | 推荐方式 | 说明 |
|------|----------|------|
| 大量上传 | 定时批量 | 避免瞬间高负载 |
| 单个重要文件 | 手动/API | 立即获得结果 |
| 日常运营 | 定时自动 | 省心省力 |

### 2. 调度器配置建议

```typescript
// 高频率场景（如新闻网站）
{
  processingIntervalMinutes: 10,  // 每10分钟
  batchSize: 20,
}

// 普通场景（如研报库）
{
  processingIntervalMinutes: 30,  // 每30分钟
  batchSize: 10,
}

// 低频场景（如档案库）
{
  processingIntervalMinutes: 60,  // 每小时
  batchSize: 5,
}
```

### 3. 监控告警

建议监控以下指标：
- 待处理队列长度
- 处理失败率
- 平均处理时间
- API 调用配额

---

## 📝 总结

| 触发方式 | 适用场景 | 配置难度 | 自动化程度 |
|----------|----------|----------|------------|
| **定时自动** | 日常运营 | ⭐ 简单 | ⭐⭐⭐ 高 |
| **手动 API** | 按需处理 | ⭐ 简单 | ⭐ 低 |
| **上传自动** | 实时性要求高 | ⭐⭐ 中等 | ⭐⭐ 中 |

**推荐组合**：
- **生产环境**: 定时自动（主）+ 手动 API（备用）
- **开发测试**: 手动 API
- **高实时性场景**: 上传自动 + 定时自动
