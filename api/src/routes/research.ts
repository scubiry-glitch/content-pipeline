// 深度研究路由 - Deep Research Routes
// v2.1: 深度研究自动采集配置

import { FastifyInstance } from 'fastify';
import {
  collectResearchContent,
  getResearchConfig,
  saveResearchConfig,
  ResearchConfig,
} from '../services/deepResearchCollector.js';
import { authenticate } from '../middleware/auth.js';

export async function researchRoutes(fastify: FastifyInstance) {
  // 获取研究配置
  fastify.get('/:taskId/config', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const config = await getResearchConfig(taskId);

    if (!config) {
      // 返回默认配置
      return {
        autoCollect: true,
        sources: ['web', 'rss'],
        maxResults: 20,
        minCredibility: 0.5,
        keywords: [],
        excludeKeywords: [],
        timeRange: '30d',
      };
    }

    return config;
  });

  // 保存研究配置
  fastify.post('/:taskId/config', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const config = request.body as ResearchConfig;

    await saveResearchConfig(taskId, config);
    return { success: true };
  });

  // 执行自动采集
  fastify.post('/:taskId/collect', {
    preHandler: authenticate
  }, async (request, reply) => {
    const { taskId } = request.params as any;

    // 获取任务信息
    const { query } = await import('../db/connection.js');
    const taskResult = await query(
      `SELECT outline, research_config FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Task not found' };
    }

    const task = taskResult.rows[0];
    const outline = task.outline || {};

    // 获取配置
    let config: ResearchConfig;
    if (task.research_config) {
      config = typeof task.research_config === 'string'
        ? JSON.parse(task.research_config)
        : task.research_config;
    } else {
      config = {
        autoCollect: true,
        sources: ['web', 'rss'],
        maxResults: 20,
        minCredibility: 0.5,
        keywords: [],
        excludeKeywords: [],
        timeRange: '30d',
      };
    }

    if (!config.autoCollect) {
      return {
        message: 'Auto collection is disabled',
        totalCollected: 0,
      };
    }

    // 异步执行采集
    setImmediate(async () => {
      try {
        const result = await collectResearchContent(taskId, outline, config);
        console.log(`[Research] Collection completed for ${taskId}:`, result);

        // 更新任务状态
        await query(
          `UPDATE tasks SET
            research_data = COALESCE(research_data, '{}'::jsonb) || $1::jsonb,
            updated_at = NOW()
          WHERE id = $2`,
          [JSON.stringify({ collectedAt: new Date(), totalItems: result.totalCollected }), taskId]
        );
      } catch (error) {
        console.error(`[Research] Collection failed for ${taskId}:`, error);
      }
    });

    return {
      message: 'Research collection started in background',
      taskId,
      config,
    };
  });

  // 实时 Tavily 搜索预览（不保存到数据库）
  fastify.get('/:taskId/preview-search', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { limit = '5' } = request.query as any;

    try {
      // 获取任务主题
      const { query } = await import('../db/connection.js');
      const taskResult = await query(
        `SELECT topic, outline FROM tasks WHERE id = $1`,
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        reply.status(404);
        return { error: 'Task not found' };
      }

      const task = taskResult.rows[0];
      const searchQuery = task.topic || 'latest news';

      // 调用 Tavily 搜索
      const { getWebSearchService } = await import('../services/webSearch.js');
      const webSearch = getWebSearchService();
      const results = await webSearch.search({
        query: searchQuery,
        maxResults: parseInt(limit),
        includeContent: false,
      });

      return {
        items: results.map((r, idx) => ({
          id: `web-${idx}`,
          title: r.title,
          source: r.source,
          url: r.url,
          relevance: r.relevance,
          credibility: r.credibility,
        })),
        query: searchQuery,
        total: results.length,
      };
    } catch (error: any) {
      console.error('[Research] Preview search failed:', error);
      reply.status(500);
      return { error: 'Search failed', message: error.message };
    }
  });

  // 获取采集结果
  fastify.get('/:taskId/collected', { preHandler: authenticate }, async (request) => {
    const { taskId } = request.params as any;
    const { limit = '20', offset = '0' } = request.query as any;

    const { query } = await import('../db/connection.js');

    const result = await query(
      `SELECT
        id, type, url, title, credibility, created_at
      FROM research_annotations
      WHERE task_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [taskId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM research_annotations WHERE task_id = $1`,
      [taskId]
    );

    return {
      items: result.rows.map(row => ({
        ...row,
        credibility: typeof row.credibility === 'string'
          ? JSON.parse(row.credibility)
          : row.credibility,
      })),
      total: parseInt(countResult.rows[0]?.count || '0'),
    };
  });
}
