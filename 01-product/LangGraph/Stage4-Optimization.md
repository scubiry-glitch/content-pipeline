# Stage 4 优化方案：质量评审

> **核心问题**：`sequentialReview.ts`（1200行）+ `streamingSequentialReview.ts`（SSE 推送）已生产就绪，但 `blueTeamNode` 用 1 次 LLM 调用模拟 3 角色。

---

## 当前 blueTeamNode 实现

```typescript
// nodes.ts:305-464 — 1 次 LLM 模拟 3 个专家
const reviewPrompt = `你是一个由三位专家组成的蓝军评审团...
1. 批判者(Challenger): ...
2. 拓展者(Expander): ...
3. 提炼者(Synthesizer): ...
每位专家提出3-5个问题，请以JSON数组格式直接输出。`;

const reviewResult = await llmRouter.generate(reviewPrompt, 'blue_team_review', ...);
```

**问题**：
1. 3 个专家角色在同一个 prompt 中，评审深度不足
2. 没有"评审→修订→再评审"的真正串行链
3. 没有接入专家库（132 位 CDT 专家可用）
4. 没有 SSE 实时推送评审进度
5. 修订只做了 1 轮（max 2 轮），PRD 定义 5 轮

## 已有可复用服务

| 服务 | 文件 | 关键函数 | 状态 |
|------|------|---------|------|
| 串行评审配置 | `sequentialReview.ts` | `configureSequentialReview(taskId, topic)` | ✅ 生产就绪 |
| 串行评审执行 | `sequentialReview.ts` | `startSequentialReview(taskId)` | ✅ 生产就绪 |
| 评审进度查询 | `sequentialReview.ts` | `getSequentialReviewProgress(taskId)` | ✅ 生产就绪 |
| SSE 实时推送 | `streamingSequentialReview.ts` | `broadcastSequentialEvent()` | ✅ 生产就绪 |
| 专家引擎 | `expert-library/singleton.ts` | `getExpertEngine()` | ✅ 132位专家 |
| BlueTeam Agent | `agents/blueTeam.ts` | `execute(input)` — parallel/sequential | ✅ 生产就绪 |

**sequentialReview.ts 已有的专家角色**（line 69-77）：
```typescript
const ALL_AI_EXPERTS = {
  challenger:    { name: '批判者', profile: '挑战逻辑漏洞、数据可靠性...' },
  expander:      { name: '拓展者', profile: '扩展关联因素、国际对比...' },
  synthesizer:   { name: '提炼者', profile: '归纳核心论点、结构优化...' },
  fact_checker:  { name: '事实核查员', profile: '数据准确性验证' },
  logic_checker: { name: '逻辑检察官', profile: '论证严密性' },
  domain_expert: { name: '行业专家', profile: '专业深度' },
  reader_rep:    { name: '读者代表', profile: '可读性、受众适配度' },
};
```

---

## 优化方案

### 改造 1: blueTeamNode 接入 sequentialReview.ts

```typescript
// nodes.ts — blueTeamNode 改造
import {
  configureSequentialReview,
  startSequentialReview,
  getSequentialReviewProgress,
} from '../services/sequentialReview.js';

export async function blueTeamNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:blue_team] Starting sequential review for: ${state.taskId}`);

  // Step 1: 配置评审专家队列（自动匹配话题相关 CDT 专家）
  const reviewConfig = await configureSequentialReview(
    state.taskId,
    state.topic
  );
  // 产出队列示例: [挑战者(AI), 行业专家A(CDT), 拓展者(AI), 行业专家B(CDT), 提炼者(AI)]

  // Step 2: 启动串行评审（每轮: 专家评审 → LLM 修订 → 下一轮）
  const reviewResult = await startSequentialReview(state.taskId);

  // Step 3: 获取最终结果
  const progress = await getSequentialReviewProgress(state.taskId);

  // 构建 blueTeamRounds 数据
  const rounds = progress.reviewChain.map((item: any) => ({
    round: item.round,
    questions: item.questions || [],
    expertName: item.expertName,
    expertRole: item.expertRole,
    expertType: item.expertType,   // 'ai' | 'human_cdt'
    revisionContent: item.revisedDraft,
    revisionSummary: item.summary,
  }));

  // 评审通过条件: 最后一轮无 high severity
  const lastRound = rounds[rounds.length - 1];
  const highCount = lastRound?.questions?.filter((q: any) => q.severity === 'high').length || 0;
  const passed = highCount === 0;

  // 获取最新修订稿
  const latestDraft = await query(
    `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
    [state.taskId]
  );

  return {
    blueTeamRounds: rounds,
    currentReviewRound: progress.completedRounds,
    reviewPassed: passed,
    draftContent: latestDraft.rows[0]?.content || state.draftContent,
    status: passed ? 'review_passed' : 'review_needs_revision',
    progress: Math.min(70 + progress.completedRounds * 4, 90),
  };
}
```

### 改造 2: 评审流程详解

改造后的完整串行流程：

```
Draft_v1 → 挑战者(AI) → LLM修订 → Draft_v2
  → 行业专家A(CDT人格) → LLM修订 → Draft_v3
  → 拓展者(AI) → LLM修订 → Draft_v4
  → 行业专家B(CDT人格) → LLM修订 → Draft_v5
  → 提炼者(AI) → LLM修订 → Draft_final
```

**分轮焦点**（由 sequentialReview.ts 内置）:
- Round 1-2: 结构性问题（逻辑漏洞、论证跳跃、数据缺口）
- Round 3-4: 细节完整性（数据准确、国际对比、交叉视角）
- Round 5: 整体优化（核心论点、金句、消除冗余）

**CDT 专家**由 expert-library 根据话题 tags 自动匹配：
```typescript
// sequentialReview.ts 内部逻辑
const engine = getExpertEngine();
const matchedExperts = await engine.matchExperts(topic, { limit: 2 });
// 返回如: [巴菲特人格, 雷军人格] — 视话题而定
```

### 改造 3: SSE 评审进度推送

`streamingSequentialReview.ts` 已有完整的 SSE 基础设施。事件类型：

```typescript
type SequentialReviewEvent =
  | 'round_started'      // 某轮评审开始
  | 'expert_reviewing'   // 专家正在评审
  | 'comment_generated'  // 单条评审意见生成
  | 'draft_revised'      // LLM 完成修订
  | 'round_completed'    // 某轮评审完成
  | 'review_completed';  // 全部评审完成
```

LangGraph 节点内不直接推 SSE，但 `startSequentialReview()` 内部已经调用 `broadcastSequentialEvent()`，前端通过 `/api/v1/tasks/:id/sequential-review/stream` SSE 端点接收。

### 改造 4: 融合 factCheckReport 到评审上下文

```typescript
// sequentialReview.ts 的每轮评审 prompt 中注入事实核查结果
const reviewContext = `
## 事实核查报告
${state.factCheckReport?.filter(f => !f.verified).map(f =>
  `⚠️ "${f.claim}" (${f.location}) — 未验证，可信度 ${f.credibility}`
).join('\n') || '所有数据点已验证'}
`;
```

### 改造 5: Graph 循环条件更新

```typescript
// graph.ts — 更新循环条件
graph.addConditionalEdges(NODE_NAMES.BLUE_TEAM, (state: PipelineStateType) => {
  // 串行评审内部已完成 5 轮，这里只判断是否需要整体打回重写
  if (!state.reviewPassed && state.currentReviewRound < state.maxReviewRounds) {
    return NODE_NAMES.WRITER;  // 重写（极端情况：5轮评审后仍有 high-severity）
  }
  return NODE_NAMES.HUMAN_APPROVE;
});
```

---

## 改造范围

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `langgraph/nodes.ts` | blueTeamNode 从 LLM 直调改为 sequentialReview 服务 | 中 |
| `services/sequentialReview.ts` | 评审 prompt 融入 factCheckReport | 小 |
| `langgraph/graph.ts` | 更新循环条件注释 | 小 |
