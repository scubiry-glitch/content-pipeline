# Phase 1: Rubrics 驱动的结构化评分输出

## 背景

专家库的 `EvaluationRubric` 类型早已定义（`types.ts:206`），并且 21 个 nuwa 增强专家中有 8+ 个填充了 rubrics 数据（如 S-32 巴菲特的"护城河深度/管理层诚信/估值合理性"三维评分）。但这些数据只在 `promptBuilder.ts` 的 `buildOutputSection()` 里作为"评估量表"描述塞给 LLM 当背景参考——LLM 输出是纯自由文本，`ExpertEngine.invoke()` 返回的 `metadata` **没有任何结构化评分字段**。

这导致下游应用（`OutlineExpertReviewer`、`AssetExpertService`、`DebateEngine`）无法做：
- 跨专家横向对比（例如 3 个专家评审同一大纲后按维度算加权平均）
- 持久化到数据库做趋势分析
- 基于某维度的分数触发自动警报（如"护城河<3 分"否决）

本 Phase 把 evaluation 任务的输出升级为"自由文本 + 结构化 JSON 双轨"，让 rubric 评分成为一等公民。

## 变更点

### 1. `api/src/modules/expert-library/types.ts`
- 新增接口 `RubricScore { dimension: string; score: number; rationale: string }` — LLM 输出解析后的结构化评分（types.ts 行 216-221）
- `ExpertResponse.metadata` 增加可选字段 `rubric_scores?: RubricScore[]`（行 258-259）
- `VerdictResult` 增加可选字段 `rubric_scores?: RubricScore[]`（行 330）

### 2. `api/src/modules/expert-library/analyzeThenJudge.ts`
- `import` 追加 `RubricScore`（行 7）
- `judge()` 函数（行 190 起）：
  - 检测 `expert.output_schema.rubrics`，若非空则在 prompt 末尾追加"结构化评分"指令
  - 指令明确要求 LLM **额外输出一段 ` ```json ... ``` ` 代码块**，包含 `rubric_scores` 数组
  - 调用 LLM 后调用新 helper `parseRubricScores(output, rubrics)` 解析
  - 将解析结果写入 `VerdictResult.rubric_scores`
- 新增 `parseRubricScores()` helper：
  - 优先匹配 ```` ```json ... ``` ```` 代码块，fallback 到文末最后一个 `{...}`
  - 通过 `JSON.parse` 尝试解析
  - 校验：`dimension` 必须是 rubrics 里定义的维度之一；`score` 被 clamp 到 1-5 整数；`rationale` 非字符串则填空
  - 解析失败返回 `undefined`（不抛错，下游当做无评分处理）

### 3. `api/src/modules/expert-library/ExpertEngine.ts`
- `invoke()` 函数新增局部变量 `rubricScores: RubricScore[] | undefined`（行 ~55）
- 进入 `evaluation` 分支时从 `analysisResult.verdict.rubric_scores` 提取（行 ~67）
- 构造 `ExpertResponse` 时把 `rubricScores` 写入 `metadata.rubric_scores`（行 ~108）

## 接口变化

**Before**:
```json
{
  "output": { "sections": [...] },
  "metadata": {
    "input_analysis": {...},
    "emm_result": {...},
    "confidence": 0.85,
    "processing_time_ms": 1234,
    "invoke_id": "..."
  }
}
```

**After** (task_type='evaluation' 且专家有 rubrics):
```json
{
  "output": { "sections": [...] },
  "metadata": {
    "input_analysis": {...},
    "emm_result": {...},
    "confidence": 0.85,
    "processing_time_ms": 1234,
    "invoke_id": "...",
    "rubric_scores": [
      { "dimension": "护城河深度", "score": 4, "rationale": "品牌+规模双重护城河，但技术迭代可能冲击" },
      { "dimension": "管理层诚信", "score": 5, "rationale": "长期致股东信坦诚公开，无粉饰行为" },
      { "dimension": "估值合理性", "score": 3, "rationale": "当前 P/E 高于十年均值，安全边际较薄" }
    ]
  }
}
```

任务非 evaluation 或专家没有配置 rubrics 时 `rubric_scores` 缺失（字段不存在，非空数组），完全向后兼容。

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit
# 仅有 tsconfig 的 2 个预存 deprecation 告警，无新增错误
```

### 端到端调用
```bash
# S-32 巴菲特 + 评估一个投资案例
curl -X POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "expert_id": "S-32",
    "task_type": "evaluation",
    "input_type": "text",
    "input_data": "评估这家公司：中国平安，金融巨头，ROE 长期 15%+，品牌强但近年房地产敞口..."
  }' | jq '.metadata.rubric_scores'
```

预期输出 3 个维度的评分，每个含 `dimension/score/rationale`。

### 回归测试
- `task_type='analysis'` 和 `'generation'` 调用应保持原样，`metadata.rubric_scores` 缺失
- 未配置 rubrics 的专家（如 yiMeng）调用 evaluation 应正常返回，`rubric_scores` 缺失

## 下游收益

1. **OutlineExpertReviewer** 可以改造为按维度汇总：
   - 当前：`reviews.map(r => r.overallScore)` 得一个 1-10 分
   - 升级后：`reviews.flatMap(r => r.metadata.rubric_scores)` 可做按维度加权聚合
2. **AssetExpertService.assessCredibility** 可以把单一分数改为多维度分数矩阵
3. **feedbackLoop** (Step 6 会用到) 可以根据 `rubric_scores` 做维度级校准
4. **前端 UI** 可以渲染评分雷达图/柱状图而非只有文本
5. **数据库审计** 可以按维度追踪专家评分分布

## 已知限制

- **LLM 不稳定性**：LLM 可能忘记输出 JSON 代码块 → `parseRubricScores()` 返回 `undefined`，不影响文本输出
- **维度名必须严格匹配**：LLM 若把"护城河深度"写成"护城河"会被过滤掉
- **仅 evaluation 路径生效**：analysis/generation 任务暂不支持 rubric 评分（后续可扩展）
- **未实现 retry 机制**：首次解析失败不会触发重试，依赖 LLM 的 one-shot 输出质量
- **向后兼容**：已有的 `OutlineExpertReviewer` 等下游代码未被修改，仍用旧的 `overallScore` 字段——需要后续 Phase 或独立任务逐个升级

## 后续相关 Phase

- Phase 5 会把同样的"结构化输出"思路扩展到 analysis 任务的 `model_applications`
- Phase 6 会利用本 Phase 的 `rubric_scores` 做 feedbackLoop 按维度校准
</content>
</invoke>
