// v3.4 热点路由 - 热点追踪
import { FastifyInstance } from 'fastify';
import { hotTopicService } from '../services/hotTopicService.js';
import { authenticate } from '../middleware/auth.js';

export async function v34HotTopicRoutes(fastify: FastifyInstance) {
  // 获取热点列表
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { trend, limit } = request.query as any;

    const hotTopics = await hotTopicService.getHotTopics({
      trend,
      limit: limit ? parseInt(limit) : 20
    });

    return { items: hotTopics };
  });

  // 获取热点详情
  fastify.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const hotTopic = await hotTopicService.getHotTopic(id);

    if (!hotTopic) {
      reply.status(404);
      return { error: 'Hot topic not found' };
    }

    return hotTopic;
  });

  // 关注热点
  fastify.post('/:id/follow', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const userId = (request as any).user?.id || 'anonymous';

    const hotTopic = await hotTopicService.getHotTopic(id);
    if (!hotTopic) {
      reply.status(404);
      return { error: 'Hot topic not found' };
    }

    await hotTopicService.followTopic(userId, id);
    return { success: true, following: true };
  });

  // 取消关注
  fastify.post('/:id/unfollow', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const userId = (request as any).user?.id || 'anonymous';

    await hotTopicService.unfollowTopic(userId, id);
    return { success: true, following: false };
  });

  // 获取趋势数据
  fastify.get('/:id/trend', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { days } = request.query as any;

    const hotTopic = await hotTopicService.getHotTopic(id);
    if (!hotTopic) {
      reply.status(404);
      return { error: 'Hot topic not found' };
    }

    const trendData = await hotTopicService.getTrendData(id, days ? parseInt(days) : 7);
    return { items: trendData };
  });

  // 触发RSS抓取（管理接口）
  fastify.post('/crawl', { preHandler: authenticate }, async () => {
    const { crawlRSSFeeds } = await import('../services/rssCrawler.js');

    // 异步执行抓取
    crawlRSSFeeds().catch(console.error);

    return { message: 'RSS crawling started' };
  });
}
