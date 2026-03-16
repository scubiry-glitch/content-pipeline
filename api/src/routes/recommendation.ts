// 推荐路由 - Recommendation Routes
// FR-028 ~ FR-030: 智能推荐 API

import { FastifyInstance } from 'fastify';
import {
  getRecommendations,
  recordRecommendationFeedback,
  getRecommendationStats,
  RecommendationRequest,
} from '../services/recommendation.js';
import { authenticate } from '../middleware/auth.js';

export async function recommendationRoutes(fastify: FastifyInstance) {
  // 获取智能推荐
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { type, context, limit = '5' } = request.query as any;

    if (!type || !['topic', 'material', 'expert'].includes(type)) {
      return {
        error: 'Invalid type. Must be one of: topic, material, expert',
      };
    }

    const req: RecommendationRequest = {
      type,
      context,
      limit: parseInt(limit),
    };

    const recommendations = await getRecommendations(req);

    return {
      type,
      context,
      count: recommendations.length,
      recommendations,
    };
  });

  // 获取综合推荐（所有类型）
  fastify.get('/all', { preHandler: authenticate }, async (request) => {
    const { context, limit = '3' } = request.query as any;
    const limitPerType = parseInt(limit);

    const [topics, materials, experts] = await Promise.all([
      getRecommendations({ type: 'topic', context, limit: limitPerType }),
      getRecommendations({ type: 'material', context, limit: limitPerType }),
      getRecommendations({ type: 'expert', context, limit: 4 }),
    ]);

    return {
      context,
      topics: {
        title: '推荐选题',
        items: topics,
      },
      materials: {
        title: '推荐素材',
        items: materials,
      },
      experts: {
        title: '推荐专家',
        items: experts,
      },
    };
  });

  // 记录推荐反馈
  fastify.post('/feedback', { preHandler: authenticate }, async (request, reply) => {
    const { recommendationId, action, metadata } = request.body as any;
    const userId = (request as any).user?.id || 'anonymous';

    if (!recommendationId || !action) {
      reply.status(400);
      return { error: 'recommendationId and action are required' };
    }

    await recordRecommendationFeedback(recommendationId, userId, action, metadata);

    return { success: true };
  });

  // 获取推荐统计
  fastify.get('/stats', { preHandler: authenticate }, async () => {
    const stats = await getRecommendationStats();
    return stats;
  });
}
