import { query } from '../db/connection.js';

export interface AsyncBatchRevisionStatus {
  taskId: string;
  status: 'pending' | 'doing' | 'completed' | 'failed';
  progress: number;
  message: string;
  newDraftId?: string;
  newVersion?: number;
  appliedCount?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

type ProgressReporter = (progress: number, message: string) => void;

const revisionJobs = new Map<string, AsyncBatchRevisionStatus>();
const BATCH_REVISION_MAX_MS = 8 * 60 * 1000;

export function getBatchRevisionStatus(taskId: string): AsyncBatchRevisionStatus | null {
  return revisionJobs.get(taskId) || null;
}

export async function startAsyncBatchRevision(
  taskId: string,
  selectedReviewIds?: string[]
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  const existingJob = revisionJobs.get(taskId);
  if (existingJob?.status === 'doing') {
    return { success: false, error: '已有进行中的改稿任务' };
  }

  const status: AsyncBatchRevisionStatus = {
    taskId,
    status: 'doing',
    progress: 0,
    message: '开始一键改稿...',
    startedAt: new Date().toISOString(),
  };
  revisionJobs.set(taskId, status);
  const startedAtMs = Date.now();

  process.nextTick(() => {
    executeBatchRevision(taskId, selectedReviewIds).catch((error) => {
      revisionJobs.set(taskId, {
        ...status,
        status: 'failed',
        progress: Math.max(status.progress, 5),
        message: '改稿执行失败',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString(),
      });
    });
  });

  // 兜底超时：避免卡在 doing 状态无法收敛
  setTimeout(() => {
    const current = revisionJobs.get(taskId);
    if (!current || current.status !== 'doing') return;
    if (Date.now() - startedAtMs < BATCH_REVISION_MAX_MS) return;
    revisionJobs.set(taskId, {
      ...current,
      status: 'failed',
      message: '改稿执行超时，请重试',
      error: `Batch revision exceeded ${BATCH_REVISION_MAX_MS}ms`,
      completedAt: new Date().toISOString(),
    });
  }, BATCH_REVISION_MAX_MS + 1000);

  return { success: true, jobId: taskId };
}

async function executeBatchRevision(taskId: string, selectedReviewIds?: string[]): Promise<void> {
  const initialStatus = revisionJobs.get(taskId);
  if (!initialStatus) return;

  const report: ProgressReporter = (progress, message) => {
    const current = revisionJobs.get(taskId);
    if (!current) return;
    revisionJobs.set(taskId, {
      ...current,
      status: 'doing',
      progress: Math.max(current.progress, progress),
      message,
    });
  };

  try {
    await query(
      `UPDATE tasks SET current_stage = 'revising', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    report(10, '收集已接受的评审意见...');
    const { applyAllAcceptedRevisions } = await import('./revisionAgent.js');
    const result = await applyAllAcceptedRevisions(taskId, {
      selectedReviewIds,
      onProgress: report,
    });

    if (!result.success) {
      throw new Error(result.error || '批量改稿失败');
    }

    report(96, '保存任务状态...');
    await query(
      `UPDATE tasks
       SET status = 'completed',
           current_stage = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );

    revisionJobs.set(taskId, {
      ...initialStatus,
      status: 'completed',
      progress: 100,
      message: '一键改稿完成',
      newDraftId: result.newDraftId,
      newVersion: result.newVersion,
      appliedCount: result.appliedCount,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    try {
      await query(
        `UPDATE tasks SET current_stage = 'awaiting_approval', updated_at = NOW() WHERE id = $1`,
        [taskId]
      );
      await query(
        `INSERT INTO task_logs (task_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
        [taskId, 'batch_revision_failed', JSON.stringify({ error: errMsg })]
      );
    } catch (loggingError) {
      console.error('[AsyncBatchRevision] Failed to persist failure state:', loggingError);
    }

    const current = revisionJobs.get(taskId) || initialStatus;
    revisionJobs.set(taskId, {
      ...current,
      status: 'failed',
      message: '一键改稿失败',
      error: errMsg,
      completedAt: new Date().toISOString(),
    });
  }
}
