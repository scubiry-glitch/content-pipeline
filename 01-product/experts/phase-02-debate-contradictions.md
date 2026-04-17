# Phase 2: DebateEngine 用 contradictions 生成交叉质询

## 背景

`DebateEngine.crossExamination()` 是多专家辩论的第二轮（cross_examination），目前的 prompt 只传递 attacker 的 name/style/tone 和 target 的一段观点文本，让 LLM 自由发挥"指出对方观点中的漏洞"。

这导致第二轮质询质量不稳定——专家经常：
- 泛泛而谈，击不到具体软肋
- 质询偏离议题，变成"也有人说..."的补充陈述
- 重复第一轮立场，没有真正的交锋

而我们的 21 个 nuwa 增强专家全部有 `contradictions[]` 字段（已知认知矛盾）和 `blindSpots.knownBias/weakDomains`（自认的弱点），这些是辩论的黄金素材——把它们喂给 attacker，能让质询**击中对方自己都承认的认知软肋**。

## 变更点

### `api/src/modules/expert-library/debateEngine.ts`

**1. `crossExamination()` 方法（行 ~299）**
- 不再内联构造 prompt，改为调用新私有方法 `buildCrossExamPrompt(attacker, target, topic, targetOpinionText)`
- 其余逻辑（target 选择、并行执行、结果结构）保持不变

**2. 新增私有方法 `buildCrossExamPrompt()`（行 ~349）**
输入 attacker、target、topic、target 上一轮的观点文本，返回结构化 `{ systemPrompt, userPrompt }`。构造逻辑：

a) **Attacker 心智模型（武器）**
```ts
const attackerModels = attacker.persona.cognition?.mentalModels ?? [];
// 取前 3 个作为"反驳武器"
```
塞入 system prompt：`"你可以用以下自己的心智模型作为质询武器（不必全部使用）：1. 【飞轮效应】... 2. 【第一性原理】..."`

b) **Target 认知矛盾（软肋）**
```ts
const targetContradictions = target.persona.contradictions ?? [];
```
塞入 system prompt：`"对方（马斯克）有以下已知的认知矛盾：1. 时间预估系统性乐观 vs 长期愿景精准（场景：...；通常解释：...）..."` + 追加明确指令：`"如果当前议题触及上述任一矛盾，请明确指出并追问对方在这个具体场景下你会倒向哪一边"`

c) **Target 盲区（补充攻击面）**
```ts
const targetBlindSpots = target.persona.blindSpots;
```
塞入：`"对方公开承认的偏见/弱项：- 已知偏见：... - 薄弱领域：..."`

d) **Attacker instructions 升级**
原：`"指出对方观点中的漏洞或不足"`
新：
```
1. 不要泛泛而谈，找到对方论证中最具体的软肋
2. 优先针对对方已知的认知矛盾或盲区发起追问
3. 用你自己的心智模型作为反驳框架
4. 250字以内，论据+质问两段式
```

**优雅降级**：所有字段都用 `?? []` 或长度检查，对于尚未升级的旧专家（无 contradictions/mentalModels/blindSpots）会自动跳过对应 block，退化为原来的通用质询，**完全向后兼容**。

## 接口变化

无 API 签名变化。`DebateEngine.debate()` / `POST /debate` 的输入输出结构保持一致，只是第二轮的 `opinions[*].content` 质量显著提升。

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit
# 无新增错误
```

### 端到端辩论调用
```bash
# 马斯克 vs 巴菲特辩论 Tesla 估值
curl -X POST http://localhost:3006/api/v1/expert-library/debate \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Tesla 当前 P/E 过高是投资陷阱还是未来溢价？",
    "content": "Tesla 市盈率 80+，远超传统车企...",
    "expertIds": ["S-03", "S-32"],
    "rounds": 3
  }' | jq '.rounds[1].opinions'
```

**预期**：第二轮（cross_examination）中
- 马斯克对巴菲特的质询应该围绕巴菲特"推崇集中投资 vs 伯克希尔极度分散"或"永远不碰科技 vs 重仓 Apple"的矛盾追问
- 巴菲特对马斯克的质询应该围绕马斯克"时间预估系统性乐观"的矛盾追问

### 回归测试
- 用两个尚未升级的专家调用 debate，应正常工作（走降级路径）
- 混合一个升级专家 + 一个未升级专家，升级专家能用对方的 contradictions（若有），未升级的走通用质询

## 下游收益

1. **辩论质量提升**：第二轮不再是泛泛而谈，而是针对每位专家自己公开承认的认知矛盾做精准追问
2. **用户体验**：用户看到的辩论更具戏剧性和信息密度——例如"你自己说过长期主义，但 Tesla 持续亏损 7 年时你怎么回应？"
3. **为 Phase 4（ExpertMatcher 认知互补）铺路**：认知互补匹配挑出的专家组合正好能触发更多矛盾追问
4. **BluemTeam 流程**：未来可以把这个能力迁移到 LangGraph 的 blueTeamNode，让评审质疑也具备"击中软肋"能力

## 已知限制

- **无 contradictions 的专家**：旧 JSON-only 专家（未升级为 .ts 深度 profile 的那些，如 S-11 沈南鹏）不会有这些数据，降级为通用质询
- **LLM 可能忽略指令**：即使喂了矛盾，LLM 可能不采用——这是 LLM 可控性的边界问题，只能通过 prompt engineering 改善
- **仅影响第二轮**：第一轮独立观点和第三轮综合裁决不受影响
- **Target 选择仍是轮询**：仍是 `(index + 1) % experts.length`，未按"认知对立度"选择——这可以作为未来优化方向（Phase 4 会做 matcher 级别的认知互补，但 debate 内部的 target 选择暂不改）

## 后续相关 Phase

- Phase 4 ExpertMatcher 认知互补：为 debate 挑选 mentalModel 互补的专家对，让本 Phase 的效果最大化
- Phase 5 mentalModels 骨架：为 analysis 任务做类似的"结构化应用"改造
