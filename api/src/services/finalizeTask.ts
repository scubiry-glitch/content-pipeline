// finalizeTask.ts - 任务最终确认服务
// 处理 Accept & Finalize 后的完整流程

import { query } from '../db/connection.js';
import { generateFinalDraft } from './draftGenerator.js';

export interface FinalizeResult {
  success: boolean;
  taskId: string;
  finalDraftId?: string;
  outputPath?: string;
  error?: string;
}

/**
 * 最终确认任务
 * 1. 更新任务状态: reviewing -> completed
 * 2. 生成最终稿件
 * 3. 创建输出记录
 */
export async function finalizeTask(taskId: string): Promise<FinalizeResult> {
  console.log(`[Finalize] Starting finalize for task ${taskId}`);

  try {
    // 1. 检查是否还有未处理的 critical 问题
    const criticalCheck = await query(
      `SELECT COUNT(*) as count 
       FROM blue_team_reviews 
       WHERE task_id = $1 
       AND user_decision IS NULL
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(questions) as q
         WHERE q->>'severity' = 'high' OR q->>'severity' = 'critical'
       )`,
      [taskId]
    );

    const criticalPending = parseInt(criticalCheck.rows[0].count);
    if (criticalPending > 0) {
      return {
        success: false,
        taskId,
        error: `还有 ${criticalPending} 个严重问题未处理，请先处理后再 finalize`
      };
    }

    // 2. 获取任务信息和最新稿件
    const taskResult = await query(
      `SELECT t.*, dv.id as latest_draft_id, dv.content as latest_content
       FROM tasks t
       LEFT JOIN LATERAL (
         SELECT id, content 
         FROM draft_versions 
         WHERE task_id = t.id 
         ORDER BY version DESC 
         LIMIT 1
       ) dv ON true
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return { success: false, taskId, error: 'Task not found' };
    }

    const task = taskResult.rows[0];

    // 3. 生成最终稿件（整合所有接受的修订）
    console.log(`[Finalize] Generating final draft for task ${taskId}`);
    const finalDraftResult = await generateFinalDraft(taskId);

    if (!finalDraftResult.success) {
      return {
        success: false,
        taskId,
        error: `生成最终稿件失败: ${finalDraftResult.error}`
      };
    }

    // 4. 更新任务状态为 completed
    await query(
      `UPDATE tasks 
       SET status = 'completed',
           final_draft = $1,
           output_ids = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        finalDraftResult.content,
        JSON.stringify([finalDraftResult.draftId]),
        taskId
      ]
    );

    // 5. 记录完成日志
    await query(
      `INSERT INTO task_logs (task_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        taskId,
        'task_finalized',
        JSON.stringify({
          finalDraftId: finalDraftResult.draftId,
          acceptedReviews: await getAcceptedReviewCount(taskId),
          ignoredReviews: await getIgnoredReviewCount(taskId)
        })
      ]
    );

    console.log(`[Finalize] Task ${taskId} finalized successfully`);

    return {
      success: true,
      taskId,
      finalDraftId: finalDraftResult.draftId,
      outputPath: finalDraftResult.outputPath
    };

  } catch (error) {
    console.error(`[Finalize] Error finalizing task ${taskId}:`, error);
    return {
      success: false,
      taskId,
      error: (error as Error).message
    };
  }
}

/**
 * 获取已接受的评审数量
 */
async function getAcceptedReviewCount(taskId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM blue_team_reviews 
     WHERE task_id = $1 AND user_decision = 'accept'`,
    [taskId]
  );
  return parseInt(result.rows[0].count);
}

/**
 * 获取已忽略的评审数量
 */
async function getIgnoredReviewCount(taskId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM blue_team_reviews 
     WHERE task_id = $1 AND user_decision = 'ignore'`,
    [taskId]
  );
  return parseInt(result.rows[0].count);
}
