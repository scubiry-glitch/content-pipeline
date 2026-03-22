// 社区话题路由 - Community Topics Routes
// API endpoints for community topic crawling and management

import { FastifyInstance } from 'fastify';
import { getCommunityCrawlerService } from '../services/communityCrawler.js';
import { getTopicUnificationService } from '../services/topicUnification.js';

const communityCrawler = getCommunityCrawlerService();
const topicUnification = getTopicUnificationService();

// ===== Schema Definitions =====

const communityTopicSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    platform: { type: 'string' },
    platformId: { type: 'string' },
    platformUrl: { type: 'string' },
    hotScore: { type: 'number' },
    platformRank: { type: 'number' },
    engagement: {
      type: 'object',
      properties: {
        views: { type: 'number' },
        likes: { type: 'number' },
        comments: { type: 'number' },
        shares: { type: 'number' },
      },
    },
    contentType: { type: 'string', enum: ['text', 'image', 'video', 'mixed'] },
    keyOpinions: { type: 'array', items: { type: 'string' } },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'mixed'] },
    tags: { type: 'array', items: { type: 'string' } },
    category: { type: 'string' },
    publishedAt: { type: 'string', format: 'date-time' },
    crawledAt: { type: 'string', format: 'date-time' },
  },
};

const unifiedTopicSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    canonicalTitle: { type: 'string' },
    hotScore: { type: 'number' },
    confidence: { type: 'number' },
    hasRssSource: { type: 'boolean' },
    hasWebSource: { type: 'boolean' },
    hasCommunitySource: { type: 'boolean' },
    sourceCount: { type: 'number' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          platform: { type: 'string' },
          url: { type: 'string' },
          hotScore: { type: 'number' },
        },
      },
    },
    keyOpinions: { type: 'array', items: { type: 'string' } },
    crossPlatformSentiment: { type: 'string' },
    firstSeenAt: { type: 'string', format: 'date-time' },
  },
};

// ===== Routes =====

export default async function communityTopicRoutes(fastify: FastifyInstance) {
  
  // ===== 平台管理接口 =====

  // GET /api/v1/quality/community/platforms
  fastify.get('/platforms', {
    schema: {
      description: '获取支持的社区平台列表',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            platforms: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  enabled: { type: 'boolean' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    return {
      platforms: [
        { id: 'xiaohongshu', name: '小红书', enabled: true, description: '生活方式社区，热搜榜、话题榜' },
        { id: 'weibo', name: '微博', enabled: true, description: '社交媒体，热搜榜' },
        { id: 'zhihu', name: '知乎', enabled: true, description: '知识问答社区，热榜' },
        { id: 'bilibili', name: 'B站', enabled: true, description: '视频社区，热门榜单' },
        { id: 'xueqiu', name: '雪球', enabled: true, description: '投资者社区，热帖' },
        { id: 'douyin', name: '抖音', enabled: false, description: '短视频平台，热榜（需要第三方API）' },
        { id: 'jike', name: '即刻', enabled: false, description: '兴趣社区（需要API权限）' },
      ],
    };
  });

  // ===== 话题抓取接口 =====

  // POST /api/v1/quality/community/crawl
  fastify.post('/crawl', {
    schema: {
      description: '触发社区话题抓取',
      tags: ['Community Topics'],
      body: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: '指定平台，不传则抓取所有' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  platform: { type: 'string' },
                  topicCount: { type: 'number' },
                  errors: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { platform } = request.body as { platform?: string };

    try {
      let results;
      if (platform) {
        const result = await communityCrawler.crawlPlatform(platform);
        results = [result];
      } else {
        results = await communityCrawler.crawlAllPlatforms();
      }

      return {
        success: true,
        results: results.map(r => ({
          platform: r.platform,
          topicCount: r.topics.length,
          errors: r.errors,
        })),
      };
    } catch (error) {
      reply.status(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Crawl failed',
      };
    }
  });

  // GET /api/v1/quality/community/topics
  fastify.get('/topics', {
    schema: {
      description: '获取社区话题列表',
      tags: ['Community Topics'],
      querystring: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: '按平台筛选' },
          limit: { type: 'number', default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: communityTopicSchema },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const { platform, limit = 50 } = request.query as { platform?: string; limit?: number };
    
    const topics = await communityCrawler.getRecentTopics(platform, limit);
    
    return {
      items: topics,
      total: topics.length,
    };
  });

  // GET /api/v1/quality/community/topics/by-platform
  fastify.get('/topics/by-platform', {
    schema: {
      description: '按平台分组获取话题',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            platforms: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: communityTopicSchema,
              },
            },
          },
        },
      },
    },
  }, async () => {
    const platforms = ['xiaohongshu', 'weibo', 'zhihu', 'bilibili', 'xueqiu'];
    const result: Record<string, any[]> = {};

    for (const platform of platforms) {
      result[platform] = await communityCrawler.getRecentTopics(platform, 10);
    }

    return { platforms: result };
  });

  // GET /api/v1/quality/community/topics/:id
  fastify.get('/topics/:id', {
    schema: {
      description: '获取话题详情',
      tags: ['Community Topics'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: { type: 'object', properties: { item: communityTopicSchema } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // 从数据库查询
    const result = await query(
      `SELECT * FROM community_topics WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Topic not found' };
    }

    const row = result.rows[0];
    return {
      item: {
        id: row.id,
        title: row.title,
        platform: row.platform,
        platformId: row.platform_id,
        platformUrl: row.platform_url,
        hotScore: row.hot_score,
        platformRank: row.platform_rank,
        engagement: {
          views: row.view_count,
          likes: row.like_count,
          comments: row.comment_count,
          shares: row.share_count,
        },
        contentType: row.content_type,
        keyOpinions: row.key_opinions || [],
        sentiment: row.sentiment,
        tags: row.tags || [],
        category: row.category,
        publishedAt: row.published_at,
        crawledAt: row.crawled_at,
      },
    };
  });

  // ===== 平台特定接口 =====

  // GET /api/v1/quality/community/xiaohongshu/hot
  fastify.get('/xiaohongshu/hot', {
    schema: {
      description: '获取小红书热搜',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: communityTopicSchema },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => {
    const topics = await communityCrawler.getRecentTopics('xiaohongshu', 20);
    return {
      items: topics,
      updatedAt: new Date().toISOString(),
    };
  });

  // GET /api/v1/quality/community/weibo/hot
  fastify.get('/weibo/hot', {
    schema: {
      description: '获取微博热搜',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: communityTopicSchema },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => {
    const topics = await communityCrawler.getRecentTopics('weibo', 20);
    return {
      items: topics,
      updatedAt: new Date().toISOString(),
    };
  });

  // GET /api/v1/quality/community/zhihu/hot
  fastify.get('/zhihu/hot', {
    schema: {
      description: '获取知乎热榜',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: communityTopicSchema },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => {
    const topics = await communityCrawler.getRecentTopics('zhihu', 20);
    return {
      items: topics,
      updatedAt: new Date().toISOString(),
    };
  });

  // ===== 话题归并接口 =====

  // POST /api/v1/quality/community/unify
  fastify.post('/unify', {
    schema: {
      description: '执行话题归并（将各源话题合并）',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            stats: {
              type: 'object',
              properties: {
                unified: { type: 'number' },
                fromRss: { type: 'number' },
                fromWeb: { type: 'number' },
                fromCommunity: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    try {
      const stats = await topicUnification.unifyTopics();
      return {
        success: true,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unification failed',
      };
    }
  });

  // GET /api/v1/quality/community/unified
  fastify.get('/unified', {
    schema: {
      description: '获取归并后的热点话题',
      tags: ['Community Topics'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
          minConfidence: { type: 'number', default: 0.5 },
          hasRss: { type: 'boolean' },
          hasWeb: { type: 'boolean' },
          hasCommunity: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: unifiedTopicSchema },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const { limit, minConfidence, hasRss, hasWeb, hasCommunity } = request.query as any;
    
    const topics = await topicUnification.getUnifiedTopics({
      limit: limit ? parseInt(limit) : 50,
      minConfidence: minConfidence ? parseFloat(minConfidence) : 0.5,
      hasRss,
      hasWeb,
      hasCommunity,
    });

    return {
      items: topics,
      total: topics.length,
    };
  });

  // GET /api/v1/quality/community/unified/cross-platform
  fastify.get('/unified/cross-platform', {
    schema: {
      description: '获取跨平台验证的热点（多源确认）',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: unifiedTopicSchema },
            description: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    // 获取至少有两个来源的话题
    const topics = await topicUnification.getUnifiedTopics({
      limit: 50,
      minConfidence: 0.6,
    });

    const crossPlatform = topics.filter(t => t.sourceCount >= 2);

    return {
      items: crossPlatform,
      description: '这些话题在多个平台都有讨论，可信度较高',
    };
  });

  // POST /api/v1/quality/community/verify/:id
  fastify.post('/verify/:id', {
    schema: {
      description: '使用 Web Search 验证话题真实性',
      tags: ['Community Topics'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            verified: { type: 'boolean' },
            searchResults: { type: 'number' },
            newsCoverage: { type: 'number' },
            adjustedScore: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await topicUnification.verifyTopicWithSearch(id);
    return result;
  });

  // ===== 统计接口 =====

  // GET /api/v1/quality/community/stats
  fastify.get('/stats', {
    schema: {
      description: '获取社区话题统计',
      tags: ['Community Topics'],
      response: {
        200: {
          type: 'object',
          properties: {
            totalTopics: { type: 'number' },
            todayTopics: { type: 'number' },
            byPlatform: { type: 'object' },
          },
        },
      },
    },
  }, async () => {
    const stats = await communityCrawler.getStats();
    return stats;
  });
}

// 导入 query
import { query } from '../db/connection.js';
