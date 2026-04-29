// 任务归档服务 - Task Archive Service
// FR-034 ~ FR-035: 任务删除、隐藏、回收站机制

import { query } from '../db/connection.js';

export interface ArchiveTask {
  taskId: string;
  action: 'delete' | 'hide' | 'archive';
  reason?: string;
  deletedAt: Date;
  deletedBy?: string;
  willBePurgedAt?: Date;
}

export interface BatchOperationResult {
  success: string[];
  failed: { taskId: string; reason: string }[];
  totalProcessed: number;
}

/**
 * 软删除任务（放入回收站）
 */
export async function softDeleteTask(
  taskId: string,
  deletedBy?: string,
  reason?: string
): Promise<{ success: boolean; willBePurgedAt?: Date }> {
  // 检查任务是否存在且未被删除
  const taskResult = await query(
    `SELECT id, status FROM tasks WHERE id = $1 AND is_deleted = false`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error('Task not found or already deleted');
  }

  const task = taskResult.rows[0];

  // 已完成的任务需要先归档
  if (task.status === 'completed') {
    await archiveTaskData(taskId);
  }

  // 30天后自动清理
  const willBePurgedAt = new Date();
  willBePurgedAt.setDate(willBePurgedAt.getDate() + 30);

  // 软删除
  await query(
    `UPDATE tasks SET
      is_deleted = true,
      deleted_at = NOW(),
      deleted_by = $1,
      delete_reason = $2,
      will_be_purged_at = $3,
      updated_at = NOW()
    WHERE id = $4`,
    [deletedBy || 'system', reason || '', willBePurgedAt, taskId]
  );

  // 记录日志
  await query(
    `INSERT INTO task_logs (task_id, action, details, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [
      taskId,
      'soft_delete',
      JSON.stringify({ deletedBy, reason, willBePurgedAt }),
    ]
  );

  return { success: true, willBePurgedAt };
}

/**
 * 批量软删除任务
 */
export async function batchSoftDelete(
  taskIds: string[],
  deletedBy?: string,
  reason?: string
): Promise<BatchOperationResult> {
  const result: BatchOperationResult = {
    success: [],
    failed: [],
    totalProcessed: 0,
  };

  for (const taskId of taskIds) {
    try {
      await softDeleteTask(taskId, deletedBy, reason);
      result.success.push(taskId);
    } catch (error) {
      result.failed.push({
        taskId,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    result.totalProcessed++;
  }

  return result;
}

/**
 * 隐藏/取消隐藏任务
 */
export async function toggleTaskVisibility(
  taskId: string,
  isHidden: boolean,
  hiddenBy?: string
): Promise<{ success: boolean; isHidden: boolean }> {
  const taskResult = await query(
    `SELECT id, is_hidden FROM tasks WHERE id = $1 AND is_deleted = false`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error('Task not found or deleted');
  }

  if (isHidden) {
    await query(
      `UPDATE tasks SET
        is_hidden = true,
        hidden_at = NOW(),
        hidden_by = $1,
        updated_at = NOW()
      WHERE id = $2`,
      [hiddenBy || 'user', taskId]
    );
  } else {
    await query(
      `UPDATE tasks SET
        is_hidden = false,
        hidden_at = NULL,
        hidden_by = NULL,
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );
  }

  // 记录日志
  await query(
    `INSERT INTO task_logs (task_id, action, details, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [
      taskId,
      isHidden ? 'hide' : 'unhide',
      JSON.stringify({ hiddenBy }),
    ]
  );

  return { success: true, isHidden };
}

/**
 * 批量隐藏/取消隐藏
 */
export async function batchToggleVisibility(
  taskIds: string[],
  isHidden: boolean,
  hiddenBy?: string
): Promise<BatchOperationResult> {
  const result: BatchOperationResult = {
    success: [],
    failed: [],
    totalProcessed: 0,
  };

  for (const taskId of taskIds) {
    try {
      await toggleTaskVisibility(taskId, isHidden, hiddenBy);
      result.success.push(taskId);
    } catch (error) {
      result.failed.push({
        taskId,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    result.totalProcessed++;
  }

  return result;
}

/**
 * 从回收站恢复任务
 */
export async function restoreTask(
  taskId: string,
  restoredBy?: string
): Promise<{ success: boolean }> {
  const taskResult = await query(
    `SELECT id FROM tasks WHERE id = $1 AND is_deleted = true`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error('Task not found in recycle bin');
  }

  await query(
    `UPDATE tasks SET
      is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL,
      delete_reason = NULL,
      will_be_purged_at = NULL,
      updated_at = NOW()
    WHERE id = $1`,
    [taskId]
  );

  // 记录日志
  await query(
    `INSERT INTO task_logs (task_id, action, details, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [
      taskId,
      'restore',
      JSON.stringify({ restoredBy }),
    ]
  );

  return { success: true };
}

/**
 * 永久删除任务（物理删除）
 */
export async function permanentlyDeleteTask(
  taskId: string,
  deletedBy?: string
): Promise<{ success: boolean }> {
  // 只删除已软删除的任务
  const taskResult = await query(
    `SELECT id FROM tasks WHERE id = $1 AND is_deleted = true`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error('Task not found in recycle bin');
  }

  // 先归档数据（备份）
  await archiveTaskData(taskId);

  // 删除关联数据
  await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM draft_edits WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM research_annotations WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM task_logs WHERE task_id = $1`, [taskId]);

  // 删除任务
  await query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

  return { success: true };
}

/**
 * 获取回收站任务列表
 */
export async function getRecycleBinTasks(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  workspaceId?: string;
}): Promise<{
  tasks: any[];
  total: number;
}> {
  const { limit = 20, offset = 0, userId, workspaceId } = options;

  let sql = `
    SELECT
      id, topic, status, progress,
      deleted_at, deleted_by, delete_reason, will_be_purged_at,
      created_at, updated_at
    FROM tasks
    WHERE is_deleted = true
  `;
  const params: any[] = [];

  if (workspaceId) {
    sql += ` AND (workspace_id = $${params.length + 1} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`;
    params.push(workspaceId);
  }
  if (userId) {
    sql += ` AND created_by = $${params.length + 1}`;
    params.push(userId);
  }

  // count 与 list 共用同一组 WHERE 条件（重建占位符）
  const countParams = [...params];
  const countConditions: string[] = [];
  if (workspaceId) countConditions.push(`(workspace_id = $${countConditions.length + 1} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
  if (userId) countConditions.push(`created_by = $${countConditions.length + 1}`);
  const countWhere = countConditions.length ? ' AND ' + countConditions.join(' AND ') : '';
  const countResult = await query(
    `SELECT COUNT(*) FROM tasks WHERE is_deleted = true${countWhere}`,
    countParams,
  );

  sql += ` ORDER BY deleted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return {
    tasks: result.rows,
    total: parseInt(countResult.rows[0]?.count || '0'),
  };
}

/**
 * 获取隐藏任务列表
 */
export async function getHiddenTasks(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  workspaceId?: string;
}): Promise<{
  tasks: any[];
  total: number;
}> {
  const { limit = 20, offset = 0, userId, workspaceId } = options;

  let sql = `
    SELECT
      id, topic, status, progress,
      hidden_at, hidden_by,
      created_at, updated_at
    FROM tasks
    WHERE is_hidden = true AND is_deleted = false
  `;
  const params: any[] = [];

  if (workspaceId) {
    sql += ` AND (workspace_id = $${params.length + 1} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`;
    params.push(workspaceId);
  }
  if (userId) {
    sql += ` AND created_by = $${params.length + 1}`;
    params.push(userId);
  }

  const countParams = [...params];
  const countConditions: string[] = [];
  if (workspaceId) countConditions.push(`(workspace_id = $${countConditions.length + 1} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
  if (userId) countConditions.push(`created_by = $${countConditions.length + 1}`);
  const countWhere = countConditions.length ? ' AND ' + countConditions.join(' AND ') : '';
  const countResult = await query(
    `SELECT COUNT(*) FROM tasks WHERE is_hidden = true AND is_deleted = false${countWhere}`,
    countParams,
  );

  sql += ` ORDER BY hidden_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return {
    tasks: result.rows,
    total: parseInt(countResult.rows[0]?.count || '0'),
  };
}

/**
 * 清理过期任务（自动清理 30 天前的软删除任务）
 */
export async function cleanupExpiredTasks(): Promise<{
  purgedCount: number;
  errors: string[];
}> {
  const expiredTasks = await query(
    `SELECT id FROM tasks
     WHERE is_deleted = true
     AND will_be_purged_at <= NOW()`,
    []
  );

  const errors: string[] = [];
  let purgedCount = 0;

  for (const row of expiredTasks.rows) {
    try {
      await permanentlyDeleteTask(row.id, 'system');
      purgedCount++;
    } catch (error) {
      errors.push(`Failed to purge ${row.id}: ${error}`);
    }
  }

  return { purgedCount, errors };
}

/**
 * 归档任务数据（备份）
 */
async function archiveTaskData(taskId: string): Promise<void> {
  // 获取完整任务数据
  const taskResult = await query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);

  if (taskResult.rows.length === 0) return;

  const task = taskResult.rows[0];

  // 保存到归档表
  await query(
    `INSERT INTO task_archives (
      task_id, task_data, archived_at
    ) VALUES ($1, $2, NOW())
    ON CONFLICT (task_id) DO UPDATE SET
      task_data = $2,
      archived_at = NOW()`,
    [taskId, JSON.stringify(task)]
  );
}

/**
 * 获取归档数据
 */
export async function getArchivedTask(taskId: string): Promise<any | null> {
  const result = await query(
    `SELECT task_data FROM task_archives WHERE task_id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) return null;

  return typeof result.rows[0].task_data === 'string'
    ? JSON.parse(result.rows[0].task_data)
    : result.rows[0].task_data;
}
