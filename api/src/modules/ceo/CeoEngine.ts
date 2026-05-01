// CeoEngine — 决策驾驶舱核心 engine
// PR3 健康检查 + scheduler stub
// PR4-PR9 各房间的 service/aggregator 在子目录补齐
// PR12 接生成中心 — runQueue 轮询 mn_runs(module='ceo') + 调度器入队 g5

import type { CeoEngineDeps } from './types.js';
import { CeoRunQueue, enqueueCeoRun } from './pipelines/runQueue.js';
import { CeoScheduler } from './pipelines/scheduler.js';

export interface CeoEngineOptions {
  /** 是否启动内置 cron 调度器（PR12 起：g5 棱镜聚合 + g3/g4 LLM 任务入队） */
  enableScheduler?: boolean;
}

export class CeoEngine {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private runQueue: CeoRunQueue | null = null;
  private cronScheduler: CeoScheduler | null = null;

  constructor(
    public readonly deps: CeoEngineDeps,
    private readonly options: CeoEngineOptions = {},
  ) {}

  /** 健康检查 */
  async health(): Promise<{
    ok: boolean;
    module: 'ceo';
    schedulerRunning: boolean;
    db: 'connected' | 'error';
    error?: string;
  }> {
    let db: 'connected' | 'error' = 'connected';
    let error: string | undefined;
    try {
      await this.deps.db.query('SELECT 1');
    } catch (e) {
      db = 'error';
      error = (e as Error).message;
    }
    return {
      ok: db === 'connected',
      module: 'ceo',
      schedulerRunning: this.schedulerInterval !== null,
      db,
      error,
    };
  }

  /**
   * 启动调度器 — PR12 实装：
   *   1. CeoRunQueue: 每 15s 轮询 mn_runs WHERE module='ceo' AND state='queued'，
   *      跑 g3/g4/g5 处理器，写回 succeeded/failed。
   *   2. CeoScheduler: 启动 30s 后入队一次 g5；每周日 21:00 自动跑 g5 棱镜聚合。
   */
  startScheduler(): void {
    if (this.options.enableScheduler === false) return;
    if (this.runQueue) return;

    this.runQueue = new CeoRunQueue(this.deps);
    this.runQueue.start();

    this.cronScheduler = new CeoScheduler(this.deps);
    this.cronScheduler.start();

    // 心跳日志（保留 schedulerRunning 状态指示）
    const tick = () => {
      console.log('[CeoEngine] scheduler heartbeat (runQueue + cron 已托管 g3/g4/g5)');
    };
    const intervalMs = Number(process.env.CEO_SCHEDULER_INTERVAL_MS ?? 30 * 60 * 1000);
    this.schedulerInterval = setInterval(tick, intervalMs);
    if (typeof this.schedulerInterval.unref === 'function') {
      this.schedulerInterval.unref();
    }
    console.log(`[CeoEngine] scheduler started (runQueue+cron, heartbeat ${intervalMs}ms)`);
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    if (this.runQueue) {
      this.runQueue.stop();
      this.runQueue = null;
    }
    if (this.cronScheduler) {
      this.cronScheduler.stop();
      this.cronScheduler = null;
    }
  }

  /** 手动入队一个 CEO 加工任务 (g1..g5)；返回 mn_runs.id */
  async enqueueRun(input: {
    axis: 'g1' | 'g2' | 'g3' | 'g4' | 'g5';
    scopeKind?: string;
    scopeId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: boolean; runId?: string }> {
    return enqueueCeoRun(this.deps, input);
  }

  /** 看板主聚合（PR4 起填充；当前以 panorama service 替代） */
  async buildDashboard(_scopeId?: string): Promise<{
    rooms: Array<{ id: string; metric: { label: string; value: string; delta: string } }>;
    note: string;
  }> {
    return {
      rooms: [],
      note: '请使用 /api/v1/ceo/panorama 获取完整聚合，或 /api/v1/ceo/{compass,boardroom,...}/dashboard 获取分房间详情',
    };
  }
}
