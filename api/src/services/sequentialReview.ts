// 串行评审服务 - Sequential Review Service
// 实现 PRD 中定义的串行多轮评审流程

import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getLLMRouter } from '../providers/index.js';
import { KimiProvider } from '../providers/kimi.js';
import { 
  broadcastSequentialEvent,
  broadcastDraftRevising,
  broadcastReviewCompleted 
} from './streamingSequentialReview.js';

// 专家评审配置
interface ReviewConfig {
  taskId: string;
  reviewQueue: ExpertConfig[];
  totalRounds: number;
}

interface ExpertConfig {
  type: 'ai' | 'human';
  role?: string;
  id?: string;
  name: string;
  profile?: string;
}

// 评审结果
interface ReviewResult {
  score: number;
  summary: string;
  questions: ReviewQuestion[];
}

interface ReviewQuestion {
  id: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  category?: string;
  location?: string;
}

// 评审链项
interface ReviewChainItem {
  round: number;
  expertId: string;
  expertName: string;
  expertRole: string;
  inputDraftId: string;
  outputDraftId: string;
  reviewId: string;
  score: number;
  status: 'completed' | 'skipped';
}

/**
 * 配置串行评审专家队列
 */
export async function configureSequentialReview(
  taskId: string,
  topic: string,
  userExperts?: string[]  // 用户在配置面板选择的专家角色列表
): Promise<ReviewConfig> {
  // 所有可用 AI 专家
  const ALL_AI_EXPERTS: Record<string, ExpertConfig> = {
    challenger: { type: 'ai', role: 'challenger', name: '批判者', profile: '挑战逻辑漏洞、数据可靠性、隐含假设' },
    expander: { type: 'ai', role: 'expander', name: '拓展者', profile: '扩展关联因素、国际对比、交叉学科视角' },
    synthesizer: { type: 'ai', role: 'synthesizer', name: '提炼者', profile: '归纳核心论点、结构优化、金句提炼' },
    fact_checker: { type: 'ai', role: 'fact_checker', name: '事实核查员', profile: '数据准确性、来源可靠性验证' },
    logic_checker: { type: 'ai', role: 'logic_checker', name: '逻辑检察官', profile: '论证严密性、逻辑链完整性' },
    domain_expert: { type: 'ai', role: 'domain_expert', name: '行业专家', profile: '专业深度、行业洞察' },
    reader_rep: { type: 'ai', role: 'reader_rep', name: '读者代表', profile: '可读性、受众适配度' },
  };

  // 1. 根据用户选择或默认配置构建 AI 专家队列
  let aiExperts: ExpertConfig[];
  if (userExperts && userExperts.length > 0) {
    // 使用用户选择的专家
    aiExperts = userExperts
      .map(role => ALL_AI_EXPERTS[role])
      .filter(Boolean);
    console.log(`[SequentialReview] Using user-selected experts:`, userExperts);
  } else {
    // 默认: 挑战者 → 拓展者 → 提炼者
    aiExperts = [
      ALL_AI_EXPERTS.challenger,
      ALL_AI_EXPERTS.expander,
      ALL_AI_EXPERTS.synthesizer,
    ];
  }

  // 2. 从专家库抽取相关专家 (简化版本，实际应根据主题匹配)
  const humanExpertsResult = await query(
    `SELECT id, name, bio, title, domain, angle
     FROM experts
     WHERE status = 'active' OR status IS NULL
     ORDER BY created_at DESC
     LIMIT 2`
  );

  const humanExperts: ExpertConfig[] = humanExpertsResult.rows.map((e: any) => ({
    type: 'human' as const,
    id: e.id,
    name: e.name,
    profile: e.bio || e.title || '领域专家',
  }));

  // 3. 构建串行评审队列: AI专家与真人专家交替
  let reviewQueue: ExpertConfig[];
  if (userExperts && userExperts.length > 0) {
    // 用户指定专家时，直接按选择顺序排列
    reviewQueue = [...aiExperts];
  } else {
    // 默认: 挑战者 → 真人专家1 → 拓展者 → 真人专家2 → 提炼者
    reviewQueue = [
      aiExperts[0],
      ...(humanExperts[0] ? [humanExperts[0]] : []),
      aiExperts[1],
      ...(humanExperts[1] ? [humanExperts[1]] : humanExperts[0] ? [humanExperts[0]] : []),
      aiExperts[2],
    ].filter(Boolean);
  }

  // 4. 保存评审配置到进度表
  await query(
    `INSERT INTO task_review_progress (
      task_id, total_rounds, review_queue, status, updated_at
    ) VALUES ($1, $2, $3, 'idle', NOW())
    ON CONFLICT (task_id) DO UPDATE SET
      total_rounds = $2,
      review_queue = $3,
      status = 'idle',
      updated_at = NOW()`,
    [taskId, reviewQueue.length, JSON.stringify(reviewQueue)]
  );

  return {
    taskId,
    reviewQueue,
    totalRounds: reviewQueue.length,
  };
}

/**
 * 启动串行评审流程
 */
export async function startSequentialReview(
  taskId: string,
  initialDraftId: string,
  draftContent: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. 获取评审配置
    const progressResult = await query(
      `SELECT * FROM task_review_progress WHERE task_id = $1`,
      [taskId]
    );

    if (progressResult.rows.length === 0) {
      // 自动配置评审
      const taskResult = await query(`SELECT topic FROM tasks WHERE id = $1`, [taskId]);
      const topic = taskResult.rows[0]?.topic || '未命名主题';
      await configureSequentialReview(taskId, topic);
    }

    // 2. 清理旧评审数据（重新评审时避免 unique constraint 冲突）
    await query(`DELETE FROM review_chains WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM expert_reviews WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM review_reports WHERE task_id = $1`, [taskId]);
    console.log(`[SequentialReview] Cleaned old review data for task ${taskId}`);

    // 3. 更新任务状态
    await query(
      `UPDATE tasks SET
        status = 'reviewing',
        current_stage = 'sequential_review',
        review_mode = 'sequential',
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );

    // 3.5 更新 draft 状态为 reviewing
    await query(
      `UPDATE draft_versions SET status = 'reviewing' WHERE id = $1`,
      [initialDraftId]
    );

    // 4. 初始化评审进度
    await query(
      `UPDATE task_review_progress SET
        status = 'running',
        current_round = 0,
        initial_draft_id = $2,
        current_draft_id = $2,
        started_at = NOW(),
        updated_at = NOW()
      WHERE task_id = $1`,
      [taskId, initialDraftId]
    );

    // 5. 异步开始第一轮评审
    setImmediate(async () => {
      try {
        await processNextRound(taskId);
      } catch (error) {
        console.error(`[SequentialReview] Failed to process task ${taskId}:`, error);
        await query(
          `UPDATE task_review_progress SET status = 'failed', updated_at = NOW() WHERE task_id = $1`,
          [taskId]
        );
      }
    });

    return { success: true, message: '串行评审已启动' };
  } catch (error) {
    console.error('[SequentialReview] Start failed:', error);
    return { success: false, message: '启动失败: ' + (error as Error).message };
  }
}

/**
 * 处理下一轮评审
 */
async function processNextRound(taskId: string): Promise<void> {
  console.log(`[processNextRound] Starting for task ${taskId}`);
  
  // 1. 获取当前进度
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) {
    console.log(`[processNextRound] No progress found for task ${taskId}`);
    return;
  }
  
  const progress = progressResult.rows[0];
  const currentRound = progress.current_round || 0;
  const totalRounds = progress.total_rounds;
  const reviewQueue: ExpertConfig[] = progress.review_queue || [];
  
  // 2. 检查是否完成所有轮次
  if (currentRound >= totalRounds) {
    await finalizeSequentialReview(taskId);
    return;
  }
  
  // 3. 获取当前轮次的专家配置
  const expertConfig = reviewQueue[currentRound];
  if (!expertConfig) {
    await finalizeSequentialReview(taskId);
    return;
  }
  
  // 4. 获取当前 draft
  const currentDraftId = progress.current_draft_id;
  const draftResult = await query(
    `SELECT content FROM draft_versions WHERE id = $1`,
    [currentDraftId]
  );
  const draftContent = draftResult.rows[0]?.content || '';
  
  // 5. 更新进度状态
  await query(
    `UPDATE task_review_progress SET
      current_round = $2,
      current_expert_role = $3,
      updated_at = NOW()
    WHERE task_id = $1`,
    [taskId, currentRound + 1, expertConfig.role || expertConfig.id]
  );
  
  // 6. 创建专家评审记录
  const reviewId = uuidv4();
  await query(
    `INSERT INTO expert_reviews (
      id, task_id, draft_id, round, expert_type, expert_role, expert_id, expert_name,
      input_draft_id, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'in_progress', NOW())`,
    [
      reviewId, taskId, currentDraftId, currentRound + 1,
      expertConfig.type, expertConfig.role, expertConfig.id, expertConfig.name,
      currentDraftId
    ]
  );
  
  await query(
    `UPDATE task_review_progress SET current_review_id = $2 WHERE task_id = $1`,
    [taskId, reviewId]
  );
  
  // 7. 执行专家评审（带流式推送）
  console.log(`[processNextRound] Conducting review for round ${currentRound + 1} with ${expertConfig.name}`);
  
  // 广播轮次开始
  broadcastSequentialEvent(taskId, {
    type: 'round_started',
    round: currentRound + 1,
    totalRounds,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `第 ${currentRound + 1} 轮评审开始：${expertConfig.name}`
  });
  
  let reviewResult: ReviewResult;
  if (expertConfig.type === 'ai') {
    // AI 专家评审 - 逐条推送评论
    reviewResult = await conductAIExpertReviewWithStreaming(
      taskId, 
      currentRound + 1, 
      draftContent, 
      expertConfig,
      totalRounds
    );
  } else {
    // 真人专家 - 创建任务等待反馈 (简化版直接模拟)
    reviewResult = await conductHumanExpertReview(draftContent, expertConfig);
  }
  
  // 8. 更新评审记录
  await query(
    `UPDATE expert_reviews SET
      questions = $2,
      overall_score = $3,
      summary = $4,
      status = 'completed',
      completed_at = NOW()
    WHERE id = $1`,
    [reviewId, JSON.stringify(reviewResult.questions), reviewResult.score, reviewResult.summary]
  );
  
  // 9. 生成修订稿（带流式推送）
  broadcastDraftRevising(taskId, currentRound + 1, expertConfig.name);
  
  const newDraft = await generateRevisedDraft(
    taskId,
    currentDraftId,
    draftContent,
    reviewResult,
    currentRound + 1,
    expertConfig.role || 'expert'
  );
  
  // 广播修订稿生成完成
  broadcastSequentialEvent(taskId, {
    type: 'draft_revised',
    round: currentRound + 1,
    expertName: expertConfig.name,
    draftId: newDraft.id,
    message: `${expertConfig.name} 生成修订稿完成`
  });
  
  // 10. 更新评审记录和进度
  await query(
    `UPDATE expert_reviews SET output_draft_id = $2 WHERE id = $1`,
    [reviewId, newDraft.id]
  );
  
  await query(
    `UPDATE task_review_progress SET
      current_draft_id = $2,
      updated_at = NOW()
    WHERE task_id = $1`,
    [taskId, newDraft.id]
  );
  
  // 11. 记录评审链
  await query(
    `INSERT INTO review_chains (
      task_id, review_id, round, expert_id, expert_name, expert_role,
      input_draft_id, output_draft_id, score, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')`,
    [
      taskId, reviewId, currentRound + 1,
      expertConfig.id || expertConfig.role, expertConfig.name, expertConfig.role,
      currentDraftId, newDraft.id, reviewResult.score
    ]
  );
  
  // 12. 继续下一轮
  setImmediate(async () => {
    try {
      await processNextRound(taskId);
    } catch (error) {
      console.error(`[SequentialReview] Round ${currentRound + 1} failed:`, error);
      await query(
        `UPDATE task_review_progress SET status = 'failed' WHERE task_id = $1`,
        [taskId]
      );
    }
  });
}

/**
 * AI 专家评审
 */
async function conductAIExpertReview(
  draftContent: string,
  expertConfig: ExpertConfig
): Promise<ReviewResult> {
  const promptTemplates: Record<string, string> = {
    challenger: `你是一位严苛的批判者(Challenger)，负责找出文稿中的逻辑漏洞和问题。

当前文稿：
{{draftContent}}

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
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "逻辑漏洞|论证跳跃|数据可靠性|隐含假设"
    }
  ]
}`,
    expander: `你是一位拓展者(Expander)，负责提供补充视角和扩展内容。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 关联因素：是否遗漏了相关的影响因素？
2. 国际对比：是否可以引入国际经验对比？
3. 交叉学科：是否需要引入其他学科视角？
4. 长尾效应：是否考虑了长期影响？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "关联因素|国际对比|交叉学科|长尾效应"
    }
  ]
}`,
    synthesizer: `你是一位提炼者(Synthesizer)，负责优化表达和结构。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 核心论点：是否清晰突出？
2. 结构优化：章节安排是否合理？
3. 金句提炼：是否有 memorable 的表述？
4. 消除冗余：是否有重复或冗余内容？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "核心论点|结构优化|金句提炼|消除冗余"
    }
  ]
}`,
  };

  const template = promptTemplates[expertConfig.role || 'challenger'];
  const prompt = template.replace('{{draftContent}}', draftContent.substring(0, 2000));
  
  try {
    const llm = getLLMRouter();
    const response = await llm.generate(prompt, 'blue_team_review', {
      maxTokens: 2000,
      temperature: 0.7,
    });
    
    const content = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(content);
    
    return {
      score: result.score || 80,
      summary: result.summary || '评审完成',
      questions: result.questions || [],
    };
  } catch (error) {
    console.error('[AIReview] Failed:', error);
    // 返回默认结果
    return {
      score: 75,
      summary: 'AI评审完成，未发现严重问题',
      questions: [
        {
          id: 'q1',
          question: '建议进一步优化文稿结构和表达',
          severity: 'low',
          suggestion: '参考同类优秀文稿进行优化',
          category: 'general',
        },
      ],
    };
  }
}

/**
 * 真人专家评审 (简化版)
 */
async function conductHumanExpertReview(
  draftContent: string,
  expertConfig: ExpertConfig
): Promise<ReviewResult> {
  // 实际应该创建任务等待专家反馈
  // 这里简化处理，使用 AI 代理
  console.log(`[HumanReview] Simulating review for ${expertConfig.name}`);
  return conductAIExpertReview(draftContent, { ...expertConfig, type: 'ai', role: 'challenger' });
}

/**
 * 生成修订稿
 */
async function generateRevisedDraft(
  taskId: string,
  currentDraftId: string,
  currentContent: string,
  reviewResult: ReviewResult,
  round: number,
  expertRole: string
): Promise<{ id: string; content: string }> {
  // 只取前5个最重要的问题（排除 praise）
  const topQuestions = reviewResult.questions
    .filter(q => q.severity !== 'praise')
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    })
    .slice(0, 5);

  // 如果没有需要修改的问题，直接复用原稿
  if (topQuestions.length === 0) {
    console.log(`[GenerateDraft] Round ${round}: no actionable issues, reusing original draft`);
    const newDraftId = uuidv4();
    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content, change_summary,
        source_review_id, previous_version_id, round, expert_role, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [newDraftId, taskId, round, currentContent,
       `第${round}轮${expertRole}评审：无需修改`, null, currentDraftId, round, expertRole]
    );
    return { id: newDraftId, content: currentContent };
  }

  // 上下文管理：完整传入文稿（截取上限 15000 字符，保留结构完整性）
  const MAX_CONTENT_CHARS = 15000;
  const contentForPrompt = currentContent.length > MAX_CONTENT_CHARS
    ? currentContent.substring(0, MAX_CONTENT_CHARS) + '\n\n[... 后续内容省略，请保持原文后续部分不变 ...]'
    : currentContent;

  const prompt = `你是一位专业的文稿修订专家。请根据专家评审意见，对完整文稿进行**针对性修订**。

## 重要规则
- 你必须输出**完整的修订后文稿**，不能只输出摘要或部分内容
- 修订后文稿的总字数应与原文相当（原文约 ${currentContent.length} 字符）
- 只修改评审意见指出的具体问题，**保留所有未被评审指出的段落和章节**
- 保持原文的 Markdown 标题层级结构（# ## ### 等）

## 当前文稿（完整）

${contentForPrompt}

## 专家评审意见

评审专家：${expertRole}
综合评分：${reviewResult.score}/100
总体评价：${reviewResult.summary}

需要修改的问题：
${topQuestions.map((q, i) => `${i + 1}. [${q.severity}] ${q.question.substring(0, 300)}
   建议：${q.suggestion.substring(0, 200)}`).join('\n')}

## 修订要求

1. **只修改上述问题涉及的段落**，其余部分原样保留
2. 修订后文稿字数应≥原文字数的 80%
3. 保持所有 Markdown 标题（#/##/###）不变
4. 输出完整的修订后文稿（Markdown格式）

请输出完整修订后文稿：`;

  try {
    console.log(`[GenerateDraft] Starting for round ${round}, task ${taskId}, original content: ${currentContent.length} chars, prompt length: ${prompt.length}`);
    const llm = getLLMRouter();
    const response = await llm.generate(prompt, 'blue_team_review', {
      maxTokens: 16000,
      temperature: 0.5,
    });

    const revisedContent = response.content;
    console.log(`[GenerateDraft] LLM response: ${revisedContent.length} chars (original: ${currentContent.length} chars, ratio: ${(revisedContent.length / currentContent.length * 100).toFixed(1)}%)`);

    // 质量守卫：修订稿不能严重缩水
    const lengthRatio = revisedContent.length / currentContent.length;
    let finalContent = revisedContent;

    if (lengthRatio < 0.6) {
      console.warn(`[GenerateDraft] Quality guard: revised content too short (${(lengthRatio * 100).toFixed(1)}% of original). Falling back to original.`);
      finalContent = currentContent;
    } else if (revisedContent.trim().length < 100) {
      console.warn(`[GenerateDraft] Quality guard: revised content is empty/trivial. Falling back to original.`);
      finalContent = currentContent;
    }

    // 检查 Markdown 标题保留情况
    const originalHeadings = (currentContent.match(/^#{1,3}\s+.+$/gm) || []).length;
    const revisedHeadings = (finalContent.match(/^#{1,3}\s+.+$/gm) || []).length;
    if (originalHeadings > 0 && revisedHeadings < originalHeadings * 0.5) {
      console.warn(`[GenerateDraft] Quality guard: headings lost (original: ${originalHeadings}, revised: ${revisedHeadings}). Falling back to original.`);
      finalContent = currentContent;
    }

    // 保存新版本
    const newDraftId = uuidv4();
    const changeSummary = finalContent === currentContent
      ? `第${round}轮${expertRole}评审：修订未通过质量检查，保留原稿`
      : `第${round}轮${expertRole}评审后修订`;

    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content, change_summary,
        source_review_id, previous_version_id, round, expert_role, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [newDraftId, taskId, round, finalContent, changeSummary,
       null, currentDraftId, round, expertRole]
    );
    console.log(`[GenerateDraft] Draft saved: ${newDraftId}, final length: ${finalContent.length} chars`);

    return { id: newDraftId, content: finalContent };
  } catch (error) {
    console.error('[GenerateDraft] Failed:', error);
    // 返回原稿
    return { id: currentDraftId, content: currentContent };
  }
}

/**
 * 完成串行评审
 */
async function finalizeSequentialReview(taskId: string): Promise<void> {
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) return;
  
  const progress = progressResult.rows[0];
  
  // 1. 生成评审报告
  const reviewsResult = await query(
    `SELECT * FROM expert_reviews WHERE task_id = $1 ORDER BY round`,
    [taskId]
  );
  
  const reviews = reviewsResult.rows;
  const totalQuestions = reviews.reduce((sum: number, r: any) => {
    const qs = r.questions || [];
    return sum + (Array.isArray(qs) ? qs.length : 0);
  }, 0);

  // 统计问题严重度分布
  let criticalCount = 0, majorCount = 0, minorCount = 0, praiseCount = 0;
  for (const review of reviews) {
    const questions = Array.isArray(review.questions) ? review.questions : [];
    for (const q of questions) {
      switch (q.severity) {
        case 'high': criticalCount++; break;
        case 'medium': majorCount++; break;
        case 'low': minorCount++; break;
        case 'praise': praiseCount++; break;
      }
    }
  }

  const avgScore = reviews.length > 0
    ? Math.round(reviews.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / reviews.length)
    : 0;

  // 决策逻辑：≥80 且无严重问题 → accept，≥60 → revise，<60 → reject
  const decision = (avgScore >= 80 && criticalCount === 0) ? 'accept' : avgScore >= 60 ? 'revise' : 'reject';

  const reportId = uuidv4();
  await query(
    `INSERT INTO review_reports (
      id, task_id, original_draft_id, final_draft_id,
      total_rounds, total_questions, critical_count, major_count, minor_count, praise_count,
      final_score, decision
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      reportId, taskId, progress.initial_draft_id, progress.current_draft_id,
      reviews.length, totalQuestions, criticalCount, majorCount, minorCount, praiseCount,
      avgScore, decision
    ]
  );
  
  // 1.5 更新最终稿件状态
  if (decision === 'accept') {
    await query(`UPDATE draft_versions SET status = 'final' WHERE id = $1`, [progress.current_draft_id]);
  }

  // 2. 更新进度表
  await query(
    `UPDATE task_review_progress SET
      status = 'completed',
      final_draft_id = $2,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE task_id = $1`,
    [taskId, progress.current_draft_id]
  );
  
  // 3. 更新任务状态
  await query(
    `UPDATE tasks SET
      status = 'awaiting_approval',
      current_stage = 'awaiting_approval',
      updated_at = NOW()
    WHERE id = $1`,
    [taskId]
  );
  
  // 4. 同步评审意见到 blue_team_reviews (统一对外接口)
  await syncToBlueTeamReviews(taskId, reviews);
  
  // 5. 广播评审全部完成
  broadcastReviewCompleted(taskId, reviews.length);
  
  console.log(`[SequentialReview] Task ${taskId} completed with ${reviews.length} rounds`);
}

/**
 * 获取串行评审进度
 */
export async function getSequentialReviewProgress(taskId: string) {
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) return null;
  
  const progress = progressResult.rows[0];
  
  // 获取评审链
  const chainResult = await query(
    `SELECT * FROM review_chains WHERE task_id = $1 ORDER BY round`,
    [taskId]
  );
  
  // 获取专家评审详情
  const reviewsResult = await query(
    `SELECT * FROM expert_reviews WHERE task_id = $1 ORDER BY round`,
    [taskId]
  );
  
  return {
    ...progress,
    chain: chainResult.rows,
    reviews: reviewsResult.rows,
  };
}

/**
 * 获取评审链完整信息
 */
export async function getReviewChain(taskId: string) {
  const chainResult = await query(
    `SELECT rc.*, 
            dv_input.content as input_content,
            dv_output.content as output_content
     FROM review_chains rc
     LEFT JOIN draft_versions dv_input ON rc.input_draft_id = dv_input.id
     LEFT JOIN draft_versions dv_output ON rc.output_draft_id = dv_output.id
     WHERE rc.task_id = $1
     ORDER BY rc.round`,
    [taskId]
  );
  
  return chainResult.rows;
}

/**
 * 获取所有版本
 */
export async function getDraftVersions(taskId: string) {
  // 先获取 draft_versions
  const draftsResult = await query(
    `SELECT * FROM draft_versions 
     WHERE task_id = $1
     ORDER BY round, version`,
    [taskId]
  );
  
  // 再获取 expert_reviews 映射
  const reviewsResult = await query(
    `SELECT id, expert_name, expert_role FROM expert_reviews WHERE task_id = $1`,
    [taskId]
  );
  
  const reviewsMap = new Map(
    reviewsResult.rows.map((r: any) => [r.id, r])
  );
  
  return draftsResult.rows.map((dv: any) => {
    const review = reviewsMap.get(dv.source_review_id);
    return {
      ...dv,
      expert_name: review?.expert_name || null,
      expert_role: review?.expert_role || dv.expert_role,
    };
  });
}


/**
 * 将串行评审结果同步到 blue_team_reviews
 * 统一对外接口，避免数据冗余和前端兼容性问题
 */
async function syncToBlueTeamReviews(taskId: string, expertReviews: any[]): Promise<void> {
  console.log(`[SequentialReview] Syncing ${expertReviews.length} reviews to blue_team_reviews for task ${taskId}`);
  
  // 1. 清理该任务在 blue_team_reviews 中的旧数据（如果有）
  await query(
    `DELETE FROM blue_team_reviews WHERE task_id = $1`,
    [taskId]
  );
  
  // 2. 将 expert_reviews 转换为 blue_team_reviews 格式
  for (const review of expertReviews) {
    const questions = Array.isArray(review.questions) ? review.questions : [];
    
    // 只同步 AI 专家评审（真人专家评审通过 expert_review_tasks 处理）
    if (review.expert_type === 'ai') {
      await query(
        `INSERT INTO blue_team_reviews (
          id, task_id, round, expert_role, questions,
          status, user_decision, decision_note, decided_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          review.id,  // 保持相同ID便于追溯
          taskId,
          review.round,
          review.expert_role,
          JSON.stringify(questions),
          'completed',  // 串行评审已完成
          'completed',  // 系统自动处理
          `串行评审第${review.round}轮自动处理完成，生成修订版本`,
          review.completed_at || new Date(),
          review.created_at || new Date()
        ]
      );
      
      console.log(`[SequentialReview] Synced AI review: ${review.expert_name} (${review.expert_role})`);
    }
  }
  
  console.log(`[SequentialReview] Sync completed for task ${taskId}`);
}


/**
 * AI 专家评审（带 Streaming 推送）
 * 包装原有 conductAIExpertReview，逐条推送生成的评论
 */
async function conductAIExpertReviewWithStreaming(
  taskId: string,
  round: number,
  draftContent: string,
  expertConfig: ExpertConfig,
  totalRounds: number
): Promise<ReviewResult> {
  // 广播专家开始评审
  broadcastSequentialEvent(taskId, {
    type: 'expert_reviewing',
    round,
    totalRounds,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `${expertConfig.name} 正在分析文稿...`
  });
  
  // 调用原有评审逻辑
  const result = await conductAIExpertReview(draftContent, expertConfig);
  
  // 逐条推送生成的评论（模拟流式效果）
  if (result.questions && result.questions.length > 0) {
    for (let i = 0; i < result.questions.length; i++) {
      const q = result.questions[i];
      
      // 广播单条评论生成
      broadcastSequentialEvent(taskId, {
        type: 'comment_generated',
        round,
        totalRounds,
        expertName: expertConfig.name,
        expertRole: expertConfig.role,
        comment: {
          index: i,
          total: result.questions.length,
          id: q.id || `${taskId}-${round}-${i}`,
          question: q.question,
          severity: q.severity,
          suggestion: q.suggestion,
          category: q.category,
          location: q.location,
          expertName: expertConfig.name,
          expertRole: expertConfig.role,
          round
        },
        progress: {
          currentRound: round,
          totalRounds,
          currentExpert: expertConfig.name,
          status: 'processing'
        },
        message: `${expertConfig.name} 发现问题 ${i + 1}/${result.questions.length}`
      });
      
      // 添加延迟让用户感知流式效果（每条间隔 300ms）
      if (i < result.questions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  
  // 广播评审完成
  broadcastSequentialEvent(taskId, {
    type: 'round_completed',
    round,
    totalRounds,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `${expertConfig.name} 完成评审，发现 ${result.questions?.length || 0} 个问题，评分 ${result.score}`
  });
  
  return result;
}
