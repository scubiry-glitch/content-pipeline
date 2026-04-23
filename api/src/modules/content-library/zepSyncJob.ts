// Zep 知识回填 Job — 将 content_facts 历史数据异步同步到 Zep Graph
// 与 reextractJob 同一模式：内存 job 状态 + SSE 订阅
// 断点续传：成功写入后在 content_facts 打 zep_synced_at / zep_graph_id；失败累计 zep_sync_attempts

import type { Pool } from 'pg';

export interface ZepSyncJobState {
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  /** 本轮计划成功同步的事实条数上限（= min(待同步数, limit)） */
  syncGoal: number;
  synced: number;
  skipped: number;
  errors: number;
  startedAt: string;
  completedAt?: string;
  currentBatch?: number;
  errorMessages: string[];
  graphId?: string;
  resume?: boolean;
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
  limit?: number;      // 本轮最多成功同步多少条事实，默认直到待同步耗尽
  batchSize?: number;  // 每次 Zep API 写入的事实数，默认 10
  minConfidence?: number; // 最低置信度，默认 0.5
  /** 为 true 时忽略本地同步标记，重新尝试写入（仍受 OpenZep 侧去重影响） */
  forceResync?: boolean;
  /** 同一条事实连续写入失败多少次后本轮不再拉取，默认 5 */
  maxSyncAttempts?: number;
}

function pendingWhereSql(force: boolean): string {
  if (force) {
    return 'is_current = true AND confidence >= $1';
  }
  return `is_current = true AND confidence >= $1
    AND (zep_synced_at IS NULL OR zep_graph_id IS DISTINCT FROM $2)
    AND COALESCE(zep_sync_attempts, 0) < $3`;
}

export function startZepSyncJob(db: Pool, options: ZepSyncJobOptions = {}): string {
  const jobId = genId();
  const ac = new AbortController();
  abortControllers.set(jobId, ac);

  const batchSize = options.batchSize ?? 10;
  const minConf = options.minConfidence ?? 0.5;
  const force = options.forceResync === true;
  const graphId = (process.env.ZEP_GRAPH_ID || 'default').trim() || 'default';
  const maxAttempts = Math.max(1, Math.min(50, options.maxSyncAttempts ?? 5));

  const state: ZepSyncJobState = {
    jobId, status: 'running',
    total: 0, syncGoal: 0, synced: 0, skipped: 0, errors: 0,
    startedAt: new Date().toISOString(), errorMessages: [],
    graphId, resume: !force,
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

      await ensureZepUser('content-pipeline-system', { firstName: 'ContentPipeline' });

      const countParams = force ? [minConf] : [minConf, graphId, maxAttempts];
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS c FROM content_facts WHERE ${pendingWhereSql(force)}`,
        countParams,
      );
      const pendingTotal = countResult.rows[0].c;
      const capped = options.limit !== undefined && !Number.isNaN(options.limit)
        ? Math.min(pendingTotal, options.limit)
        : pendingTotal;
      state.syncGoal = capped;
      state.total = capped;
      emit(jobId, 'total', {
        total: state.total,
        graphId,
        resume: !force,
        maxSyncAttempts: maxAttempts,
      });

      const pageSize = batchSize * 5;

      while (state.status === 'running') {
        if (ac.signal.aborted) { state.status = 'cancelled'; break; }

        const remaining = state.syncGoal - state.synced;
        if (remaining <= 0) break;

        const fetchLimit = Math.min(pageSize, remaining);
        const fetchParams = force
          ? [minConf, fetchLimit]
          : [minConf, graphId, maxAttempts, fetchLimit];

        const factsResult = await db.query(
          `SELECT id, subject, predicate, object, confidence, context, asset_id
           FROM content_facts
           WHERE ${pendingWhereSql(force)}
           ORDER BY COALESCE(zep_sync_attempts, 0) ASC, confidence DESC, created_at DESC, id DESC
           LIMIT $${fetchParams.length}`,
          fetchParams,
        );

        if (factsResult.rows.length === 0) break;

        for (let i = 0; i < factsResult.rows.length; i += batchSize) {
          if (ac.signal.aborted) { state.status = 'cancelled'; break; }
          if (state.synced >= state.syncGoal) break;

          const room = state.syncGoal - state.synced;
          if (room <= 0) break;

          const batch = factsResult.rows.slice(i, i + Math.min(batchSize, room));
          const batchNum = Math.floor(i / batchSize) + 1;
          state.currentBatch = batchNum;

          const ids = batch.map((r: any) => r.id as string);

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
            if (result !== null) {
              await db.query(
                `UPDATE content_facts
                 SET zep_synced_at = NOW(), zep_graph_id = $1, zep_sync_attempts = 0
                 WHERE id = ANY($2::uuid[])`,
                [graphId, ids],
              );
              state.synced += batch.length;
            } else {
              await db.query(
                `UPDATE content_facts
                 SET zep_sync_attempts = COALESCE(zep_sync_attempts, 0) + 1
                 WHERE id = ANY($1::uuid[])`,
                [ids],
              );
              state.skipped += batch.length;
            }
          } catch (err) {
            await db.query(
              `UPDATE content_facts
               SET zep_sync_attempts = COALESCE(zep_sync_attempts, 0) + 1
               WHERE id = ANY($1::uuid[])`,
              [ids],
            ).catch(() => {});
            state.errors += batch.length;
            state.errorMessages.push(`batch ${batchNum}: ${err instanceof Error ? err.message : String(err)}`);
          }

          emit(jobId, 'progress', {
            total: state.total,
            syncGoal: state.syncGoal,
            synced: state.synced,
            skipped: state.skipped,
            errors: state.errors,
            currentBatch: state.currentBatch,
          });

          await new Promise(r => setTimeout(r, 500));
        }
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
        total: state.total,
        syncGoal: state.syncGoal,
        synced: state.synced,
        skipped: state.skipped,
        errors: state.errors,
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
