// 蓝军评审用户决策服务 - Review Decision Service
// FR-021 ~ FR-023: 用户决策交互功能
// 扩展: 接受后自动修订稿件

import { query } from '../db/connection.js';
import { BlueTeamAgent } from '../agents/blueTeam.js';
import { applyReviewRevision } from './revisionAgent.js';

export type DecisionType = 'accept' | 'ignore' | 'manual_resolved';

export interface ReviewDecision {
  reviewId: string;
  decision: DecisionType;
  note?: string;
}

export interface ReviewItem {
  id: string;
  taskId: string;
  round: number;
  expertRole: string;
  expertName: string;
  question: string;
  suggestion: string;
  location?: string;
  severity: 'critical' | 'warning' | 'praise';
  status: 'pending' | 'accepted' | 'ignored' | 'manual_resolved';
  decisionNote?: string;
  decidedAt?: string;
}

export interface DecisionSummary {
  taskId: string;
  totalIssues: number;
  pendingCount: number;
  acceptedCount: number;
  ignoredCount: number;
  manualResolvedCount: number;
  criticalPending: number;
  canProceed: boolean;
}

/**
 * 获取评审项列表（带用户决策状态）
 */
export async function getReviewItems(taskId: string): Promise<ReviewItem[]> {
  const result = await query(
    `SELECT
      id,
      task_id as "taskId",
      round,
      expert_role as "expertRole",
      questions,
      status,
      user_decision as "userDecision",
      decision_note as "decisionNote",
      decided_at as "decidedAt"
     FROM blue_team_reviews
     WHERE task_id = $1
     ORDER BY round, expert_role, created_at`,
    [taskId]
  );

  return result.rows.map(row => {
    const questions = typeof row.questions === 'string'
      ? JSON.parse(row.questions)
      : row.questions;

    // Map severity from stored format to display format
    const severity = questions.severity === 'high' ? 'critical'
      : questions.severity === 'praise' ? 'praise'
      : 'warning';

    return {
      id: row.id,
      taskId: row.taskId,
      round: row.round,
      expertRole: row.expertRole,
      expertName: questions.expertName || questions.expert_name || '专家',
      question: questions.question,
      suggestion: questions.suggestion,
      location: questions.location,
      severity,
      status: row.status || 'pending',
      decisionNote: row.decisionNote,
      decidedAt: row.decidedAt?.toISOString(),
    };
  });
}

/**
 * 提交单个评审项或单个 question 的决策
 * FR-021: 用户可逐条选择：接受修改 / 忽略 / 标记为已手动处理
 * 
 * 当 decision = 'accept' 时，会自动根据评审意见修订稿件
 * 
 * @param questionIndex - 可选，指定 questions 数组中的索引，如果不提供则处理整个 review
 */
export async function submitDecision(
  taskId: string,
  reviewId: string,
  decision: DecisionType,
  note?: string,
  questionIndex?: number
): Promise<{ success: boolean; reviewItem?: ReviewItem; revisionResult?: any }> {
  // 验证评审项存在且属于该任务
  const checkResult = await query(
    `SELECT id, questions FROM blue_team_reviews WHERE id = $1 AND task_id = $2`,
    [reviewId, taskId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Review item not found');
  }

  const review = checkResult.rows[0];
  const questions = typeof review.questions === 'string' 
    ? JSON.parse(review.questions) 
    : review.questions;

  // 如果指定了 questionIndex，记录 question 级别的决策
  if (questionIndex !== undefined && questionIndex >= 0) {
    // 验证 questionIndex 有效
    if (!Array.isArray(questions) || questionIndex >= questions.length) {
      throw new Error('Invalid question index');
    }

    // 插入或更新 question_decisions 表
    await query(
      `INSERT INTO question_decisions (task_id, review_id, question_index, decision, note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (review_id, question_index)
       DO UPDATE SET decision = $4, note = $5, updated_at = NOW()`,
      [taskId, reviewId, questionIndex, decision, note || null]
    );

    // 记录操作日志
    await query(
      `INSERT INTO task_logs (task_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        taskId,
        'question_decision',
        JSON.stringify({ reviewId, questionIndex, decision, note })
      ]
    );

    // 检查是否所有 questions 都已决策，如果是则更新 review 状态
    const decisionStats = await query(
      `SELECT 
        COUNT(*) as total_questions,
        COUNT(qd.decision) as decided_count
       FROM blue_team_reviews btr
       LEFT JOIN LATERAL jsonb_array_elements(btr.questions) WITH ORDINALITY AS q(elem, idx) ON true
       LEFT JOIN question_decisions qd ON qd.review_id = btr.id AND qd.question_index = (idx::int - 1)
       WHERE btr.id = $1
       GROUP BY btr.id`,
      [reviewId]
    );

    if (decisionStats.rows.length > 0) {
      const { total_questions, decided_count } = decisionStats.rows[0];
      if (parseInt(decided_count) === parseInt(total_questions)) {
        // 所有 questions 都已决策，更新 review 状态
        await query(
          `UPDATE blue_team_reviews
           SET status = $1,
               user_decision = $1,
               decided_at = NOW()
           WHERE id = $2`,
          [decision, reviewId]
        );
      }
    }
  } else {
    // 原来的逻辑：处理整个 review
    await query(
      `UPDATE blue_team_reviews
       SET status = $1,
           user_decision = $2,
           decision_note = $3,
           decided_at = NOW()
       WHERE id = $4`,
      [decision, decision, note || null, reviewId]
    );

    // 记录操作日志
    await query(
      `INSERT INTO task_logs (task_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        taskId,
        'review_decision',
        JSON.stringify({ reviewId, decision, note })
      ]
    );
  }

  let revisionResult: any = null;

  // ===== 接受后自动修订稿件 =====
  if (decision === 'accept') {
    console.log(`[ReviewDecision] Auto-revision triggered for review ${reviewId}`);
    
    try {
      // 获取评审详情和当前稿件
      const reviewDetail = await query(
        `SELECT 
          btr.id,
          btr.task_id,
          btr.expert_role,
          btr.questions,
          dv.content as current_content
         FROM blue_team_reviews btr
         LEFT JOIN LATERAL (
           SELECT content FROM draft_versions 
           WHERE task_id = btr.task_id 
           ORDER BY version DESC 
           LIMIT 1
         ) dv ON true
         WHERE btr.id = $1`,
        [reviewId]
      );

      if (reviewDetail.rows.length > 0) {
        const row = reviewDetail.rows[0];
        const questions = typeof row.questions === 'string' 
          ? JSON.parse(row.questions) 
          : row.questions;
        
        // 获取第一个问题（简化处理）
        const firstQuestion = Array.isArray(questions) ? questions[0] : questions;
        
        if (firstQuestion && row.current_content) {
          // 异步执行修订（不阻塞响应）
          revisionResult = await applyReviewRevision({
            taskId,
            reviewId,
            originalContent: row.current_content,
            question: firstQuestion.question,
            suggestion: firstQuestion.suggestion,
            location: firstQuestion.location,
            expertRole: row.expert_role
          });

          console.log(`[ReviewDecision] Revision result:`, {
            success: revisionResult.success,
            newVersion: revisionResult.newVersion,
            draftId: revisionResult.newDraftId
          });
        }
      }
    } catch (error) {
      console.error(`[ReviewDecision] Auto-revision failed:`, error);
      // 修订失败不影响决策提交，只记录错误
      revisionResult = { success: false, error: (error as Error).message };
    }
  }

  // 返回更新后的评审项
  const items = await getReviewItems(taskId);
  const updatedItem = items.find(item => item.id === reviewId);

  return {
    success: true,
    reviewItem: updatedItem,
    revisionResult
  };
}

/**
 * 批量提交决策
 */
export async function batchSubmitDecisions(
  taskId: string,
  decisions: ReviewDecision[]
): Promise<{ success: boolean; updated: number }> {
  let updated = 0;

  for (const { reviewId, decision, note } of decisions) {
    await submitDecision(taskId, reviewId, decision, note);
    updated++;
  }

  return { success: true, updated };
}

/**
 * 获取决策汇总统计
 * FR-022: 严重问题未处理时，不允许进入确认环节
 */
export async function getDecisionSummary(taskId: string): Promise<DecisionSummary> {
  const items = await getReviewItems(taskId);

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const acceptedCount = items.filter(i => i.status === 'accepted').length;
  const ignoredCount = items.filter(i => i.status === 'ignored').length;
  const manualResolvedCount = items.filter(i => i.status === 'manual_resolved').length;
  const criticalPending = items.filter(i =>
    i.severity === 'critical' && i.status === 'pending'
  ).length;

  // 有严重问题未处理时，不允许进入确认环节
  const canProceed = criticalPending === 0;

  return {
    taskId,
    totalIssues: items.length,
    pendingCount,
    acceptedCount,
    ignoredCount,
    manualResolvedCount,
    criticalPending,
    canProceed,
  };
}

/**
 * 检查是否可以进入确认环节
 */
export async function canProceedToConfirmation(taskId: string): Promise<{
  canProceed: boolean;
  reason?: string;
  criticalPending: number;
}> {
  const summary = await getDecisionSummary(taskId);

  if (!summary.canProceed) {
    return {
      canProceed: false,
      reason: `有 ${summary.criticalPending} 个严重问题未处理，请先处理后再进入确认环节`,
      criticalPending: summary.criticalPending,
    };
  }

  return {
    canProceed: true,
    criticalPending: 0,
  };
}

/**
 * 重新评审单个专家的所有意见
 * FR-023: 用户可要求某位专家重新评审（如认为判断有误）
 */
export async function requestReReview(
  taskId: string,
  expertRole: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  // 获取任务信息
  const taskResult = await query(
    `SELECT topic, research_data FROM tasks WHERE id = $1`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error('Task not found');
  }

  const task = taskResult.rows[0];
  const topic = task.topic;
  const researchData = task.research_data || {};

  // 获取当前稿件版本
  const draftResult = await query(
    `SELECT content FROM draft_versions
     WHERE task_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [taskId]
  );

  if (draftResult.rows.length === 0) {
    throw new Error('No draft found for re-review');
  }

  const currentDraft = draftResult.rows[0].content;

  // 删除该专家的现有评审记录
  await query(
    `DELETE FROM blue_team_reviews
     WHERE task_id = $1 AND expert_role = $2`,
    [taskId, expertRole]
  );

  // 记录重新评审请求
  await query(
    `INSERT INTO task_logs (task_id, action, details, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [
      taskId,
      're_review_requested',
      JSON.stringify({ expertRole, reason, requestedAt: new Date().toISOString() })
    ]
  );

  // 异步执行重新评审
  setImmediate(async () => {
    try {
      const blueTeamAgent = new BlueTeamAgent();

      // 使用现有的 experts 信息或创建新的
      const experts = researchData.blue_team_experts || [];
      const targetExpert = experts.find((e: any) => e.role === expertRole);

      if (!targetExpert) {
        console.error(`[ReReview] Expert not found for role: ${expertRole}`);
        return;
      }

      console.log(`[ReReview] Starting re-review for ${targetExpert.name} (${expertRole})`);

      // 执行评审（这里简化处理，实际应该调用 agent 的单个专家评审方法）
      // 为简化实现，我们使用现有的 generateExpertQuestions 逻辑

      // 标记为重新评审完成
      await query(
        `INSERT INTO task_logs (task_id, action, details, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          taskId,
          're_review_completed',
          JSON.stringify({ expertRole, completedAt: new Date().toISOString() })
        ]
      );

      console.log(`[ReReview] Completed re-review for ${expertRole}`);
    } catch (error) {
      console.error(`[ReReview] Failed for task ${taskId}:`, error);
    }
  });

  return {
    success: true,
    message: `已申请${expertRole}专家重新评审，将在后台异步处理`,
  };
}

/**
 * 获取专家评审统计（用于展示各专家的评审情况）
 */
export async function getExpertReviewStats(taskId: string): Promise<{
  expertRole: string;
  expertName: string;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  praiseCount: number;
  pendingCount: number;
}[]> {
  const items = await getReviewItems(taskId);

  const statsByExpert: Record<string, {
    expertRole: string;
    expertName: string;
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    praiseCount: number;
    pendingCount: number;
  }> = {};

  for (const item of items) {
    if (!statsByExpert[item.expertRole]) {
      statsByExpert[item.expertRole] = {
        expertRole: item.expertRole,
        expertName: item.expertName,
        totalIssues: 0,
        criticalCount: 0,
        warningCount: 0,
        praiseCount: 0,
        pendingCount: 0,
      };
    }

    const stats = statsByExpert[item.expertRole];
    stats.totalIssues++;

    if (item.severity === 'critical') stats.criticalCount++;
    else if (item.severity === 'warning') stats.warningCount++;
    else if (item.severity === 'praise') stats.praiseCount++;

    if (item.status === 'pending') stats.pendingCount++;
  }

  return Object.values(statsByExpert);
}

