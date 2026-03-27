# 一键改稿动态进度展示设计方案

**日期**: 2026-03-27  
**状态**: 计划中  
**优先级**: 高（需先修复 AITaskRecommendations Bug）

---

## 紧急 Bug 修复（优先执行）

### 问题描述
`AITaskRecommendations.tsx` 中出现 `Cannot read properties of undefined (reading 'length')` 错误。

### 可能原因
API 返回的 `recommendation_data.content.keyPoints` 字段为 undefined，导致第 237 行调用 `.slice()` 方法时出错：
```typescript
{item.recommendation_data.content.keyPoints.slice(0, 3).map((point, i) => (
```

### 修复方案
添加空值检查：
```typescript
{(item.recommendation_data.content.keyPoints || []).slice(0, 3).map((point, i) => (
```

---

## 一键改稿动态进度展示设计

### 1. 需求概述

为 Reviews 页面的"一键改稿"功能添加动态进度展示，让用户实时了解改稿进度，提升用户体验。

**当前问题**:
- 改稿过程使用 `setImmediate` 异步执行，用户只能看到"改稿中..."的静态提示
- 通过轮询检查 `current_stage` 判断完成，没有详细进度信息
- 用户无法了解改稿进行到哪个阶段

### 2. 当前实现分析

### 2.1 前端代码 (`ReviewsTab.tsx` 第 345-387 行)
```typescript
const handleBatchRevision = async () => {
  setBatchRevisionLoading(true);
  const result = await blueTeamApi.applyRevisions(task.id);
  if (result.async) {
    // 轮询等待完成
    const pollInterval = setInterval(async () => {
      const taskData = await tasksApi.getById(task.id);
      if (taskData.current_stage !== 'revising') {
        // 完成处理
      }
    }, 3000);
  }
};
```

### 2.2 后端代码 (`production.ts` 第 324-370 行)
```typescript
fastify.post('/:taskId/apply-revisions', async (request, reply) => {
  // 立即返回，后台执行
  setImmediate(async () => {
    await query(`UPDATE tasks SET current_stage = 'revising'...`);
    const result = await applyAllAcceptedRevisions(taskId);
    await query(`UPDATE tasks SET current_stage = 'awaiting_approval'...`);
  });
  return { success: true, async: true };
});
```

### 2.3 改稿流程 (`revisionAgent.ts`)
```
1. 收集所有 accepted 的评审意见 (blue_team_reviews + expert_reviews)
2. 获取最新稿件内容
3. 合并所有评审意见为列表
4. 构建 LLM prompt
5. 调用 LLM 生成修订内容
6. 创建新版本稿件
7. 更新任务状态
```

### 3. 设计方案

采用 **SSE (Server-Sent Events)** 方案，与现有蓝军评审 streaming 保持一致。

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend                                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐  │
│  │  ReviewsTab.tsx │───▶│useStreamingRevision│───▶│   EventSource  │  │
│  │                 │◀───│     Hook        │◀───│              │  │
│  │  BatchRevision  │    └─────────────────┘    └─────────────┘  │
│  │   Progress UI   │                                            │
│  └─────────────────┘                                            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ SSE
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Backend                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              POST /apply-revisions                       │   │
│  │                    │                                    │   │
│  │                    ▼                                    │   │
│  │         ┌─────────────────────┐                        │   │
│  │         │   Progress Manager  │◀──── 各阶段报告进度      │   │
│  │         │   (in-memory Map)   │                        │   │
│  │         └──────────┬──────────┘                        │   │
│  │                    │                                    │   │
│  │         ┌──────────▼──────────┐                        │   │
│  │         │ GET /streaming/     │                        │   │
│  │         │      revision/:id   │                        │   │
│  │         │  (SSE endpoint)     │                        │   │
│  │         └─────────────────────┘                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           applyAllAcceptedRevisions()                   │   │
│  │  1. collecting ──▶ 2. preparing ──▶ 3. llm_generating   │   │
│  │         │                │                 │            │   │
│  │         ▼                ▼                 ▼            │   │
│  │    4. parsing ──▶ 5. saving ──▶ 6. completed            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据结构设计

#### Progress State Type
```typescript
// api/src/services/streamingRevision.ts
export interface RevisionProgress {
  taskId: string;
  status: 'idle' | 'collecting' | 'preparing' | 'llm_generating' | 'parsing' | 'saving' | 'completed' | 'error';
  progress: number; // 0-100
  stage: string;    // 当前阶段中文描述
  message: string;  // 详细状态信息
  startedAt: string;
  completedAt?: string;
  error?: string;
  
  // 详细统计
  stats: {
    totalIssues: number;      // 总评审意见数
    processedIssues: number;  // 已处理意见数
    contentLength: number;    // 稿件字符数
    promptTokens?: number;    // Prompt token 数
    completionTokens?: number;// 生成 token 数
  };
}
```

#### SSE Event Types
```typescript
// webapp/src/hooks/useStreamingRevision.ts
interface RevisionEvent {
  type: 'connected' | 'progress' | 'stage_change' | 'completed' | 'error';
  data: RevisionProgress;
  timestamp: string;
}
```

### 3.3 后端实现

#### 文件 1: `api/src/services/streamingRevision.ts` (新建)

```typescript
import { EventEmitter } from 'events';

// 全局进度管理器
const progressStore = new Map<string, RevisionProgress>();
const eventEmitter = new EventEmitter();

export function updateRevisionProgress(
  taskId: string, 
  update: Partial<RevisionProgress>
): void {
  const current = progressStore.get(taskId) || createInitialProgress(taskId);
  const updated = { ...current, ...update };
  progressStore.set(taskId, updated);
  eventEmitter.emit(`revision:${taskId}`, updated);
}

export function getRevisionProgress(taskId: string): RevisionProgress | undefined {
  return progressStore.get(taskId);
}

export function subscribeToRevision(
  taskId: string, 
  callback: (progress: RevisionProgress) => void
): () => void {
  const eventName = `revision:${taskId}`;
  eventEmitter.on(eventName, callback);
  return () => eventEmitter.off(eventName, callback);
}

export function clearRevisionProgress(taskId: string): void {
  progressStore.delete(taskId);
}
```

#### 文件 2: `api/src/routes/streamingRevision.ts` (新建)

```typescript
import { FastifyInstance } from 'fastify';
import { getRevisionProgress, subscribeToRevision } from '../services/streamingRevision.js';

export async function streamingRevisionRoutes(fastify: FastifyInstance) {
  // GET /api/v1/streaming/revision/:taskId
  fastify.get('/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    
    // SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    
    // Send current progress immediately
    const current = getRevisionProgress(taskId);
    if (current) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', data: current })}

`);
    }
    
    // Subscribe to updates
    const unsubscribe = subscribeToRevision(taskId, (progress) => {
      const eventType = progress.status === 'completed' ? 'completed' 
                      : progress.status === 'error' ? 'error' 
                      : 'progress';
      reply.raw.write(`data: ${JSON.stringify({ type: eventType, data: progress })}

`);
    });
    
    // Heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat

`);
    }, 30000);
    
    // Cleanup
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    
    await new Promise(() => {}); // Keep connection open
  });
  
  // GET /api/v1/streaming/revision/:taskId/status
  fastify.get('/:taskId/status', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const progress = getRevisionProgress(taskId);
    return progress || { status: 'idle', progress: 0 };
  });
}
```

#### 修改 `revisionAgent.ts`

在 `applyAllAcceptedRevisions` 函数中插入进度更新点：

```typescript
export async function applyAllAcceptedRevisions(taskId: string) {
  const { updateRevisionProgress } = await import('./streamingRevision.js');
  
  // 1. 收集阶段 (10%)
  updateRevisionProgress(taskId, {
    status: 'collecting',
    progress: 0,
    stage: '收集评审意见',
    message: '正在收集已接受的评审意见...',
    startedAt: new Date().toISOString(),
    stats: { totalIssues: 0, processedIssues: 0, contentLength: 0 }
  });
  
  // ... 收集逻辑 ...
  
  updateRevisionProgress(taskId, {
    progress: 10,
    message: `已收集 ${allIssues.length} 条评审意见`,
    stats: { totalIssues: allIssues.length, processedIssues: 0, contentLength: 0 }
  });
  
  // 2. 准备阶段 (20%)
  updateRevisionProgress(taskId, {
    status: 'preparing',
    progress: 20,
    stage: '准备改稿',
    message: '正在构建改稿提示词...',
    stats: { totalIssues: allIssues.length, processedIssues: 0, contentLength: latestDraft.content.length }
  });
  
  // 3. LLM 生成阶段 (20% -> 70%)
  updateRevisionProgress(taskId, {
    status: 'llm_generating',
    progress: 30,
    stage: 'AI 改稿中',
    message: '正在调用 AI 进行改稿，这可能需要 30-60 秒...',
  });
  
  const llmResult = await generate(prompt, 'writing', { ... });
  
  updateRevisionProgress(taskId, {
    progress: 70,
    message: 'AI 改稿完成，正在解析结果...',
    stats: { 
      ...,
      promptTokens: llmResult.usage?.promptTokens,
      completionTokens: llmResult.usage?.completionTokens
    }
  });
  
  // 4. 解析阶段 (70% -> 80%)
  updateRevisionProgress(taskId, {
    status: 'parsing',
    progress: 80,
    stage: '解析结果',
    message: '正在解析改稿结果...',
  });
  
  // 5. 保存阶段 (80% -> 100%)
  updateRevisionProgress(taskId, {
    status: 'saving',
    progress: 90,
    stage: '保存新版本',
    message: '正在保存修订后的稿件...',
  });
  
  // ... 保存逻辑 ...
  
  updateRevisionProgress(taskId, {
    status: 'completed',
    progress: 100,
    stage: '改稿完成',
    message: `改稿完成！已生成新版本 v${newVersion}，处理了 ${allIssues.length} 条评审意见`,
    completedAt: new Date().toISOString(),
  });
  
  // 5分钟后清理内存
  setTimeout(() => clearRevisionProgress(taskId), 5 * 60 * 1000);
}
```

#### 修改 `production.ts`

在 `apply-revisions` 路由中初始化进度：

```typescript
fastify.post('/:taskId/apply-revisions', async (request, reply) => {
  const { taskId } = request.params as { taskId: string };
  const { updateRevisionProgress, clearRevisionProgress } = await import('../services/streamingRevision.js');
  
  // 清理之前的进度
  clearRevisionProgress(taskId);
  
  // 初始化进度
  updateRevisionProgress(taskId, {
    taskId,
    status: 'idle',
    progress: 0,
    stage: '准备开始',
    message: '改稿任务已启动...',
    startedAt: new Date().toISOString(),
    stats: { totalIssues: 0, processedIssues: 0, contentLength: 0 }
  });
  
  // ... 原有 setImmediate 逻辑 ...
});
```

### 3.4 前端实现

#### 文件 1: `webapp/src/hooks/useStreamingRevision.ts` (新建)

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';

export interface RevisionProgress {
  taskId: string;
  status: 'idle' | 'collecting' | 'preparing' | 'llm_generating' | 'parsing' | 'saving' | 'completed' | 'error';
  progress: number;
  stage: string;
  message: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  stats: {
    totalIssues: number;
    processedIssues: number;
    contentLength: number;
    promptTokens?: number;
    completionTokens?: number;
  };
}

interface UseStreamingRevisionOptions {
  onProgress?: (progress: RevisionProgress) => void;
  onComplete?: (progress: RevisionProgress) => void;
  onError?: (error: string) => void;
}

export function useStreamingRevision(options: UseStreamingRevisionOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState<RevisionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  const connect = useCallback((taskId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    setIsStreaming(true);
    setError(null);
    
    const sseUrl = `/api/v1/streaming/revision/${taskId}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;
    
    es.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        
        setProgress(data);
        optionsRef.current.onProgress?.(data);
        
        if (type === 'completed') {
          setIsStreaming(false);
          optionsRef.current.onComplete?.(data);
          es.close();
        } else if (type === 'error') {
          setIsStreaming(false);
          setError(data.error || '改稿失败');
          optionsRef.current.onError?.(data.error);
          es.close();
        }
      } catch (e) {
        console.error('[StreamingRevision] Parse error:', e);
      }
    };
    
    es.onerror = (err) => {
      console.error('[StreamingRevision] SSE error:', err);
      setError('连接失败');
      setIsStreaming(false);
      optionsRef.current.onError?.('连接失败');
    };
    
    return () => es.close();
  }, []);
  
  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);
  
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);
  
  return {
    isStreaming,
    progress,
    error,
    connect,
    disconnect,
  };
}
```

#### 文件 2: 新建组件 `webapp/src/components/BatchRevisionProgress.tsx`

```typescript
import React from 'react';
import type { RevisionProgress } from '../hooks/useStreamingRevision';

interface BatchRevisionProgressProps {
  progress: RevisionProgress | null;
  isActive: boolean;
}

const STAGE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  idle: { icon: 'hourglass_empty', color: 'text-slate-400', label: '准备中' },
  collecting: { icon: 'search', color: 'text-blue-500', label: '收集评审' },
  preparing: { icon: 'edit_note', color: 'text-blue-500', label: '准备改稿' },
  llm_generating: { icon: 'psychology', color: 'text-amber-500', label: 'AI 改稿' },
  parsing: { icon: 'code', color: 'text-blue-500', label: '解析结果' },
  saving: { icon: 'save', color: 'text-blue-500', label: '保存版本' },
  completed: { icon: 'check_circle', color: 'text-green-500', label: '改稿完成' },
  error: { icon: 'error', color: 'text-red-500', label: '改稿失败' },
};

export function BatchRevisionProgress({ progress, isActive }: BatchRevisionProgressProps) {
  if (!isActive || !progress) return null;
  
  const config = STAGE_CONFIG[progress.status] || STAGE_CONFIG.idle;
  const isCompleted = progress.status === 'completed';
  const isError = progress.status === 'error';
  
  return (
    <div className={`rounded-xl p-4 border ${
      isCompleted ? 'bg-green-50 border-green-200' :
      isError ? 'bg-red-50 border-red-200' :
      'bg-blue-50 border-blue-200'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${config.color} ${
            progress.status === 'llm_generating' ? 'animate-pulse' : ''
          }`}>
            {config.icon}
          </span>
          <span className={`font-medium ${
            isCompleted ? 'text-green-700' :
            isError ? 'text-red-700' :
            'text-blue-700'
          }`}>
            {config.label}
          </span>
        </div>
        <span className={`text-sm font-bold ${
          isCompleted ? 'text-green-600' :
          isError ? 'text-red-600' :
          'text-blue-600'
        }`}>
          {progress.progress}%
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className={`h-2 rounded-full overflow-hidden ${
        isCompleted ? 'bg-green-200' :
        isError ? 'bg-red-200' :
        'bg-blue-200'
      }`}>
        <div 
          className={`h-full rounded-full transition-all duration-500 ${
            isCompleted ? 'bg-green-500' :
            isError ? 'bg-red-500' :
            'bg-blue-500'
          }`}
          style={{ width: `${progress.progress}%` }}
        />
      </div>
      
      {/* Message */}
      <p className={`text-sm mt-2 ${
        isCompleted ? 'text-green-600' :
        isError ? 'text-red-600' :
        'text-blue-600'
      }`}>
        {progress.message}
      </p>
      
      {/* Stats */}
      {progress.stats.totalIssues > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-200/50 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-500">评审意见：</span>
            <span className="font-medium text-slate-700">
              {progress.stats.totalIssues} 条
            </span>
          </div>
          <div>
            <span className="text-slate-500">稿件长度：</span>
            <span className="font-medium text-slate-700">
              {progress.stats.contentLength.toLocaleString()} 字符
            </span>
          </div>
          {progress.stats.promptTokens && (
            <div>
              <span className="text-slate-500">Prompt：</span>
              <span className="font-medium text-slate-700">
                {progress.stats.promptTokens} tokens
              </span>
            </div>
          )}
          {progress.stats.completionTokens && (
            <div>
              <span className="text-slate-500">生成：</span>
              <span className="font-medium text-slate-700">
                {progress.stats.completionTokens} tokens
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 修改 `ReviewsTab.tsx`

```typescript
import { useStreamingRevision } from '../../hooks/useStreamingRevision';
import { BatchRevisionProgress } from '../../components/BatchRevisionProgress';

export function ReviewsTab() {
  // ... existing state ...
  
  // 一键改稿 Streaming Hook
  const revisionStreaming = useStreamingRevision({
    onComplete: () => {
      setBatchRevisionLoading(false);
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error) => {
      setBatchRevisionLoading(false);
      alert(`改稿失败: ${error}`);
    }
  });
  
  // 修改 handleBatchRevision
  const handleBatchRevision = async () => {
    if (!confirm(`确定要应用所有已接受的评审意见进行一键改稿吗？`)) return;
    
    setBatchRevisionLoading(true);
    
    // 建立 SSE 连接
    revisionStreaming.connect(task.id);
    
    try {
      const result = await blueTeamApi.applyRevisions(task.id);
      
      if (!result.success) {
        revisionStreaming.disconnect();
        setBatchRevisionLoading(false);
        alert(`改稿失败: ${result.error || '未知错误'}`);
      }
      // 成功后通过 SSE 监听进度，onComplete 回调处理完成
    } catch (error: any) {
      revisionStreaming.disconnect();
      setBatchRevisionLoading(false);
      alert(`改稿失败: ${error?.message || '未知错误'}`);
    }
  };
  
  // 在 JSX 中添加进度组件
  return (
    <div className="space-y-6">
      {/* ... existing code ... */}
      
      {/* 一键改稿进度展示 */}
      {(batchRevisionLoading || revisionStreaming.progress) && (
        <BatchRevisionProgress 
          progress={revisionStreaming.progress}
          isActive={batchRevisionLoading || revisionStreaming.isStreaming}
        />
      )}
      
      {/* Batch Revision Button */}
      {reviewSummary.accepted > 0 && (
        <div className="...">
          <button
            onClick={handleBatchRevision}
            disabled={batchRevisionLoading}
            className="..."
          >
            {batchRevisionLoading ? '改稿中...' : `应用 ${reviewSummary.accepted} 条修改`}
          </button>
        </div>
      )}
    </div>
  );
}
```

### 3.5 路由注册

修改 `api/src/server.ts` 添加新路由：

```typescript
import { streamingRevisionRoutes } from './routes/streamingRevision.js';

// ... in registerRoutes function ...
await fastify.register(streamingRevisionRoutes, { prefix: '/api/v1/streaming/revision' });
```

## 4. 实现顺序

1. **Phase 0 - Bug 修复** (10 min)
   - 修复 `AITaskRecommendations.tsx` 中的空值检查问题

2. **Phase 1 - 后端基础** (30 min)
   - 创建 `streamingRevision.ts` service
   - 创建 `streamingRevision.ts` route
   - 修改 `revisionAgent.ts` 插入进度更新
   - 修改 `production.ts` 初始化进度
   - 注册路由

3. **Phase 2 - 前端基础** (30 min)
   - 创建 `useStreamingRevision.ts` hook
   - 创建 `BatchRevisionProgress.tsx` 组件

4. **Phase 3 - 集成** (20 min)
   - 修改 `ReviewsTab.tsx` 集成 Hook 和组件
   - 移除旧轮询逻辑

5. **Phase 4 - 测试** (20 min)
   - 测试完整流程
   - 处理边界情况

**预计总耗时**: ~110 分钟

## 5. 边界情况处理

| 场景 | 处理方案 |
|------|----------|
| 用户刷新页面 | SSE 断开，重新连接后获取当前进度 |
| 后端重启 | 进度丢失，返回 idle 状态，前端显示"请重新启动改稿" |
| 改稿耗时过长 | SSE 自动重连，保持进度显示 |
| 并发改稿请求 | 新请求覆盖旧进度，发送冲突通知 |
| 浏览器不支持 SSE | 降级到原有轮询机制 |

## 6. UI 视觉效果

```
┌─────────────────────────────────────────────┐
│  🧠 AI 改稿中                          45%  │
│  ████████████████████░░░░░░░░░░░░░░░░░░░    │
│  正在调用 AI 进行改稿，这可能需要 30-60 秒...  │
│  ─────────────────────────────────────────  │
│  评审意见：12 条        稿件长度：8,456 字符  │
│  Prompt：2,340 tokens   生成：0 tokens      │
└─────────────────────────────────────────────┘
```
