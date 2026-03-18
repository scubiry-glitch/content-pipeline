// RSS 路由 - RSS Routes v2.0
// FR-031 ~ FR-033: RSS 自动采集管理 + 进度追踪

import { FastifyInstance } from 'fastify';
import {
  collectAllFeeds,
  collectSingleFeed,
  loadRSSConfig,
  getRSSStats,
  saveRSSConfig,
  getCurrentJob,
  getJobHistory,
  getRecentHotTopics,
  RSSSource,
} from '../services/rssCollector.js';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

// 内存存储RSS源（实际项目应使用数据库）
let rssSources: any[] = [];

export async function rssRoutes(fastify: FastifyInstance) {
  // ===== RSS 源管理 =====

  // 获取 RSS 源列表（适配前端格式）
  fastify.get('/rss-sources', { preHandler: authenticate }, async (request) => {
    const config = await loadRSSConfig();

    // 从数据库获取每个源的最后抓取时间
    const fetchLogs = await query(`
      SELECT source_id, MAX(fetched_at) as last_fetched
      FROM rss_fetch_logs
      GROUP BY source_id
    `);

    const lastFetchMap = new Map(
      fetchLogs.rows.map((r: any) => [r.source_id, r.last_fetched])
    );

    const sources = Object.entries(config.categories).flatMap(([category, catConfig]: [string, any]) =>
      catConfig.sources.map((s: any) => ({
        ...s,
        category,
        categoryName: catConfig.name,
        isActive: s.enabled !== false && s.status === 'active',
        lastCrawledAt: lastFetchMap.get(s.id) || s.lastFetched || null,
      }))
    );
    return { items: sources };
  });

  // 创建 RSS 源
  fastify.post('/rss-sources', { preHandler: authenticate }, async (request) => {
    const data = request.body as any;
    const newSource = {
      id: `rss-${Date.now()}`,
      ...data,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    rssSources.push(newSource);
    return newSource;
  });

  // 更新 RSS 源
  fastify.put('/rss-sources/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const data = request.body as any;
    const index = rssSources.findIndex((s) => s.id === id);
    if (index === -1) {
      reply.status(404);
      return { error: 'Source not found' };
    }
    rssSources[index] = { ...rssSources[index], ...data, updatedAt: new Date().toISOString() };
    return rssSources[index];
  });

  // 删除 RSS 源
  fastify.delete('/rss-sources/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const index = rssSources.findIndex((s) => s.id === id);
    if (index === -1) {
      reply.status(404);
      return { error: 'Source not found' };
    }
    rssSources.splice(index, 1);
    return { success: true };
  });

  // ===== 采集触发 =====

  // 手动触发采集（带进度追踪）
  fastify.post('/rss-sources/crawl', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.body as any;

    // 检查是否有正在运行的任务
    const currentJob = getCurrentJob();
    if (currentJob && currentJob.status === 'running') {
      return {
        success: false,
        message: '已有采集任务正在运行',
        jobId: currentJob.jobId,
        status: 'running',
      };
    }

    // 不管是单个还是全部，都异步执行，立即返回
    if (id) {
      // 采集单个源
      setImmediate(async () => {
        try {
          const config = await loadRSSConfig();
          const sources = Object.values(config.categories)
            .flatMap((c: any) => c.sources)
            .filter((s: any) => s.id === id);

          if (sources.length > 0) {
            const result = await collectSingleFeed(sources[0], config.filters);
            console.log(`[RSS] Single source ${sources[0].name} collection completed:`, result);
          }
        } catch (error) {
          console.error('[RSS] Single source collection failed:', error);
        }
      });

      return {
        success: true,
        message: `RSS source ${id} collection started`,
        status: 'running',
      };
    } else {
      // 采集所有源
      setImmediate(async () => {
        try {
          const result = await collectAllFeeds();
          console.log('[RSS] All feeds collection completed:', result);
        } catch (error) {
          console.error('[RSS] Collection failed:', error);
        }
      });

      return {
        success: true,
        message: 'RSS collection started in background',
        status: 'running',
      };
    }
  });

  // ===== 进度追踪 =====

  // 获取当前采集进度
  fastify.get('/rss-sources/progress', { preHandler: authenticate }, async () => {
    const job = getCurrentJob();
    
    if (!job) {
      return {
        hasRunningJob: false,
        progress: null,
      };
    }

    // 计算总体进度百分比
    const percent = job.totalSources > 0 
      ? Math.round(((job.processedSources + (job.currentSource ? 0.5 : 0)) / job.totalSources) * 100)
      : 0;

    return {
      hasRunningJob: job.status === 'running',
      progress: {
        jobId: job.jobId,
        status: job.status,
        startedAt: job.startedAt,
        percent,
        currentSource: job.currentSource,
        processedSources: job.processedSources,
        totalSources: job.totalSources,
        totalFetched: job.totalFetched,
        totalImported: job.totalImported,
        duplicates: job.duplicates,
        errors: job.errors.length,
        sourceProgress: Array.from(job.sourceProgress.values()).map(s => ({
          sourceId: s.sourceId,
          sourceName: s.sourceName,
          status: s.status,
          fetched: s.fetched,
          imported: s.imported,
          duplicates: s.duplicates,
          error: s.error,
        })),
      },
    };
  });

  // 获取历史任务
  fastify.get('/rss-sources/history', { preHandler: authenticate }, async (request) => {
    const { limit = '10' } = request.query as any;
    const history = getJobHistory(parseInt(limit));
    
    return {
      items: history.map(job => ({
        jobId: job.jobId,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        totalSources: job.totalSources,
        totalFetched: job.totalFetched,
        totalImported: job.totalImported,
        duplicates: job.duplicates,
        errors: job.errors.length,
      })),
    };
  });

  // ===== 统计数据 =====

  // 获取 RSS 采集统计
  fastify.get('/stats', { preHandler: authenticate }, async () => {
    const stats = await getRSSStats();
    return stats;
  });

  // ===== RSS 条目管理 =====

  // 获取 RSS 条目列表
  fastify.get('/items', { preHandler: authenticate }, async (request) => {
    const {
      sourceId,
      tag,
      minRelevance = '0',
      limit = '20',
      offset = '0',
    } = request.query as any;

    let sql = `
      SELECT
        id, source_name, title, link, summary,
        published_at, author, tags, relevance_score, 
        hot_score, trend, sentiment, created_at
      FROM rss_items
      WHERE 1=1
    `;
    const params: any[] = [];

    if (sourceId) {
      sql += ` AND source_id = $${params.length + 1}`;
      params.push(sourceId);
    }

    if (tag) {
      sql += ` AND tags @> $${params.length + 1}::jsonb`;
      params.push(JSON.stringify([tag]));
    }

    if (parseFloat(minRelevance) > 0) {
      sql += ` AND relevance_score >= $${params.length + 1}`;
      params.push(parseFloat(minRelevance));
    }

    sql += ` ORDER BY published_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    return {
      items: result.rows.map(row => ({
        ...row,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rowCount,
      },
    };
  });

  // 获取 RSS 条目详情
  fastify.get('/items/:itemId', { preHandler: authenticate }, async (request, reply) => {
    const { itemId } = request.params as any;

    const result = await query(
      `SELECT * FROM rss_items WHERE id = $1`,
      [itemId]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Item not found' };
    }

    const item = result.rows[0];
    return {
      ...item,
      tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags,
      categories: typeof item.categories === 'string' ? JSON.parse(item.categories) : item.categories,
    };
  });

  // 导入 RSS 条目到素材库
  fastify.post('/items/:itemId/import', { preHandler: authenticate }, async (request, reply) => {
    const { itemId } = request.params as any;

    const result = await query(
      `SELECT * FROM rss_items WHERE id = $1`,
      [itemId]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Item not found' };
    }

    const item = result.rows[0];

    // 检查是否已导入
    const existingResult = await query(
      `SELECT id FROM assets WHERE id = $1`,
      [`rss-${itemId}`]
    );

    if (existingResult.rows.length > 0) {
      return {
        success: true,
        message: 'Already imported',
        assetId: `rss-${itemId}`,
      };
    }

    // 导入到素材库
    await query(
      `INSERT INTO assets (
        id, title, content, content_type, source, source_url,
        tags, auto_tags, quality_score, embedding, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [
        `rss-${itemId}`,
        item.title,
        item.content,
        'text/rss',
        item.source_name,
        item.link,
        item.tags,
        item.tags,
        item.relevance_score,
        item.embedding,
      ]
    );

    return {
      success: true,
      assetId: `rss-${itemId}`,
    };
  });

  // 搜索 RSS 条目
  fastify.get('/search', { preHandler: authenticate }, async (request) => {
    const { q, limit = '10' } = request.query as any;

    if (!q) {
      return { items: [] };
    }

    const result = await query(
      `SELECT
        id, source_name, title, link, summary,
        published_at, tags, relevance_score,
        similarity(title, $1) as title_sim,
        similarity(summary, $1) as content_sim
      FROM rss_items
      WHERE title % $1 OR summary % $1
      ORDER BY GREATEST(similarity(title, $1), similarity(summary, $1)) DESC
      LIMIT $2`,
      [q, parseInt(limit)]
    );

    return {
      items: result.rows.map(row => ({
        ...row,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
        similarity: Math.max(row.title_sim, row.content_sim),
      })),
    };
  });

  // ===== 热点话题 =====
  // 注意: /hot-topics 路由已移至 v34-hot-topics.ts，避免重复定义

  // ===== 兼容旧版路由 =====

  // 获取 RSS 源列表（旧版）
  fastify.get('/sources', { preHandler: authenticate }, async (request) => {
    const config = await loadRSSConfig();
    const sources = Object.entries(config.categories).flatMap(([category, catConfig]) =>
      catConfig.sources.map(s => ({
        ...s,
        category,
        categoryName: catConfig.name,
      }))
    );

    return { sources };
  });

  // 手动触发全量采集（旧版）
  fastify.post('/collect', { preHandler: authenticate }, async (request, reply) => {
    const { sourceId } = request.body as any;

    if (sourceId) {
      const config = await loadRSSConfig();
      const sources = Object.values(config.categories)
        .flatMap(c => c.sources)
        .filter(s => s.id === sourceId);

      if (sources.length === 0) {
        reply.status(404);
        return { error: 'Source not found' };
      }

      const result = await collectSingleFeed(sources[0], config.filters);
      return {
        sourceId,
        sourceName: sources[0].name,
        ...result,
      };
    }

    // 检查是否有正在运行的任务
    const currentJob = getCurrentJob();
    if (currentJob && currentJob.status === 'running') {
      return {
        message: 'RSS collection already running',
        status: 'running',
        jobId: currentJob.jobId,
      };
    }

    // 异步执行
    setImmediate(async () => {
      try {
        await collectAllFeeds();
      } catch (error) {
        console.error('[RSS] Collection failed:', error);
      }
    });

    return {
      message: 'RSS collection started in background',
      status: 'running',
    };
  });
}
