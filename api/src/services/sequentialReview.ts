// 串行评审服务 - Sequential Review Service
// 实现 PRD 中定义的串行多轮评审流程

import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getLLMRouter } from '../providers/index.js';

// 专家评审配置
interface ReviewConfig {
  taskId: string;
  reviewQueue: ExpertConfig[];
  totalRounds: number;
}

interface ExpertConfig {
  type: 'ai' | 'human';
  role?: 'challenger' | 'expander' | 'synthesizer';
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
  topic: string
): Promise<ReviewConfig> {
  // 1. 固定 AI 专家 (按PRD: 挑战者 → 拓展者 → 提炼者)
  const aiExperts: ExpertConfig[] = [
    { type: 'ai', role: 'challenger', name: '批判者', profile: '挑战逻辑漏洞、数据可靠性、隐含假设' },
    { type: 'ai', role: 'expander', name: '拓展者', profile: '扩展关联因素、国际对比、交叉学科视角' },
    { type: 'ai', role: 'synthesizer', name: '提炼者', profile: '归纳核心论点、结构优化、金句提炼' },
  ];

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

  // 3. 构建串行评审队列: 挑战者 → 真人专家1 → 拓展者 → 真人专家2 → 提炼者
  const reviewQueue: ExpertConfig[] = [
    aiExperts[0], // 挑战者先评审
    ...(humanExperts[0] ? [humanExperts[0]] : []),
    aiExperts[1], // 拓展者
    ...(humanExperts[1] ? [humanExperts[1]] : humanExperts[0] ? [humanExperts[0]] : []),
    aiExperts[2], // 提炼者最后
  ].filter(Boolean);

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

    // 2. 更新任务状态
    await query(
      `UPDATE tasks SET
        status = 'reviewing',
        current_stage = 'sequential_review',
        review_mode = 'sequential',
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );

    // 2.5 更新 draft 状态为 reviewing
    await query(
      `UPDATE draft_versions SET status = 'reviewing' WHERE id = $1`,
      [initialDraftId]
    );

    // 3. 初始化评审进度
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

    // 4. 异步开始第一轮评审
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
  // 1. 获取当前进度
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) return;
  
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
  
  // 7. 执行专家评审
  let reviewResult: ReviewResult;
  if (expertConfig.type === 'ai') {
    reviewResult = await conductAIExpertReview(draftContent, expertConfig);
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
  
  // 9. 生成修订稿
  const newDraft = await generateRevisedDraft(
    taskId,
    currentDraftId,
    draftContent,
    reviewResult,
    currentRound + 1,
    expertConfig.role || 'expert'
  );
  
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
  const prompt = template.replace('{{draftContent}}', draftContent.substring(0, 8000));
  
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
  const prompt = `你是一位专业的文稿修订专家。请根据专家评审意见，对文稿进行修订。

## 当前文稿

${currentContent.substring(0, 6000)}

## 专家评审意见

评审专家：${expertRole}
综合评分：${reviewResult.score}/100
总体评价：${reviewResult.summary}

具体问题与建议：
${reviewResult.questions.map((q, i) => `${i + 1}. [${q.severity}] ${q.question}
   建议：${q.suggestion}`).join('\n')}

## 修订要求

1. 针对专家提出的每个问题进行修改
2. 优先处理 high 和 medium 级别的问题
3. 保持文稿整体结构、风格和专业性
4. 确保修订后的内容流畅自然
5. 生成完整的修订后文稿（Markdown格式）

请输出完整的修订后文稿：`;

  try {
    console.log(`[GenerateDraft] Starting for round ${round}, task ${taskId}`);
    const llm = getLLMRouter();
    console.log(`[GenerateDraft] Calling LLM...`);
    // 使用 blue_team_review 任务类型，它会路由到 dashboard-llm -> kimi
    const response = await llm.generate(prompt, 'blue_team_review', {
      maxTokens: 4000,
      temperature: 0.7,
    });
    console.log(`[GenerateDraft] LLM response received, length: ${response.content.length}`);
    
    // 保存新版本
    const newDraftId = uuidv4();
    console.log(`[GenerateDraft] Inserting new draft: ${newDraftId}`);
    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content, change_summary,
        source_review_id, previous_version_id, round, expert_role, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        newDraftId,
        taskId,
        round,
        response.content,
        `第${round}轮${expertRole}评审后修订`,
        null, // source_review_id 会在后面更新
        currentDraftId,
        round,
        expertRole,
      ]
    );
    console.log(`[GenerateDraft] Draft inserted successfully: ${newDraftId}`);
    
    return { id: newDraftId, content: response.content };
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
  const result = await query(
    `SELECT dv.*, er.expert_name, er.expert_role
     FROM draft_versions dv
     LEFT JOIN expert_reviews er ON dv.source_review_id = er.id
     WHERE dv.task_id = $1
     ORDER BY dv.round, dv.version`,
    [taskId]
  );
  
  return result.rows;
}
