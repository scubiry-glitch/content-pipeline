// AI 批量处理 API 路由
// v6.1 RSS 内容智能分析接口

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import {
  batchProcessor,
  persistenceService,
  BatchProcessingConfig,
} from '../services/ai/batchProcessor.js';
import { feedbackService, promptIterationService } from '../services/ai/feedback.js';
import { alertManager, metricsCollector } from '../services/ai/monitoring.js';
import { query } from '../db/connection.js';

// ============================================
// 路由注册
// ============================================

export async function aiProcessingRoutes(fastify: FastifyInstance) {
  // 1. 触发批量处理
  fastify.post('/batch-process', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as {
      itemIds?: string[];
      priority?: 'high' | 'normal' | 'low';
      force?: boolean;
      config?: Partial<BatchProcessingConfig>;
    };

    try {
      let items: any[] = [];

      // 获取待处理 items
      if (body.itemIds && body.itemIds.length > 0) {
        // 指定 IDs
        const result = await query(
          `SELECT * FROM rss_items WHERE id = ANY($1)`,
          [body.itemIds]
        );
        items = result.rows;
      } else {
        // 自动获取未处理 items
        const minHotScore = body.priority === 'high' ? 60 : body.priority === 'normal' ? 40 : 0;
        items = await persistenceService.getUnprocessedItems({
          limit: 20,
          minHotScore,
        });
      }

      if (items.length === 0) {
        return { message: 'No items to process', processed: 0 };
      }

      // 更新配置
      if (body.config) {
        batchProcessor.updateConfig(body.config);
      }

      // 异步处理（不等待完成）
      const jobId = `ai-batch-${Date.now()}`;
      
      // 启动后台处理
      processBatchAsync(items, jobId, body.force || false);

      return {
        jobId,
        status: 'processing',
        totalItems: items.length,
        message: `Started processing ${items.length} items`,
      };
    } catch (error) {
      console.error('[AI Processing] Batch process failed:', error);
      reply.status(500);
      return { error: 'Failed to start batch processing', message: (error as Error).message };
    }
  });

  // 2. 获取 AI 分析结果
  fastify.get('/rss-items/:id/ai-analysis', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await persistenceService.getAnalysisResult(id);

      if (!result) {
        reply.status(404);
        return { error: 'Analysis result not found', code: 'NOT_FOUND' };
      }

      return result;
    } catch (error) {
      console.error('[AI Processing] Get analysis failed:', error);
      reply.status(500);
      return { error: 'Failed to get analysis result', message: (error as Error).message };
    }
  });

  // 3. 查询分析结果列表
  fastify.get('/analysis-results', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as {
      minQualityScore?: string;
      maxQualityScore?: string;
      category?: string;
      sentiment?: string;
      hasTaskRecommendation?: string;
      analyzedAfter?: string;
      analyzedBefore?: string;
      sortBy?: 'quality' | 'time' | 'hot_score';
      limit?: string;
      offset?: string;
    };

    try {
      let sql = `
        SELECT 
          r.id as rss_item_id,
          r.title,
          r.source_name,
          r.hot_score,
          r.published_at,
          a.quality_score,
          a.primary_category,
          a.sentiment,
          a.analyzed_at,
          CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_task_recommendation
        FROM rss_items r
        JOIN rss_item_ai_analysis a ON r.id = a.rss_item_id
        LEFT JOIN ai_task_recommendations t ON r.id = t.rss_item_id
        WHERE 1=1
      `;
      const params: any[] = [];

      // 质量分数筛选
      if (queryParams.minQualityScore) {
        params.push(parseInt(queryParams.minQualityScore));
        sql += ` AND a.quality_score >= $${params.length}`;
      }
      if (queryParams.maxQualityScore) {
        params.push(parseInt(queryParams.maxQualityScore));
        sql += ` AND a.quality_score <= $${params.length}`;
      }

      // 分类筛选
      if (queryParams.category) {
        params.push(queryParams.category);
        sql += ` AND a.primary_category = $${params.length}`;
      }

      // 情感筛选
      if (queryParams.sentiment) {
        params.push(queryParams.sentiment);
        sql += ` AND a.sentiment = $${params.length}`;
      }

      // 时间范围筛选
      if (queryParams.analyzedAfter) {
        params.push(queryParams.analyzedAfter);
        sql += ` AND a.analyzed_at >= $${params.length}`;
      }
      if (queryParams.analyzedBefore) {
        params.push(queryParams.analyzedBefore);
        sql += ` AND a.analyzed_at <= $${params.length}`;
      }

      // 任务推荐筛选
      if (queryParams.hasTaskRecommendation === 'true') {
        sql += ` AND t.id IS NOT NULL`;
      } else if (queryParams.hasTaskRecommendation === 'false') {
        sql += ` AND t.id IS NULL`;
      }

      // 排序
      const sortBy = queryParams.sortBy || 'time';
      switch (sortBy) {
        case 'quality':
          sql += ` ORDER BY a.quality_score DESC, r.hot_score DESC`;
          break;
        case 'hot_score':
          sql += ` ORDER BY r.hot_score DESC, a.quality_score DESC`;
          break;
        case 'time':
        default:
          sql += ` ORDER BY a.analyzed_at DESC`;
      }

      // 分页
      const limit = parseInt(queryParams.limit || '20');
      const offset = parseInt(queryParams.offset || '0');
      params.push(limit, offset);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const result = await query(sql, params);

      // 获取总数
      const countResult = await query(
        `SELECT COUNT(*) FROM rss_item_ai_analysis`,
        []
      );

      return {
        items: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
      };
    } catch (error) {
      console.error('[AI Processing] Query analysis results failed:', error);
      return { error: 'Failed to query analysis results', message: (error as Error).message };
    }
  });

  // 4. 获取任务推荐列表
  fastify.get('/task-recommendations', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as {
      status?: 'pending' | 'accepted' | 'rejected' | 'all';
      priority?: 'high' | 'medium' | 'low';
      category?: string;
      limit?: string;
      offset?: string;
    };

    try {
      let sql = `
        SELECT 
          tr.*,
          r.title as rss_title,
          r.source_name,
          r.hot_score,
          a.quality_score,
          a.primary_category,
          a.sentiment_score
        FROM ai_task_recommendations tr
        JOIN rss_items r ON tr.rss_item_id = r.id
        JOIN rss_item_ai_analysis a ON r.id = a.rss_item_id
        WHERE 1=1
      `;
      const params: any[] = [];

      // 状态筛选
      if (queryParams.status && queryParams.status !== 'all') {
        params.push(queryParams.status);
        sql += ` AND tr.status = $${params.length}`;
      }

      // 分类筛选
      if (queryParams.category) {
        params.push(queryParams.category);
        sql += ` AND a.primary_category = $${params.length}`;
      }

      // 排序
      sql += ` ORDER BY a.quality_score DESC, r.hot_score DESC`;

      // 分页
      const limit = parseInt(queryParams.limit || '20');
      const offset = parseInt(queryParams.offset || '0');
      params.push(limit, offset);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const result = await query(sql, params);

      return {
        items: result.rows,
        limit,
        offset,
      };
    } catch (error) {
      console.error('[AI Processing] Query task recommendations failed:', error);
      return { error: 'Failed to query task recommendations', message: (error as Error).message };
    }
  });

  // 5. 接受任务推荐
  fastify.post('/task-recommendations/:id/accept', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { taskId?: string; note?: string };
    const userId = (request as any).user?.id || 'anonymous';

    try {
      await query(
        `UPDATE ai_task_recommendations SET
          status = 'accepted',
          accepted_by = $2,
          accepted_at = NOW(),
          created_task_id = $3,
          updated_at = NOW()
        WHERE id = $1`,
        [id, userId, body.taskId || null]
      );

      return { success: true, message: 'Recommendation accepted' };
    } catch (error) {
      console.error('[AI Processing] Accept recommendation failed:', error);
      reply.status(500);
      return { error: 'Failed to accept recommendation', message: (error as Error).message };
    }
  });

  // 6. 拒绝任务推荐
  fastify.post('/task-recommendations/:id/reject', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reason: string };

    if (!body.reason) {
      reply.status(400);
      return { error: 'Rejection reason is required' };
    }

    try {
      await query(
        `UPDATE ai_task_recommendations SET
          status = 'rejected',
          rejection_reason = $2,
          updated_at = NOW()
        WHERE id = $1`,
        [id, body.reason]
      );

      return { success: true, message: 'Recommendation rejected' };
    } catch (error) {
      console.error('[AI Processing] Reject recommendation failed:', error);
      reply.status(500);
      return { error: 'Failed to reject recommendation', message: (error as Error).message };
    }
  });

  // 7. 获取 AI 处理统计
  fastify.get('/stats', { preHandler: authenticate }, async () => {
    try {
      const stats = await persistenceService.getProcessingStats();
      return stats;
    } catch (error) {
      console.error('[AI Processing] Get stats failed:', error);
      return { error: 'Failed to get stats', message: (error as Error).message };
    }
  });

  // 8. 获取分类分布
  fastify.get('/stats/categories', { preHandler: authenticate }, async () => {
    try {
      const result = await query(
        `SELECT 
          primary_category as category,
          COUNT(*) as count,
          AVG(quality_score) as avg_quality
        FROM rss_item_ai_analysis
        GROUP BY primary_category
        ORDER BY count DESC`
      );

      return { items: result.rows };
    } catch (error) {
      console.error('[AI Processing] Get category stats failed:', error);
      return { error: 'Failed to get category stats', message: (error as Error).message };
    }
  });

  // 9. 获取情感分布
  fastify.get('/stats/sentiments', { preHandler: authenticate }, async () => {
    try {
      const result = await query(
        `SELECT 
          sentiment,
          COUNT(*) as count,
          AVG(sentiment_score) as avg_score
        FROM rss_item_ai_analysis
        GROUP BY sentiment
        ORDER BY count DESC`
      );

      return { items: result.rows };
    } catch (error) {
      console.error('[AI Processing] Get sentiment stats failed:', error);
      return { error: 'Failed to get sentiment stats', message: (error as Error).message };
    }
  });

  // ============================================
  // v6.1 Phase 5: 反馈与监控 API
  // ============================================

  // 10. 提交反馈
  fastify.post('/feedback', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as {
      rssItemId: string;
      feedbackType: string;
      aiResult: any;
      userFeedback: any;
    };
    const userId = (request as any).user?.id || 'anonymous';

    try {
      await feedbackService.submitFeedback({
        rssItemId: body.rssItemId,
        feedbackType: body.feedbackType as any,
        aiResult: body.aiResult,
        userFeedback: body.userFeedback,
        userId,
      });

      return { success: true, message: 'Feedback submitted' };
    } catch (error) {
      console.error('[AI Processing] Submit feedback failed:', error);
      reply.status(500);
      return { error: 'Failed to submit feedback', message: (error as Error).message };
    }
  });

  // 11. 获取反馈统计
  fastify.get('/feedback/stats', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as { days?: string };
    const days = parseInt(queryParams.days || '30');

    try {
      const stats = await feedbackService.getFeedbackStats(days);
      return stats;
    } catch (error) {
      console.error('[AI Processing] Get feedback stats failed:', error);
      return { error: 'Failed to get feedback stats', message: (error as Error).message };
    }
  });

  // 12. 获取系统指标（监控用）
  fastify.get('/monitoring/metrics', { preHandler: authenticate }, async () => {
    try {
      const metrics = await metricsCollector.collectMetrics();
      return metrics;
    } catch (error) {
      console.error('[AI Processing] Get metrics failed:', error);
      return { error: 'Failed to get metrics', message: (error as Error).message };
    }
  });

  // 13. 获取处理报告
  fastify.get('/monitoring/report', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as { hours?: string };
    const hours = parseInt(queryParams.hours || '24');

    try {
      const report = await metricsCollector.generateReport(hours);
      return report;
    } catch (error) {
      console.error('[AI Processing] Get report failed:', error);
      return { error: 'Failed to get report', message: (error as Error).message };
    }
  });

  // 14. 获取告警列表
  fastify.get('/monitoring/alerts', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as { limit?: string };
    const limit = parseInt(queryParams.limit || '20');

    try {
      const alerts = await alertManager.getRecentAlerts(limit);
      return { items: alerts };
    } catch (error) {
      console.error('[AI Processing] Get alerts failed:', error);
      return { error: 'Failed to get alerts', message: (error as Error).message };
    }
  });

  // 15. 确认告警
  fastify.post('/monitoring/alerts/:id/acknowledge', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user?.id || 'anonymous';

    try {
      await query(
        `UPDATE ai_alerts SET
          acknowledged = true,
          acknowledged_by = $2,
          acknowledged_at = NOW()
        WHERE id = $1`,
        [id, userId]
      );

      return { success: true, message: 'Alert acknowledged' };
    } catch (error) {
      console.error('[AI Processing] Acknowledge alert failed:', error);
      reply.status(500);
      return { error: 'Failed to acknowledge alert', message: (error as Error).message };
    }
  });
}

// ============================================
// 后台处理函数
// ============================================

async function processBatchAsync(items: any[], jobId: string, force: boolean): Promise<void> {
  console.log(`[AI Batch Job ${jobId}] Started processing ${items.length} items`);

  try {
    const results = await batchProcessor.processBatch(items);
    
    // 保存结果
    await persistenceService.saveResults(results.results);

    console.log(`[AI Batch Job ${jobId}] Completed: ${results.success} success, ${results.failed} failed`);
  } catch (error) {
    console.error(`[AI Batch Job ${jobId}] Failed:`, error);
  }
}
