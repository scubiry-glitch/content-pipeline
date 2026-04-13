# Phase 7: ExpressionDNA linter 后置校验

## 背景

专家的 `persona.expressionDNA` 描述了 4 个语言特征：`sentencePattern`（句式）、`vocabularyPreference`（用词）、`certaintyCali`（确定性校准）、`citationHabit`（引用习惯）。当前这些字段只作为字符串塞进 system prompt，LLM 看到后经常"点头同意但不照做"——例如让马斯克写东西，LLM 按自己的习惯输出一堆复杂长句。

**Phase 7 的目标**：添加一个纯本地启发式 linter，在 generation 任务的 `formatOutput()` 阶段检查输出是否偏离 expressionDNA，不达标则走现有的 reformat retry 机制，由 LLM 自我纠正。

## 变更点

### 1. 新增 `api/src/modules/expert-library/expressionDnaLinter.ts`

纯本地校验器，**不依赖 LLM 调用**。接口：

```ts
export function validateExpressionDNA(
  output: string,
  expressionDNA: ExpressionDNA | undefined,
): LinterResult;

export interface LinterResult {
  pass: boolean;
  issues: string[];
  checks: Array<{ rule: string; passed: boolean; detail?: string }>;
}
```

实现的 4 条启发式检查：

**Check 1: 句长分布**
- 若 `sentencePattern` 描述含"极简/短句/简洁/断言/1-6字"等关键词 → 平均句长应 <= 40
- 若 `sentencePattern` 描述含"长句/嵌套/层层/复合/学术"等关键词 → 平均句长应 >= 25
- 使用中英文句末标点（`。！？.!?；;`）切分

**Check 2: 确定性词汇**
- 若 `certaintyCali` 描述含"不说我认为/结论式/极度确信/不说可能"等关键词
- 则统计输出中 `我认为|可能|或许|大概|也许|似乎|应该` 的出现频率
- 每 100 字超过 0.5 个对冲词视为违反

**Check 3: 量化引用**
- 若 `citationHabit` 描述含"物理/工程/数据/实测/benchmark/财务/数字"等关键词
- 则要求输出至少包含一个数字+单位（%/元/美元/亿/倍/kWh/$ 等）或连续 2 位以上数字

**Check 4: 关键术语出现**
- 从 `vocabularyPreference` 描述中提取 2-6 字连续汉字词（排除"术语/用词/偏好"等 metadata 词）作为 key terms
- 要求 key terms 在输出中至少命中 1 个

对于没有对应字段的情况，自动跳过该检查（宽松降级）。

### 2. `api/src/modules/expert-library/outputFormatter.ts`

- `formatOutput()` 签名增加可选参数 `options?: { taskType?: string }`
- 当 `options.taskType === 'generation'` 且专家有 `expressionDNA` 时，调用 `validateExpressionDNA()`
- 违规项以 `[DNA] ...` 前缀加入 issues 列表，复用现有的 `reformatWithFeedback` retry 机制（最多 2 次）

### 3. `api/src/modules/expert-library/ExpertEngine.ts`

`invoke()` 调用 `formatOutput` 时传入 `{ taskType: request.task_type }`。

## 接口变化

无 API 签名变化。`formatOutput` 内部增加一个 optional 参数，所有现有调用都通过 `options` 可选字段向后兼容。

行为变化：
- generation 任务输出偏离专家 expressionDNA 时，会触发 reformat retry，最终输出更符合专家语言特征
- 其他任务（analysis/evaluation）行为不变

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 单元测试示例（手测）

```ts
import { validateExpressionDNA } from './expressionDnaLinter';

// 马斯克的 expressionDNA（简短断言式）
const muskDNA = {
  sentencePattern: '极简陈述句，通常 5-15 个字。偏好"X 就是 Y"断言式。',
  vocabularyPreference: '工程术语泛化到所有领域——"throughput"、"bottleneck"',
  certaintyCali: '结论式输出，不说"我认为"',
  citationHabit: '优先引用物理定律和工程实测数据',
};

// 违规：长句 + 对冲词 + 无数字
const badOutput = '关于这个问题，我认为可能需要从多个角度来考虑，也许最重要的是要看技术路径是否可行，以及市场接受度大概如何...';
const result = validateExpressionDNA(badOutput, muskDNA);
console.log(result);
// 预期：pass=false, issues 包含 [句长偏离, 确定性偏离, 引用习惯偏离]

// 合规：短句 + 断言 + 数字
const goodOutput = '成本必须降 10 倍。BOM 级拆解。当前 $250/kWh，理论下限 $60。物理上可行。';
const result2 = validateExpressionDNA(goodOutput, muskDNA);
console.log(result2);
// 预期：pass=true
```

### 端到端
```bash
curl -X POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{
    "expert_id": "S-03",
    "task_type": "generation",
    "input_type": "text",
    "input_data": "写一段关于 Tesla 成本优势的分析"
  }'
```

**观察**：首次 LLM 输出如果是长句、充满对冲词，后台日志应出现 `[OutputFormatter] Attempt 1 failed, retrying. Issues: ['[DNA] 句长偏离: ...']`，然后重新生成更简洁有断言的输出。

## 下游收益

1. **generation 任务专家辨识度跃升**：马斯克写出的东西真像马斯克，王兴写的像王兴
2. **LangGraph writerNode 受益**：所有调用 expert-library 的写作流程都自动获得 DNA 保障
3. **Phase 3 闭环**：Phase 3 的 heuristics 激活要求 LLM 应用特定规则，Phase 7 从"形式"层面保证"读起来像那个人"
4. **可观测性**：reformat 日志暴露了具体是哪条 DNA 被违反，便于调试专家画像

## 已知限制

- **启发式不是精确的**：关键词匹配逻辑（如"极简"→短句）可能误判某些描述；未来可以接入更精确的风格分类器
- **仅 generation 任务生效**：analysis 输出经常需要长句说明，不适合短句约束；evaluation 走 analyzeThenJudge 路径也未集成
- **DNA 字段缺失的专家不受益**：旧 JSON-only 专家（部分 E 系列、部分未升级的 S 级）没有 expressionDNA
- **reformat LLM 调用代价**：每次不通过要多调一次 LLM（已有 `MAX_FORMAT_RETRIES=2` 上限）
- **句长阈值硬编码**：40/25 的阈值未配置化

## 后续相关 Phase

- Phase 8 跨专家 mentalModel 图：可以聚合"哪些专家的 expressionDNA 最独特/最通用"
- Phase 10 Mental Model Catalog：catalog 可以附带每个模型的 expressionDNA 样例
