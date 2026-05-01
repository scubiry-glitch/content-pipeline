// CeoEngine — 决策驾驶舱核心 engine
// PR3 阶段仅含基础健康检查 + scheduler stub；
// PR4-PR9 各房间的 service/aggregator 在子目录补齐；
// PR12 接生成中心。

import type { CeoEngineDeps } from './types.js';

export interface CeoEngineOptions {
  /** 是否启动内置 cron 调度器（A/B/C/D 规则流） */
  enableScheduler?: boolean;
}

export class CeoEngine {
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(
    public readonly deps: CeoEngineDeps,
    private readonly options: CeoEngineOptions = {},
  ) {}

  /** 健康检查 — PR3 阶段：检查 db 连通 */
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
   * 启动调度器 — PR3 仅占位，每 30 分钟空跑一次心跳日志；
   * PR4 起 aggregator/promotion/anomaly/scoring 各流接入。
   */
  startScheduler(): void {
    if (this.schedulerInterval) return;
    if (this.options.enableScheduler === false) return;

    const tick = () => {
      // PR4-PR9 在这里依次接入：
      //   - g5 棱镜聚合
      //   - 房间 metric 重算
      //   - 关注清单晋升 / 异常检测
      console.log('[CeoEngine] scheduler tick (placeholder, see pipelines/scheduler.ts in PR4+)');
    };

    // 每 30 分钟（开发期可降低）；首次 60s 后跑
    const intervalMs = Number(process.env.CEO_SCHEDULER_INTERVAL_MS ?? 30 * 60 * 1000);
    setTimeout(tick, 60_000);
    this.schedulerInterval = setInterval(tick, intervalMs);
    if (typeof this.schedulerInterval.unref === 'function') {
      this.schedulerInterval.unref();
    }
    console.log(`[CeoEngine] scheduler started (interval=${intervalMs}ms)`);
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  // ============================================================
  // 占位方法 — 后续 PR 替换为真实业务逻辑
  // ============================================================

  /** 看板主聚合（PR4 起填充） */
  async buildDashboard(_scopeId?: string): Promise<{
    rooms: Array<{ id: string; metric: { label: string; value: string; delta: string } }>;
    note: string;
  }> {
    return {
      rooms: [],
      note: 'PR3 阶段：dashboard 聚合占位，PR4-PR9 房间逐步接入',
    };
  }
}
