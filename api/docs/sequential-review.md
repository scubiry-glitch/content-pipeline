# 串行多轮评审系统 (Sequential Multi-Round Review System) v5.0

## 概述

串行多轮评审系统实现了「专家库 + AI专家」的混合评审模式，支持顺序执行的评审流程。

### 核心特性

- **专家组合**: 3位AI专家 + ≥2位真人专家
- **串行执行**: 每位专家按顺序评审，前一位的修改稿作为下一位的输入
- **自动修订**: LLM根据评审意见自动生成新版本Draft
- **版本追踪**: 完整记录版本流转链

## 专家配置

### AI专家角色

| 角色 | 名称 | 关注点 |
|------|------|--------|
| challenger | 批判者 | 逻辑漏洞、论证跳跃、数据可靠性、隐含假设 |
| expander | 拓展者 | 关联因素、国际对比、交叉学科、长尾效应 |
| synthesizer | 提炼者 | 核心论点、结构优化、金句提炼、消除冗余 |

### 真人专家

从专家库(`expertLibrary.ts`)动态匹配，优先选择2位最相关的领域专家。

## 评审流程

```
┌─────────────────────────────────────────────────────────────┐
│  初始稿件 v1                                                │
│     ↓                                                       │
│  [Round 1] 挑战者 (AI) ───→ LLM修订 ───→ 稿件 v2           │
│     ↓                                                       │
│  [Round 2] 专家A (真人) ──→ LLM修订 ───→ 稿件 v3           │
│     ↓                                                       │
│  [Round 3] 拓展者 (AI) ───→ LLM修订 ───→ 稿件 v4           │
│     ↓                                                       │
│  [Round 4] 专家B (真人) ──→ LLM修订 ───→ 稿件 v5           │
│     ↓                                                       │
│  [Round 5] 提炼者 (AI) ───→ LLM修订 ───→ 终稿 v6           │
└─────────────────────────────────────────────────────────────┘
```

## API 接口

### 1. 配置串行评审

```http
POST /api/v1/production/:taskId/sequential-review/configure
Content-Type: application/json

{
  "topic": "AI投资趋势分析"
}
```

响应：
```json
{
  "taskId": "task-xxx",
  "reviewQueue": [
    { "type": "ai", "role": "challenger", "name": "批判者" },
    { "type": "human", "id": "exp-1", "name": "张专家", "profile": "AI投资分析师" },
    { "type": "ai", "role": "expander", "name": "拓展者" },
    { "type": "human", "id": "exp-2", "name": "李研究员", "profile": "科技产业研究员" },
    { "type": "ai", "role": "synthesizer", "name": "提炼者" }
  ],
  "totalRounds": 5
}
```

### 2. 执行串行评审

```http
POST /api/v1/production/:taskId/sequential-review/conduct
```

响应：
```json
{
  "message": "串行评审已启动",
  "taskId": "task-xxx",
  "expertCount": 5
}
```

**注意**: 此接口立即返回，评审在后台异步执行。

### 3. 获取评审结果

```http
GET /api/v1/production/:taskId/sequential-review/results
```

响应：
```json
{
  "reviews": [...],
  "chain": [...],
  "totalReviews": 5,
  "completedReviews": 3,
  "averageScore": 82.5
}
```

### 4. 获取单轮评审详情

```http
GET /api/v1/production/:taskId/sequential-review/round/:round
```

响应：
```json
{
  "id": "review-xxx",
  "round": 1,
  "expertType": "ai",
  "expertRole": "challenger",
  "expertName": "批判者",
  "status": "completed",
  "overallScore": 75,
  "summary": "整体评价...",
  "questions": [
    {
      "question": "论证不够严密",
      "severity": "high",
      "suggestion": "建议补充更多数据支撑",
      "category": "逻辑漏洞"
    }
  ]
}
```

### 5. 获取评审进度

```http
GET /api/v1/production/:taskId/sequential-review/progress
```

响应：
```json
{
  "taskId": "task-xxx",
  "progress": 60,
  "currentRound": 3,
  "totalRounds": 5,
  "averageScore": 82.5,
  "status": "in_progress"
}
```

## 数据库表

### expert_reviews

专家评审记录表，存储每位专家的评审结果。

```sql
CREATE TABLE expert_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL,
    draft_id VARCHAR(50) NOT NULL,
    round INTEGER NOT NULL,
    expert_type VARCHAR(20) NOT NULL, -- 'ai' or 'human'
    expert_role VARCHAR(50),          -- AI角色: challenger/expander/synthesizer
    expert_id VARCHAR(50),            -- 真人专家ID
    expert_name VARCHAR(100) NOT NULL,
    expert_profile TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    questions JSONB DEFAULT '[]'::jsonb,
    overall_score INTEGER,
    summary TEXT,
    input_draft_id VARCHAR(50) NOT NULL,
    output_draft_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### expert_review_tasks

真人专家评审任务表，用于通知和追踪。

```sql
CREATE TABLE expert_review_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(50) NOT NULL,
    review_id UUID NOT NULL,
    draft_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    draft_content TEXT NOT NULL,
    fact_check_summary JSONB,
    logic_check_summary JSONB,
    deadline TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### review_chains

评审链记录表，追踪版本流转。

```sql
CREATE TABLE review_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL,
    round INTEGER NOT NULL,
    expert_id VARCHAR(50) NOT NULL,
    expert_name VARCHAR(100) NOT NULL,
    input_draft_id VARCHAR(50) NOT NULL,
    output_draft_id VARCHAR(50),
    review_id UUID REFERENCES expert_reviews(id),
    score INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 迁移脚本

运行数据库迁移：

```bash
# 使用 psql
psql -d your_database -f api/migrations/003_add_sequential_review.sql
```

## 实现文件

| 文件 | 说明 |
|------|------|
| `api/src/services/sequentialReview.ts` | 核心串行评审服务 |
| `api/src/routes/production.ts` | API路由定义 |
| `api/migrations/003_add_sequential_review.sql` | 数据库迁移脚本 |

## 与旧版对比

| 特性 | 旧版并行评审 | 新版串行评审 |
|------|-------------|-------------|
| 专家数量 | 3位AI专家 | 3位AI + ≥2位真人 |
| 执行方式 | 并行 | 串行 |
| 版本流转 | 人工确认后统一修订 | 每轮自动LLM修订 |
| 评审深度 | 浅层覆盖 | 深度迭代 |
| 适用场景 | 快速初筛 | 高质量终稿 |

## 注意事项

1. **真人专家评审**: 当前实现使用AI代理真人专家评审，实际应用中需要实现通知机制
2. **超时处理**: 真人专家评审有24小时截止时间
3. **错误恢复**: 某轮评审失败不会影响后续轮次
4. **性能**: 串行执行时间较长，建议异步执行
