import { query } from '../db/connection.js';

export interface AsyncBatchRevisionStatus {
  taskId: string;
  status: 'pending' | 'doing' | 'completed' | 'failed';
  stage?: 'initializing' | 'collecting_reviews' | 'running_llm' | 'validating' | 'saving' | 'completed' | 'failed';
  sectionIndex?: number;
  totalSections?: number;
  batchIndex?: number;
  totalBatches?: number;
  progress: number;
  message: string;
  newDraftId?: string;
  newVersion?: number;
  appliedCount?: number;
  error?: string;
  errorCode?: 'LLM_TIMEOUT' | 'NETWORK_TIMEOUT' | 'VALIDATION_ERROR' | 'UNKNOWN_ERROR';
  attempt?: number;
  lastHeartbeatAt?: string;
  startedAt?: string;
  completedAt?: string;
}

const revisionJobs = new Map<string, AsyncBatchRevisionStatus>();
const BATCH_REVISION_MAX_MS = 8 * 60 * 1000;
const STALL_TIMEOUT_MS = 90 * 1000;
const WATCHDOG_INTERVAL_MS = 15 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function classifyErrorCode(message?: string): AsyncBatchRevisionStatus['errorCode'] {
  const text = String(message || '').toLowerCase();
  if (text.includes('timeout') || text.includes('timed out') || text.includes('超时') || text.includes('[timeout]')) {
    return 'LLM_TIMEOUT';
  }
  if (text.includes('network') || text.includes('econn') || text.includes('socket') || text.includes('fetch')) {
    return 'NETWORK_TIMEOUT';
  }
  if (text.includes('未找到') || text.includes('没有') || text.includes('invalid') || text.includes('校验')) {
    return 'VALIDATION_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

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
    stage: 'initializing',
    progress: 0,
    message: '开始一键改稿...',
    attempt: 1,
    lastHeartbeatAt: nowIso(),
    startedAt: new Date().toISOString(),
  };
  revisionJobs.set(taskId, status);
  const startedAtMs = Date.now();

  process.nextTick(() => {
    executeBatchRevision(taskId, selectedReviewIds).catch((error) => {
      revisionJobs.set(taskId, {
        ...status,
        status: 'failed',
        stage: 'failed',
        progress: Math.max(status.progress, 5),
        message: '改稿执行失败',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: classifyErrorCode(error instanceof Error ? error.message : 'Unknown error'),
        lastHeartbeatAt: nowIso(),
        completedAt: new Date().toISOString(),
      });
    });
  });

  // 无心跳 watchdog：长时间无进度更新则强制失败，避免卡死在 doing
  const watchdog = setInterval(() => {
    const current = revisionJobs.get(taskId);
    if (!current || current.status !== 'doing') {
      clearInterval(watchdog);
      return;
    }
    const lastBeat = new Date(current.lastHeartbeatAt || current.startedAt || nowIso()).getTime();
    if (Date.now() - lastBeat < STALL_TIMEOUT_MS) return;
    revisionJobs.set(taskId, {
      ...current,
      status: 'failed',
      stage: 'failed',
      message: '改稿执行超时，请重试',
      error: `No heartbeat for ${STALL_TIMEOUT_MS}ms`,
      errorCode: 'LLM_TIMEOUT',
      lastHeartbeatAt: nowIso(),
      completedAt: nowIso(),
    });
    clearInterval(watchdog);
  }, WATCHDOG_INTERVAL_MS);

  // 兜底超时：避免卡在 doing 状态无法收敛
  setTimeout(() => {
    const current = revisionJobs.get(taskId);
    if (!current || current.status !== 'doing') return;
    if (Date.now() - startedAtMs < BATCH_REVISION_MAX_MS) return;
    revisionJobs.set(taskId, {
      ...current,
      status: 'failed',
      stage: 'failed',
      message: '改稿执行超时，请重试',
      error: `Batch revision exceeded ${BATCH_REVISION_MAX_MS}ms`,
      errorCode: 'LLM_TIMEOUT',
      lastHeartbeatAt: nowIso(),
      completedAt: new Date().toISOString(),
    });
  }, BATCH_REVISION_MAX_MS + 1000);

  return { success: true, jobId: taskId };
}

async function executeBatchRevision(taskId: string, selectedReviewIds?: string[]): Promise<void> {
  const initialStatus = revisionJobs.get(taskId);
  if (!initialStatus) return;

  const report = (
    progress: number,
    message: string,
    meta?: {
      stage?: 'collecting_reviews' | 'running_llm_section' | 'validating' | 'saving';
      sectionIndex?: number;
      totalSections?: number;
      batchIndex?: number;
      totalBatches?: number;
    }
  ) => {
    const current = revisionJobs.get(taskId);
    if (!current) return;
    revisionJobs.set(taskId, {
      ...current,
      status: 'doing',
      stage:
        meta?.stage === 'running_llm_section'
          ? 'running_llm'
          : (meta?.stage ?? current.stage),
      sectionIndex: meta?.sectionIndex ?? current.sectionIndex,
      totalSections: meta?.totalSections ?? current.totalSections,
      batchIndex: meta?.batchIndex ?? current.batchIndex,
      totalBatches: meta?.totalBatches ?? current.totalBatches,
      progress: Math.max(current.progress, progress),
      message,
      lastHeartbeatAt: nowIso(),
    });
  };

  try {
    await query(
      `UPDATE tasks SET current_stage = 'revising', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    const currentA = revisionJobs.get(taskId);
    if (currentA) {
      revisionJobs.set(taskId, { ...currentA, stage: 'collecting_reviews', lastHeartbeatAt: nowIso() });
    }
    report(10, '收集已接受的评审意见...');
    const { applyAllAcceptedRevisions } = await import('./revisionAgent.js');
    const currentB = revisionJobs.get(taskId);
    if (currentB) {
      revisionJobs.set(taskId, { ...currentB, stage: 'running_llm', lastHeartbeatAt: nowIso() });
    }
    const result = await applyAllAcceptedRevisions(taskId, {
      selectedReviewIds,
      onProgress: report,
    });

    if (!result.success) {
      throw new Error(result.error || '批量改稿失败');
    }

    const currentC = revisionJobs.get(taskId);
    if (currentC) {
      revisionJobs.set(taskId, { ...currentC, stage: 'saving', lastHeartbeatAt: nowIso() });
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
      stage: 'completed',
      progress: 100,
      message: '一键改稿完成',
      newDraftId: result.newDraftId,
      newVersion: result.newVersion,
      appliedCount: result.appliedCount,
      errorCode: undefined,
      error: undefined,
      lastHeartbeatAt: nowIso(),
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
      stage: 'failed',
      message: '一键改稿失败',
      error: errMsg,
      errorCode: classifyErrorCode(errMsg),
      lastHeartbeatAt: nowIso(),
      completedAt: new Date().toISOString(),
    });
  }
}
