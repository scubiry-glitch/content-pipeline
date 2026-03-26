// AI 批量处理定时任务调度器
// v6.1 定时自动处理 RSS 内容

import { batchProcessor, persistenceService } from './batchProcessor.js';

// ============================================
// 定时任务配置
// ============================================

interface SchedulerConfig {
  // 新内容处理（每 15 分钟）
  newItemsInterval: number;  // 毫秒
  newItemsBatchSize: number;
  newItemsMinHotScore: number;

  // 重试失败任务（每小时）
  retryInterval: number;
  retryMaxAttempts: number;

  // 全量刷新（每天凌晨 2 点）
  fullRefreshCron: string;
  fullRefreshMaxItems: number;

  // 热门内容优先处理
  hotItemsThreshold: number;
  hotItemsBatchSize: number;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  newItemsInterval: 15 * 60 * 1000,  // 15 分钟
  newItemsBatchSize: 10,
  newItemsMinHotScore: 30,

  retryInterval: 60 * 60 * 1000,  // 1 小时
  retryMaxAttempts: 3,

  fullRefreshCron: '0 2 * * *',  // 每天凌晨 2 点
  fullRefreshMaxItems: 100,

  hotItemsThreshold: 70,
  hotItemsBatchSize: 5,
};

// ============================================
// 定时任务调度器
// ============================================

export class AIProcessingScheduler {
  private config: SchedulerConfig;
  private isRunning: boolean = false;
  private intervals: NodeJS.Timeout[] = [];

  // 运行状态统计
  private stats = {
    totalProcessed: 0,
    totalFailed: 0,
    lastRunTime: null as Date | null,
    lastRunResults: null as any,
  };

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * 启动定时任务
   */
  start(): void {
    if (this.isRunning) {
      console.log('[AI Scheduler] Already running');
      return;
    }

    console.log('[AI Scheduler] Starting...');
    this.isRunning = true;

    // 1. 每 15 分钟处理新内容
    const newItemsInterval = setInterval(
      () => this.processNewItems(),
      this.config.newItemsInterval
    );
    this.intervals.push(newItemsInterval);

    // 2. 每小时重试失败任务
    const retryInterval = setInterval(
      () => this.retryFailedItems(),
      this.config.retryInterval
    );
    this.intervals.push(retryInterval);

    // 3. 立即执行一次（启动时）
    this.processNewItems();

    console.log('[AI Scheduler] Started successfully');
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    console.log('[AI Scheduler] Stopping...');
    this.isRunning = false;
    
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    console.log('[AI Scheduler] Stopped');
  }

  /**
   * 处理新抓取的 RSS items
   */
  private async processNewItems(): Promise<void> {
    if (!this.isRunning) return;

    const startTime = Date.now();
    console.log('[AI Scheduler] Processing new items...');

    try {
      // 获取高热度优先内容
      const hotItems = await persistenceService.getUnprocessedItems({
        limit: this.config.hotItemsBatchSize,
        minHotScore: this.config.hotItemsThreshold,
      });

      // 获取普通新内容
      const normalItems = await persistenceService.getUnprocessedItems({
        limit: this.config.newItemsBatchSize - hotItems.length,
        minHotScore: this.config.newItemsMinHotScore,
      });

      const items = [...hotItems, ...normalItems];

      if (items.length === 0) {
        console.log('[AI Scheduler] No new items to process');
        return;
      }

      console.log(`[AI Scheduler] Found ${items.length} items to process (${hotItems.length} hot)`);

      // 批量处理
      const results = await batchProcessor.processBatch(items);
      
      // 保存结果
      await persistenceService.saveResults(results.results);

      // 更新统计
      this.stats.totalProcessed += results.success;
      this.stats.totalFailed += results.failed;
      this.stats.lastRunTime = new Date();
      this.stats.lastRunResults = {
        total: results.total,
        success: results.success,
        failed: results.failed,
        processingTime: Date.now() - startTime,
      };

      console.log(`[AI Scheduler] Completed: ${results.success} success, ${results.failed} failed, time: ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[AI Scheduler] Process new items failed:', error);
    }
  }

  /**
   * 重试之前失败的分析
   */
  private async retryFailedItems(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[AI Scheduler] Retrying failed items...');

    try {
      // 查询处理失败的内容（质量分为 0 且分析时间较早的）
      const result = await query(
        `SELECT r.id
         FROM rss_items r
         JOIN rss_item_ai_analysis a ON r.id = a.rss_item_id
         WHERE a.quality_score = 0
           AND a.analyzed_at < NOW() - INTERVAL '1 hour'
           AND a.analyzed_at > NOW() - INTERVAL '24 hours'
         LIMIT 10`,
        []
      );

      if (result.rows.length === 0) {
        console.log('[AI Scheduler] No failed items to retry');
        return;
      }

      console.log(`[AI Scheduler] Retrying ${result.rows.length} failed items`);

      // 重新分析
      const itemIds = result.rows.map(r => r.id);
      const itemsResult = await query(
        `SELECT * FROM rss_items WHERE id = ANY($1)`,
        [itemIds]
      );

      const items = itemsResult.rows.map(row => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        title: row.title,
        link: row.link,
        content: row.content,
        summary: row.summary,
        publishedAt: row.published_at,
        author: row.author,
        categories: row.categories || [],
        tags: row.tags || [],
        relevanceScore: row.relevance_score,
        hotScore: row.hot_score,
        trend: row.trend,
        sentiment: row.sentiment,
        createdAt: row.created_at,
      }));

      const results = await batchProcessor.processBatch(items);
      await persistenceService.saveResults(results.results);

      console.log(`[AI Scheduler] Retry completed: ${results.success} success, ${results.failed} failed`);
    } catch (error) {
      console.error('[AI Scheduler] Retry failed items failed:', error);
    }
  }

  /**
   * 执行全量刷新（可手动调用）
   */
  async runFullRefresh(): Promise<void> {
    console.log('[AI Scheduler] Running full refresh...');

    try {
      // 获取最近未分析或需要重新分析的内容
      const result = await query(
        `SELECT * FROM rss_items
         WHERE ai_analyzed_at IS NULL
           OR ai_analyzed_at < NOW() - INTERVAL '7 days'
         ORDER BY hot_score DESC, published_at DESC
         LIMIT $1`,
        [this.config.fullRefreshMaxItems]
      );

      const items = result.rows.map(row => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        title: row.title,
        link: row.link,
        content: row.content,
        summary: row.summary,
        publishedAt: row.published_at,
        author: row.author,
        categories: row.categories || [],
        tags: row.tags || [],
        relevanceScore: row.relevance_score,
        hotScore: row.hot_score,
        trend: row.trend,
        sentiment: row.sentiment,
        createdAt: row.created_at,
      }));

      if (items.length === 0) {
        console.log('[AI Scheduler] No items to refresh');
        return;
      }

      console.log(`[AI Scheduler] Refreshing ${items.length} items`);

      // 分批处理，避免一次处理太多
      const batchSize = 20;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const results = await batchProcessor.processBatch(batch);
        await persistenceService.saveResults(results.results);
        console.log(`[AI Scheduler] Batch ${Math.floor(i / batchSize) + 1} completed`);
      }

      console.log('[AI Scheduler] Full refresh completed');
    } catch (error) {
      console.error('[AI Scheduler] Full refresh failed:', error);
    }
  }

  /**
   * 获取运行状态
   */
  getStatus(): {
    isRunning: boolean;
    stats: typeof this.stats;
    config: SchedulerConfig;
  } {
    return {
      isRunning: this.isRunning,
      stats: { ...this.stats },
      config: { ...this.config },
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[AI Scheduler] Config updated:', this.config);
  }
}

// ============================================
// 手动触发函数（用于 API 调用）
// ============================================

export async function triggerImmediateProcessing(options: {
  itemIds?: string[];
  minHotScore?: number;
  limit?: number;
} = {}): Promise<{ processed: number; failed: number }> {
  console.log('[AI Manual Trigger] Starting immediate processing...');

  try {
    let items: any[] = [];

    if (options.itemIds && options.itemIds.length > 0) {
      const result = await query(
        `SELECT * FROM rss_items WHERE id = ANY($1)`,
        [options.itemIds]
      );
      items = result.rows;
    } else {
      items = await persistenceService.getUnprocessedItems({
        limit: options.limit || 20,
        minHotScore: options.minHotScore || 0,
      });
    }

    if (items.length === 0) {
      console.log('[AI Manual Trigger] No items to process');
      return { processed: 0, failed: 0 };
    }

    const results = await batchProcessor.processBatch(items);
    await persistenceService.saveResults(results.results);

    console.log(`[AI Manual Trigger] Completed: ${results.success} success, ${results.failed} failed`);

    return {
      processed: results.success,
      failed: results.failed,
    };
  } catch (error) {
    console.error('[AI Manual Trigger] Failed:', error);
    throw error;
  }
}

// 导入 query
import { query } from '../../db/connection.js';

// 导出单例
export const aiScheduler = new AIProcessingScheduler();
