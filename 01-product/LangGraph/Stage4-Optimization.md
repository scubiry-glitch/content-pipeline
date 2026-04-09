# Stage 4 优化方案：质量评审

> **核心问题**：`sequentialReview.ts`（1200行）+ `streamingSequentialReview.ts`（SSE）+ `blueTeam.ts`（并行/串行双模式）已生产就绪，但 `blueTeamNode` 用 1 次 LLM 调用模拟 3 角色。

---

## 当前 blueTeamNode 实现

```typescript
// nodes.ts:305-464 — 1 次 LLM 模拟 3 个专家
const reviewPrompt = `你是一个由三位专家组成的蓝军评审团...`;
const reviewResult = await llmRouter.generate(reviewPrompt, 'blue_team_review', ...);
```

**问题**：
1. 3 个专家角色在同一个 prompt 中，评审深度不足
2. 没有"评审→修订→再评审"的真正串行链
3. 没有接入专家库（132 位 CDT 专家可用）
4. 没有 SSE 实时推送评审进度
5. 修订是全稿替换，无段落级定位
6. 无并行评审模式可选
7. 无专家配置能力——用户无法选择/排列专家

## 已有可复用服务

| 服务 | 文件 | 关键函数 | 能力 | 状态 |
|------|------|---------|------|------|
| 专家配置 | `sequentialReview.ts:63-176` | `configureSequentialReview(taskId, topic, userExperts?)` | 7 种 AI 角色 + CDT 专家自动匹配 + 用户手动选择 | ✅ |
| 串行评审 | `sequentialReview.ts` | `startSequentialReview(taskId)` | 专家1→修订→专家2→修订→... | ✅ |
| 并行评审 | `agents/blueTeam.ts:284-296` | `execute({ mode: 'parallel' })` | 所有专家同时评审，Promise.all | ✅ |
| SSE 推送 | `streamingSequentialReview.ts` | `broadcastSequentialEvent()` | 实时推送评审进度到前端 | ✅ |
| 专家引擎 | `expert-library/singleton.ts` | `getExpertEngine()` | 132 位 CDT 专家库 | ✅ |
| 段落标注 | `stage3Service.ts:100-255` | `AnnotationService` | 字符级 offset 标注 + selectedText | ✅ |
| 位置定位 | `blueTeam.ts:415` | prompt 输出 `location: "P3第二段"` | 评审意见定位到段落 | ⚠️ 部分 |
| 配置保存 | `routes/production.ts:335-366` | `POST /:taskId/save-review-config` | 前端保存评审配置 | ✅ |
| 配置端点 | `routes/production.ts:1287-1306` | `POST /:taskId/sequential-review/configure` | 返回专家队列 | ✅ |

---

## 优化方案

### 改造 1: Config 配置专家

**已有能力**（`sequentialReview.ts:63-176` + `blueTeam.ts:211-272`）：

```typescript
// 7 种内置 AI 专家角色
const ALL_AI_EXPERTS = {
  challenger:    { name: '批判者',     profile: '挑战逻辑漏洞、数据可靠性' },
  expander:      { name: '拓展者',     profile: '扩展关联因素、国际对比' },
  synthesizer:   { name: '提炼者',     profile: '归纳核心论点、结构优化' },
  fact_checker:  { name: '事实核查员', profile: '数据准确性验证' },
  logic_checker: { name: '逻辑检察官', profile: '论证严密性' },
  domain_expert: { name: '行业专家',   profile: '专业深度、行业洞察' },
  reader_rep:    { name: '读者代表',   profile: '可读性、受众适配度' },
};

// 132 位 CDT 人类专家（含 S-01~S-17, E04~E10 等预配置）
// 按话题自动匹配或由用户在配置面板手动选择
```

**blueTeamNode 改造**——接收前端传来的专家配置：

```typescript
export async function blueTeamNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // 从 state 读取用户配置的评审方案（前端通过 save-review-config 保存到 DB）
  const taskRow = await query(
    `SELECT blue_team_config FROM tasks WHERE id = $1`, [state.taskId]
  );
  const userConfig = taskRow.rows[0]?.blue_team_config;

  // 用户可配置:
  // - mode: 'sequential' | 'parallel'
  // - selectedExperts: ['challenger', 'S-03', 'expander', 'E07', 'synthesizer']
  // - rounds: number (并行模式下的轮次)
  // - revisionMode: 'per_round' | 'final'
  const mode = userConfig?.mode || 'sequential';
  const selectedExperts = userConfig?.selectedExperts;

  if (mode === 'sequential') {
    return await runSequentialReview(state, selectedExperts);
  } else {
    return await runParallelReview(state, userConfig);
  }
}
```

**前端配置面板已有端点**：
- `POST /:taskId/save-review-config` — 保存配置
- `POST /:taskId/sequential-review/configure` — 预览专家队列
- `POST /:taskId/redo/review` — 用新配置重跑评审

---

### 改造 2: 串行 + 并行双模式

```typescript
// 串行模式: 接入 sequentialReview.ts
async function runSequentialReview(state: PipelineStateType, selectedExperts?: string[]) {
  const reviewConfig = await configureSequentialReview(
    state.taskId, state.topic, selectedExperts
  );
  // 队列示例: [挑战者(AI), 巴菲特(CDT), 拓展者(AI), 雷军(CDT), 提炼者(AI)]

  await startSequentialReview(state.taskId);
  const progress = await getSequentialReviewProgress(state.taskId);

  // ... 构建 blueTeamRounds，判断 passed
}

// 并行模式: 接入 blueTeam.ts agent
async function runParallelReview(state: PipelineStateType, config: any) {
  const llmRouter = getLLMRouter();
  const blueTeam = new BlueTeamAgent(llmRouter);

  const result = await blueTeam.execute({
    taskId: state.taskId,
    topic: state.topic,
    draft: state.draftContent,
    config: {
      mode: 'parallel',                      // 所有专家同时评审
      aiExpertCount: config?.aiExpertCount || 4,
      rounds: config?.rounds || 2,
      revisionMode: config?.revisionMode || 'per_round',
      selectedExpertIds: config?.selectedExperts,
    },
  });

  // ... 构建 blueTeamRounds
}
```

**两种模式对比**：

| 维度 | 串行模式 | 并行模式 |
|------|---------|---------|
| 执行方式 | 专家1→修订→专家2→修订→... | 所有专家同时评审→合并修订 |
| 修订质量 | 每轮修订后下一位专家看到更好的版本 | 修订基于同一版本，可能冲突 |
| 速度 | 较慢（串行等待） | 较快（并行） |
| 适用场景 | 深度评审、高质量要求 | 快速迭代、时间紧迫 |
| 服务 | `sequentialReview.ts` | `blueTeam.ts` agent |

---

### 改造 3: 基于观点的段落修改

**当前问题**：修订是全稿替换——整篇文章重新生成。

**已有基础**：
- `blueTeam.ts:415` prompt 要求输出 `location: "P3第二段"`
- `stage3Service.ts` AnnotationService 支持字符级 `startOffset/endOffset`
- `production.ts:370-398` 有批量修订端点但是全稿替换

**优化方案**——段落级定向修订：

```typescript
// 新增: 基于评审意见的段落级修订
async function reviseByParagraph(
  draft: string,
  questions: BlueTeamQuestion[],
  topic: string
): Promise<string> {
  const llmRouter = getLLMRouter();
  
  // Step 1: 将文稿按段落拆分
  const paragraphs = splitIntoParagraphs(draft);
  
  // Step 2: 将评审意见按 location 分组到对应段落
  const paragraphIssues = new Map<number, BlueTeamQuestion[]>();
  for (const q of questions) {
    if (q.severity === 'praise') continue;
    const paraIdx = parseLocation(q.location, paragraphs); // "P3第二段" → index
    if (paraIdx !== -1) {
      const issues = paragraphIssues.get(paraIdx) || [];
      issues.push(q);
      paragraphIssues.set(paraIdx, issues);
    }
  }

  // Step 3: 只修订有问题的段落，保留其他段落不变
  const revisedParagraphs = [...paragraphs];
  for (const [paraIdx, issues] of paragraphIssues) {
    const original = paragraphs[paraIdx];
    const context = {
      before: paragraphs.slice(Math.max(0, paraIdx - 1), paraIdx).join('\n'),
      after: paragraphs.slice(paraIdx + 1, paraIdx + 2).join('\n'),
    };

    const prompt = `修订以下段落，解决评审专家提出的问题。
    
## 原文段落
${original}

## 上文（保持衔接）
${context.before}

## 评审意见
${issues.map((q, i) => `${i+1}. [${q.severity}] ${q.expertName}: ${q.question}\n   建议: ${q.suggestion}`).join('\n')}

## 要求
1. 只修订这个段落，不要改变前后文的衔接
2. 保持原文风格和语气
3. 逐条回应评审意见
4. 直接输出修订后的段落文本`;

    const result = await llmRouter.generate(prompt, 'writing', {
      temperature: 0.5, maxTokens: 2000,
    });
    revisedParagraphs[paraIdx] = result.content.trim();
  }

  return revisedParagraphs.join('\n\n');
}

// 位置解析: "P3第二段" → 段落索引
function parseLocation(location: string | undefined, paragraphs: string[]): number {
  if (!location) return -1;
  // 匹配 "P3" "第3章" "第三段" 等
  const match = location.match(/P(\d+)|第(\d+)|第([一二三四五六七八九十]+)/);
  if (!match) return -1;
  const num = match[1] ? parseInt(match[1]) : 
              match[2] ? parseInt(match[2]) :
              chineseToNumber(match[3]);
  return Math.min(num - 1, paragraphs.length - 1);
}
```

**效果**：
- 只修改有问题的段落，其他段落完全保留
- 每个段落修订时带上下文（前后段落），保证衔接
- 修订规模小 → LLM 输出质量更高，不会丢失内容

---

### 改造 4: 评审高亮段落

**已有基础**：
- `BlueTeamQuestion.location?: string` — 自由文本如 "P3第二段"
- `AnnotationService` — 支持 `startOffset/endOffset/selectedText` 写入 `draft_annotations`

**优化方案**——评审意见自动转化为段落标注：

```typescript
// 评审完成后，将 questions 写入 draft_annotations 表
async function createReviewAnnotations(
  taskId: string,
  draftId: string,
  versionId: string,
  questions: BlueTeamQuestion[],
  draftContent: string
): Promise<void> {
  const paragraphs = splitIntoParagraphs(draftContent);

  for (const q of questions) {
    const paraIdx = parseLocation(q.location, paragraphs);
    if (paraIdx === -1) continue;

    // 计算段落在全文中的字符偏移量
    let startOffset = 0;
    for (let i = 0; i < paraIdx; i++) {
      startOffset += paragraphs[i].length + 2; // +2 for \n\n
    }
    const endOffset = startOffset + paragraphs[paraIdx].length;

    await annotationService.create({
      draftId,
      versionId,
      type: q.severity === 'praise' ? 'praise' : 'suggestion',
      startOffset,
      endOffset,
      selectedText: paragraphs[paraIdx].substring(0, 200),
      content: `[${q.expertName}] ${q.question}`,
      suggestion: q.suggestion || '',
      source: 'blue_team',
      expertRole: q.expertId,
      severity: q.severity,
    });
  }
}
```

**前端效果**：
- 评审意见直接显示在对应段落旁边（侧边栏标注）
- 按严重性颜色高亮：🔴 high = 红色 | 🟡 medium = 黄色 | 🟢 praise = 绿色
- 点击标注 → 展开专家评审详情 + 修改建议
- 支持"接受建议"→ 触发段落级修订

**数据流**：
```
评审意见(questions) → parseLocation → 计算 offset → 写入 draft_annotations
                                                         ↓
前端读取 draft_annotations → 按 startOffset/endOffset → 渲染高亮标注
```

---

### 改造 5: 融合 factCheckReport + SSE + Graph 条件

（保留原方案内容，此处不重复）

- factCheckReport 注入评审上下文
- SSE 通过 `startSequentialReview()` 内部自动推送
- Graph 循环条件：5 轮内置评审后，仅极端情况打回 WRITER

---

## 改造范围

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `langgraph/nodes.ts` | blueTeamNode 双模式（串行/并行）+ 专家配置读取 | 中 |
| `langgraph/nodes.ts` | 新增 `reviseByParagraph()` 段落级修订 | 中 |
| `langgraph/nodes.ts` | 新增 `createReviewAnnotations()` 评审→标注 | 中 |
| `services/sequentialReview.ts` | 评审 prompt 融入 factCheckReport | 小 |
| `langgraph/graph.ts` | 更新循环条件 | 小 |

## 功能矩阵

| 功能 | 当前 | 优化后 |
|------|------|--------|
| 专家配置 | 硬编码 3 角色 | 7 种 AI + 132 CDT + 用户面板选择 |
| 评审模式 | 无 | 串行（深度）+ 并行（速度）可选 |
| 修订方式 | 全稿替换 | 段落级定向修订 |
| 评审定位 | 无 | location 解析 → offset → 高亮标注 |
| 实时推送 | 无 | SSE 事件流 |
