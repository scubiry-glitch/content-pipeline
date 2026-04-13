# Phase 4: ExpertMatcher 认知互补匹配

## 背景

`ExpertMatcher.match()` 目前用关键词评分挑出相关度 top 3 领域专家。这导致一个典型问题：给定"AI 创业公司评估"主题，匹配出来的 3 位专家经常是 **3 个 VC**（李开复/沈南鹏/朱啸虎），视角高度同质化，评审意见会围绕同一套"赛道/团队/融资节奏"的话语体系打转，用户收到的 3 份评审报告有 70% 内容重叠。

**Phase 4 的目标**：
1. 利用 nuwa 增强字段 `persona.cognition.mentalModels` 做"认知视角匹配"，让心智模型真正与主题契合的专家优先
2. 新增"认知互补选择"算法，从相关度 top 6 候选池里挑 3 个**心智模型重叠最少**的，实现视角多样化

## 变更点

### `api/src/modules/expert-library/expertMatcher.ts`

**1. `calculateMatchScore()` 新增维度 6：Mental model applicationContext 匹配（0-30 分）**

```ts
const mentalModels = expert.persona.cognition?.mentalModels;
if (mentalModels && mentalModels.length > 0) {
  for (const m of mentalModels) {
    // 主题词 vs m.applicationContext 做子串/token 匹配
    ...
  }
  score += Math.min(30, mmMatches.length * 10);
  reasons.push(`心智模型可套用: ${mmMatches.join('、')}`);
}
```

例：评估"新能源电池创业公司"时
- 马斯克的 "渐近极限思维" (applicationContext: "评估任何硬件产品/制造业的成本优化潜力") → 匹配
- 巴菲特的 "经济护城河" (applicationContext: "评估任何企业的长期投资价值") → 匹配
- 塔勒布的 "反脆弱" (applicationContext: "评估系统/组织/策略在压力下是变强还是变弱") → 匹配

三位都匹配，但心智模型名称完全不重叠——这正是互补选择的用武之地。

**2. 新增 `selectComplementarySet()` 方法**

贪心算法，从候选池挑 `count` 个认知互补的专家：
```ts
private selectComplementarySet<T>(candidates: T[], count: number): T[] {
  const selected = [候选池第 1 位（相关度最高）];
  while (selected.length < count) {
    // 已选集合里出现过的所有 mental model 名称
    const selectedModels = new Set(...);
    // 为每个剩余候选计算"综合分 = 相关度*0.6 + 新颖度*0.4"
    //   新颖度 = 候选的 mentalModels 中有多少不在 selectedModels 里
    selected.push(综合分最高的);
  }
  return selected;
}
```

**3. `match()` 流程调整**

```ts
const candidates = scoredDomain.filter(s => s.matchScore > 0).slice(0, 6); // 先取 top 6
const topDomain = this.selectComplementarySet(candidates, 3); // 再挑 3 个互补
```

## 接口变化

API 签名无变化。`POST /match` 返回的 `domainExperts` 依旧是 `Array<{expert, matchScore, matchReason}>`，只是排序从"纯相关度降序"变成"相关度 top N 后认知互补优选"。

`matchScore` 上限从 100 拉到 130（因新增 30 分维度），前端若做百分比换算需按新上限。

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 端到端调用
```bash
curl -X POST http://localhost:3006/api/v1/expert-library/match \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "AI 创业公司技术估值",
    "taskType": "evaluation",
    "importance": 0.9
  }' | jq '.domainExperts[].expert.name, .domainExperts[].matchReason'
```

**预期**（相对于未优化前）：
- 未优化：3 个 VC（李开复、沈南鹏、朱啸虎）心智模型同质化
- 优化后：1 个技术视角 (Karpathy 的"九个九递进") + 1 个投资视角 (李开复的"AI四波浪潮") + 1 个风险视角 (塔勒布的"反脆弱")

### 回归测试
- 对没有 mentalModels 的旧专家（如 E 系列的 E01-01 刘明远），`calculateMatchScore` 的第 6 维度不加分，`selectComplementarySet` 的新颖度贡献为 0，退化为按相关度选——与升级前行为一致

## 下游收益

1. **DebateEngine**：用 match 挑出的 3 人做辩论，第二轮（Phase 2 的 contradictions 交叉质询）命中率大幅提升——不同心智模型的专家更容易互相挑战对方的盲点
2. **OutlineExpertReviewer**：3 份评审报告内容重叠度降低，用户收到的信息密度更高
3. **HotTopicExpertService**：3 个不同视角的专家观点自然展现话题的多面性
4. **调度层**：`SchedulingService.recommendExperts` 直接继承本优化（它调用 `ExpertMatcher`）

## 已知限制

- **贪心算法非全局最优**：对于 6 选 3 的小规模问题，贪心足够好；如果未来候选池扩展到 20+，需考虑改为组合优化
- **applicationContext 是字符串匹配**：如"评估任何硬件产品" vs 主题"新能源电池"需要 LLM 语义理解才能精确匹配，当前用简单子串可能漏匹——但这个 Phase 不引入 LLM 调用以保持性能
- **没有 mentalModels 的旧专家无差别**：它们的认知互补得分为 0，始终按相关度走，可能错失本应被挑中的机会——这是数据侧的限制而非算法问题
- **E 系列领域专家目前都没有 mentalModels**：本优化对"S 级特级专家混合匹配"场景收益最大，对纯 E 系列领域专家的匹配改动不大

## 后续相关 Phase

- Phase 8 跨专家 mentalModel 索引图：复用本 Phase 的 mentalModel 抽取思路，构建反向索引
- Phase 10 Mental Model Catalog：把 mentalModels 提升为一等公民的平台化目录
</content>
</invoke>
