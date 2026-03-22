# 产品需求文档: 阶段 3 - 文稿生成详细设计 v5.0

**版本**: v5.0
**日期**: 2026-03-23
**状态**: 📝 详细设计文档
**对应阶段**: 阶段 3 - 文稿生成
**依赖**: PRD-Production-Pipeline-v5.0.md

---

## 1. 文稿生成流程概览

### 1.1 流程架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段 3: 文稿生成流程 (v5.0 - 流式分段生成)              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │  任务触发    │ ← 研究阶段完成 / 用户手动触发                              │
│  └──────┬──────┘                                                            │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 1:     │     │ 输入: outline + researchData + insights         │   │
│  │ 流式初稿生成 │ →   │ 输出: draft_v1 (分段实时生成)                    │   │
│  │             │     │ 处理: 串行段落生成，上下文传递                     │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                      │                                            │
│         │    ┌─────────────────┼─────────────────┐                         │
│         │    ▼                 ▼                 ▼                         │
│         │ ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│         │ │ 段落 1   │→ │ 段落 2   │→ │ 段落 N   │                        │
│         │ │ 生成     │  │ 生成(带  │  │ 生成(带  │                        │
│         │ │          │  │ 上文)    │  │ 全文上文)│                        │
│         │ └──────────┘  └──────────┘  └──────────┘                        │
│         │      │              │              │                            │
│         │      ▼              ▼              ▼                            │
│         │ ┌─────────────────────────────────────────┐                     │
│         │ │  实时进度推送 (WebSocket/SSE)            │                     │
│         │ │  - 当前生成段落索引/标题                  │                     │
│         │ │  - 已生成字数/预估总字数                  │                     │
│         │ │  - 段落生成状态 (pending/processing/done) │                    │
│         │ └─────────────────────────────────────────┘                     │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 2:     │     │ 输入: draft_v1                                   │   │
│  │ 内容润色     │ →   │ 输出: draft_v2 (润色后)                         │   │
│  │             │     │ 处理: 语言优化/风格调整/可读性提升               │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │    ┌─────────────────┬─────────────────┐                         │
│         │    ▼                 ▼                 ▼                         │
│         │ ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│         │ │ 语言流畅  │  │ 风格统一  │  │ 可读性   │                        │
│         │ │ 度优化    │  │ 调整      │  │ 提升      │                        │
│         │ └──────────┘  └──────────┘  └──────────┘                        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 3:     │     │ 输入: draft_v2                                   │   │
│  │ 事实核查     │ →   │ 输出: draft_v3 (核查后) + factCheckReport       │   │
│  │             │     │ 处理: 数据点提取→验证→标记                       │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │    ┌─────────────────┼─────────────────┐                         │
│         │    ▼                 ▼                 ▼                         │
│         │ ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│         │ │ 数据点   │→ │ 多源     │→ │ 可信度   │                        │
│         │ │ 提取      │  │ 验证      │  │ 评级      │                        │
│         │ └──────────┘  └──────────┘  └──────────┘                        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 4:     │     │ 输入: draft_v3                                   │   │
│  │ 格式调整     │ →   │ 输出: draft_v4 (最终稿)                         │   │
│  │             │     │ 处理: 排版/图表/引用/格式标准化                  │   │
│  └──────┬──────┘     └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 5:     │     │ 存储: draft_versions 表                          │   │
│  │ 版本保存     │ →   │ 更新: tasks.output_ids                           │   │
│  └─────────────┘     └─────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心数据结构

#### OutlineNode - 大纲节点

```typescript
interface OutlineNode {
  id: string;
  level: number;           // 层级 (1, 2, 3)
  title: string;
  content?: string;        // 预设内容
  keywords: string[];      // 关键词
  requiredLength: number;  // 建议字数
  dataSources?: string[];  // 推荐数据源
  children?: OutlineNode[];
}
```

#### Draft - 文稿

```typescript
interface Draft {
  id: string;
  taskId: string;
  version: number;
  status: 'draft' | 'polishing' | 'checking' | 'reviewing' | 'final';
  outline: OutlineNode[];
  content: string;         // Markdown 格式
  sections: DraftSection[];
  wordCount: number;
  readabilityScore: number;
  qualityScore: number;
  factCheckResult: FactCheckResult;
  createdAt: Date;
  updatedAt: Date;
}

interface DraftSection {
  id: string;
  outlineNodeId: string;
  title: string;
  content: string;
  wordCount: number;
  sources: string[];       // 引用的数据源
}
```

#### FactCheckResult - 事实核查结果

```typescript
interface FactCheckResult {
  overallScore: number;    // 综合可信度分
  totalClaims: number;     // 声明总数
  verifiedCount: number;   // 已验证数
  disputedCount: number;   // 存疑数
  failedCount: number;     // 验证失败数
  claims: ClaimCheck[];
}

interface ClaimCheck {
  id: string;
  claim: string;           // 声明内容
  type: 'data' | 'quote' | 'fact';
  sources: VerificationSource[];
  status: 'verified' | 'disputed' | 'failed' | 'unverified';
  confidence: number;
  location: {              // 在文中的位置
    sectionId: string;
    start: number;
    end: number;
  };
}
```

---

## 2. 详细步骤设计

### 步骤 1: 初稿生成

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | outline, researchData, insights |
| 输出 | draft_v1 (Markdown格式) |
| 方法 | AI 分段写作 + 内容整合 |
| 优先级 | P0 |

#### 流式生成流程 (v5.0)

```typescript
async function generateDraftStreaming(
  outline: OutlineNode[],
  researchData: ResearchData[],
  insights: Insight[],
  config: DraftConfig,
  onProgress: (progress: DraftProgress) => void
): Promise<Draft> {
  // 1. 解析大纲并准备上下文
  const flatOutline = flattenOutline(outline);
  const context = buildGenerationContext(outline, researchData, insights);
  
  // 2. 串行生成段落，每个段落带上前文上下文
  const sections: DraftSection[] = [];
  let accumulatedContent = ''; // 累计已生成内容
  
  for (let i = 0; i < flatOutline.length; i++) {
    const node = flatOutline[i];
    
    // 2.1 推送进度：开始生成当前段落
    onProgress({
      currentIndex: i,
      total: flatOutline.length,
      currentTitle: node.title,
      status: 'processing',
      generatedWordCount: countWords(accumulatedContent),
      estimatedTotalWordCount: estimateTotalWordCount(flatOutline),
      sections: sections.map(s => ({ id: s.id, title: s.title, status: 'done' })),
      currentSection: { id: node.id, title: node.title, status: 'processing' }
    });
    
    // 2.2 生成段落（带上前文上下文 + 大纲 + 研究数据）
    const section = await generateSectionWithContext(
      node, 
      researchData, 
      insights,
      accumulatedContent, // 前文上下文
      context
    );
    
    sections.push(section);
    accumulatedContent += `\n\n${'#'.repeat(node.level + 1)} ${section.title}\n${section.content}`;
    
    // 2.3 推送进度：段落完成
    onProgress({
      currentIndex: i + 1,
      total: flatOutline.length,
      currentTitle: node.title,
      status: i === flatOutline.length - 1 ? 'completed' : 'processing',
      generatedWordCount: countWords(accumulatedContent),
      estimatedTotalWordCount: estimateTotalWordCount(flatOutline),
      sections: sections.map(s => ({ id: s.id, title: s.title, status: 'done' })),
      currentSection: null
    });
    
    // 2.4 保存中间状态到数据库（支持断点续传）
    await saveDraftProgress({
      taskId: config.taskId,
      sections,
      accumulatedContent,
      progress: (i + 1) / flatOutline.length
    });
  }
  
  // 3. 生成标题和摘要
  const title = generateTitle(outline, sections);
  const summary = generateSummary(sections);
  
  return {
    id: generateId(),
    version: 1,
    status: 'draft',
    outline,
    content: `${title}\n\n${summary}\n\n${accumulatedContent.trim()}`,
    sections,
    wordCount: countWords(accumulatedContent),
    readabilityScore: 0,
    qualityScore: 0,
    factCheckResult: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// 进度数据结构
interface DraftProgress {
  currentIndex: number;           // 当前段落索引
  total: number;                  // 总段落数
  currentTitle: string;           // 当前段落标题
  status: 'pending' | 'processing' | 'completed';
  generatedWordCount: number;     // 已生成字数
  estimatedTotalWordCount: number; // 预估总字数
  sections: SectionProgress[];    // 所有段落状态
  currentSection: SectionProgress | null;
}

interface SectionProgress {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'done';
}
```

#### 带上下文的段落生成 (v5.0)

```typescript
async function generateSectionWithContext(
  node: OutlineNode,
  researchData: ResearchData[],
  insights: Insight[],
  accumulatedContent: string,  // 已生成的前文内容
  context: GenerationContext
): Promise<DraftSection> {
  // 1. 筛选相关数据
  const relevantData = researchData.filter(d => 
    node.keywords.some(k => d.tags.includes(k))
  );
  
  // 2. 筛选相关洞察
  const relevantInsights = insights.filter(i =>
    node.keywords.some(k => i.relatedTopics.includes(k))
  );
  
  // 3. 构建上下文感知的 Prompt
  const prompt = buildContextualPrompt({
    node,
    relevantData,
    relevantInsights,
    accumulatedContent,  // 前文上下文
    fullOutline: context.outline,
    topic: context.topic
  });

  const response = await llm.generate(prompt, {
    model: 'k2p5',
    maxTokens: node.requiredLength * 2,
    temperature: 0.7,
  });
  
  return {
    id: generateId(),
    outlineNodeId: node.id,
    title: node.title,
    content: response.content,
    wordCount: countWords(response.content),
    sources: relevantData.map(d => d.id),
  };
}

// 构建上下文感知的 Prompt
function buildContextualPrompt(params: {
  node: OutlineNode;
  relevantData: ResearchData[];
  relevantInsights: Insight[];
  accumulatedContent: string;
  fullOutline: OutlineNode[];
  topic: string;
}): string {
  const { node, relevantData, relevantInsights, accumulatedContent, fullOutline, topic } = params;
  
  // 提取前文的关键信息（避免超出 Token 限制）
  const previousContext = accumulatedContent 
    ? extractKeyContext(accumulatedContent, 2000)  // 提取前2000字的关键信息
    : '这是文章的第一个段落，需要引人入胜的开篇。';
  
  // 找到相邻段落信息
  const siblingNodes = findSiblingNodes(node, fullOutline);
  
  return `
你是一位专业的财经/行业研究员，正在撰写关于"${topic}"的深度研究报告。

【任务】
请撰写"${node.title}"部分的内容。

【全文大纲结构】
${formatOutlineForPrompt(fullOutline)}

【前文上下文】（已完成的内容摘要）
${previousContext}

【当前段落定位】
- 标题：${node.title}
- 层级：${node.level}级标题
- 建议字数：${node.requiredLength}字
- 前置段落：${siblingNodes.previous || '无'}
- 后置段落：${siblingNodes.next || '无'}

【相关研究数据】
${relevantData.map(d => `- [来源: ${d.source}] ${d.summary}`).join('\n') || '暂无特定数据'}

【相关洞察】
${relevantInsights.map(i => `- ${i.title}: ${i.description}`).join('\n') || '暂无特定洞察'}

【写作要求】
1. 内容承接：与前文逻辑连贯，自然过渡
2. 承上启下：如有前置段落，需要承接其结论；如有后置段落，需要为后续内容铺垫
3. 专业深度：数据支撑充分，观点有深度
4. 结构清晰：符合大纲结构，层次分明
5. 字数控制：严格控制在${node.requiredLength}字左右

请直接输出段落正文内容（不含标题）：
`;
}

// 提取关键上下文（避免 Token 超限）
function extractKeyContext(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  
  // 提取最后 maxLength 字符，并在段落边界截断
  const truncated = content.slice(-maxLength);
  const firstNewline = truncated.indexOf('\n');
  return firstNewline > 0 ? truncated.slice(firstNewline) : truncated;
}
```

#### 内容整合

```typescript
function integrateSections(
  sections: DraftSection[],
  style: WritingStyle
): string {
  const parts: string[] = [];
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const prevSection = sections[i - 1];
    
    // 添加过渡句（非首段）
    if (prevSection && style.addTransitions) {
      const transition = generateTransition(prevSection, section);
      parts.push(transition);
    }
    
    // 添加段落标题
    parts.push(`${'#'.repeat(section.level + 1)} ${section.title}`);
    parts.push(section.content);
    parts.push(''); // 空行
  }
  
  return parts.join('\n');
}
```

---

### 步骤 2: 内容润色

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v1 |
| 输出 | draft_v2 |
| 维度 | 语言流畅度、风格统一、可读性 |
| 优先级 | P1 |

#### 润色流程

```typescript
async function polishDraft(draft: Draft): Promise<Draft> {
  let content = draft.content;
  
  // 1. 语言流畅度优化
  content = await improveFluency(content);
  
  // 2. 风格统一
  content = await unifyStyle(content, draft.style);
  
  // 3. 可读性提升
  content = await improveReadability(content);
  
  // 4. 术语校准
  content = await calibrateTerminology(content, draft.domain);
  
  return {
    ...draft,
    version: draft.version + 1,
    status: 'polishing',
    content,
    readabilityScore: calculateReadabilityScore(content),
    updatedAt: new Date(),
  };
}
```

#### 可读性提升

```typescript
async function improveReadability(content: string): Promise<string> {
  const issues = detectReadabilityIssues(content);
  
  for (const issue of issues) {
    switch (issue.type) {
      case 'long_sentence':
        content = await breakLongSentence(content, issue.location);
        break;
      case 'complex_word':
        content = await simplifyWord(content, issue.location);
        break;
      case 'passive_voice':
        content = await convertToActive(content, issue.location);
        break;
    }
  }
  
  return content;
}

function calculateReadabilityScore(content: string): number {
  // Flesch Reading Ease Score
  const words = content.split(/\s+/).length;
  const sentences = content.split(/[.!?。！？]+/).length;
  const syllables = countSyllables(content);
  
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  
  // 转换到 0-100 分制
  return Math.min(Math.max(score, 0), 100);
}
```

---

### 步骤 3: 事实核查

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v2 |
| 输出 | draft_v3 + factCheckReport |
| 方法 | NLP提取 + 多源验证 |
| 优先级 | P0 |

#### 核查流程

```typescript
async function factCheck(draft: Draft): Promise<FactCheckResult> {
  // 1. 提取可验证声明
  const claims = await extractClaims(draft.content);
  
  // 2. 逐一验证
  const checkedClaims: ClaimCheck[] = [];
  for (const claim of claims) {
    const result = await verifyClaim(claim);
    checkedClaims.push(result);
  }
  
  // 3. 生成报告
  return generateFactCheckReport(checkedClaims);
}
```

#### 声明提取

```typescript
async function extractClaims(content: string): Promise<Claim[]> {
  const prompt = `
从以下文本中提取所有需要事实核查的声明：

${content}

声明类型包括：
1. 数据声明 (具体数字、百分比)
2. 引用声明 (引用他人观点)
3. 事实声明 (客观事实陈述)

输出格式：
[
  {
    "claim": "声明文本",
    "type": "data|quote|fact",
    "location": { "sectionId": "", "start": 0, "end": 10 }
  }
]
`;

  const response = await llm.generate(prompt);
  return JSON.parse(response.content);
}
```

#### 声明验证

```typescript
async function verifyClaim(claim: Claim): Promise<ClaimCheck> {
  // 1. 搜索验证源
  const sources = await searchVerificationSources(claim.claim);
  
  // 2. 交叉验证
  const verificationResults = await Promise.all(
    sources.map(s => verifyAgainstSource(claim, s))
  );
  
  // 3. 综合判断
  const verifiedCount = verificationResults.filter(r => r.verified).length;
  const disputedCount = verificationResults.filter(r => r.disputed).length;
  
  let status: ClaimStatus;
  let confidence: number;
  
  if (verifiedCount >= 2) {
    status = 'verified';
    confidence = 0.9;
  } else if (verifiedCount === 1) {
    status = 'disputed';
    confidence = 0.6;
  } else {
    status = 'failed';
    confidence = 0.3;
  }
  
  return {
    id: generateId(),
    claim: claim.claim,
    type: claim.type,
    sources: verificationResults,
    status,
    confidence,
    location: claim.location,
  };
}
```

#### 可信度评级

| 状态 | 说明 | 颜色标记 |
|------|------|---------|
| ✅ 已验证 | 2+ 独立来源确认 | 绿色 |
| ⚠️ 存疑 | 仅 1 来源确认 | 黄色 |
| ❌ 错误 | 多源矛盾 | 红色 |
| ❓ 未验证 | 无法找到来源 | 灰色 |

---

### 步骤 4: 格式调整

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v3 |
| 输出 | draft_v4 (最终稿) |
| 处理 | 排版/图表/引用/格式 |
| 优先级 | P1 |

#### 格式处理

```typescript
function formatDraft(draft: Draft, template: FormatTemplate): Draft {
  let content = draft.content;
  
  // 1. 标题格式
  content = formatHeadings(content, template.headings);
  
  // 2. 正文格式
  content = formatBody(content, template.body);
  
  // 3. 引用格式
  content = formatCitations(content, draft.factCheckResult);
  
  // 4. 图表插入
  content = insertCharts(content, draft.dataVisualizations);
  
  // 5. 页眉页脚
  content = addHeaderFooter(content, template.header, template.footer);
  
  return {
    ...draft,
    version: draft.version + 1,
    status: 'final',
    content,
    updatedAt: new Date(),
  };
}
```

#### 引用格式

```typescript
function formatCitations(
  content: string,
  factCheckResult: FactCheckResult
): string {
  let formatted = content;
  
  for (const claim of factCheckResult.claims) {
    const citation = generateCitation(claim);
    
    // 在声明后插入引用标记
    const before = formatted.slice(0, claim.location.end);
    const after = formatted.slice(claim.location.end);
    
    formatted = `${before}[${citation.id}]${after}`;
  }
  
  // 添加引用列表
  const citationList = generateCitationList(factCheckResult.claims);
  formatted += '\n\n## 参考资料\n\n' + citationList;
  
  return formatted;
}
```

---

### 步骤 5: 版本保存

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v4 |
| 输出 | void |
| 存储 | draft_versions 表 |
| 优先级 | P0 |

#### 存储逻辑

```typescript
async function saveDraftVersion(draft: Draft): Promise<void> {
  // 保存到 draft_versions
  await query(
    `INSERT INTO draft_versions (
      id, task_id, version, status, outline, content,
      sections, word_count, readability_score, quality_score,
      fact_check_result, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      draft.id,
      draft.taskId,
      draft.version,
      draft.status,
      JSON.stringify(draft.outline),
      draft.content,
      JSON.stringify(draft.sections),
      draft.wordCount,
      draft.readabilityScore,
      draft.qualityScore,
      JSON.stringify(draft.factCheckResult),
    ]
  );
  
  // 更新任务
  await query(
    `UPDATE tasks SET
      output_ids = array_append(output_ids, $1),
      status = 'awaiting_approval',
      updated_at = NOW()
    WHERE id = $2`,
    [draft.id, draft.taskId]
  );
}
```

---

## 3. 实时进度显示设计

### 3.1 进度推送机制

#### WebSocket 事件

```typescript
// 服务端推送事件类型
interface DraftGenerationEvents {
  // 段落开始生成
  'section:start': {
    taskId: string;
    sectionIndex: number;
    totalSections: number;
    sectionTitle: string;
    timestamp: number;
  };
  
  // 段落生成完成
  'section:complete': {
    taskId: string;
    sectionIndex: number;
    sectionTitle: string;
    wordCount: number;
    accumulatedWordCount: number;
    timestamp: number;
  };
  
  // 整体进度更新
  'progress:update': {
    taskId: string;
    progress: DraftProgress;
    timestamp: number;
  };
  
  // 生成完成
  'draft:complete': {
    taskId: string;
    draftId: string;
    totalWordCount: number;
    duration: number; // 耗时（秒）
  };
  
  // 生成错误
  'draft:error': {
    taskId: string;
    error: string;
    sectionIndex?: number;
  };
}
```

#### 前端进度展示组件

```typescript
// React 组件示例
interface DraftProgressPanelProps {
  taskId: string;
}

const DraftProgressPanel: React.FC<DraftProgressPanelProps> = ({ taskId }) => {
  const [progress, setProgress] = useState<DraftProgress | null>(null);
  const [sections, setSections] = useState<SectionProgress[]>([]);
  
  useEffect(() => {
    // 连接 WebSocket
    const ws = new WebSocket(`ws://api/draft/${taskId}/progress`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'section:start':
          updateSectionStatus(data.sectionIndex, 'processing');
          break;
        case 'section:complete':
          updateSectionStatus(data.sectionIndex, 'done');
          appendSectionContent(data.sectionTitle, data.content);
          break;
        case 'progress:update':
          setProgress(data.progress);
          break;
        case 'draft:complete':
          // 跳转至编辑页面
          navigate(`/draft/${data.draftId}/edit`);
          break;
      }
    };
    
    return () => ws.close();
  }, [taskId]);
  
  return (
    <div className="draft-progress-panel">
      {/* 总体进度 */}
      <div className="overall-progress">
        <ProgressBar 
          percent={(progress?.currentIndex || 0) / (progress?.total || 1) * 100}
          status={progress?.status}
        />
        <div className="progress-text">
          正在生成：{progress?.currentTitle || '准备中...'}
          （{progress?.generatedWordCount || 0} / {progress?.estimatedTotalWordCount || 0} 字）
        </div>
      </div>
      
      {/* 段落列表状态 */}
      <div className="sections-list">
        {sections.map((section, index) => (
          <div key={section.id} className={`section-item ${section.status}`}>
            <span className="section-index">{index + 1}</span>
            <span className="section-title">{section.title}</span>
            <span className="section-status">
              {section.status === 'pending' && '⏳'}
              {section.status === 'processing' && <Spinner />}
              {section.status === 'done' && '✓'}
            </span>
          </div>
        ))}
      </div>
      
      {/* 实时预览区域 */}
      <div className="live-preview">
        <h4>实时预览</h4>
        <div className="preview-content">
          {renderAccumulatedContent()}
        </div>
      </div>
    </div>
  );
};
```

### 3.2 API 接口（流式）

```yaml
# 启动流式文稿生成
POST /api/v1/production/:id/draft/generate-stream
Response: EventSource (SSE)

# 查询生成进度
GET /api/v1/production/:id/draft/progress
Response:
  {
    "status": "processing",
    "currentSection": 2,
    "totalSections": 10,
    "currentTitle": "定价的代际财富转移",
    "generatedWordCount": 1500,
    "estimatedTotalWordCount": 5000,
    "sections": [
      { "id": "s1", "title": "宏观层分析", "status": "done" },
      { "id": "s2", "title": "定价的代际财富转移", "status": "processing" },
      { "id": "s3", "title": "经济周期中的定价弹性", "status": "pending" }
    ],
    "accumulatedContent": "..."
  }

# WebSocket 连接
WS /api/v1/ws/draft/:taskId/progress
```

---

## 4. 数据库存储设计

### 4.1 表结构

#### draft_versions (文稿版本表)

```sql
CREATE TABLE draft_versions (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  version INTEGER NOT NULL,
  status VARCHAR(20), -- 'draft' | 'polishing' | 'checking' | 'final'
  outline JSONB,
  content TEXT,
  sections JSONB, -- DraftSection[]
  word_count INTEGER,
  readability_score INTEGER,
  quality_score INTEGER,
  fact_check_result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, version)
);

CREATE INDEX idx_draft_versions_task ON draft_versions(task_id);
CREATE INDEX idx_draft_versions_version ON draft_versions(version);
```

#### draft_generation_progress (文稿生成进度表 - 支持断点续传)

```sql
CREATE TABLE draft_generation_progress (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  status VARCHAR(20) NOT NULL, -- 'running' | 'paused' | 'completed' | 'failed'
  current_section_index INTEGER DEFAULT 0,
  total_sections INTEGER NOT NULL,
  accumulated_content TEXT DEFAULT '',
  sections JSONB DEFAULT '[]', -- 已完成的段落
  outline JSONB NOT NULL,
  research_data JSONB,
  config JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT,
  UNIQUE(task_id)
);

CREATE INDEX idx_draft_progress_task ON draft_generation_progress(task_id);
CREATE INDEX idx_draft_progress_status ON draft_generation_progress(status);
```

---

## 5. 接口设计

```yaml
# ========== 流式文稿生成 (v5.0 新增) ==========

# 启动流式生成（SSE 推送进度）
POST /api/v1/production/:id/draft/generate-stream
Request:
  {
    "style": "formal",
    "tone": "professional",
    "options": {
      "includeContext": true,      # 带上文上下文
      "realtimePreview": true,     # 实时预览
      "saveProgress": true         # 支持断点续传
    }
  }
Response: text/event-stream
  event: section:start
  data: {"sectionIndex":0,"totalSections":10,"sectionTitle":"宏观层分析"}
  
  event: section:complete
  data: {"sectionIndex":0,"sectionTitle":"宏观层分析","wordCount":500,"accumulatedWordCount":500}
  
  event: progress:update
  data: {"currentIndex":1,"total":10,"status":"processing","generatedWordCount":500}
  
  event: draft:complete
  data: {"draftId":"draft_xxx","totalWordCount":5000,"duration":120}

# 查询生成进度
GET /api/v1/production/:id/draft/progress
Response:
  {
    "status": "processing",
    "currentSection": 2,
    "totalSections": 10,
    "currentTitle": "定价的代际财富转移",
    "generatedWordCount": 1500,
    "estimatedTotalWordCount": 5000,
    "progress": 0.3,
    "sections": [
      { "id": "s1", "title": "宏观层分析", "status": "done", "wordCount": 800 },
      { "id": "s2", "title": "定价的代际财富转移", "status": "processing" },
      { "id": "s3", "title": "经济周期中的定价弹性", "status": "pending" }
    ],
    "accumulatedContent": "...",
    "startedAt": "2026-03-23T10:00:00Z",
    "elapsedTime": 45
  }

# WebSocket 实时连接
WS /api/v1/ws/draft/:taskId/progress

# ========== 传统接口 ==========

# 初稿生成（非流式，兼容旧版）
POST   /api/v1/production/:id/draft/generate
GET    /api/v1/production/:id/draft

# 内容润色
POST   /api/v1/production/:id/draft/polish

# 事实核查
POST   /api/v1/production/:id/draft/fact-check
GET    /api/v1/production/:id/draft/fact-check-result

# 版本管理
GET    /api/v1/production/:id/draft/versions
GET    /api/v1/production/:id/draft/versions/:version

# 断点续传控制
POST   /api/v1/production/:id/draft/pause    # 暂停生成
POST   /api/v1/production/:id/draft/resume   # 恢复生成
POST   /api/v1/production/:id/draft/cancel   # 取消生成
```

---

## 6. 性能与限制

| 指标 | 目标值 |
|------|--------|
| 段落生成速度 | < 30秒/段落 (500字) |
| 完整初稿生成 | < 5分钟 (10段落/5000字) |
| 进度推送延迟 | < 500ms |
| 内容润色 | < 2分钟 |
| 事实核查 | < 3分钟 |
| 单次最大段落数 | 20个 |
| 单次最大字数 | 10000字 |
| 上下文携带长度 | 前2000字 |

### 6.1 流式生成优化策略

1. **段落级并行预热**：在生成当前段落时，预加载下一个段落的相关数据
2. **增量保存**：每完成一个段落，立即保存到数据库（支持断点续传）
3. **智能上下文截断**：超过2000字时，提取关键摘要而非全文
4. **进度推送节流**：每500ms最多推送一次进度更新

---

**文档维护**: 产品研发运营协作体系
**更新频率**: 每迭代更新
