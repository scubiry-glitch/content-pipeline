// asyncFinalize.ts - 异步 Finalize 服务
// 支持批量勾选、异步执行、进行中状态

import { query } from '../db/connection.js';
import { generateFinalDraft } from './draftGenerator.js';

export interface AsyncFinalizeRequest {
  taskId: string;
  selectedReviewIds?: string[]; // 批量勾选的评审意见ID，如果不传则处理所有已接受的
  force?: boolean; // 强制模式：忽略未处理的严重问题
}

export interface AsyncFinalizeStatus {
  taskId: string;
  status: 'pending' | 'doing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  finalDraftId?: string;
  outputPath?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// 内存中的执行状态（生产环境应该用 Redis 或数据库）
const finalizeJobs = new Map<string, AsyncFinalizeStatus>();

/**
 * 启动异步 Finalize 任务
 */
export async function startAsyncFinalize(
  taskId: string,
  selectedReviewIds?: string[],
  force?: boolean
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  console.log(`[AsyncFinalize] Starting finalize for task ${taskId}`, { selectedReviewIds, force });
  console.log(`[AsyncFinalize] Starting finalize for task ${taskId}`, { selectedReviewIds });

  try {
    // 1. 检查是否已有进行中的任务
    const existingJob = finalizeJobs.get(taskId);
    if (existingJob?.status === 'doing') {
      return { success: false, error: '已有进行中的 Finalize 任务' };
    }

    // 2. 更新任务状态为 finalizing（进行中）
    await query(
      `UPDATE tasks SET status = 'finalizing', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    // 3. 创建任务状态记录
    const jobStatus: AsyncFinalizeStatus = {
      taskId,
      status: 'doing',
      progress: 0,
      message: '开始生成最终稿件...',
      startedAt: new Date().toISOString(),
    };
    finalizeJobs.set(taskId, jobStatus);

    // 4. 异步执行 Finalize（不阻塞响应）
    process.nextTick(() => {
      executeFinalize(taskId, selectedReviewIds, force).catch(err => {
        console.error(`[AsyncFinalize] Error:`, err);
        finalizeJobs.set(taskId, {
          ...jobStatus,
          status: 'failed',
          message: '执行失败',
          error: err.message,
          completedAt: new Date().toISOString(),
        });
      });
    });

    return { success: true, jobId: taskId };
  } catch (error) {
    console.error(`[AsyncFinalize] Error starting:`, error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * 执行 Finalize（后台异步）
 */
async function executeFinalize(taskId: string, selectedReviewIds?: string[], force?: boolean): Promise<void> {
  const job = finalizeJobs.get(taskId);
  if (!job) return;

  try {
    // 1. 检查严重问题（非强制模式下）
    job.progress = 10;
    job.message = force ? '强制模式：跳过严重问题检查...' : '检查未处理的严重问题...';
    
    if (!force) {
      // 检查未处理的严重问题（支持 questions 为 object 或 array 格式）
      let criticalCheckQuery = `
        SELECT COUNT(*) as count 
        FROM blue_team_reviews 
        WHERE task_id = $1 
        AND user_decision IS NULL
        AND (
          -- 如果是数组格式
          (jsonb_typeof(questions) = 'array' AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(questions) as q
            WHERE q->>'severity' = 'high' OR q->>'severity' = 'critical'
          ))
          OR
          -- 如果是 object 格式（单个问题）
          (jsonb_typeof(questions) = 'object' AND (
            questions->>'severity' = 'high' OR questions->>'severity' = 'critical'
          ))
        )
      `;
      
      // 如果只处理选中的评审意见，只检查这些
      if (selectedReviewIds && selectedReviewIds.length > 0) {
        criticalCheckQuery += ` AND id = ANY($2)`;
      }
      
      const criticalCheck = await query(criticalCheckQuery, 
        selectedReviewIds && selectedReviewIds.length > 0 
          ? [taskId, selectedReviewIds]
          : [taskId]
      );

      const criticalPending = parseInt(criticalCheck.rows[0].count);
      if (criticalPending > 0) {
        throw new Error(`还有 ${criticalPending} 个严重问题未处理`);
      }
    } else {
      console.log(`[AsyncFinalize] Force mode: skipping critical check for task ${taskId}`);
    }

    // 2. 获取任务信息和最新稿件
    job.progress = 30;
    job.message = '获取任务信息和最新稿件...';

    const taskResult = await query(
      `SELECT t.*, dv.id as latest_draft_id, dv.content as latest_content, dv.status as draft_status
       FROM tasks t
       LEFT JOIN LATERAL (
         SELECT id, content, status
         FROM draft_versions
         WHERE task_id = t.id
         ORDER BY version DESC
         LIMIT 1
       ) dv ON true
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('Task not found');
    }

    // 3. 生成最终稿件
    // 如果最新版本已经是 revised 状态（经过批量改稿），使用轻量润色模式
    const latestDraftStatus = taskResult.rows[0].draft_status;
    const finalizeMode = latestDraftStatus === 'revised' ? 'polish' : 'full';

    job.progress = 50;
    job.message = finalizeMode === 'polish'
      ? '基于已修订稿件进行最终润色...'
      : '使用 LLM 生成最终稿件（这可能需要几分钟）...';

    const finalDraftResult = await generateFinalDraft(taskId, selectedReviewIds, force, finalizeMode);

    if (!finalDraftResult.success) {
      throw new Error(`生成最终稿件失败: ${finalDraftResult.error}`);
    }

    // 4. 更新任务状态为 completed
    job.progress = 90;
    job.message = '保存最终稿件并更新任务状态...';
    
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
          selectedReviewIds: selectedReviewIds || 'all',
          async: true,
        })
      ]
    );

    // 6. 更新任务状态为完成
    finalizeJobs.set(taskId, {
      ...job,
      status: 'completed',
      progress: 100,
      message: 'Finalize 完成！',
      finalDraftId: finalDraftResult.draftId,
      outputPath: finalDraftResult.outputPath,
      completedAt: new Date().toISOString(),
    });

    console.log(`[AsyncFinalize] Task ${taskId} completed`);

  } catch (error) {
    console.error(`[AsyncFinalize] Error:`, error);
    
    // 更新任务状态为失败
    await query(
      `UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );
    
    finalizeJobs.set(taskId, {
      ...job,
      status: 'failed',
      message: '执行失败',
      error: (error as Error).message,
      completedAt: new Date().toISOString(),
    });
  }
}

/**
 * 获取 Finalize 状态
 */
export function getFinalizeStatus(taskId: string): AsyncFinalizeStatus | null {
  return finalizeJobs.get(taskId) || null;
}

/**
 * 查询任务是否处于 finalizing 状态
 */
export async function isTaskFinalizing(taskId: string): Promise<boolean> {
  const result = await query(
    `SELECT status FROM tasks WHERE id = $1`,
    [taskId]
  );
  return result.rows[0]?.status === 'finalizing';
}
