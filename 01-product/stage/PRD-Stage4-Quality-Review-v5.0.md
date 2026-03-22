# 产品需求文档: 阶段 4 - 质量评审详细设计 v5.0

**版本**: v5.0
**日期**: 2026-03-23
**状态**: 📝 详细设计文档
**对应阶段**: 阶段 4 - 质量评审
**依赖**: PRD-Production-Pipeline-v5.0.md

---

## 1. 质量评审流程概览

### 1.1 流程架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段 4: 质量评审流程                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │  文稿完成    │ ← 阶段3完成 / 用户提交评审                                  │
│  └──────┬──────┘                                                            │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 1: 事实核查 (自动化)                                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 数据点提取   │→ │ 来源验证     │→ │ 可信度评级   │                 │   │
│  │  │ (NLP+正则)  │  │ (多源交叉)   │  │ (A/B/C/D)   │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 2: 逻辑检查 (AI辅助)                                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 论证完整性   │→ │ 逻辑一致性   │→ │ 结构合理性   │                 │   │
│  │  │ (前提-结论)  │  │ (矛盾检测)   │  │ (层次清晰)   │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 3: 专家评审 (串行多轮评审)                                       │   │
│  │                                                                      │   │
│  │  专家评审团构成:                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ AI专家 (3个固定角色)                                           │   │   │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │   │   │
│  │  │  │  挑战者       │ │  拓展者       │ │  提炼者       │         │   │   │
│  │  │  │ (Challenger) │ │ (Expander)   │ │ (Synthesizer)│         │   │   │
│  │  │  └──────────────┘ └──────────────┘ └──────────────┘         │   │   │
│  │  │ + 真实专家 (从专家库抽取 ≥2个)                                  │   │   │
│  │  │  ┌──────────────┐ ┌──────────────┐                           │   │   │
│  │  │  │  领域专家A    │ │  领域专家B    │ (根据主题匹配)            │   │   │
│  │  │  └──────────────┘ └──────────────┘                           │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  评审流程 (串行执行):                                                │   │
│  │                                                                      │   │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐         │   │
│  │  │ 第1轮   │    │ 第2轮   │    │ 第3轮   │    │ 第N轮   │         │   │
│  │  │         │    │         │    │         │    │         │         │   │
│  │  │ Draft_v0│───→│ Draft_v1│───→│ Draft_v2│───→│ Draft_vN│         │   │
│  │  │    ↓    │    │    ↓    │    │    ↓    │    │    ↓    │         │   │
│  │  │ 专家1意见│   │ 专家2意见│   │ 专家3意见│   │ 专家N意见│         │   │
│  │  │    ↓    │    │    ↓    │    │    ↓    │    │    ↓    │         │   │
│  │  │ LLM生成 │───→│ LLM生成 │───→│ LLM生成 │───→│ LLM生成 │         │   │
│  │  │ Draft_v1│    │ Draft_v2│    │ Draft_v3│    │ Draft_final        │   │
│  │  └─────────┘    └─────────┘    └─────────┘    └─────────┘         │   │
│  │                                                                      │   │
│  │  每轮处理流程:                                                       │   │
│  │  1. 获取当前Draft版本                                                │   │
│  │  2. 分配给当前轮次评审专家                                            │   │
│  │  3. 专家提交评审意见 (问题+建议)                                      │   │
│  │  4. LLM基于 Draft + 专家意见 + FactCheck + LogicCheck 生成新版本Draft  │   │
│  │  5. 新版本Draft作为下一轮输入                                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 步骤 4: 读者测试 (可选)                                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 可读性测试   │→ │ 受众匹配     │→ │ 满意度调查   │                 │   │
│  │  │ (阅读难度)   │  │ (目标读者)   │  │ (问卷评分)   │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 5:     │     │ 输出: 评审报告 + 质量评分 + 修订建议              │   │
│  │ 结果汇总     │ →   │ 存储: blue_team_reviews / draft_versions        │   │
│  └─────────────┘     └─────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │ 步骤 6:     │     │ 人工确认: 接受 / 拒绝 / 要求修改                 │   │
│  │ 人工确认     │ →   │ 状态更新: tasks.status                          │   │
│  └─────────────┘     └─────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心数据结构

#### ExpertReview - 专家评审

```typescript
interface ExpertReview {
  id: string;
  taskId: string;
  draftId: string;
  round: number;                    // 评审轮次 (1-N)
  
  // 专家信息
  expertType: 'ai' | 'human';       // AI专家或真人专家
  expertRole?: 'challenger' | 'expander' | 'synthesizer';  // AI专家角色
  expertId?: string;                // 真人专家ID (关联experts表)
  expertName: string;               // 专家姓名
  expertProfile?: string;           // 专家简介/领域
  
  // 评审内容
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  questions: ReviewQuestion[];
  overallScore: number;             // 综合评分 0-100
  summary: string;                  // 总结意见
  
  // 串行评审特有
  inputDraftId: string;             // 输入Draft版本ID
  outputDraftId?: string;           // 输出Draft版本ID (LLM生成后)
  
  createdAt: Date;
  completedAt?: Date;
}

interface ReviewQuestion {
  id: string;
  question: string;                 // 问题描述
  severity: 'high' | 'medium' | 'low' | 'praise';  // 严重程度
  suggestion: string;               // 修改建议
  location?: {                      // 问题位置
    sectionId: string;
    start: number;
    end: number;
  };
  category: string;                 // 问题类别
  userDecision?: 'accept' | 'ignore' | 'manual_resolved';  // 用户决策
  decisionNote?: string;            // 决策备注
}
```

#### ReviewReport - 评审报告

```typescript
interface ReviewReport {
  id: string;
  taskId: string;
  originalDraftId: string;          // 原始Draft ID
  finalDraftId: string;             // 最终Draft ID
  
  // 评审链
  reviewChain: ReviewChainItem[];   // 串行评审链
  
  // 参与专家
  participants: {
    aiExperts: string[];            // AI专家角色列表
    humanExperts: string[];         // 真人专家ID列表
  };
  
  finalScore: number;
  decision: 'accept' | 'revise' | 'reject';
  
  statistics: {
    totalRounds: number;            // 总轮次
    totalQuestions: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    praiseCount: number;
    resolvedCount: number;
  };
  generatedAt: Date;
}

interface ReviewChainItem {
  round: number;
  expertId: string;                 // 评审专家ID
  expertName: string;
  inputDraftId: string;             // 输入Draft版本
  outputDraftId: string;            // 输出Draft版本 (LLM生成)
  reviewId: string;                 // 关联的ExpertReview ID
  score: number;
  status: 'completed' | 'skipped';
}
```

#### ReaderTestResult - 读者测试结果

```typescript
interface ReaderTestResult {
  id: string;
  draftId: string;
  readabilityScore: number;         // 可读性分
  readingTime: number;              // 预估阅读时间(分钟)
  comprehensionScore: number;       // 理解度分
  satisfactionScore: number;        // 满意度分
  shareWillingness: number;         // 分享意愿
  feedback: ReaderFeedback[];
  testedAt: Date;
}

interface ReaderFeedback {
  readerProfile: string;            // 读者画像
  rating: number;                   // 评分 1-5
  comments: string;
  confusingParts: string[];
  highlights: string[];
}
```

---

## 2. 详细步骤设计

### 步骤 1: 事实核查

**详细设计参考**: [PRD-Stage3-Content-Generation-v5.0.md](./PRD-Stage3-Content-Generation-v5.0.md) 中的"步骤 3: 事实核查"

简要流程:
1. 数据点提取 (NLP + 正则)
2. 多源交叉验证
3. 可信度评级 (A/B/C/D)

---

### 步骤 2: 逻辑检查

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v4 |
| 输出 | logicCheckReport |
| 检查项 | 论证完整性、逻辑一致性、结构合理性 |
| 优先级 | P0 |

#### 论证完整性检查

```typescript
async function checkArgumentCompleteness(
  draft: Draft
): Promise<LogicIssue[]> {
  const issues: LogicIssue[] = [];
  
  for (const section of draft.sections) {
    // 检查每个论证段落
    const arguments = parseArguments(section.content);
    
    for (const arg of arguments) {
      // 检查是否有前提
      if (!arg.premise) {
      issues.push({
          type: 'missing_premise',
          severity: 'high',
          message: `论证缺少前提: "${arg.conclusion}"`,
          location: arg.location,
          suggestion: '补充论证的前提条件',
        });
      }
      
      // 检查是否有推理过程
      if (!arg.reasoning) {
        issues.push({
          type: 'missing_reasoning',
          severity: 'medium',
          message: `论证缺少推理过程`,
          location: arg.location,
          suggestion: '补充从前提得出结论的推理过程',
        });
      }
      
      // 检查是否有结论
      if (!arg.conclusion) {
        issues.push({
          type: 'missing_conclusion',
          severity: 'high',
          message: `论证缺少结论`,
          location: arg.location,
          suggestion: '明确论证的结论',
        });
      }
    }
  }
  
  return issues;
}
```

#### 逻辑一致性检查

```typescript
async function checkLogicalConsistency(
  draft: Draft
): Promise<LogicIssue[]> {
  const issues: LogicIssue[] = [];
  
  // 1. 提取所有声明
  const claims = extractAllClaims(draft.content);
  
  // 2. 检查矛盾
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const conflict = detectConflict(claims[i], claims[j]);
      if (conflict) {
        issues.push({
          type: 'contradiction',
          severity: 'high',
          message: `逻辑矛盾: "${claims[i].text}" 与 "${claims[j].text}"`,
          location: claims[i].location,
          suggestion: '检查并统一两个声明的表述',
        });
      }
    }
  }
  
  // 3. 检查因果关系
  const causalRelations = extractCausalRelations(draft.content);
  for (const relation of causalRelations) {
    const validity = await validateCausalRelation(relation);
    if (!validity.valid) {
      issues.push({
        type: 'invalid_causation',
        severity: 'medium',
        message: `因果关系存疑: ${validity.reason}`,
        location: relation.location,
        suggestion: validity.suggestion,
      });
    }
  }
  
  return issues;
}
```

---

### 步骤 3: 专家评审 (串行多轮评审)

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v4, factCheckResult, logicCheckResult, 专家配置 |
| 输出 | ExpertReview[], ReviewReport, finalDraft |
| 评审流程 | 串行执行: 专家1 → LLM生成 → 专家2 → LLM生成 → ... → 最终稿 |
| 专家构成 | 3 AI专家 + ≥2 真人专家 |
| 优先级 | P0 |

#### 专家抽取与配置

```typescript
async function configureReviewExperts(
  taskId: string,
  topic: string
): Promise<ReviewConfig> {
  // 1. 固定AI专家
  const aiExperts = [
    { type: 'ai', role: 'challenger', name: '批判者' },
    { type: 'ai', role: 'expander', name: '拓展者' },
    { type: 'ai', role: 'synthesizer', name: '提炼者' },
  ];
  
  // 2. 从专家库抽取相关专家
  const humanExperts = await query(
    `SELECT id, name, profile, expertise_areas
     FROM experts
     WHERE is_active = true
       AND expertise_areas && $1  -- 与主题标签有交集
     ORDER BY relevance_score DESC
     LIMIT 5`,
    [topicTags]
  );
  
  // 确保至少2个真人专家
  const selectedHumanExperts = humanExperts.rows.slice(0, Math.max(2, humanExperts.rows.length));
  
  // 3. 构建评审队列 (串行顺序)
  // 顺序: 挑战者 → 真人专家1 → 拓展者 → 真人专家2 → 提炼者
  const reviewQueue = [
    aiExperts[0],           // 挑战者先评审
    selectedHumanExperts[0],
    aiExperts[1],           // 拓展者
    selectedHumanExperts[1] || selectedHumanExperts[0], // 如果只有一个真人专家，复用
    aiExperts[2],           // 提炼者最后
  ].filter(Boolean);
  
  return {
    taskId,
    reviewQueue,
    totalRounds: reviewQueue.length,
  };
}
```

#### 串行评审流程

```typescript
async function conductSequentialReview(
  taskId: string,
  initialDraft: Draft,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult,
  reviewConfig: ReviewConfig
): Promise<{
  reviews: ExpertReview[];
  finalDraft: Draft;
  report: ReviewReport;
}> {
  const reviews: ExpertReview[] = [];
  let currentDraft = initialDraft;
  const reviewChain: ReviewChainItem[] = [];
  
  // 串行执行每一轮评审
  for (let round = 0; round < reviewConfig.reviewQueue.length; round++) {
    const expertConfig = reviewConfig.reviewQueue[round];
    
    console.log(`[Review] Starting round ${round + 1}/${reviewConfig.reviewQueue.length} with ${expertConfig.name}`);
    
    // 1. 创建评审记录
    const review = await createExpertReview({
      taskId,
      draftId: currentDraft.id,
      round: round + 1,
      expertType: expertConfig.type,
      expertRole: expertConfig.role,
      expertId: expertConfig.id,
      expertName: expertConfig.name,
      inputDraftId: currentDraft.id,
    });
    
    // 2. 获取专家评审意见
    let reviewResult: ReviewResult;
    if (expertConfig.type === 'ai') {
      // AI专家: 直接调用LLM
      reviewResult = await conductAIExpertReview(
        currentDraft,
        expertConfig,
        factCheck,
        logicCheck
      );
    } else {
      // 真人专家: 发送通知等待反馈 (异步)
      reviewResult = await conductHumanExpertReview(
        currentDraft,
        expertConfig,
        factCheck,
        logicCheck
      );
    }
    
    // 3. 更新评审记录
    await updateExpertReview(review.id, {
      questions: reviewResult.questions,
      overallScore: reviewResult.score,
      summary: reviewResult.summary,
      status: 'completed',
    });
    
    reviews.push(review);
    
    // 4. LLM基于评审意见生成新版本Draft
    const newDraft = await generateRevisedDraft(
      currentDraft,
      reviewResult,
      factCheck,
      logicCheck
    );
    
    // 5. 更新评审链
    reviewChain.push({
      round: round + 1,
      expertId: expertConfig.id || expertConfig.role,
      expertName: expertConfig.name,
      inputDraftId: currentDraft.id,
      outputDraftId: newDraft.id,
      reviewId: review.id,
      score: reviewResult.score,
      status: 'completed',
    });
    
    // 6. 新版本作为下一轮输入
    currentDraft = newDraft;
    
    console.log(`[Review] Round ${round + 1} completed. New draft: ${newDraft.id}`);
  }
  
  // 生成评审报告
  const report = await generateReviewReport(
    taskId,
    initialDraft.id,
    currentDraft.id,
    reviews,
    reviewChain
  );
  
  return {
    reviews,
    finalDraft: currentDraft,
    report,
  };
}
```

#### AI专家评审

```typescript
async function conductAIExpertReview(
  draft: Draft,
  expertConfig: ExpertConfig,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult
): Promise<ReviewResult> {
  const promptTemplates: Record<string, string> = {
    challenger: `
你是一位严苛的批判者(Challenger)，负责找出文稿中的逻辑漏洞和问题。

当前文稿版本：{{draftContent}}

事实核查结果：{{factCheck}}

逻辑检查结果：{{logicCheck}}

请从以下角度进行评审：
1. 逻辑漏洞：是否存在论证不严密的地方？
2. 论证跳跃：是否缺少必要的推理步骤？
3. 数据可靠性：引用的数据是否可信？
4. 隐含假设：是否有未明确说明的前提？

输出格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "逻辑漏洞|论证跳跃|数据可靠性|隐含假设"
    }
  ]
}`,
    expander: `
你是一位拓展者(Expander)，负责提供补充视角和扩展内容。
...
`,
    synthesizer: `
你是一位提炼者(Synthesizer)，负责优化表达和结构。
...
`,
  };

  const prompt = promptTemplates[expertConfig.role]
    .replace('{{draftContent}}', draft.content)
    .replace('{{factCheck}}', JSON.stringify(factCheck))
    .replace('{{logicCheck}}', JSON.stringify(logicCheck));
  
  const response = await llm.generate(prompt, {
    model: 'k2p5',
    maxTokens: 2000,
  });
  
  return parseReviewResponse(response.content);
}
```

#### 真人专家评审

```typescript
async function conductHumanExpertReview(
  draft: Draft,
  expertConfig: ExpertConfig,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult
): Promise<ReviewResult> {
  // 1. 创建专家评审任务
  const reviewTask = await createHumanReviewTask({
    expertId: expertConfig.id,
    draftId: draft.id,
    draftContent: draft.content,
    factCheckSummary: summarizeFactCheck(factCheck),
    logicCheckSummary: summarizeLogicCheck(logicCheck),
    deadline: addHours(new Date(), 24), // 24小时截止
  });
  
  // 2. 发送通知给专家
  await notifyExpert(expertConfig.id, {
    type: 'review_request',
    taskId: reviewTask.id,
    draftTitle: draft.title,
    deadline: reviewTask.deadline,
    reviewUrl: `${config.frontendUrl}/expert-review/${reviewTask.id}`,
  });
  
  // 3. 等待专家提交反馈 (轮询或Webhook)
  const result = await waitForExpertFeedback(reviewTask.id, {
    timeout: 24 * 60 * 60 * 1000, // 24小时超时
    pollInterval: 60 * 1000,       // 每分钟轮询
  });
  
  if (!result) {
    // 超时处理: 使用AI代理评审或跳过
    console.warn(`[Review] Expert ${expertConfig.name} timed out, using AI proxy`);
    return conductAIExpertReview(draft, { ...expertConfig, type: 'ai', role: 'challenger' }, factCheck, logicCheck);
  }
  
  return {
    score: result.score,
    summary: result.summary,
    questions: result.questions,
  };
}

// 专家提交反馈的接口
async function submitExpertFeedback(
  reviewTaskId: string,
  feedback: {
    score: number;
    summary: string;
    questions: ReviewQuestion[];
  }
): Promise<void> {
  await query(
    `UPDATE expert_review_tasks SET
      status = 'completed',
      score = $1,
      summary = $2,
      questions = $3,
      completed_at = NOW()
    WHERE id = $4`,
    [feedback.score, feedback.summary, JSON.stringify(feedback.questions), reviewTaskId]
  );
}
```

#### 基于评审意见生成修订稿

```typescript
async function generateRevisedDraft(
  currentDraft: Draft,
  reviewResult: ReviewResult,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult
): Promise<Draft> {
  const prompt = `
你是一位专业的文稿修订专家。请根据当前专家评审意见，对文稿进行修订。

## 当前文稿版本

标题：${currentDraft.title}

内容：
${currentDraft.content}

## 本轮专家评审意见

评审专家：${reviewResult.expertName}
综合评分：${reviewResult.score}/100
总体评价：${reviewResult.summary}

具体问题与建议：
${reviewResult.questions.map((q, i) => `
${i + 1}. [${q.severity}] ${q.question}
   位置：${q.location || '全文'}
   建议：${q.suggestion}
`).join('\n')}

## 事实核查结果

${factCheck.claims.filter(c => c.status !== 'verified').map(c => `
- ${c.claim}: ${c.status} (${c.confidence})
`).join('\n')}

## 逻辑检查结果

${logicCheck.issues?.map(issue => `
- [${issue.severity}] ${issue.message}
`).join('\n') || '无明显逻辑问题'}

## 修订要求

1. 针对专家提出的每个问题进行修改
2. 优先处理 high 和 medium 级别的问题
3. 保持文稿整体结构、风格和专业性
4. 确保修订后的内容流畅自然
5. 生成完整的修订后文稿

请输出完整的修订后文稿（Markdown格式）：
`;

  const response = await llm.generate(prompt, {
    model: 'k2p5',
    maxTokens: 8000,
    temperature: 0.7,
  });
  
  // 创建新版本Draft
  const newDraft: Draft = {
    ...currentDraft,
    id: generateId(),
    version: currentDraft.version + 1,
    status: 'reviewing',
    content: response.content,
    wordCount: countWords(response.content),
    updatedAt: new Date(),
  };
  
  // 保存到数据库
  await saveDraftVersion(newDraft);
  
  return newDraft;
}
```



---

### 步骤 4: 读者测试

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | draft_v4 |
| 输出 | ReaderTestResult |
| 测试项 | 可读性、受众匹配、满意度 |
| 优先级 | P1 (可选) |

#### 测试流程

```typescript
async function conductReaderTest(draft: Draft): Promise<ReaderTestResult> {
  // 1. 可读性测试
  const readability = calculateReadabilityMetrics(draft.content);
  
  // 2. 预估阅读时间
  const readingTime = estimateReadingTime(draft.wordCount);
  
  // 3. AI 模拟读者反馈
  const simulatedFeedback = await generateSimulatedFeedback(draft);
  
  return {
    id: generateId(),
    draftId: draft.id,
    readabilityScore: readability.fleschScore,
    readingTime,
    comprehensionScore: simulatedFeedback.comprehension,
    satisfactionScore: simulatedFeedback.satisfaction,
    shareWillingness: simulatedFeedback.shareWillingness,
    feedback: simulatedFeedback.details,
    testedAt: new Date(),
  };
}
```

---

### 步骤 5: 结果汇总

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | BlueTeamReview[], ReaderTestResult |
| 输出 | ReviewReport |
| 决策 | accept / revise / reject |
| 优先级 | P0 |

#### 汇总逻辑

```typescript
function generateReviewReport(
  reviews: BlueTeamReview[],
  readerTest?: ReaderTestResult
): ReviewReport {
  // 统计问题
  const allQuestions = reviews.flatMap(r => r.questions);
  const statistics = {
    totalQuestions: allQuestions.length,
    criticalCount: allQuestions.filter(q => q.severity === 'high').length,
    majorCount: allQuestions.filter(q => q.severity === 'medium').length,
    minorCount: allQuestions.filter(q => q.severity === 'low').length,
    praiseCount: allQuestions.filter(q => q.severity === 'praise').length,
    resolvedCount: allQuestions.filter(q => q.userDecision === 'accept').length,
  };
  
  // 计算综合分
  const expertScores = reviews.map(r => r.overallScore);
  const avgExpertScore = expertScores.reduce((a, b) => a + b, 0) / expertScores.length;
  
  const readerScore = readerTest?.satisfactionScore || 0;
  
  const finalScore = Math.round(
    avgExpertScore * 0.7 + readerScore * 20 * 0.3
  );
  
  // 决策建议
  let decision: 'accept' | 'revise' | 'reject';
  if (finalScore >= 80 && statistics.criticalCount === 0) {
    decision = 'accept';
  } else if (finalScore >= 60) {
    decision = 'revise';
  } else {
    decision = 'reject';
  }
  
  return {
    id: generateId(),
    taskId: reviews[0].taskId,
    draftId: reviews[0].draftId,
    rounds: groupByRound(reviews),
    finalScore,
    decision,
    statistics,
    generatedAt: new Date(),
  };
}
```

---

### 步骤 6: 人工确认

#### 功能规格

| 项目 | 规格 |
|------|------|
| 输入 | ReviewReport |
| 输出 | 用户决策 |
| 操作 | 接受 / 拒绝 / 要求修改 |
| 优先级 | P0 |

#### 确认流程

```typescript
async function submitUserDecision(
  taskId: string,
  reportId: string,
  decision: 'accept' | 'reject' | 'revise',
  note?: string
): Promise<void> {
  // 保存用户决策
  await query(
    `INSERT INTO review_decisions (
      task_id, report_id, decision, note, decided_at
    ) VALUES ($1, $2, $3, $4, NOW())`,
    [taskId, reportId, decision, note]
  );
  
  // 更新任务状态
  const statusMap = {
    accept: 'completed',
    reject: 'failed',
    revise: 'writing',
  };
  
  await query(
    `UPDATE tasks SET
      status = $1,
      user_decision = $2,
      updated_at = NOW()
    WHERE id = $3`,
    [statusMap[decision], decision, taskId]
  );
}
```

---

## 3. 数据库存储设计

### 3.1 表结构

#### expert_reviews (专家评审表)

```sql
CREATE TABLE expert_reviews (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  draft_id VARCHAR(50) NOT NULL,
  round INTEGER NOT NULL,
  
  -- 专家信息
  expert_type VARCHAR(10) NOT NULL CHECK (expert_type IN ('ai', 'human')),
  expert_role VARCHAR(20),           -- AI专家角色
  expert_id VARCHAR(50),             -- 真人专家ID (关联experts表)
  expert_name VARCHAR(100),
  expert_profile TEXT,
  
  -- 评审内容
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  questions JSONB,
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  summary TEXT,
  
  -- 串行评审特有
  input_draft_id VARCHAR(50) NOT NULL,
  output_draft_id VARCHAR(50),       -- LLM生成的新版本
  
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_expert_reviews_task ON expert_reviews(task_id);
CREATE INDEX idx_expert_reviews_draft ON expert_reviews(draft_id);
CREATE INDEX idx_expert_reviews_round ON expert_reviews(round);
```

#### expert_review_tasks (真人专家评审任务表)

```sql
CREATE TABLE expert_review_tasks (
  id VARCHAR(50) PRIMARY KEY,
  expert_id VARCHAR(50) NOT NULL REFERENCES experts(id),
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  review_id VARCHAR(50) REFERENCES expert_reviews(id),
  draft_id VARCHAR(50) NOT NULL,
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  draft_content TEXT,
  fact_check_summary TEXT,
  logic_check_summary TEXT,
  
  -- 专家反馈
  score INTEGER,
  summary TEXT,
  questions JSONB,
  
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_expert_review_tasks_expert ON expert_review_tasks(expert_id);
CREATE INDEX idx_expert_review_tasks_status ON expert_review_tasks(status);
```

#### review_decisions (评审决策表)

```sql
CREATE TABLE review_decisions (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id),
  report_id VARCHAR(50) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  note TEXT,
  decided_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. 接口设计

```yaml
# 串行评审管理
GET    /api/v1/production/:id/reviews                    # 获取所有专家评审
GET    /api/v1/production/:id/reviews/chain              # 获取评审链 (串行流程)
POST   /api/v1/production/:id/reviews/start              # 启动串行评审流程
POST   /api/v1/production/:id/reviews/proceed            # 完成当前轮次，触发LLM生成新版本并进入下一轮
GET    /api/v1/production/:id/reviews/current            # 获取当前待评审的轮次信息

# 真人专家评审任务 (供专家使用)
GET    /api/v1/expert/review-tasks                       # 专家获取待评审任务列表
GET    /api/v1/expert/review-tasks/:taskId               # 获取评审任务详情
POST   /api/v1/expert/review-tasks/:taskId/submit        # 提交专家评审意见
POST   /api/v1/expert/review-tasks/:taskId/delegate      # 委托给其他专家 (可选)

# 专家评审详情
GET    /api/v1/production/:id/reviews/:reviewId
PUT    /api/v1/production/:id/reviews/:reviewId          # 更新评审 (管理员)

# 评审报告
GET    /api/v1/production/:id/review-report              # 获取完整评审报告

# 读者测试
POST   /api/v1/production/:id/reader-test
GET    /api/v1/production/:id/reader-test/result

# 最终确认
POST   /api/v1/production/:id/approve
POST   /api/v1/production/:id/reject
```

---

## 5. 性能与限制

| 指标 | 目标值 | 说明 |
|------|--------|------|
| AI专家评审 | < 2分钟 | 单个AI角色评审耗时 |
| 真人专家评审 | < 24小时 | 专家响应时限 |
| LLM生成修订稿 | < 3分钟 | 每轮生成新版本耗时 |
| 完整串行评审 | 1-3天 | 3 AI + 2真人专家，取决于真人响应速度 |
| 读者测试 | < 1分钟 | AI模拟读者测试 |
| 最大评审文稿长度 | 10000字 | 超过需分段处理 |
| 最大评审轮次 | 10轮 | 防止无限循环 |

---

**文档维护**: 产品研发运营协作体系
**更新频率**: 每迭代更新
