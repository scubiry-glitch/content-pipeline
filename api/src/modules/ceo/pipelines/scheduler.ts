// CEO · 定时调度
//
// - g5 棱镜聚合：每周日 21:00 自动入队 (PR12 起生效)
// - 开发期：进程启动后 30 秒入队一次，便于本地验证

import type { CeoEngineDeps } from '../types.js';
import { enqueueCeoRun } from './runQueue.js';

export class CeoScheduler {
  private weeklyTimer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: CeoEngineDeps) {}

  start(): void {
    // 启动 30 秒后跑一次 g5 (开发期方便验证)
    this.bootTimer = setTimeout(() => {
      enqueueCeoRun(this.deps, { axis: 'panorama-aggregate', metadata: { source: 'boot-tick' } }).catch(() => {});
    }, 30_000);
    if (typeof this.bootTimer.unref === 'function') this.bootTimer.unref();

    // 每小时检查一次是否到周日 21:00 (避免引入 cron 库)
    this.weeklyTimer = setInterval(() => this.maybeWeeklyTick(), 60 * 60 * 1000);
    if (typeof this.weeklyTimer.unref === 'function') this.weeklyTimer.unref();

    console.log('[CeoScheduler] started (g5 boot tick + hourly check)');
  }

  stop(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.weeklyTimer) clearInterval(this.weeklyTimer);
    this.bootTimer = null;
    this.weeklyTimer = null;
  }

  private async maybeWeeklyTick(): Promise<void> {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 21) {
      // 当前小时已经入过队就跳过（用 metadata 防重）
      const r = await this.deps.db.query(
        `SELECT 1 FROM mn_runs
          WHERE module = 'ceo' AND axis = 'g5'
            AND created_at > NOW() - INTERVAL '2 hours'
          LIMIT 1`,
      );
      if (r.rows.length === 0) {
        await enqueueCeoRun(this.deps, { axis: 'panorama-aggregate', metadata: { source: 'weekly-tick' } });
      }
    }
  }
}
