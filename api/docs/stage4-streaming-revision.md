# Stage4 蓝军评审后流式修改 - 需求文档 v1.0

## 概述

本文档描述 Stage4（蓝军评审后修改）的流式生成实现方案，参考 `streamingDraft.ts` 的实现模式，支持分段修订、实时进度推送、版本保存。

## 需求变更

### FR-SR-001: 流式修订生成
- **需求**: 蓝军评审后的正文修改支持流式生成
- **参考**: 参考 `streamingDraft.ts` 的分段生成模式
- **实现**: `streamingRevision.ts` 服务

### FR-SR-002: 版本保存
- **需求**: 支持保存中间版本和最终版本
- **说明**: 每修订3个段落保存一个中间版本，完成时保存最终版本

### FR-SR-003: 实时进度推送
- **需求**: 支持 SSE 实时推送修订进度
- **事件类型**: start, progress, complete, error

### FR-SR-004: 版本历史管理
- **需求**: 支持查看版本历史、版本对比、版本回滚
- **视图**: `draft_version_tree` 支持版本链查询

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Stage4 流式修订流程                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 解析原文 → 按大纲分段                                    │
│       ↓                                                     │
│  2. 建议分组 → 按段落关联评审意见                              │
│       ↓                                                     │
│  3. 串行修订 → 逐段流式生成修订内容                            │
│       │                                                     │
│       ├──→ 推送 progress 事件（每段完成）                      │
│       │                                                     │
│       ├──→ 保存中间进度（可选）                               │
│       │                                                     │
│       └──→ 保存中间版本（每3段）                              │
│       ↓                                                     │
│  4. 生成修订说明                                             │
│       ↓                                                     │
│  5. 保存最终版本 + 修订记录                                   │
│       ↓                                                     │
│  6. 推送 complete 事件                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 数据模型

### RevisionSection（修订段落）
```typescript
{
  id: string;                    // 段落ID
  outlineNodeId: string;         // 大纲节点ID
  title: string;                 // 段落标题
  level: number;                 // 标题层级
  originalContent: string;       // 原文内容
  revisedContent: string;        // 修订后内容
  revisionNotes: string[];       // 应用的修订意见
  wordCount: number;             // 字数
  status: 'pending' | 'processing' | 'done' | 'error';
}
```

### ReviewSuggestion（评审建议）
```typescript
{
  id: string;                    // 建议ID
  expertName: string;            // 专家名称
  expertRole: string;            // 专家角色
  question: string;              // 问题描述
  suggestion: string;            // 修改建议
  severity: 'high' | 'medium' | 'low' | 'praise';
  location?: string;             // 位置信息
  category?: string;             // 问题分类
  status: 'pending' | 'applied' | 'ignored';
}
```

## API 接口

### 1. 查询修订进度
```http
GET /api/v1/production/:taskId/draft/:draftId/revision/progress
```

响应：
```json
{
  "status": "processing",
  "currentIndex": 2,
  "total": 5,
  "currentTitle": "市场分析",
  "revisedWordCount": 1500,
  "totalWordCount": 3000,
  "progress": 0.4,
  "sections": [...],
  "appliedSuggestions": 3,
  "totalSuggestions": 8,
  "accumulatedContent": "..."
}
```

### 2. 启动流式修订（SSE）
```http
POST /api/v1/production/:taskId/draft/:draftId/revision/stream
Content-Type: application/json

{
  "suggestions": [
    {
      "id": "sug-1",
      "expertName": "批判者",
      "expertRole": "challenger",
      "question": "数据缺乏来源",
      "suggestion": "请补充数据来源",
      "severity": "high",
      "location": "市场分析"
    }
  ],
  "revisionMode": "balanced"
}
```

SSE 事件：
- `start`: 修订开始
- `progress`: 进度更新
- `complete`: 修订完成
- `error`: 错误信息

### 3. 获取修订历史
```http
GET /api/v1/production/:taskId/revisions
```

### 4. 获取版本对比
```http
GET /api/v1/production/:taskId/draft/:draftId/diff/:newDraftId
```

### 5. 获取版本树
```http
GET /api/v1/production/:taskId/version-tree
```

### 6. 获取中间版本
```http
GET /api/v1/production/:taskId/draft/:draftId/intermediate-versions
```

### 7. 回滚到指定版本
```http
POST /api/v1/production/:taskId/draft/:draftId/rollback
Content-Type: application/json

{
  "version": 2
}
```

## 数据库表

### draft_revisions（修订记录）
```sql
CREATE TABLE draft_revisions (
    id UUID PRIMARY KEY,
    task_id VARCHAR(50) NOT NULL,
    draft_id VARCHAR(50) NOT NULL,      -- 原稿ID
    new_draft_id VARCHAR(50) NOT NULL,  -- 修订后稿ID
    version INTEGER NOT NULL,
    suggestions_applied INTEGER DEFAULT 0,
    suggestions_total INTEGER DEFAULT 0,
    mode VARCHAR(20) CHECK (mode IN ('conservative', 'balanced', 'aggressive')),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### draft_revision_progress（修订进度）
```sql
CREATE TABLE draft_revision_progress (
    id UUID PRIMARY KEY,
    task_id VARCHAR(50) NOT NULL,
    draft_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'running', 'completed', 'error')),
    current_section_index INTEGER DEFAULT 0,
    total_sections INTEGER DEFAULT 0,
    accumulated_content TEXT,
    sections JSONB,
    progress DECIMAL(5,4),
    applied_suggestions INTEGER DEFAULT 0,
    total_suggestions INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### draft_intermediate_versions（中间版本）
```sql
CREATE TABLE draft_intermediate_versions (
    id UUID PRIMARY KEY,
    task_id VARCHAR(50) NOT NULL,
    parent_draft_id VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL,
    sub_version INTEGER NOT NULL,       -- 如 v2.1, v2.2
    content TEXT NOT NULL,
    sections_completed INTEGER,
    total_sections INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 修订模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| conservative | 保守修改，仅修改被明确指出的问题 | 微调、最终润色 |
| balanced | 平衡修改，在保持原文风格基础上优化 | 一般评审修订 |
| aggressive | 积极修改，根据建议全面重构 | 大幅改进 |

## 与 streamingDraft.ts 对比

| 特性 | streamingDraft（写作） | streamingRevision（修订） |
|------|------------------------|---------------------------|
| 输入 | 大纲 + 研究数据 | 原文 + 评审建议 |
| 生成方式 | 逐段生成新内容 | 逐段修订现有内容 |
| 上下文 | 前文上下文 | 前文修订结果 + 评审建议 |
| 版本管理 | 单版本 | 版本链（父版本 → 子版本） |
| 进度追踪 | 生成进度 | 修订进度 + 建议应用数 |
| 中间保存 | 每段保存进度 | 每段保存进度 + 每3段保存版本 |

## 实现文件

| 文件 | 说明 |
|------|------|
| `api/src/services/streamingRevision.ts` | 核心流式修订服务 |
| `api/src/routes/production.ts` | API 路由定义 |
| `api/migrations/004_add_streaming_revision.sql` | 数据库迁移脚本 |
| `api/docs/stage4-streaming-revision.md` | 需求文档 |

## 迁移步骤

1. 执行数据库迁移：
```bash
psql -d your_database -f api/migrations/004_add_streaming_revision.sql
```

2. 部署 API 服务

3. 前端集成 SSE 客户端

## 注意事项

1. **建议分组算法**: 根据 `location` 字段匹配段落，未匹配的分配给通用段落
2. **错误处理**: 某段修订失败会抛出错误，不自动跳过
3. **字数控制**: 修订后的字数尽量与原文相近
4. **状态更新**: 修订完成后自动更新建议状态为 `applied`
