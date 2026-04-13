# Phase 9: agenticProtocol 真实工具调用

## 背景

专家的 `method.agenticProtocol.requiresResearch` 字段表达"该专家必须先研究再回答"的原则——例如马斯克的 agenticProtocol 写着：

```ts
{
  requiresResearch: true,
  researchSteps: [
    '确认核心数据来源——是实测数据还是二手引用',
    '拆解到物理层面——找到理论上限和当前水平的差距',
    '检查是否有反面证据被忽略',
  ],
  noGuessPolicy: true,
}
```

但当前 `ExpertEngine.invoke()` 只把这段文字塞进 system prompt，LLM 读一眼"好的我会先研究"然后就开始编造答案。Phase 9 让这个字段产生真实的行为差异：

- `requiresResearch=true` 时，**实际调用 topic-aware 的知识检索**（用 `knowledgeService.retrieveKnowledge`，语义向量 + ILIKE + 最新记录三级降级）
- 把 `researchSteps` 作为调研指令追加到 knowledge context，告诉 LLM 如何组织后续回答
- 在 `response.metadata.agentic_research_performed=true` 记录本次实际走了 agentic 路径

## 变更点

### 1. `api/src/modules/expert-library/types.ts`

`ExpertResponse.metadata` 增加：
```ts
/** Phase 9: 是否执行了 agenticProtocol 的主题感知知识检索 */
agentic_research_performed?: boolean;
```

### 2. `api/src/modules/expert-library/ExpertEngine.ts`

- 新增 import：`retrieveKnowledge as retrieveKnowledgeTopicAware from './knowledgeService.js'`
- `invoke()` Step 3 增加分支：
  - 读取 `agenticMode = expert.method.agenticProtocol?.requiresResearch === true`
  - `agenticMode=true` 时：走 `retrieveKnowledgeTopicAware(expert_id, input_data, deps, 10)`
  - 拿到的 context 后追加 `### 调研步骤（本专家的 agenticProtocol 要求）` 和 `researchSteps` 枚举
  - 控制台打印 `[ExpertEngine] Agentic protocol active for X, running topic-aware knowledge retrieval`
- `agenticMode=false` 时保持原有的 `this.retrieveKnowledge`（最新 5 条）
- 返回 metadata 时设置 `agentic_research_performed: agenticMode || undefined`

与 Phase 1-5 相比的区别：
- Phase 1-5 都是"被动地从 ExpertProfile 字段构造更好的 prompt"
- Phase 9 是"**主动**根据 profile 改变运行时行为"（走不同的检索逻辑），这是第一个真正的 agentic 能力

## 接口变化

**Before** (invoke metadata):
```json
{
  "metadata": { ..., "invoke_id": "..." }
}
```

**After** (agenticProtocol 开启时):
```json
{
  "metadata": {
    ...,
    "invoke_id": "...",
    "agentic_research_performed": true
  }
}
```

非 agentic 专家不会出现 `agentic_research_performed` 字段（undefined）。

知识上下文（system prompt 的一部分）示例：

```
## 你近期研究的参考资料
[Tesla 电池成本拆解] 基于松下 21700 电芯的 BOM 分析... 
关键洞察: 材料成本占比 80%；锂钴镍是主要成本驱动

[麒麟芯片研发时间线] 华为海思 10 年投入路径...

### 调研步骤（本专家的 agenticProtocol 要求）
1. 确认核心数据来源——是实测数据还是二手引用
2. 拆解到物理层面——找到理论上限和当前水平的差距
3. 检查是否有反面证据被忽略
```

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 端到端

**1. 确保有知识源数据**
```bash
curl -X POST http://localhost:3006/api/v1/expert-library/experts/S-03/knowledge \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Tesla 2023 Q4 财报","content":"...","source_type":"publication"}'
```

**2. 对 S-03（agenticProtocol 开启）调用 invoke**
```bash
curl -sX POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{
    "expert_id": "S-03",
    "task_type": "analysis",
    "input_type": "text",
    "input_data": "Tesla 2023 Q4 毛利率下降的根本原因是什么？"
  }' | jq '.metadata.agentic_research_performed'
# 预期：true
```

**3. 对比：调用未开启 agenticProtocol 的专家**
```bash
curl -sX POST http://localhost:3006/api/v1/expert-library/invoke \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"expert_id":"S-29","task_type":"analysis","input_type":"text","input_data":"测试"}' | \
  jq '.metadata.agentic_research_performed'
# 预期：null（字段不存在）
```

**4. 观察后台日志**
应出现 `[ExpertEngine] Agentic protocol active for S-03, running topic-aware knowledge retrieval`

## 下游收益

1. **真实的差异化行为**：agenticProtocol 从"声明性标志"变成"运行时行为"——对强制先研究的专家实际走不同的代码路径
2. **知识源召回率提升**：`knowledgeService.retrieveKnowledge` 的三级检索（语义/ILIKE/最新）比 ExpertEngine 私有方法召回率高得多
3. **指标透明**：`agentic_research_performed` 字段可以用于事后审计——哪些调用用了 agentic 检索、耗时多少
4. **可扩展性**：未来可以引入更多"工具"（如 Web 搜索、外部 API），都可以按同样的模式注册到 agenticProtocol 分支

## 已知限制

- **仅读取 expert_knowledge_sources 表**：真正的 agentic 还应该能调用外部工具（Web search、RAG pipeline 等），当前只在内部知识库中检索
- **没有工具调用循环**：真正的 agent 会在"检索 → 判断够不够 → 再检索"循环里迭代，这里是一次性检索
- **researchSteps 是文字追加**：LLM 仍然可能忽略这些步骤（无法强制验证）
- **两条检索路径略有代码重复**：`ExpertEngine.retrieveKnowledge` (私有) vs `knowledgeService.retrieveKnowledge`（公共），未来可以统一
- **知识源为空时无 fallback**：若专家还没有任何 knowledge source，agentic 模式返回 null，与非 agentic 模式表现一致

## 后续相关 Phase

- 无后续直接依赖，但 Phase 10 catalog 可以记录"哪些心智模型需要配合哪些工具"的元信息
