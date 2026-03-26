// ============================================
// v6.2 Assets AI 批量处理 - 定时任务调度器
// 自动触发 Assets AI 分析
// ============================================

import { assetsBatchProcessor, AssetsAIBatchProcessor } from './batchProcessor.js';
import { persistenceService } from './persistence.js';
import { query } from '../../db/connection.js';

// ============================================
// 调度器配置
// ============================================
export interface SchedulerConfig {
  // 处理间隔（分钟）
  processingIntervalMinutes: number;
  // 每批处理数量
  batchSize: number;
  // 是否启用向量化
  enableVectorization: boolean;
  // 质量阈值（高于此值才生成任务推荐）
  qualityThreshold: number;
  // 最大重试次数
  maxRetries: number;
  // 重试间隔（分钟）
  retryIntervalMinutes: number;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  processingIntervalMinutes: 30, // 每30分钟处理一次
  batchSize: 10,
  enableVectorization: true,
  qualityThreshold: 70,
  maxRetries: 3,
  retryIntervalMinutes: 60, // 失败后1小时重试
};

// ============================================
// Assets AI 处理调度器
// ============================================
export class AssetsAIProcessingScheduler {
  private config: SchedulerConfig;
  private processor: AssetsAIBatchProcessor;
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.processor = assetsBatchProcessor;
    // 更新 processor 配置
    this.processor.updateConfig({
      batchSize: this.config.batchSize,
      qualityThreshold: this.config.qualityThreshold,
      enableVectorization: this.config.enableVectorization,
    });
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      console.log('[AssetsAIScheduler] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[AssetsAIScheduler] Started, interval: ${this.config.processingIntervalMinutes} minutes`);

    // 立即执行一次
    this.processPendingAssets();

    // 设置定时任务
    const intervalMs = this.config.processingIntervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      this.processPendingAssets();
    }, intervalMs);

    // 设置重试任务
    const retryIntervalMs = this.config.retryIntervalMinutes * 60 * 1000;
    this.retryTimer = setInterval(() => {
      this.retryFailedAssets();
    }, retryIntervalMs);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }

    console.log('[AssetsAIScheduler] Stopped');
  }

  /**
   * 处理待处理的 Assets
   */
  private async processPendingAssets(): Promise<void> {
    try {
      console.log('[AssetsAIScheduler] Checking for pending assets...');

      // 获取待处理的 assets
      const assets = await persistenceService.getUnprocessedAssets({
        limit: this.config.batchSize,
      });

      if (assets.length === 0) {
        console.log('[AssetsAIScheduler] No pending assets to process');
        return;
      }

      console.log(`[AssetsAIScheduler] Found ${assets.length} pending assets, starting processing...`);

      // 执行批量处理
      const result = await this.processor.processBatch(assets);

      console.log(`[AssetsAIScheduler] Processing completed: ${result.success} success, ${result.failed} failed`);

      // 如果有失败的，记录日志
      if (result.failed > 0) {
        console.warn(`[AssetsAIScheduler] ${result.failed} assets failed to process, will retry later`);
      }
    } catch (error) {
      console.error('[AssetsAIScheduler] Failed to process pending assets:', error);
    }
  }

  /**
   * 重试失败的 Assets
   */
  private async retryFailedAssets(): Promise<void> {
    try {
      console.log('[AssetsAIScheduler] Checking for failed assets to retry...');

      // 获取处理失败的 assets
      const result = await query(
        `SELECT 
          id, title, file_url as "fileUrl", file_type as "fileType", file_size as "fileSize",
          source, author, published_at as "publishedAt", created_at as "createdAt",
          metadata
        FROM assets
        WHERE ai_processing_status = 'failed'
          AND (is_deleted = false OR is_deleted IS NULL)
          AND created_at > NOW() - INTERVAL '7 days'
        LIMIT $1`,
        [this.config.batchSize]
      );

      if (result.rows.length === 0) {
        console.log('[AssetsAIScheduler] No failed assets to retry');
        return;
      }

      const assets = result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        fileUrl: row.fileUrl,
        fileType: row.fileType,
        fileSize: row.fileSize,
        source: row.source,
        author: row.author,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        metadata: row.metadata || {},
      }));

      console.log(`[AssetsAIScheduler] Retrying ${assets.length} failed assets...`);

      // 重置状态为 pending
      for (const asset of assets) {
        await query(
          `UPDATE assets SET ai_processing_status = 'pending' WHERE id = $1`,
          [asset.id]
        );
      }

      // 执行批量处理
      const processResult = await this.processor.processBatch(assets);

      console.log(`[AssetsAIScheduler] Retry completed: ${processResult.success} success, ${processResult.failed} failed`);
    } catch (error) {
      console.error('[AssetsAIScheduler] Failed to retry failed assets:', error);
    }
  }

  /**
   * 手动触发处理
   */
  async triggerManualProcessing(assetIds?: string[]): Promise<{ jobId: string; message: string }> {
    const jobId = `assets-ai-manual-${Date.now()}`;

    try {
      let assets: any[] = [];

      if (assetIds && assetIds.length > 0) {
        // 指定 IDs
        const result = await query(
          `SELECT * FROM assets WHERE id = ANY($1)`,
          [assetIds]
        );
        assets = result.rows;
      } else {
        // 获取所有未处理的 assets
        assets = await persistenceService.getUnprocessedAssets({
          limit: this.config.batchSize * 2,
        });
      }

      if (assets.length === 0) {
        return { jobId, message: 'No assets to process' };
      }

      // 异步处理
      this.processor.processBatch(assets).then((result) => {
        console.log(`[AssetsAIScheduler] Manual processing completed: ${result.success} success, ${result.failed} failed`);
      });

      return {
        jobId,
        message: `Started processing ${assets.length} assets`,
      };
    } catch (error) {
      console.error('[AssetsAIScheduler] Manual processing failed:', error);
      throw error;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    const wasRunning = this.isRunning;
    
    // 停止当前调度器
    if (wasRunning) {
      this.stop();
    }

    // 更新配置
    this.config = { ...this.config, ...config };
    
    // 更新 processor 配置
    this.processor.updateConfig({
      batchSize: this.config.batchSize,
      qualityThreshold: this.config.qualityThreshold,
      enableVectorization: this.config.enableVectorization,
    });

    console.log('[AssetsAIScheduler] Configuration updated:', this.config);

    // 如果之前是运行状态，重新启动
    if (wasRunning) {
      this.start();
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * 获取运行状态
   */
  getStatus(): { isRunning: boolean; config: SchedulerConfig } {
    return {
      isRunning: this.isRunning,
      config: this.getConfig(),
    };
  }
}

// ============================================
// 导出单例
// ============================================
export const assetsAIScheduler = new AssetsAIProcessingScheduler();
