# Phase 3: Heuristics trigger 匹配，激活最相关规则

## 背景

专家的 `persona.cognition.heuristics[]` 是一组带 `trigger/rule/example` 的决策启发式（如马斯克的"面对任何需求列表时 → 给每条需求找到一个真实署名人"）。

当前 `promptBuilder.buildPersonaSection()` 把专家所有的 heuristics 一股脑塞进 system prompt 里，LLM 面对 5-10 条启发式经常"用力平均"——每条都提一下但都不深入，反而被淹没。

**Phase 3 的目标**：从"全部喂 LLM"升级为"按输入内容激活最相关 1-3 条"，让 LLM 聚焦应用，输出更有辨识度。

## 变更点

### 1. 新增 `api/src/modules/expert-library/heuristicsMatcher.ts`

轻量级关键词匹配器，**不依赖 LLM 调用**，纯本地 O(n) 复杂度：

```ts
export function matchHeuristics(
  inputText: string,
  heuristics: DecisionHeuristic[] | undefined,
  limit: number = 3
): DecisionHeuristic[]
```

评分规则：
- **子串直接命中**：如果 input 包含 trigger 的前 10 个字符，直接 +50 分
- **Trigger token 重叠**：每个命中的 >=2 字符 token +8 分
- **Rule token 重叠**：每个命中的 token +2 分（辅助信号）

Token 策略：
- 英文/数字：小写后按空白+标点切分，长度 >=2
- 中文：连续 2 字符 bigram + 单字

若没有任何启发式评分 > 0，返回前 `limit` 条原始顺序作为兜底（保证 prompt 始终有东西）。

### 2. `api/src/modules/expert-library/promptBuilder.ts`

- `buildSystemPrompt(options)` 签名增加 `activeHeuristics?: DecisionHeuristic[]`
- 新增 `buildActiveHeuristicsSection()` section builder — 插在"身份"section 之后，使用醒目的 `## 🎯 本次任务必须严格应用的决策启发式` 标题 + 明确指令"请在输出中明确体现这些启发式的应用——至少一条"
- `buildPersonaSection()` 新增参数 `activeHeuristics?`，从常规 heuristics 列表里过滤掉已激活的（避免重复），剩余部分以"决策启发式（背景参考）"标题展示

### 3. `api/src/modules/expert-library/ExpertEngine.ts`

在 `invoke()` 的 analysis/generation 分支中：

```ts
const activeHeuristics = matchHeuristics(
  request.input_data,
  expert.persona.cognition?.heuristics,
  3,
);

const systemPrompt = buildSystemPrompt(expert, {
  ...,
  activeHeuristics: activeHeuristics.length > 0 ? activeHeuristics : undefined,
});
```

- 导入 `matchHeuristics`
- 只在 analysis/generation 路径调用（evaluation 路径走 analyzeThenJudge，未来 Phase 5 会做对应的优化）

## 接口变化

- API 无变化
- `ExpertResponse` 结构无变化
- 仅 system prompt 内容变化（LLM 输入质量提升）

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 匹配行为手测（可以写单元测试）

```ts
import { matchHeuristics } from './heuristicsMatcher';

const muskHeuristics = [
  { trigger: '面对任何需求列表时', rule: '给每条需求找到一个真实署名人——找不到署名人的需求直接删除' },
  { trigger: '评估制造方案时', rule: '制造比设计难 10 倍' },
  { trigger: '判断技术路线选择时', rule: '选物理上限更高的路线' },
  { trigger: '遇到行业"不可能"共识时', rule: '追问"是物理上不可能，还是现有方法做不到"' },
  { trigger: '评估公司/团队时', rule: '看工程产出速度而非 PPT 质量' },
];

matchHeuristics('评估一家制造新能源汽车的创业公司', muskHeuristics, 3);
// 预期：前 3 名按相关度是 "评估制造方案时"（trigger 包含"评估"和"制造"）
// 和 "评估公司/团队时"（trigger 包含"评估"）和 "判断技术路线选择时"
```

### 端到端调用

```bash
curl -X POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "expert_id": "S-03",
    "task_type": "analysis",
    "input_type": "text",
    "input_data": "评估一家新能源电池创业公司的技术路线..."
  }'
```

**观察**：后台日志或 DEBUG 模式的 system prompt 应该包含 `## 🎯 本次任务必须严格应用的决策启发式` 区块，里面只有 1-3 条与"电池/制造/技术路线"最相关的 heuristics，其余归入背景参考。

## 下游收益

1. **LLM 聚焦**：不再被 5-10 条启发式平均分散注意力，输出更有辨识度
2. **可解释性**：prompt 显式告诉 LLM"这几条必须用"，便于后续 Phase 7（expressionDNA linter）验证是否真的用了
3. **可组合**：未来 `DebateEngine.crossExamination`（Phase 2 已改）也可以接入 `matchHeuristics`，让质询方的启发式也按相关度激活
4. **性能**：纯本地 token 匹配，零额外 LLM 调用，延迟可忽略

## 已知限制

- **关键词匹配的局限**：跨语言/跨领域术语同义词无法识别（如 input 写"锂电池"但 trigger 写"电池"可能只拿到半分）——这个 Phase 不投入 LLM 二次调用，留给 Phase 5 如果需要更强语义匹配再扩展
- **仅 analysis/generation 路径生效**：evaluation 路径走 `analyzeThenJudge.ts`，未集成 matchHeuristics（因为 judge 的 prompt 结构已经很紧凑）
- **无 heuristics 的旧专家**：降级到不插入 activeHeuristics section，完全向后兼容
- **匹配阈值未配置化**：若后续发现某个领域匹配过宽/过窄，需要调整 `score > 0` 的阈值或 token overlap 的权重

## 后续相关 Phase

- Phase 4 ExpertMatcher 认知互补：同样用 token 匹配思路，但用在 mentalModels 上
- Phase 7 ExpressionDNA linter：可以检查 LLM 输出是否真的应用了激活的 heuristics
