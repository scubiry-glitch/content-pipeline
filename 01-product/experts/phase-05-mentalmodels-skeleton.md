# Phase 5: mentalModels 作为分析框架显式骨架

## 背景

Phase 1 把 rubrics 做成了 evaluation 任务的结构化输出。analysis 任务还缺一个对等能力：让 LLM 明确说出"这个结论是用了哪个心智模型得出的"，便于：
- 追溯推理链（用户看到"飞轮效应 → 数据说 Tesla 每提升 1% 产能利用率能降 3% 成本 → 因此当前估值合理"而非纯文字）
- 可视化（UI 可以渲染成标签云或心智模型应用热力图）
- 跨专家对比（同一话题用不同专家分析，比较各自的模型组合）

## 变更点

### 1. `api/src/modules/expert-library/types.ts`

新增接口：
```ts
export interface ModelApplication {
  modelName: string;      // 对应 MentalModel.name
  application: string;    // 具体推理过程
  conclusion: string;     // 子结论
}
```

`ExpertResponse.metadata` 增加 `model_applications?: ModelApplication[]`。

### 2. `api/src/modules/expert-library/promptBuilder.ts`

`buildTaskPersonalization()` 在 `taskType === 'analysis'` 且专家有 `mentalModels` 时追加"结构化输出要求"段：
- 列出所有可用心智模型（最多 5 个）
- 要求 LLM 挑选 2-3 个最相关的应用
- 明确要求输出 ```json 代码块，格式为 `{ "model_applications": [{modelName, application, conclusion}] }`
- 强调 `modelName` 必须严格来自上述清单，**不得生造**

### 3. `api/src/modules/expert-library/ExpertEngine.ts`

- `invoke()` 新增局部变量 `modelApplications`
- analysis 分支调用 LLM 后，若专家有 mentalModels 则调用新 helper `parseModelApplications(rawOutput, mentalModels)`
- 将解析结果写入 `response.metadata.model_applications`

新增私有 helper `parseModelApplications()`：
- 与 `parseRubricScores` 类似的容错 JSON 解析
- 用 `validNames = Set(mentalModels.name)` 过滤掉 LLM 生造的模型名
- 失败返回 `undefined`（不抛错）

## 接口变化

**Before** (analysis 任务):
```json
{
  "metadata": {
    "input_analysis": {...},
    "emm_result": {...},
    "confidence": 0.88,
    "processing_time_ms": 1500,
    "invoke_id": "..."
  }
}
```

**After** (analysis + 专家有 mentalModels):
```json
{
  "metadata": {
    ...,
    "model_applications": [
      {
        "modelName": "飞轮效应",
        "application": "头条 DAU 增长带来更多数据 → 更好推荐 → 更长停留 → 更多 DAU",
        "conclusion": "短视频赛道具备自我强化的正循环，护城河成立"
      },
      {
        "modelName": "延迟满足组织论",
        "application": "字节拒绝短期上市压力，用 OKR 引导长期方向",
        "conclusion": "字节的长期竞争力建立在组织"延迟满足"基因之上"
      }
    ]
  }
}
```

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 端到端调用
```bash
curl -X POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "expert_id": "S-01",
    "task_type": "analysis",
    "input_type": "text",
    "input_data": "分析字节跳动国际化策略"
  }' | jq '.metadata.model_applications'
```

**预期**：返回 2-3 个 application 记录，每个含合法的 modelName（来自张一鸣的 3 个心智模型：概率思维/增长飞轮/延迟满足组织论）。

### 回归测试
- analysis 任务对没有 mentalModels 的专家应正常工作，`model_applications` 缺失
- evaluation 和 generation 任务不受影响

## 下游收益

1. **UI 渲染**：可以在 ExpertAdmin 的调用结果区展示"用了哪几个心智模型"
2. **分析质量追溯**：通过 `application/conclusion` 字段可以反向检查 LLM 推理是否真的体现了该模型的核心机制
3. **跨专家对比**：同一话题用 S-01/S-31/S-32 分析，可以看到三位的心智模型组合差异（飞轮 vs 飞轮+长期主义 vs 护城河+安全边际）
4. **Phase 10 Mental Model Catalog 的基础**：catalog 可以记录"哪些模型被真实 invoke 应用过，应用频率多高"

## 已知限制

- **LLM 可能忽略 JSON 要求**：与 Phase 1 同样的风险，解析失败时返回 undefined 降级
- **仅 analysis 任务**：evaluation 走 analyzeThenJudge 分支，没有接入（evaluation 已有 rubric_scores 做结构化）
- **没有 mentalModels 的专家不受益**：E 系列领域专家和部分旧 S 级专家
- **LLM 可能生造模型名**：用 `validNames` 过滤掉不在清单中的条目，但可能整个 LLM 输出全被过滤

## 后续相关 Phase

- Phase 8 跨专家 mentalModel 索引图：可以把本 Phase 的 application 记录反向聚合——"飞轮效应在近 30 天的所有 analysis 调用中被应用了多少次"
- Phase 10 Mental Model Catalog：把 model_applications 累积数据作为"模型热度"指标
