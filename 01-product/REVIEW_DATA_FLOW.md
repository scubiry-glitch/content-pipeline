# 评审数据流转方案

## 1. 设计目标

- **单一数据源**: `blue_team_reviews` 作为唯一对外暴露的评审意见表
- **内部隔离**: `expert_reviews` + `review_chains` 仅用于串行评审内部流转
- **自动同步**: 串行评审完成后，自动将结果合并到 `blue_team_reviews`
- **版本追溯**: 通过 `draft_versions` 的 `source_review_id` 关联

## 2. 表职责划分

```
┌─────────────────────────────────────────────────────────────┐
│                     对外接口层                               │
│           blue_team_reviews (统一评审意见表)                  │
│  ├─ 并行评审直接写入                                         │
│  ├─ 串行评审完成后同步                                        │
│  └─ 前端读取评审列表的唯一来源                                 │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ 同步 (finalizeSequentialReview)
┌─────────────────────────────────────────────────────────────┐
│                     串行评审内部层                           │
│                                                             │
│   expert_reviews ──► review_chains ──► draft_versions      │
│   (专家评分)         (版本链记录)        (自动修订稿)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 3. 数据流转详细流程

### 3.1 并行评审模式

```
User创建任务
    │
    ▼
启动并行评审 (BlueTeamAgent)
    │
    ▼
写入 blue_team_reviews (status='pending')
    │
    ▼
任务状态: awaiting_approval
    │
    ▼
User查看/处理意见
    │
    ├── 点击"接受" ──► 自动修订 (revisionAgent)
    │                    └── 创建 draft_versions 新版本
    ├── 点击"忽略" ──► 更新 status='ignored'
    └── 点击"手动处理" ──► 更新 status='manual_resolved'
```

### 3.2 串行评审模式

```
User创建任务
    │
    ▼
启动串行评审 (startSequentialReview)
    │
    ▼
processNextRound() 循环处理:
    │
    ├── 批判者评审 ──► conductAIExpertReview()
    │                   ├── 写入 expert_reviews
    │                   └── generateRevisedDraft() ──► draft_versions
    │
    ├── 拓展者评审 ──► conductAIExpertReview()
    │                   ├── 写入 expert_reviews
    │                   └── generateRevisedDraft() ──► draft_versions
    │
    └── 提炼者评审 ──► conductAIExpertReview()
                        ├── 写入 expert_reviews
                        └── generateRevisedDraft() ──► draft_versions
    │
    ▼
finalizeSequentialReview()
    │
    ├── 生成 review_reports
    ├── 更新 draft_versions.status='final'
    ├── 同步到 blue_team_reviews (status='completed')
    │       └── syncToBlueTeamReviews()
    └── 任务状态: awaiting_approval
    │
    ▼
User查看意见 (已自动处理完成，无需操作)
```

## 4. 状态定义

| 状态值 | 适用场景 | 含义 | 前端显示 |
|--------|----------|------|----------|
| `pending` | 并行评审 | 待用户处理 | ⏳ 待处理 |
| `accepted` | 并行评审 | 用户已接受（触发修订） | ✓ 已接受 |
| `ignored` | 并行评审 | 用户已忽略 | ⊘ 已忽略 |
| `completed` | 串行评审 | 系统自动处理完成 | ✓ 已完成 |
| `manual_resolved` | 并行评审 | 用户手动处理 | ✓ 已手动处理 |

## 5. 关键字段映射

### blue_team_reviews (统一表)

```sql
CREATE TABLE blue_team_reviews (
  id UUID PRIMARY KEY,
  task_id VARCHAR(50) REFERENCES tasks(id),
  round INTEGER NOT NULL,              -- 评审轮次
  expert_role VARCHAR(50),             -- challenger/expander/synthesizer
  questions JSONB,                     -- 评审问题列表
  status VARCHAR(20),                  -- pending/accepted/ignored/completed/manual_resolved
  user_decision VARCHAR(20),           -- accept/ignore/manual_resolved/completed
  decision_note TEXT,                  -- 决策说明
  decided_at TIMESTAMP,                -- 决策时间
  created_at TIMESTAMP DEFAULT NOW()
);
```

### expert_reviews (串行内部表)

```sql
CREATE TABLE expert_reviews (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL,
  draft_id VARCHAR(50) NOT NULL,
  round INTEGER NOT NULL,
  expert_type VARCHAR(10),             -- 'ai' | 'human'
  expert_role VARCHAR(50),             -- challenger/expander/synthesizer
  expert_name VARCHAR(100),
  status VARCHAR(20),                  -- pending/in_progress/completed/skipped
  questions JSONB,
  overall_score INTEGER,               -- 0-100
  summary TEXT,
  input_draft_id VARCHAR(50),          -- 输入版本
  output_draft_id VARCHAR(50),         -- 输出版本（修订后）
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

## 6. 数据同步规则

### 6.1 同步时机
- **触发点**: `finalizeSequentialReview()` 函数末尾
- **调用**: `syncToBlueTeamReviews(taskId, expertReviews)`

### 6.2 同步逻辑

```typescript
async function syncToBlueTeamReviews(taskId, expertReviews) {
  // 1. 清理旧数据
  DELETE FROM blue_team_reviews WHERE task_id = $1;
  
  // 2. 只同步 AI 专家评审
  for (const review of expertReviews) {
    if (review.expert_type === 'ai') {
      INSERT INTO blue_team_reviews (
        id, task_id, round, expert_role, questions,
        status,           -- 'completed'
        user_decision,    -- 'completed'
        decision_note     -- '串行评审第X轮自动处理完成'
      );
    }
  }
}
```

### 6.3 不同步的数据
- 真人专家评审 (`expert_type = 'human'`)
- 中间状态评审 (`status != 'completed'`)

## 7. API 接口设计

### 7.1 获取评审列表 (已存在)

```
GET /api/v1/production/:taskId/reviews

Response: {
  taskId: string,
  status: string,
  summary: {
    total: number,
    critical: number,
    warning: number,
    praise: number,
    accepted: number,
    pending: number,
    ignored: number
  },
  experts: [...],
  rawReviews: [...]  // 来自 blue_team_reviews
}
```

### 7.2 提交评审决策 (已存在)

```
POST /api/v1/production/:taskId/review-items/:reviewId/decide

Body: {
  decision: 'accept' | 'ignore' | 'manual_resolved',
  note?: string
}

Response: {
  success: boolean,
  reviewItem: {...},
  revisionResult?: {        // 仅 accept 时返回
    success: boolean,
    newDraftId: string,
    newVersion: number,
    revisedContent: string,
    changes: string
  }
}
```

## 8. 前端适配

### 8.1 ReviewsTab 组件

```typescript
// 状态映射
const statusLabels = {
  pending: { text: '⏳ 待处理', class: 'pending' },
  accepted: { text: '✓ 已接受', class: 'accepted' },
  accept: { text: '✓ 已接受', class: 'accepted' },
  ignored: { text: '⊘ 已忽略', class: 'ignored' },
  manual_resolved: { text: '✓ 已手动处理', class: 'manual' },
  completed: { text: '✓ 系统已处理', class: 'accepted' },  // 串行评审
};

// 按钮显示逻辑
{task?.status === 'awaiting_approval' && 
 (!item.status || item.status === 'pending') && 
 item.severity !== 'praise' && (
  <div className="review-actions">
    <button onClick={() => onReviewDecision(...)}>✓ 接受修改</button>
    <button onClick={() => onReviewDecision(...)}>✓ 已手动处理</button>
    <button onClick={() => onReviewDecision(...)}>⊘ 忽略</button>
  </div>
)}
```

### 8.2 串行评审已完成的状态

- `status = 'completed'` 或 `user_decision = 'completed'`
- 前端显示"✓ 系统已处理"
- 不显示操作按钮

## 9. 数据清理

对于已存在的重复数据，执行一次性清理：

```sql
-- 清理串行评审任务的 blue_team_reviews 重复数据
-- (保留同步后的数据，删除之前的手动插入)
DELETE FROM blue_team_reviews btr
WHERE EXISTS (
  SELECT 1 FROM task_review_progress trp
  WHERE trp.task_id = btr.task_id
    AND trp.status = 'completed'
    AND btr.decision_note IS NULL  -- 旧数据没有决策说明
);
```

## 10. 优势总结

| 优势 | 说明 |
|------|------|
| **单一数据源** | 前端只读 blue_team_reviews，简化逻辑 |
| **向后兼容** | 旧并行评审数据不受影响 |
| **可追溯** | 通过 review_id 可关联 expert_reviews 详情 |
| **可扩展** | 未来新增评审模式只需修改同步逻辑 |
