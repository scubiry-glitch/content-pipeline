// Content Library v7.2 G2 — 异步回填 job + SSE 进度推送
// 把 reextractBatch 从同步 HTTP 请求改为后台 job，通过 SSE 实时推送进度
// 内存存储 job 状态 (无需 Redis)，支持取消

import type { ContentLibraryEngine } from './ContentLibraryEngine.js';

export interface ReextractJobState {
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  newFacts: number;
  updatedFacts: number;
  skipped: number;
  errors: number;
  tokenEstimate: number;
  startedAt: string;
  completedAt?: string;
  currentAssetId?: string;
  errorMessages: string[];
}

export interface ReextractJobOptions {
  limit?: number;
  since?: string;
  minConfidence?: number;
  onlyUnprocessed?: boolean;
  source?: 'assets' | 'rss';
}

type SSEListener = (event: string, data: any) => void;

// 全局 job 存储 (内存，进程重启清空)
const jobs = new Map<string, ReextractJobState>();
const listeners = new Map<string, Set<SSEListener>>();
const abortControllers = new Map<string, AbortController>();

let jobCounter = 0;

function generateJobId(): string {
  return `reextract_${Date.now()}_${++jobCounter}`;
}

function emit(jobId: string, event: string, data: any) {
  const subs = listeners.get(jobId);
  if (subs) {
    for (const fn of subs) {
      try { fn(event, data); } catch { /* ignore */ }
    }
  }
}

/**
 * 启动异步回填 job。立即返回 jobId，后台逐条处理。
 */
export function startReextractJob(
  engine: ContentLibraryEngine,
  options: ReextractJobOptions
): string {
  const jobId = generateJobId();
  const ac = new AbortController();
  abortControllers.set(jobId, ac);

  const state: ReextractJobState = {
    jobId,
    status: 'running',
    total: 0,
    processed: 0,
    newFacts: 0,
    updatedFacts: 0,
    skipped: 0,
    errors: 0,
    tokenEstimate: 0,
    startedAt: new Date().toISOString(),
    errorMessages: [],
  };
  jobs.set(jobId, state);

  // 后台执行
  (async () => {
    try {
      // 先做 dry-run 获取 total
      const dryResult = await engine.reextractBatch({
        ...options,
        dryRun: true,
        limit: options.limit || 200,
      });
      state.total = dryResult.processed + dryResult.skipped;
      state.tokenEstimate = dryResult.tokenEstimate;
      emit(jobId, 'total', { total: state.total, tokenEstimate: state.tokenEstimate });

      // 逐个处理 (用 limit=1 循环，每次处理 1 个 asset)
      let remaining = options.limit || 200;
      while (remaining > 0 && state.status === 'running') {
        if (ac.signal.aborted) {
          state.status = 'cancelled';
          break;
        }

        const batch = await engine.reextractBatch({
          ...options,
          limit: 1,
          dryRun: false,
        });

        if (batch.processed === 0 && batch.skipped === 0) break;  // 没有更多素材

        state.processed += batch.processed;
        state.newFacts += batch.newFacts;
        state.updatedFacts += batch.updatedFacts;
        state.skipped += batch.skipped;
        state.errors += batch.errors;
        remaining -= (batch.processed + batch.skipped);

        emit(jobId, 'progress', {
          processed: state.processed,
          newFacts: state.newFacts,
          updatedFacts: state.updatedFacts,
          skipped: state.skipped,
          errors: state.errors,
          total: state.total,
        });

        // 防 LLM 限速
        await new Promise(r => setTimeout(r, 500));
      }

      if (state.status === 'running') {
        state.status = 'completed';
      }
    } catch (err) {
      state.status = 'failed';
      state.errorMessages.push(err instanceof Error ? err.message : String(err));
    } finally {
      state.completedAt = new Date().toISOString();
      emit(jobId, 'done', { status: state.status });
      abortControllers.delete(jobId);
    }
  })();

  return jobId;
}

/** 获取 job 状态 */
export function getReextractJob(jobId: string): ReextractJobState | null {
  return jobs.get(jobId) || null;
}

/** 取消正在运行的 job */
export function cancelReextractJob(jobId: string): boolean {
  const ac = abortControllers.get(jobId);
  if (ac) {
    ac.abort();
    const state = jobs.get(jobId);
    if (state) state.status = 'cancelled';
    return true;
  }
  return false;
}

/** 订阅 SSE 事件 */
export function subscribeJob(jobId: string, listener: SSEListener): () => void {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set());
  listeners.get(jobId)!.add(listener);
  return () => {
    listeners.get(jobId)?.delete(listener);
  };
}

/** 列出所有 job */
export function listReextractJobs(): ReextractJobState[] {
  return Array.from(jobs.values()).sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
