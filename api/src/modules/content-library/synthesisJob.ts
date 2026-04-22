// Content Library — 认知综合预生成 Job (SSE 进度推送 + 断点续传)
// 与 reextractJob.ts 同一模式：内存 job 状态 + 全局 SSE 订阅

import type { ContentLibraryEngine } from './ContentLibraryEngine.js';

export interface SynthesisJobState {
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;   // 已尝试（generated + skipped + errors）
  generated: number;   // LLM 实际生成
  skipped: number;     // 已有缓存跳过
  errors: number;
  overwrite: boolean;
  startedAt: string;
  completedAt?: string;
  currentEntity?: string;
  errorMessages: string[];
  /** Round 2: 深度模式标记 */
  deep?: boolean;
}

export interface SynthesisJobOptions {
  limit?: number;       // 最多处理多少个实体，默认 50
  domain?: string;      // 限定领域
  overwrite?: boolean;  // true = 覆盖已有缓存；false = 跳过
  minFacts?: number;    // 至少有多少条事实的实体才生成，默认 3
  /** Round 2: 深度模式 — 每个实体用 CDT 专家综合，cache_key 独立命名空间 */
  enableDeep?: boolean;
  /** Round 2: 专家应用策略配置 */
  expertStrategy?: {
    preset?: 'lite' | 'standard' | 'max' | 'custom';
    default?: string;
    perDeliverable?: Record<string, string>;
  };
}

type SSEListener = (event: string, data: any) => void;

const jobs = new Map<string, SynthesisJobState>();
const listeners = new Map<string, Set<SSEListener>>();
const abortControllers = new Map<string, AbortController>();

let counter = 0;
function generateJobId() { return `synthesis_${Date.now()}_${++counter}`; }

function emit(jobId: string, event: string, data: any) {
  const subs = listeners.get(jobId);
  if (subs) for (const fn of subs) { try { fn(event, data); } catch { /* ignore */ } }
}

/**
 * 启动预生成 job。立即返回 jobId，后台逐实体调用 LLM 并写缓存。
 */
export function startSynthesisJob(
  engine: ContentLibraryEngine,
  options: SynthesisJobOptions,
): string {
  const jobId = generateJobId();
  const ac = new AbortController();
  abortControllers.set(jobId, ac);

  const overwrite = options.overwrite ?? false;
  const limit = options.limit ?? 50;
  const minFacts = options.minFacts ?? 3;
  const enableDeep = options.enableDeep === true;

  const state: SynthesisJobState = {
    jobId,
    status: 'running',
    total: 0,
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    overwrite,
    startedAt: new Date().toISOString(),
    errorMessages: [],
    deep: enableDeep,
  };
  jobs.set(jobId, state);

  (async () => {
    try {
      // 1. 查询待处理实体列表（按事实数量降序）
      const db = (engine as any).deps.db;
      const domainClause = options.domain
        ? `AND context->>'domain' = '${options.domain.replace(/'/g, "''")}'`
        : '';
      const entitiesResult = await db.query(`
        SELECT DISTINCT subject AS name, COUNT(*) AS fact_count
        FROM content_facts
        WHERE is_current = true ${domainClause}
        GROUP BY subject
        HAVING COUNT(*) >= $1
        ORDER BY COUNT(*) DESC
        LIMIT $2
      `, [minFacts, limit]);

      const entities: Array<{ name: string; fact_count: number }> = entitiesResult.rows;
      state.total = entities.length;
      emit(jobId, 'total', { total: state.total, deep: state.deep });

      // 2. 逐实体生成
      for (const entity of entities) {
        if (ac.signal.aborted || state.status !== 'running') {
          state.status = 'cancelled';
          break;
        }

        state.currentEntity = entity.name;
        emit(jobId, 'progress', { ...progressSnapshot(state), currentEntity: entity.name });

        // Round 2: 深度模式用独立 cache_key namespace，避免污染泛型缓存
        const cacheKey = enableDeep ? `entity:${entity.name}:deep` : `entity:${entity.name}`;
        const scopeType = enableDeep ? 'entity_deep' : 'entity';

        // 断点续传：检查缓存是否已存在
        if (!overwrite) {
          const existing = await db.query(
            `SELECT id FROM content_synthesis_cache WHERE cache_key = $1`,
            [cacheKey],
          );
          if (existing.rows.length > 0) {
            state.skipped++;
            state.processed++;
            emit(jobId, 'progress', progressSnapshot(state));
            continue;
          }
        }

        try {
          // Round 2: 深度模式走 synthesizeInsightsDeep (CDT 专家综合)；否则走 Raw
          const result = enableDeep
            ? await (engine as any).synthesizeInsightsDeep({
                subjects: [entity.name],
                limit: 5,
                expertStrategy: options.expertStrategy,
              })
            : await (engine as any).synthesizeInsightsRaw({
                subjects: [entity.name],
                limit: 5,
              });

          if (result && result.insights && result.insights.length > 0) {
            await db.query(`
              INSERT INTO content_synthesis_cache
                (cache_key, scope_type, scope_value, insights, summary, facts_used, generated_at)
              VALUES ($1, $2, $3, $4, $5, $6, NOW())
              ON CONFLICT (cache_key) DO UPDATE SET
                insights = EXCLUDED.insights,
                summary = EXCLUDED.summary,
                facts_used = EXCLUDED.facts_used,
                generated_at = NOW()
            `, [cacheKey, scopeType, entity.name, JSON.stringify(result.insights), result.summary || '', result.factsUsed || 0]);
            state.generated++;
          } else {
            state.errors++;
            state.errorMessages.push(`${entity.name}: 无洞察输出`);
          }
        } catch (err) {
          state.errors++;
          state.errorMessages.push(`${entity.name}: ${err instanceof Error ? err.message : String(err)}`);
        }

        state.processed++;
        emit(jobId, 'progress', progressSnapshot(state));

        // 防 LLM 限速
        await new Promise(r => setTimeout(r, 300));
      }

      if (state.status === 'running') state.status = 'completed';
    } catch (err) {
      state.status = 'failed';
      state.errorMessages.push(err instanceof Error ? err.message : String(err));
    } finally {
      state.currentEntity = undefined;
      state.completedAt = new Date().toISOString();
      emit(jobId, 'done', { status: state.status, ...progressSnapshot(state) });
      abortControllers.delete(jobId);
    }
  })();

  return jobId;
}

function progressSnapshot(s: SynthesisJobState) {
  return {
    total: s.total,
    processed: s.processed,
    generated: s.generated,
    skipped: s.skipped,
    errors: s.errors,
  };
}

export function getSynthesisJob(jobId: string): SynthesisJobState | null {
  return jobs.get(jobId) || null;
}

export function cancelSynthesisJob(jobId: string): boolean {
  const ac = abortControllers.get(jobId);
  if (ac) {
    ac.abort();
    const s = jobs.get(jobId);
    if (s) s.status = 'cancelled';
    return true;
  }
  return false;
}

export function subscribeSynthesisJob(jobId: string, listener: SSEListener): () => void {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set());
  listeners.get(jobId)!.add(listener);
  return () => { listeners.get(jobId)?.delete(listener); };
}

export function listSynthesisJobs(): SynthesisJobState[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
