// 串行多轮评审服务 - Sequential Review Service v5.0
// 支持: 3 AI专家 + ≥2 真人专家串行评审，每轮LLM生成新版本Draft

import { query } from '../db/connection.js';
import { getLLMRouter } from '../providers/index.js';
import { ExpertLibraryService } from './expertLibrary.js';

// AI专家角色定义
const AI_EXPERT_ROLES = [
  {
    role: 'challenger',
    name: '批判者',
    focus: ['逻辑漏洞', '论证跳跃', '数据可靠性', '隐含假设'],
    promptTemplate: generateChallengerPrompt,
  },
  {
    role: 'expander',
    name: '拓展者',
    focus: ['关联因素', '国际对比', '交叉学科', '长尾效应'],
    promptTemplate: generateExpanderPrompt,
  },
  {
    role: 'synthesizer',
    name: '提炼者',
    focus: ['核心论点', '结构优化', '金句提炼', '消除冗余'],
    promptTemplate: generateSynthesizerPrompt,
  },
];

// 评审配置
interface ReviewConfig {
  taskId: string;
  reviewQueue: ReviewQueueItem[];
  totalRounds: number;
}

interface ReviewQueueItem {
  type: 'ai' | 'human';
  role?: string;
  id?: string;
  name: string;
  profile?: string;
}

// 评审结果
interface ExpertReview {
  id: string;
  taskId: string;
  draftId: string;
  round: number;
  expertType: 'ai' | 'human';
  expertRole?: string;
  expertId?: string;
  expertName: string;
  expertProfile?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  questions: ReviewQuestion[];
  overallScore: number;
  summary: string;
  inputDraftId: string;
  outputDraftId?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface ReviewQuestion {
  id: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  location?: string;
  category?: string;
}

interface ReviewResult {
  score: number;
  summary: string;
  questions: ReviewQuestion[];
}

// 事实核查结果类型
interface FactCheckResult {
  overallScore: number;
  claims: Array<{
    claim: string;
    status: 'verified' | 'disputed' | 'failed' | 'unverified';
    confidence: number;
  }>;
}

// 逻辑检查结果类型
interface LogicCheckResult {
  overallScore: number;
  issues?: Array<{
    severity: 'high' | 'medium' | 'low';
    message: string;
  }>;
}

// Draft类型
interface Draft {
  id: string;
  taskId: string;
  version: number;
  title?: string;
  content: string;
  status: string;
}

/**
 * 配置串行评审专家队列
 */
export async function configureSequentialReview(
  taskId: string,
  topic: string
): Promise<ReviewConfig> {
  console.log(`[SequentialReview] Configuring review for task ${taskId}, topic: ${topic}`);

  // 1. 固定AI专家
  const aiExperts = AI_EXPERT_ROLES.map(e => ({
    type: 'ai' as const,
    role: e.role,
    name: e.name,
  }));

  // 2. 从专家库抽取相关专家
  const expertLibrary = new ExpertLibraryService();
  const humanExperts = await expertLibrary.matchExperts(topic, 5);

  // 选择最合适的2个专家
  const selectedHumanExperts = humanExperts
    .slice(0, Math.max(2, humanExperts.length))
    .map(e => ({
      type: 'human' as const,
      id: e.id,
      name: e.name,
      profile: e.bio || `${e.title}，${e.domains.join('、')}领域`,
    }));

  // 3. 构建评审队列 (串行顺序)
  // 顺序: 挑战者 → 真人专家1 → 拓展者 → 真人专家2 → 提炼者
  const reviewQueue: ReviewQueueItem[] = [
    aiExperts[0],                          // 挑战者先评审
    selectedHumanExperts[0],               // 真人专家1
    aiExperts[1],                          // 拓展者
    selectedHumanExperts[1] || selectedHumanExperts[0], // 真人专家2 (如不足则复用)
    aiExperts[2],                          // 提炼者最后
  ].filter(Boolean);

  console.log(`[SequentialReview] Review queue configured with ${reviewQueue.length} experts`);
  reviewQueue.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.name} (${e.type})`);
  });

  return {
    taskId,
    reviewQueue,
    totalRounds: reviewQueue.length,
  };
}

/**
 * 执行串行多轮评审
 */
export async function conductSequentialReview(
  taskId: string,
  initialDraft: Draft,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult,
  reviewConfig: ReviewConfig
): Promise<{
  reviews: ExpertReview[];
  finalDraft: Draft;
  reviewChain: ReviewChainItem[];
}> {
  console.log(`[SequentialReview] Starting sequential review for task ${taskId}`);

  const reviews: ExpertReview[] = [];
  let currentDraft = initialDraft;
  const reviewChain: ReviewChainItem[] = [];

  // 串行执行每一轮评审
  for (let round = 0; round < reviewConfig.reviewQueue.length; round++) {
    const expertConfig = reviewConfig.reviewQueue[round];

    console.log(`[SequentialReview] Round ${round + 1}/${reviewConfig.totalRounds}: ${expertConfig.name}`);

    try {
      // 1. 创建评审记录
      const review = await createExpertReview({
        taskId,
        draftId: currentDraft.id,
        round: round + 1,
        expertType: expertConfig.type,
        expertRole: expertConfig.role,
        expertId: expertConfig.id,
        expertName: expertConfig.name,
        expertProfile: expertConfig.profile,
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
        // 真人专家: 创建评审任务等待反馈
        reviewResult = await conductHumanExpertReview(
          currentDraft,
          expertConfig,
          factCheck,
          logicCheck,
          review.id
        );
      }

      // 3. 更新评审记录
      await updateExpertReview(review.id, {
        questions: reviewResult.questions,
        overallScore: reviewResult.score,
        summary: reviewResult.summary,
        status: 'completed',
        completedAt: new Date(),
      });

      review.questions = reviewResult.questions;
      review.overallScore = reviewResult.score;
      review.summary = reviewResult.summary;
      review.status = 'completed';
      reviews.push(review);

      // 4. LLM基于评审意见生成新版本Draft
      console.log(`[SequentialReview] Generating revised draft based on ${expertConfig.name}'s feedback`);
      const newDraft = await generateRevisedDraft(
        currentDraft,
        reviewResult,
        expertConfig,
        factCheck,
        logicCheck
      );

      // 5. 更新评审链
      reviewChain.push({
        round: round + 1,
        expertId: expertConfig.id || expertConfig.role || 'unknown',
        expertName: expertConfig.name,
        inputDraftId: currentDraft.id,
        outputDraftId: newDraft.id,
        reviewId: review.id,
        score: reviewResult.score,
        status: 'completed',
      });

      // 6. 新版本作为下一轮输入
      currentDraft = newDraft;

      console.log(`[SequentialReview] Round ${round + 1} completed. New draft: ${newDraft.id}`);
    } catch (error) {
      console.error(`[SequentialReview] Round ${round + 1} failed:`, error);
      // 继续下一轮，使用当前draft
    }
  }

  // 更新最终稿状态
  await updateDraftStatus(currentDraft.id, 'review_completed');

  console.log(`[SequentialReview] Sequential review completed. Final draft: ${currentDraft.id}`);

  return {
    reviews,
    finalDraft: currentDraft,
    reviewChain,
  };
}

/**
 * AI专家评审
 */
async function conductAIExpertReview(
  draft: Draft,
  expertConfig: ReviewQueueItem,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult
): Promise<ReviewResult> {
  const roleConfig = AI_EXPERT_ROLES.find(r => r.role === expertConfig.role);
  if (!roleConfig) {
    throw new Error(`Unknown AI expert role: ${expertConfig.role}`);
  }

  const prompt = roleConfig.promptTemplate(draft, factCheck, logicCheck);

  const llmRouter = getLLMRouter();
  const response = await llmRouter.generate(prompt, 'analysis', {
    maxTokens: 2000,
  });

  return parseReviewResponse(response.content);
}

/**
 * 真人专家评审
 */
async function conductHumanExpertReview(
  draft: Draft,
  expertConfig: ReviewQueueItem,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult,
  reviewId: string
): Promise<ReviewResult> {
  // 1. 创建专家评审任务
  const taskResult = await query(
    `INSERT INTO expert_review_tasks (
      expert_id, task_id, review_id, draft_id, status,
      draft_content, fact_check_summary, logic_check_summary, deadline, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '24 hours', NOW())
    RETURNING id`,
    [
      expertConfig.id,
      draft.taskId,
      reviewId,
      draft.id,
      'pending',
      draft.content,
      JSON.stringify(factCheck),
      JSON.stringify(logicCheck),
    ]
  );

  const taskId = taskResult.rows[0].id;

  // 2. 这里应该发送通知给专家，然后等待反馈
  // 为简化实现，我们先使用AI代理评审
  console.log(`[SequentialReview] Human expert ${expertConfig.name} task created: ${taskId}`);
  console.log(`[SequentialReview] Using AI proxy for human expert review (should be replaced with real notification)`);

  // TODO: 实现真实的通知和等待机制
  // 目前使用AI代理
  const aiProxyResult = await conductAIExpertReview(
    draft,
    { ...expertConfig, role: 'challenger', type: 'ai' },
    factCheck,
    logicCheck
  );

  // 标记为AI代理完成
  await query(
    `UPDATE expert_review_tasks SET status = $1, completed_at = NOW() WHERE id = $2`,
    ['completed_proxy', taskId]
  );

  return aiProxyResult;
}

/**
 * 基于评审意见生成修订稿
 */
async function generateRevisedDraft(
  currentDraft: Draft,
  reviewResult: ReviewResult,
  expertConfig: ReviewQueueItem,
  factCheck: FactCheckResult,
  logicCheck: LogicCheckResult
): Promise<Draft> {
  const prompt = `
你是一位专业的文稿修订专家。请根据当前专家评审意见，对文稿进行修订。

## 当前文稿版本

${currentDraft.content}

## 本轮专家评审意见

评审专家：${expertConfig.name} (${expertConfig.type === 'ai' ? 'AI专家' : '领域专家'})
综合评分：${reviewResult.score}/100
总体评价：${reviewResult.summary}

具体问题与建议：
${reviewResult.questions.map((q, i) => `
${i + 1}. [${q.severity}] ${q.question}
   ${q.suggestion ? `建议：${q.suggestion}` : ''}
`).join('\n')}

## 事实核查参考

${factCheck.claims.filter(c => c.status !== 'verified').map(c => `- ${c.claim}: ${c.status}`).join('\n') || '无重大问题'}

## 修订要求

1. 针对专家提出的每个问题进行修改
2. 优先处理 high 和 medium 级别的问题
3. 保持文稿整体结构、风格和专业性
4. 确保修订后的内容流畅自然
5. 生成完整的修订后文稿（Markdown格式）

请输出完整的修订后文稿：
`;

  const llmRouter = getLLMRouter();
  const response = await llmRouter.generate(prompt, 'writing', {
    maxTokens: 8000,
  });

  // 验证修订稿质量
  const revisedContent = (response.content || '').trim();

  if (!revisedContent || revisedContent.length < 100) {
    console.warn(`[Review] Revised draft empty/too short (${revisedContent.length} chars), keeping original`);
    return currentDraft;
  }

  const originalLen = currentDraft.content.length;
  const revisedLen = revisedContent.length;

  // 字数变化不超过 ±50%
  if (revisedLen < originalLen * 0.5 || revisedLen > originalLen * 2.0) {
    console.warn(`[Review] Revised draft length anomaly: ${revisedLen} vs original ${originalLen}, keeping original`);
    return currentDraft;
  }

  // Markdown 结构完整性检查
  const originalHasHeadings = /^#{1,6}\s/m.test(currentDraft.content);
  const revisedHasHeadings = /^#{1,6}\s/m.test(revisedContent);
  if (originalHasHeadings && !revisedHasHeadings) {
    console.warn(`[Review] Revised draft lost all headings, keeping original`);
    return currentDraft;
  }

  // 创建新版本Draft
  const newDraftResult = await query(
    `INSERT INTO draft_versions (
      task_id, version, status, content, word_count, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id, version`,
    [
      currentDraft.taskId,
      currentDraft.version + 1,
      'reviewing',
      revisedContent,
      revisedContent.length,
    ]
  );

  return {
    id: newDraftResult.rows[0].id,
    taskId: currentDraft.taskId,
    version: newDraftResult.rows[0].version,
    content: revisedContent,
    status: 'reviewing',
  };
}

/**
 * 创建专家评审记录
 */
async function createExpertReview(params: {
  taskId: string;
  draftId: string;
  round: number;
  expertType: 'ai' | 'human';
  expertRole?: string;
  expertId?: string;
  expertName: string;
  expertProfile?: string;
  inputDraftId: string;
}): Promise<ExpertReview> {
  const result = await query(
    `INSERT INTO expert_reviews (
      task_id, draft_id, round, expert_type, expert_role, expert_id,
      expert_name, expert_profile, status, input_draft_id, questions, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING id`,
    [
      params.taskId,
      params.draftId,
      params.round,
      params.expertType,
      params.expertRole,
      params.expertId,
      params.expertName,
      params.expertProfile,
      'in_progress',
      params.inputDraftId,
      JSON.stringify([]),
    ]
  );

  return {
    id: result.rows[0].id,
    taskId: params.taskId,
    draftId: params.draftId,
    round: params.round,
    expertType: params.expertType,
    expertRole: params.expertRole,
    expertId: params.expertId,
    expertName: params.expertName,
    expertProfile: params.expertProfile,
    status: 'in_progress',
    questions: [],
    overallScore: 0,
    summary: '',
    inputDraftId: params.inputDraftId,
    createdAt: new Date(),
  };
}

/**
 * 更新专家评审记录
 */
async function updateExpertReview(
  reviewId: string,
  updates: Partial<ExpertReview>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.questions !== undefined) {
    fields.push(`questions = $${values.length + 1}`);
    values.push(JSON.stringify(updates.questions));
  }
  if (updates.overallScore !== undefined) {
    fields.push(`overall_score = $${values.length + 1}`);
    values.push(updates.overallScore);
  }
  if (updates.summary !== undefined) {
    fields.push(`summary = $${values.length + 1}`);
    values.push(updates.summary);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${values.length + 1}`);
    values.push(updates.status);
  }
  if (updates.outputDraftId !== undefined) {
    fields.push(`output_draft_id = $${values.length + 1}`);
    values.push(updates.outputDraftId);
  }
  if (updates.completedAt !== undefined) {
    fields.push(`completed_at = $${values.length + 1}`);
    values.push(updates.completedAt);
  }

  if (fields.length === 0) return;

  values.push(reviewId);

  await query(
    `UPDATE expert_reviews SET ${fields.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

/**
 * 更新Draft状态
 */
async function updateDraftStatus(draftId: string, status: string): Promise<void> {
  await query(
    `UPDATE draft_versions SET status = $1 WHERE id = $2`,
    [status, draftId]
  );
}

/**
 * 解析LLM评审响应
 */
function parseReviewResponse(content: string): ReviewResult {
  try {
    // 尝试解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        score: data.score || 70,
        summary: data.summary || '评审完成',
        questions: (data.questions || []).map((q: any, i: number) => ({
          id: `q_${i}`,
          question: q.question || q.title || '未说明',
          severity: q.severity || 'medium',
          suggestion: q.suggestion || q.suggest || '',
          location: q.location,
          category: q.category,
        })),
      };
    }
  } catch (e) {
    console.error('[SequentialReview] Failed to parse review response:', e);
  }

  // 默认返回
  return {
    score: 70,
    summary: '评审完成（解析失败，使用默认值）',
    questions: [],
  };
}

// Prompt模板函数
function generateChallengerPrompt(draft: Draft, factCheck: FactCheckResult, logicCheck: LogicCheckResult): string {
  return `
你是一位严苛的批判者(Challenger)，负责找出文稿中的逻辑漏洞和问题。

文稿内容：
${draft.content}

事实核查结果：
${JSON.stringify(factCheck, null, 2)}

逻辑检查结果：
${JSON.stringify(logicCheck, null, 2)}

请从以下角度进行评审：
1. 逻辑漏洞：是否存在论证不严密的地方？
2. 论证跳跃：是否缺少必要的推理步骤？
3. 数据可靠性：引用的数据是否可信？
4. 隐含假设：是否有未明确说明的前提？

输出JSON格式：
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
}`;
}

function generateExpanderPrompt(draft: Draft, factCheck: FactCheckResult, logicCheck: LogicCheckResult): string {
  return `
你是一位拓展者(Expander)，负责提供补充视角和扩展内容。

文稿内容：
${draft.content}

请从以下角度进行评审：
1. 关联因素：是否遗漏了重要的相关因素？
2. 国际对比：是否可以考虑国际视角？
3. 交叉学科：是否可以引入其他学科视角？
4. 长尾效应：是否考虑了长期影响？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "question": "问题或建议",
      "severity": "high|medium|low|praise",
      "suggestion": "具体建议",
      "category": "关联因素|国际对比|交叉学科|长尾效应"
    }
  ]
}`;
}

function generateSynthesizerPrompt(draft: Draft, factCheck: FactCheckResult, logicCheck: LogicCheckResult): string {
  return `
你是一位提炼者(Synthesizer)，负责优化表达和结构。

文稿内容：
${draft.content}

请从以下角度进行评审：
1. 核心论点：核心观点是否清晰突出？
2. 结构优化：结构是否合理流畅？
3. 金句提炼：是否有值得提炼的金句？
4. 消除冗余：是否有可以删减的冗余内容？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "question": "问题或建议",
      "severity": "high|medium|low|praise",
      "suggestion": "具体建议",
      "category": "核心论点|结构优化|金句提炼|消除冗余"
    }
  ]
}`;
}

// ReviewChainItem类型
interface ReviewChainItem {
  round: number;
  expertId: string;
  expertName: string;
  inputDraftId: string;
  outputDraftId: string;
  reviewId: string;
  score: number;
  status: string;
}

// 导出函数
export {
  ReviewConfig,
  ReviewQueueItem,
  ExpertReview,
  ReviewResult,
  ReviewQuestion,
  ReviewChainItem,
};
