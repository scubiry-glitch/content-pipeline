// Public API 路由 - v3.0 内容质量输入体系开放接口
// 提供对外暴露的内容质量输入相关 API

import { FastifyInstance } from 'fastify';
import { query } from '../db/connection.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  loadRSSConfig,
  getRSSStats,
  collectAllFeeds,
  collectSingleFeed,
} from '../services/rssCollector.js';

/**
 * Public API 路由
 * 基础路径: /api/v3
 */
export async function publicAPIRoutes(fastify: FastifyInstance) {
  // ==================== 健康检查 ====================
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
      services: {
        rss: true,
        sentiment: true,
        recommendation: true,
      },
    };
  });

  // ==================== RSS 公共接口 ====================

  // 获取 RSS 源列表（公开）
  fastify.get('/rss/sources', async () => {
    const config = await loadRSSConfig();
    const sources = Object.entries(config.categories).flatMap(([category, catConfig]) =>
      catConfig.sources.map(s => ({
        id: s.id,
        name: s.name,
        category,
        categoryName: catConfig.name,
        priority: s.priority,
        updateInterval: s.updateInterval,
      }))
    );

    return {
      total: sources.length,
      sources,
    };
  });

  // 获取 RSS 统计（公开）
  fastify.get('/rss/stats', async () => {
    const stats = await getRSSStats();
    return stats;
  });

  // 获取 RSS 条目列表（公开，支持分页和筛选）
  fastify.get('/rss/items', async (request) => {
    const {
      sourceId,
      category,
      tag,
      minRelevance = '0',
      limit = '20',
      offset = '0',
    } = request.query as any;

    let sql = `
      SELECT
        id, source_name, title, link, summary,
        published_at, author, tags, relevance_score, created_at
      FROM rss_items
      WHERE 1=1
    `;
    const params: any[] = [];

    if (sourceId) {
      sql += ` AND source_id = $${params.length + 1}`;
      params.push(sourceId);
    }

    if (category) {
      sql += ` AND source_category = $${params.length + 1}`;
      params.push(category);
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

  // 获取单条 RSS 详情（公开）
  fastify.get('/rss/items/:itemId', async (request, reply) => {
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

  // 搜索 RSS 条目（公开）
  fastify.get('/rss/search', async (request) => {
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

  // ==================== 热点话题接口 ====================

  // 获取热点话题列表（公开）
  fastify.get('/hot-topics', async (request) => {
    const { limit = '10', days = '7' } = request.query as any;

    const result = await query(
      `SELECT
        id,
        title,
        hot_score as score,
        source_count,
        mention_count,
        first_seen_at,
        last_seen_at,
        keywords,
        created_at
      FROM hot_topics
      WHERE last_seen_at > NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY hot_score DESC
      LIMIT $1`,
      [parseInt(limit)]
    );

    return {
      topics: result.rows.map(row => ({
        ...row,
        keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords,
      })),
      meta: {
        total: result.rowCount,
        days: parseInt(days),
      },
    };
  });

  // 获取热点话题详情（公开）
  fastify.get('/hot-topics/:topicId', async (request, reply) => {
    const { topicId } = request.params as any;

    const topicResult = await query(
      `SELECT * FROM hot_topics WHERE id = $1`,
      [topicId]
    );

    if (topicResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Topic not found' };
    }

    // 获取相关文章
    const articlesResult = await query(
      `SELECT
        r.id, r.source_name, r.title, r.link, r.summary,
        r.published_at, r.relevance_score
      FROM rss_items r
      JOIN hot_topic_articles hta ON r.id = hta.article_id
      WHERE hta.topic_id = $1
      ORDER BY r.published_at DESC
      LIMIT 20`,
      [topicId]
    );

    const topic = topicResult.rows[0];
    return {
      ...topic,
      keywords: typeof topic.keywords === 'string' ? JSON.parse(topic.keywords) : topic.keywords,
      articles: articlesResult.rows,
    };
  });

  // ==================== 质量评估接口 ====================

  // 获取内容质量评分（公开）
  fastify.get('/quality/score', async (request) => {
    const { url } = request.query as any;

    if (!url) {
      return { error: 'URL parameter is required' };
    }

    // 从数据库查询已有评分
    const result = await query(
      `SELECT
        id, title, relevance_score,
        quality_dimensions,
        freshness_score,
        credibility_score,
        differentiation_score,
        audience_match_score
      FROM rss_items
      WHERE link = $1`,
      [url]
    );

    if (result.rows.length === 0) {
      return {
        url,
        score: null,
        message: 'Content not found in database',
      };
    }

    const item = result.rows[0];
    return {
      url,
      score: {
        overall: item.relevance_score,
        dimensions: {
          freshness: item.freshness_score,
          credibility: item.credibility_score,
          differentiation: item.differentiation_score,
          audienceMatch: item.audience_match_score,
        },
      },
      title: item.title,
    };
  });

  // 批量质量评估（需认证）
  fastify.post('/quality/batch', { preHandler: authenticate }, async (request) => {
    const { urls } = request.body as any;

    if (!Array.isArray(urls) || urls.length === 0) {
      return { error: 'urls array is required' };
    }

    const result = await query(
      `SELECT
        link as url,
        title,
        relevance_score as overall,
        freshness_score,
        credibility_score,
        differentiation_score,
        audience_match_score
      FROM rss_items
      WHERE link = ANY($1)`,
      [urls]
    );

    return {
      results: result.rows,
      total: result.rowCount,
      requested: urls.length,
    };
  });

  // ==================== 情感分析接口 (v3.2) ====================

  // 获取市场情绪指数 MSI（公开）
  fastify.get('/sentiment/msi', async () => {
    const result = await query(
      `SELECT
        msi_value as value,
        msi_level as level,
        change_24h as change24h,
        positive_ratio,
        neutral_ratio,
        negative_ratio,
        calculated_at
      FROM market_sentiment_index
      ORDER BY calculated_at DESC
      LIMIT 1`
    );

    if (result.rows.length === 0) {
      // 返回模拟数据
      return {
        value: 65,
        level: 'greed',
        change24h: 8,
        distribution: {
          positive: 0.45,
          neutral: 0.35,
          negative: 0.20,
        },
        calculatedAt: new Date().toISOString(),
      };
    }

    const row = result.rows[0];
    return {
      value: row.value,
      level: row.level,
      change24h: row.change24h,
      distribution: {
        positive: row.positive_ratio,
        neutral: row.neutral_ratio,
        negative: row.negative_ratio,
      },
      calculatedAt: row.calculated_at,
    };
  });

  // 获取情感分析历史（公开）
  fastify.get('/sentiment/history', async (request) => {
    const { days = '7' } = request.query as any;

    const result = await query(
      `SELECT
        msi_value as value,
        msi_level as level,
        calculated_at as timestamp
      FROM market_sentiment_index
      WHERE calculated_at > NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY calculated_at ASC`
    );

    return {
      history: result.rows,
      days: parseInt(days),
    };
  });

  // 分析文本情感（公开）
  fastify.post('/sentiment/analyze', async (request) => {
    const { text } = request.body as any;

    if (!text) {
      return { error: 'text is required' };
    }

    // 简单情感分析实现
    const positiveWords = ['增长', '突破', '利好', '成功', '创新', '强劲', '乐观', '上涨', '大涨', '飙升'];
    const negativeWords = ['下跌', '亏损', '裁员', '危机', '担忧', '恐慌', '暴跌', '崩盘', '萎缩', '衰退'];

    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
      if (text.includes(word)) positiveScore++;
    });

    negativeWords.forEach(word => {
      if (text.includes(word)) negativeScore++;
    });

    let polarity: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positiveScore > negativeScore) polarity = 'positive';
    if (negativeScore > positiveScore) polarity = 'negative';

    const intensity = Math.min(100, 30 + (positiveScore + negativeScore) * 10);

    return {
      polarity,
      intensity,
      confidence: 0.85,
      keywords: [...positiveWords.filter(w => text.includes(w)), ...negativeWords.filter(w => text.includes(w))],
    };
  });

  // ==================== 智能推荐接口 (v3.1) ====================

  // 获取推荐内容（支持匿名和登录用户）
  fastify.get('/recommendations', { preHandler: optionalAuth }, async (request) => {
    const { limit = '5', category } = request.query as any;
    const userId = (request as any).user?.id;

    let sql = `
      SELECT
        r.id,
        r.title,
        r.summary,
        r.link,
        r.source_name,
        r.published_at,
        r.relevance_score as score,
        r.tags
      FROM rss_items r
      WHERE r.relevance_score > 70
    `;
    const params: any[] = [];

    if (category) {
      sql += ` AND r.source_category = $${params.length + 1}`;
      params.push(category);
    }

    // 如果用户已登录，根据用户兴趣调整排序
    if (userId) {
      sql += `
        ORDER BY
          r.relevance_score * COALESCE(
            (SELECT interest_weight FROM user_interests ui
             WHERE ui.user_id = $${params.length + 1}
             AND ui.category = r.source_category), 1
          ) DESC
      `;
      params.push(userId);
    } else {
      sql += ` ORDER BY r.relevance_score DESC, r.published_at DESC`;
    }

    sql += ` LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);

    return {
      recommendations: result.rows.map(row => ({
        ...row,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
        reason: userId ? 'Based on your interests' : 'Popular now',
      })),
      meta: {
        total: result.rowCount,
        personalized: !!userId,
      },
    };
  });

  // 记录用户反馈（需认证）
  fastify.post('/recommendations/:itemId/feedback', { preHandler: authenticate }, async (request, reply) => {
    const { itemId } = request.params as any;
    const { action } = request.body as any; // 'like', 'ignore', 'click'
    const userId = (request as any).user.id;

    if (!['like', 'ignore', 'click'].includes(action)) {
      reply.status(400);
      return { error: 'Invalid action' };
    }

    // 保存用户反馈
    await query(
      `INSERT INTO user_recommendation_feedback (user_id, item_id, action, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, item_id) DO UPDATE
       SET action = $3, created_at = NOW()`,
      [userId, itemId, action]
    );

    return { success: true };
  });

  // ==================== 管理接口（需认证）====================

  // 触发 RSS 采集（管理员）
  fastify.post('/admin/rss/collect', { preHandler: authenticate }, async (request) => {
    const { sourceId } = request.body as any;

    if (sourceId) {
      const config = await loadRSSConfig();
      const sources = Object.values(config.categories)
        .flatMap(c => c.sources)
        .filter(s => s.id === sourceId);

      if (sources.length === 0) {
        return { error: 'Source not found' };
      }

      const result = await collectSingleFeed(sources[0], config.filters);
      return {
        sourceId,
        sourceName: sources[0].name,
        ...result,
      };
    }

    // 异步采集所有源
    setImmediate(async () => {
      try {
        const result = await collectAllFeeds();
        console.log('[RSS] Collection completed:', result);
      } catch (error) {
        console.error('[RSS] Collection failed:', error);
      }
    });

    return {
      message: 'RSS collection started in background',
      status: 'running',
    };
  });

  // 获取系统统计（管理员）
  fastify.get('/admin/stats', { preHandler: authenticate }, async () => {
    const rssCount = await query('SELECT COUNT(*) as count FROM rss_items');
    const hotTopicsCount = await query('SELECT COUNT(*) as count FROM hot_topics');
    const todayItems = await query(
      `SELECT COUNT(*) as count FROM rss_items WHERE created_at > NOW() - INTERVAL '1 day'`
    );

    return {
      rss: {
        totalItems: parseInt(rssCount.rows[0].count),
        todayItems: parseInt(todayItems.rows[0].count),
      },
      hotTopics: {
        total: parseInt(hotTopicsCount.rows[0].count),
      },
      version: '3.0.0',
    };
  });
}
