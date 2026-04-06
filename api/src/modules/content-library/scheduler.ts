// Content Library — 定时任务调度器
// 定时生成⑦信息增量报告、⑧保鲜度报告，推送到运营 Dashboard
// 嵌入模式: 在 server.ts 启动时调用 startContentLibraryScheduler()
// 独立模式: 在 standalone.ts 中调用

import { ContentLibraryEngine } from './ContentLibraryEngine.js';
import type { EventBusAdapter, DeltaReport, ContentFact } from './types.js';
import { CONTENT_LIBRARY_EVENTS } from './types.js';

export interface SchedulerConfig {
  /** 信息增量报告生成间隔 (ms, 默认 6 小时) */
  deltaReportInterval?: number;
  /** 保鲜度扫描间隔 (ms, 默认 24 小时) */
  freshnessCheckInterval?: number;
  /** 事实过期天数阈值 (默认 90) */
  factMaxAgeDays?: number;
  /** 启用日志 */
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<SchedulerConfig> = {
  deltaReportInterval: 6 * 60 * 60 * 1000,     // 6 hours
  freshnessCheckInterval: 24 * 60 * 60 * 1000,  // 24 hours
  factMaxAgeDays: 90,
  verbose: true,
};

export class ContentLibraryScheduler {
  private engine: ContentLibraryEngine;
  private eventBus?: EventBusAdapter;
  private config: Required<SchedulerConfig>;
  private deltaTimer: ReturnType<typeof setInterval> | null = null;
  private freshnessTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    engine: ContentLibraryEngine,
    eventBus?: EventBusAdapter,
    config?: SchedulerConfig
  ) {
    this.engine = engine;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动定时任务 */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.log('Content Library scheduler started');

    // ⑦ 信息增量报告 — 定时生成
    this.deltaTimer = setInterval(() => {
      this.generateDeltaReport().catch(err =>
        console.error('[ContentLibrary:Scheduler] Delta report failed:', err)
      );
    }, this.config.deltaReportInterval);

    // ⑧ 保鲜度报告 — 定时扫描
    this.freshnessTimer = setInterval(() => {
      this.checkFreshness().catch(err =>
        console.error('[ContentLibrary:Scheduler] Freshness check failed:', err)
      );
    }, this.config.freshnessCheckInterval);

    // 启动时立即执行一次
    this.generateDeltaReport().catch(() => {});
    this.checkFreshness().catch(() => {});
  }

  /** 停止定时任务 */
  stop(): void {
    if (this.deltaTimer) clearInterval(this.deltaTimer);
    if (this.freshnessTimer) clearInterval(this.freshnessTimer);
    this.running = false;
    this.log('Content Library scheduler stopped');
  }

  /** ⑦ 生成信息增量报告 */
  private async generateDeltaReport(): Promise<void> {
    const since = new Date(Date.now() - this.config.deltaReportInterval);
    const report = await this.engine.getDeltaReport(since);

    const total = report.newFacts.length + report.updatedFacts.length + report.refutedFacts.length;
    this.log(`Delta report: ${report.summary}`);

    // 推送到 EventBus（Dashboard 可订阅）
    if (this.eventBus && total > 0) {
      await this.eventBus.publish('content-library:delta-report', {
        period: report.period,
        newCount: report.newFacts.length,
        updatedCount: report.updatedFacts.length,
        refutedCount: report.refutedFacts.length,
        summary: report.summary,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  /** ⑧ 扫描过期事实 */
  private async checkFreshness(): Promise<void> {
    const staleFacts = await this.engine.getStaleFacts({
      maxAgeDays: this.config.factMaxAgeDays,
      limit: 100,
    });

    this.log(`Freshness check: ${staleFacts.length} stale facts found`);

    if (this.eventBus && staleFacts.length > 0) {
      await this.eventBus.publish('content-library:freshness-alert', {
        staleCount: staleFacts.length,
        oldestFact: staleFacts.length > 0 ? {
          subject: staleFacts[0].subject,
          predicate: staleFacts[0].predicate,
          createdAt: staleFacts[0].createdAt,
        } : null,
        threshold: this.config.factMaxAgeDays,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[ContentLibrary:Scheduler] ${message}`);
    }
  }
}

/** 便捷启动函数 — 在 server.ts 中使用 */
export function startContentLibraryScheduler(
  engine: ContentLibraryEngine,
  eventBus?: EventBusAdapter,
  config?: SchedulerConfig
): ContentLibraryScheduler {
  const scheduler = new ContentLibraryScheduler(engine, eventBus, config);
  scheduler.start();
  return scheduler;
}
