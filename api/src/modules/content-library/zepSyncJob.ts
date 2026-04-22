// Zep 知识回填 Job — 将 content_facts 历史数据异步同步到 Zep Graph
// 与 reextractJob 同一模式：内存 job 状态 + SSE 订阅

import type { Pool } from 'pg';

export interface ZepSyncJobState {
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  synced: number;
  skipped: number;
  errors: number;
  startedAt: string;
  completedAt?: string;
  currentBatch?: number;
  errorMessages: string[];
}

type SSEListener = (event: string, data: any) => void;

const jobs = new Map<string, ZepSyncJobState>();
const listeners = new Map<string, Set<SSEListener>>();
const abortControllers = new Map<string, AbortController>();

let counter = 0;
function genId() { return `zep_sync_${Date.now()}_${++counter}`; }

function emit(jobId: string, event: string, data: any) {
  const subs = listeners.get(jobId);
  if (subs) for (const fn of subs) { try { fn(event, data); } catch { /* ignore */ } }
}

export interface ZepSyncJobOptions {
  limit?: number;      // 最多同步多少条事实，默认全部
  batchSize?: number;  // 每次 Zep API 写入的事实数，默认 10
  minConfidence?: number; // 最低置信度，默认 0.5
}

export function startZepSyncJob(db: Pool, options: ZepSyncJobOptions = {}): string {
  const jobId = genId();
  const ac = new AbortController();
  abortControllers.set(jobId, ac);

  const batchSize = options.batchSize ?? 10;
  const minConf = options.minConfidence ?? 0.5;

  const state: ZepSyncJobState = {
    jobId, status: 'running',
    total: 0, synced: 0, skipped: 0, errors: 0,
    startedAt: new Date().toISOString(), errorMessages: [],
  };
  jobs.set(jobId, state);

  (async () => {
    try {
      const { isZepEnabled, addGraphEpisode, ensureZepUser } = await import('../../services/zep/zepClient.js');
      if (!isZepEnabled()) {
        state.status = 'failed';
        state.errorMessages.push('Zep not enabled (ZEP_API_KEY missing)');
        return;
      }

      // 确保系统用户存在
      await ensureZepUser('content-pipeline-system', { firstName: 'ContentPipeline' });

      // 计算总数
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS c FROM content_facts WHERE is_current = true AND confidence >= $1`,
        [minConf],
      );
      state.total = Math.min(countResult.rows[0].c, options.limit ?? Infinity);
      emit(jobId, 'total', { total: state.total });

      // 分页读取并同步
      let offset = 0;
      const pageSize = batchSize * 5; // 每页读 50 条，分 5 批写入 Zep

      while (offset < state.total && state.status === 'running') {
        if (ac.signal.aborted) { state.status = 'cancelled'; break; }

        const currentLimit = Math.min(pageSize, Math.max(state.total - offset, 0));
        const factsResult = await db.query(
          `SELECT subject, predicate, object, confidence, context, asset_id
           FROM content_facts
           WHERE is_current = true AND confidence >= $1
           ORDER BY confidence DESC, created_at DESC
           LIMIT $2 OFFSET $3`,
          [minConf, currentLimit, offset],
        );

        if (factsResult.rows.length === 0) break;

        // 按 batchSize 分组写入 Zep
        for (let i = 0; i < factsResult.rows.length; i += batchSize) {
          if (ac.signal.aborted) { state.status = 'cancelled'; break; }

          const batch = factsResult.rows.slice(i, i + batchSize);
          const batchNum = Math.floor(offset / batchSize) + Math.floor(i / batchSize) + 1;
          state.currentBatch = batchNum;

          const lines = batch.map((f: any) => {
            let ctx: any = {};
            if (typeof f.context === 'string') {
              try { ctx = JSON.parse(f.context || '{}'); } catch { ctx = {}; }
            } else {
              ctx = f.context || {};
            }
            const domain = ctx.domain ? `[${ctx.domain}] ` : '';
            const time = ctx.time ? ` (时间: ${ctx.time})` : '';
            return `${domain}${f.subject} ${f.predicate} ${f.object}${time}。置信度: ${Math.round(f.confidence * 100)}%`;
          });

          const episodeText = `内容库事实 (来源: ${batch[0]?.asset_id || 'db'}):\n${lines.join('\n')}`;

          try {
            const result = await addGraphEpisode('content-pipeline-system', {
              type: 'text',
              data: episodeText,
              user_id: 'content-pipeline-system',
            });
            // result === null 表示 API 返回非 2xx（zepFetch 返回 null）
            // result === "" 表示 202 Accepted 空 body — 实际成功
            if (result !== null) {
              state.synced += batch.length;
            } else {
              state.skipped += batch.length;
            }
          } catch (err) {
            state.errors += batch.length;
            state.errorMessages.push(`batch ${batchNum}: ${err instanceof Error ? err.message : String(err)}`);
          }

          emit(jobId, 'progress', {
            total: state.total, synced: state.synced,
            skipped: state.skipped, errors: state.errors,
            currentBatch: state.currentBatch,
          });

          // 防 Zep 限速 (~2 req/s 安全区间)
          await new Promise(r => setTimeout(r, 500));
        }

        offset += factsResult.rows.length;
      }

      if (state.status === 'running') state.status = 'completed';
    } catch (err) {
      state.status = 'failed';
      state.errorMessages.push(err instanceof Error ? err.message : String(err));
    } finally {
      state.currentBatch = undefined;
      state.completedAt = new Date().toISOString();
      emit(jobId, 'done', {
        status: state.status,
        total: state.total, synced: state.synced,
        skipped: state.skipped, errors: state.errors,
      });
      abortControllers.delete(jobId);
    }
  })();

  return jobId;
}

export function getZepSyncJob(jobId: string) { return jobs.get(jobId) || null; }

export function cancelZepSyncJob(jobId: string): boolean {
  const ac = abortControllers.get(jobId);
  if (ac) {
    ac.abort();
    const s = jobs.get(jobId);
    if (s) s.status = 'cancelled';
    return true;
  }
  return false;
}

export function subscribeZepSyncJob(jobId: string, listener: SSEListener): () => void {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set());
  listeners.get(jobId)!.add(listener);
  return () => { listeners.get(jobId)?.delete(listener); };
}

export function listZepSyncJobs() {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
