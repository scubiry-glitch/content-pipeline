# Stage 3 优化方案：文稿生成

> **核心问题**：`streamingDraft.ts` 和 `draftGenerator.ts` 已生产就绪，但 `writerNode` 完全没用——改用单次 LLM 调用。

---

## 当前 writerNode 实现

```typescript
// nodes.ts:189-297 — 单次 LLM 调用，无流式、无润色、无方法论
const prompt = `...采用"三层穿透"结构...总字数控制在5000-8000字...`;
const result = await llmRouter.generate(prompt, 'writing', { maxTokens: 8000 });
```

**问题**：
1. 一次 LLM 调用生成全文，maxTokens=8000 经常截断
2. 无上下文传递——前后章节没有逻辑衔接
3. 写作 prompt 仍硬编码"三层穿透"（大纲已改为内容驱动）
4. 无润色步骤
5. 无事实核查

## 已有可复用服务

| 服务 | 文件 | 关键函数 | 状态 |
|------|------|---------|------|
| 流式分段生成 | `streamingDraft.ts` | `generateDraftStreaming(config, onProgress)` | ✅ 生产就绪 |
| 润色/终稿 | `draftGenerator.ts` | `generateFinalDraft(taskId, ids, force, 'polish')` | ✅ 生产就绪 |
| 进度断点恢复 | `streamingDraft.ts` | `getDraftProgress(taskId)` | ✅ 生产就绪 |

---

## 优化方案

### 改造 1: writerNode 接入 streamingDraft.ts

```typescript
// nodes.ts — writerNode 改造
import { generateDraftStreaming, StreamingDraftConfig } from '../services/streamingDraft.js';

export async function writerNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const config: StreamingDraftConfig = {
    taskId: state.taskId,
    topic: state.topic,
    outline: state.outline,
    researchData: state.researchData,
    style: 'formal',
    options: { includeContext: true, saveProgress: true },
  };

  // 流式分段生成（逐章节，带上下文传递）
  const result = await generateDraftStreaming(config, (progress) => {
    // LangGraph 节点内不直接推 SSE，但可写 DB 供前端轮询
    query(`UPDATE tasks SET progress = $1, updated_at = NOW() WHERE id = $2`,
      [50 + Math.floor(progress.currentIndex / progress.total * 20), state.taskId]);
  });

  return {
    draftContent: result.content,
    status: 'writing_complete',
    progress: 70,
  };
}
```

**效果**：
- 逐章节生成，每章携带前文摘要作为上下文
- 支持断点恢复（中断后重新进入不丢失已生成章节）
- 每章独立验证字数和质量

### 改造 2: 写作 prompt 利用大纲新字段

`streamingDraft.ts` 内部的章节 prompt 需要增强，利用 `coreQuestion` 和 `analysisApproach`：

```typescript
// streamingDraft.ts 的 buildSectionPrompt() 增强
const sectionPrompt = `
## 本章任务
核心问题: ${section.coreQuestion || section.title}
分析方法: ${section.analysisApproach || '综合分析'}
初始假设: ${section.hypothesis || '待论证'}

## 写作规范
每节遵循 "视觉锚点 → 数据对比 → 综合分析" 流程:
1. 以图表或数据表作为视觉锚点
2. 构建对比突出关键差异
3. What(现象) → Why(原因) → So What(启示)
4. 所有数据必须来自研究数据包，不编造

## 本章研究数据
${sectionData.map(d => `- [${d.source}] ${d.content.slice(0, 300)}`).join('\n')}
`;
```

### 改造 3: 新增 polishNode

```typescript
// nodes.ts — 新增节点
import { generateFinalDraft } from '../services/draftGenerator.js';

export async function polishNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // Step A: 润色（复用 draftGenerator.ts 的 polish 模式）
  const polishResult = await generateFinalDraft(state.taskId, undefined, false, 'polish');

  // Step B: 事实核查（新建）
  const factCheckReport = await factCheckDraft(
    polishResult.content || state.draftContent,
    state.researchData?.dataPackage || []
  );

  return {
    draftContent: polishResult.content || state.draftContent,
    factCheckReport,
    status: 'polished',
    progress: 75,
  };
}

// 事实核查：提取数据点 → 与研究数据交叉验证
async function factCheckDraft(content: string, dataPackage: any[]): Promise<any[]> {
  const llmRouter = getLLMRouter();
  const prompt = `从以下文稿中提取所有数据点（数字、百分比、排名、引用），
  并逐一标注是否能在研究数据中找到支撑。

  ## 文稿（前4000字）
  ${content.substring(0, 4000)}

  ## 可用研究数据
  ${dataPackage.slice(0, 10).map((d, i) => `[${i+1}] ${d.source}: ${d.content?.substring(0, 200)}`).join('\n')}

  输出 JSON 数组: [{ "claim": "原文数据点", "location": "所在章节",
  "verified": true/false, "credibility": "A|B|C|D", "sources": ["来源"] }]`;

  const result = await llmRouter.generate(prompt, 'analysis', { temperature: 0.3, maxTokens: 3000 });
  try {
    const match = result.content.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch { return []; }
}
```

### 改造 4: Graph 边更新

```typescript
// graph.ts — 在 WRITER 和 BLUE_TEAM 之间插入 POLISH
graph.addNode('polish', polishNode);
graph.addEdge(NODE_NAMES.WRITER, 'polish');
graph.addEdge('polish', NODE_NAMES.BLUE_TEAM);
// 删除原来的: graph.addEdge(NODE_NAMES.WRITER, NODE_NAMES.BLUE_TEAM);
```

### State 扩展

```typescript
// state.ts 新增
factCheckReport: Annotation<any[]>({
  reducer: (_prev, next) => next,
  default: () => [],
});
```

---

## 改造范围

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `langgraph/nodes.ts` | writerNode 接入 streamingDraft + 新增 polishNode | 中 |
| `langgraph/state.ts` | 新增 factCheckReport | 小 |
| `langgraph/graph.ts` | 插入 polish 节点 + 更新边 | 小 |
| `services/streamingDraft.ts` | buildSectionPrompt() 利用 coreQuestion/analysisApproach | 小 |
