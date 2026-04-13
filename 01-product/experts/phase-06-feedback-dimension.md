# Phase 6: feedbackLoop 按 rubric 维度校准

## 背景

`feedbackLoop.ts` 目前只收集单一 `human_score` (1-5) 做校准，无法识别"这个专家在'护城河深度'这个特定维度是不是偏弱"。Phase 1 已经让 `ExpertResponse.metadata.rubric_scores` 产出维度级评分，Phase 6 把这个能力延伸到反馈闭环——让前端能按维度打分，让 `calibrateExpert` 能识别维度级薄弱点，让 `applyCalibration` 能自动追加 blindSpots 声明。

## 变更点

### 1. `api/src/modules/expert-library/types.ts`

`ExpertFeedback` 增加 `rubric_scores?: Record<string, number>` 字段。

### 2. `api/src/db/connection.ts`（initDatabase）

兼容创建 `expert_feedback` 表（过去该表只在 `api/src/modules/expert-library/migrations/001-expert-library.sql` 中定义，但那个文件没有被自动执行）。新增 `ADD COLUMN IF NOT EXISTS rubric_scores JSONB` 和 idx_feedback_expert 索引。

### 3. `api/src/modules/expert-library/migrations/003-feedback-rubric-scores.sql`（新建）

独立 SQL 文件，作为生产环境手动应用的参考，内容等价于上面的 `ALTER TABLE`。

### 4. `api/src/modules/expert-library/feedbackLoop.ts`

**`submitFeedback()`**
- INSERT 语句增加 `rubric_scores` 列
- 参数数量从 6 变为 7

**`calibrateExpert()`**
- SELECT 查询增加 `rubric_scores` 列
- 新增私有 helper `aggregateRubricScores(rows)` 按维度聚合
- 在 prompt 中加入 "按维度评分" 和 "持续偏弱的维度" 块，引导 LLM 建议聚焦
- 返回值增加 `dimensionAverages?: Record<string, {avg, count}>` 字段

**`applyCalibration()`**
- SELECT 查询增加 `rubric_scores`
- 阈值 `< 2.8` 且 `count >= 3` 的维度被标记为"持续偏弱"
- 在最终 `suggestions` 列表头部自动插入 `"⚠️ 维度 X 持续偏弱: 2.5/5 (n=5) — 建议在 blindSpots.explicitLimitations 声明此局限"`
- 即使 EMM 权重无需调整，存在持续偏弱维度时也会返回 `applied` 状态

**`aggregateRubricScores(rows)`** (新私有函数)
- 支持 JSONB 返回既可能是 string 也可能是 object（pg driver 行为）
- 输出 `{ dimension: { avg, count } }`

### 5. `api/src/modules/expert-library/router.ts`

`POST /feedback` 端点 handler：
- 接收 request body 的可选字段 `rubric_scores`
- 校验为 `Record<string, number>`，且 1 ≤ value ≤ 5，整数化
- 非法字段过滤后传给 `submitFeedback()`

## 接口变化

### Request: `POST /api/v1/expert-library/feedback`

**Before**:
```json
{
  "expert_id": "S-32",
  "invoke_id": "uuid",
  "human_score": 4,
  "human_notes": "整体可以"
}
```

**After** (新增可选字段):
```json
{
  "expert_id": "S-32",
  "invoke_id": "uuid",
  "human_score": 4,
  "human_notes": "整体可以",
  "rubric_scores": {
    "护城河深度": 5,
    "管理层诚信": 4,
    "估值合理性": 2
  }
}
```

### Response: `POST /api/v1/expert-library/calibrate/:id`

**Before**:
```json
{ "status": "applied", "suggestions": ["..."] }
```

**After** (累积反馈后):
```json
{
  "status": "applied",
  "suggestions": [
    "⚠️ 维度 '估值合理性' 持续偏弱: 2.40/5 (n=5) — 建议在 blindSpots.explicitLimitations 声明此局限",
    "安全边际相关因子权重建议上调 5%"
  ],
  "weightChanges": {...}
}
```

### DB 变更

`expert_feedback` 表新增列：
```sql
ALTER TABLE expert_feedback ADD COLUMN IF NOT EXISTS rubric_scores JSONB;
CREATE INDEX IF NOT EXISTS idx_feedback_expert ON expert_feedback(expert_id, created_at DESC);
```

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 端到端流程

**1. 提交带维度分的反馈**
```bash
# 先调用 invoke 拿到 invoke_id 和 rubric_scores
INVOKE_RESP=$(curl -sX POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"expert_id":"S-32","task_type":"evaluation","input_type":"text","input_data":"评估中国平安"}')
INVOKE_ID=$(echo $INVOKE_RESP | jq -r '.metadata.invoke_id')

# 提交维度级反馈
curl -X POST http://localhost:3006/api/v1/expert-library/feedback \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"expert_id\": \"S-32\",
    \"invoke_id\": \"$INVOKE_ID\",
    \"human_score\": 3,
    \"rubric_scores\": { \"护城河深度\": 5, \"管理层诚信\": 4, \"估值合理性\": 1 }
  }"
```

**2. 累积 3 条以上后触发校准**
```bash
curl -X POST http://localhost:3006/api/v1/expert-library/calibrate/S-32 \
  -H "X-API-Key: $API_KEY" | jq
```

**预期**：`suggestions` 头部出现"维度 '估值合理性' 持续偏弱"条目。

### 回归测试
- 不带 `rubric_scores` 的老 feedback 提交应正常工作（字段为 NULL）
- `calibrateExpert` 在只有 `human_score` 的反馈数据上应退化为原行为

## 下游收益

1. **前端按维度打分**：`ExpertAdmin.tsx` 的反馈表单可以改为按专家 `output_schema.rubrics` 的维度逐项打分，而非单一 slider（本 Phase 的后端已就绪，前端改动作为后续工作）
2. **细粒度盲区识别**：持续低分的维度会被自动标记为"需要在 blindSpots.explicitLimitations 声明"——闭环到专家的诚实边界声明
3. **趋势分析**：DB 累积的 `rubric_scores` JSONB 可用于时间序列图表，观察某维度评分随时间变化
4. **自动校准精度提升**：LLM prompt 中包含维度统计后，权重调整更有针对性

## 已知限制

- **前端 UI 未改**：ExpertAdmin.tsx 的反馈表单仍是单 slider，需要独立任务改造（本 Phase 已完成后端能力铺垫）
- **自动 blindSpots 追加是建议性的**：系统不会自动修改专家的 profile，只在 suggestions 中提示管理员——避免自动修改引发不可预期的回归
- **2.8 阈值硬编码**：`weakDimensions` 的判定阈值未配置化，未来可能需要按专家/任务类型调整
- **需要 ≥3 条同维度数据**：样本量太少会被忽略，避免单次反馈错误导致过度反应
- **`expert_feedback` 表的创建脚本**：通过 `initDatabase` 兼容创建，但依赖调用 `initDatabase` 的环境——某些生产环境可能需要手动执行 migration 003

## 后续相关 Phase

- Phase 7 ExpressionDNA linter 会产生更多维度反馈数据，进一步丰富本 Phase 的输入
- 独立后续任务：前端 ExpertAdmin.tsx 反馈表单维度化改造
</content>
</invoke>
