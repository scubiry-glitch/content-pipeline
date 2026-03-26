// ============================================
// v6.2 Assets AI 批量处理 - API 路由
// ============================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { assetsBatchProcessor, AssetsAIBatchProcessor } from '../services/assets-ai/batchProcessor.js';
import { persistenceService } from '../services/assets-ai/persistence.js';
import { embeddingService } from '../services/assets-ai/embedding.js';
import { query } from '../db/connection.js';

// ============================================
// 路由注册
// ============================================
export async function assetsAIProcessingRoutes(fastify: FastifyInstance) {
  // 1. 触发 Assets 批量处理
  fastify.post('/batch-process', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as {
      assetIds?: string[];
      priority?: 'high' | 'normal' | 'low';
      force?: boolean;
      includeEmbedding?: boolean;
      config?: {
        batchSize?: number;
        qualityThreshold?: number;
      };
    };

    try {
      let assets: any[] = [];

      // 获取待处理 assets
      if (body.assetIds && body.assetIds.length > 0) {
        // 指定 IDs
        const result = await query(
          `SELECT * FROM assets WHERE id = ANY($1)`,
          [body.assetIds]
        );
        assets = result.rows;
      } else {
        // 自动获取未处理 assets
        assets = await persistenceService.getUnprocessedAssets({
          limit: 20,
        });
      }

      if (assets.length === 0) {
        return { message: 'No assets to process', processed: 0 };
      }

      // 更新配置
      if (body.config) {
        assetsBatchProcessor.updateConfig({
          ...body.config,
          enableVectorization: body.includeEmbedding !== false,
        });
      }

      // 异步处理
      const jobId = `assets-ai-batch-${Date.now()}`;
      processAssetsBatchAsync(assets, jobId, body.force || false);

      return {
        jobId,
        status: 'processing',
        totalAssets: assets.length,
        message: `Started processing ${assets.length} assets`,
      };
    } catch (error) {
      console.error('[Assets AI Processing] Batch process failed:', error);
      reply.status(500);
      return { error: 'Failed to start batch processing', message: (error as Error).message };
    }
  });

  // 2. 获取 Asset AI 分析结果
  fastify.get('/assets/:id/ai-analysis', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await persistenceService.getAnalysisResult(id);

      if (!result) {
        reply.status(404);
        return { error: 'Analysis result not found', code: 'NOT_FOUND' };
      }

      return result;
    } catch (error) {
      console.error('[Assets AI Processing] Get analysis failed:', error);
      reply.status(500);
      return { error: 'Failed to get analysis result', message: (error as Error).message };
    }
  });

  // 3. 语义检索
  fastify.post('/semantic-search', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as {
      query: string;
      themeId?: string;
      minQualityScore?: number;
      limit?: number;
      threshold?: number;
    };

    if (!body.query) {
      reply.status(400);
      return { error: 'Query is required' };
    }

    try {
      // 生成查询的 embedding
      const queryEmbedding = await embeddingService.embed(body.query);

      // 执行语义搜索
      const results = await query(
        `SELECT 
          a.id as asset_id,
          a.title,
          a.source,
          a.ai_quality_score,
          1 - (a.ai_document_embedding <=> $1::vector) AS similarity
        FROM assets a
        WHERE a.ai_document_embedding IS NOT NULL
          AND 1 - (a.ai_document_embedding <=> $1::vector) > $2
          AND ($3::varchar IS NULL OR a.ai_theme_id = $3)
          AND ($4::int IS NULL OR a.ai_quality_score >= $4)
        ORDER BY a.ai_document_embedding <=> $1::vector
        LIMIT $5`,
        [
          queryEmbedding,
          body.threshold || 0.7,
          body.themeId || null,
          body.minQualityScore || null,
          body.limit || 10,
        ]
      );

      return {
        items: results.rows.map((row) => ({
          assetId: row.asset_id,
          title: row.title,
          source: row.source,
          qualityScore: row.ai_quality_score,
          relevanceScore: parseFloat(row.similarity),
        })),
        total: results.rows.length,
        query: body.query,
      };
    } catch (error) {
      console.error('[Assets AI Processing] Semantic search failed:', error);
      reply.status(500);
      return { error: 'Failed to perform semantic search', message: (error as Error).message };
    }
  });

  // 4. 查找相似素材
  fastify.get('/assets/:id/similar', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const queryParams = request.query as { limit?: string };
    const limit = parseInt(queryParams.limit || '5');

    try {
      const similarAssets = await persistenceService.findSimilarAssets(id, limit);

      return {
        assetId: id,
        similarAssets: similarAssets.map((a) => ({
          assetId: a.assetId,
          title: a.title,
          similarity: a.relevanceScore,
        })),
      };
    } catch (error) {
      console.error('[Assets AI Processing] Find similar failed:', error);
      reply.status(500);
      return { error: 'Failed to find similar assets', message: (error as Error).message };
    }
  });

  // 5. 获取去重结果
  fastify.get('/assets/:id/duplicates', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await persistenceService.getDuplicateResult(id);

      if (!result) {
        reply.status(404);
        return { error: 'Duplicate check result not found', code: 'NOT_FOUND' };
      }

      return {
        assetId: id,
        ...result,
      };
    } catch (error) {
      console.error('[Assets AI Processing] Get duplicates failed:', error);
      reply.status(500);
      return { error: 'Failed to get duplicate result', message: (error as Error).message };
    }
  });

  // 6. 查询分析结果列表
  fastify.get('/analysis-results', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as {
      minQualityScore?: string;
      maxQualityScore?: string;
      themeId?: string;
      hasTaskRecommendation?: string;
      analyzedAfter?: string;
      analyzedBefore?: string;
      sortBy?: 'quality' | 'time';
      limit?: string;
      offset?: string;
    };

    try {
      let sql = `
        SELECT 
          a.id as asset_id,
          a.title,
          a.source,
          a.file_type,
          a.ai_quality_score,
          a.ai_theme_id,
          a.ai_analyzed_at,
          CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_task_recommendation
        FROM assets a
        LEFT JOIN asset_ai_analysis aaa ON a.id = aaa.asset_id
        LEFT JOIN ai_task_recommendations t ON a.id = t.source_asset_id AND t.source_type = 'asset'
        WHERE a.ai_analyzed_at IS NOT NULL
      `;
      const params: any[] = [];

      // 质量分数筛选
      if (queryParams.minQualityScore) {
        params.push(parseInt(queryParams.minQualityScore));
        sql += ` AND a.ai_quality_score >= $${params.length}`;
      }
      if (queryParams.maxQualityScore) {
        params.push(parseInt(queryParams.maxQualityScore));
        sql += ` AND a.ai_quality_score <= $${params.length}`;
      }

      // 主题筛选
      if (queryParams.themeId) {
        params.push(queryParams.themeId);
        sql += ` AND a.ai_theme_id = $${params.length}`;
      }

      // 时间范围筛选
      if (queryParams.analyzedAfter) {
        params.push(queryParams.analyzedAfter);
        sql += ` AND a.ai_analyzed_at >= $${params.length}`;
      }
      if (queryParams.analyzedBefore) {
        params.push(queryParams.analyzedBefore);
        sql += ` AND a.ai_analyzed_at <= $${params.length}`;
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
          sql += ` ORDER BY a.ai_quality_score DESC NULLS LAST`;
          break;
        case 'time':
        default:
          sql += ` ORDER BY a.ai_analyzed_at DESC`;
      }

      // 分页
      const limit = parseInt(queryParams.limit || '20');
      const offset = parseInt(queryParams.offset || '0');
      params.push(limit, offset);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const result = await query(sql, params);

      // 获取总数
      const countResult = await query(
        `SELECT COUNT(*) FROM assets WHERE ai_analyzed_at IS NOT NULL`,
        []
      );

      return {
        items: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
      };
    } catch (error) {
      console.error('[Assets AI Processing] Query analysis results failed:', error);
      return { error: 'Failed to query analysis results', message: (error as Error).message };
    }
  });

  // 7. 获取任务推荐列表（复用 v6.1 接口，扩展 source_type）
  fastify.get('/task-recommendations', { preHandler: authenticate }, async (request) => {
    const queryParams = request.query as {
      sourceType?: 'asset' | 'rss' | 'all';
      status?: 'pending' | 'accepted' | 'rejected' | 'all';
      priority?: 'high' | 'medium' | 'low';
      limit?: string;
      offset?: string;
    };

    try {
      let sql = `
        SELECT 
          tr.*,
          COALESCE(a.title, r.title) as source_title,
          COALESCE(a.source, r.source_name) as source_name,
          COALESCE(aa.quality_score, ra.quality_score) as quality_score
        FROM ai_task_recommendations tr
        LEFT JOIN assets a ON tr.source_asset_id = a.id
        LEFT JOIN rss_items r ON tr.rss_item_id = r.id
        LEFT JOIN asset_ai_analysis aa ON a.id = aa.asset_id
        LEFT JOIN rss_item_ai_analysis ra ON r.id = ra.rss_item_id
        WHERE 1=1
      `;
      const params: any[] = [];

      // 来源类型筛选
      if (queryParams.sourceType && queryParams.sourceType !== 'all') {
        params.push(queryParams.sourceType);
        sql += ` AND tr.source_type = $${params.length}`;
      }

      // 状态筛选
      if (queryParams.status && queryParams.status !== 'all') {
        params.push(queryParams.status);
        sql += ` AND tr.status = $${params.length}`;
      }

      // 排序
      sql += ` ORDER BY tr.created_at DESC`;

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
      console.error('[Assets AI Processing] Query task recommendations failed:', error);
      return { error: 'Failed to query task recommendations', message: (error as Error).message };
    }
  });

  // 8. 获取 AI 处理统计
  fastify.get('/stats', { preHandler: authenticate }, async () => {
    try {
      const stats = await persistenceService.getProcessingStats();
      return stats;
    } catch (error) {
      console.error('[Assets AI Processing] Get stats failed:', error);
      return { error: 'Failed to get stats', message: (error as Error).message };
    }
  });

  // 9. 获取主题分布
  fastify.get('/stats/themes', { preHandler: authenticate }, async () => {
    try {
      const result = await query(
        `SELECT 
          ai_theme_id as theme_id,
          COUNT(*) as count,
          AVG(ai_quality_score) as avg_quality
        FROM assets
        WHERE ai_theme_id IS NOT NULL
        GROUP BY ai_theme_id
        ORDER BY count DESC`
      );

      return { items: result.rows };
    } catch (error) {
      console.error('[Assets AI Processing] Get theme stats failed:', error);
      return { error: 'Failed to get theme stats', message: (error as Error).message };
    }
  });

  // 10. 获取质量分布
  fastify.get('/stats/quality', { preHandler: authenticate }, async () => {
    try {
      const result = await query(
        `SELECT 
          CASE 
            WHEN ai_quality_score >= 80 THEN 'excellent'
            WHEN ai_quality_score >= 60 THEN 'good'
            WHEN ai_quality_score >= 40 THEN 'average'
            ELSE 'poor'
          END as quality_range,
          COUNT(*) as count
        FROM assets
        WHERE ai_quality_score IS NOT NULL
        GROUP BY 1
        ORDER BY 1`
      );

      return { items: result.rows };
    } catch (error) {
      console.error('[Assets AI Processing] Get quality stats failed:', error);
      return { error: 'Failed to get quality stats', message: (error as Error).message };
    }
  });
}

// ============================================
// 后台处理函数
// ============================================
async function processAssetsBatchAsync(
  assets: any[],
  jobId: string,
  force: boolean
): Promise<void> {
  console.log(`[Assets AI Batch Job ${jobId}] Started processing ${assets.length} assets`);

  try {
    const results = await assetsBatchProcessor.processBatch(assets);

    console.log(
      `[Assets AI Batch Job ${jobId}] Completed: ${results.success} success, ${results.failed} failed`
    );
  } catch (error) {
    console.error(`[Assets AI Batch Job ${jobId}] Failed:`, error);
  }
}
