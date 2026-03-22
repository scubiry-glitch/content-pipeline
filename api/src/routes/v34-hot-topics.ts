// v3.4 热点路由 - 热点追踪
import { FastifyInstance } from 'fastify';
import { hotTopicService } from '../services/hotTopicService.js';
import { getTopicUnificationService } from '../services/topicUnification.js';
import { authenticate } from '../middleware/auth.js';

const topicUnification = getTopicUnificationService();

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

  // 触发RSS抓取（管理接口）- 使用新的 rssCollector
  fastify.post('/crawl', { preHandler: authenticate }, async () => {
    const { collectAllFeeds, getCurrentJob } = await import('../services/rssCollector.js');

    // 检查是否已有运行中的任务
    const currentJob = getCurrentJob();
    if (currentJob && currentJob.status === 'running') {
      return { 
        message: 'RSS collection already running',
        jobId: currentJob.jobId,
        status: 'running'
      };
    }

    // 异步执行抓取
    collectAllFeeds().catch(console.error);

    return { message: 'RSS collection started', status: 'running' };
  });

  // ===== 多源热点接口 =====

  // 获取归并后的热点列表
  fastify.get('/unified', { preHandler: authenticate }, async (request) => {
    const { limit, minConfidence, hasRss, hasWeb, hasCommunity } = request.query as any;
    
    const topics = await topicUnification.getUnifiedTopics({
      limit: limit ? parseInt(limit) : 50,
      minConfidence: minConfidence ? parseFloat(minConfidence) : 0.5,
      hasRss,
      hasWeb,
      hasCommunity,
    });

    return { items: topics, total: topics.length };
  });

  // 获取跨平台验证的热点（多源确认）
  fastify.get('/cross-platform', { preHandler: authenticate }, async () => {
    const topics = await topicUnification.getUnifiedTopics({
      limit: 50,
      minConfidence: 0.6,
    });

    const crossPlatform = topics.filter(t => t.sourceCount >= 2);

    return {
      items: crossPlatform,
      total: crossPlatform.length,
      description: '这些话题在多个平台都有讨论，可信度较高',
    };
  });

  // 按来源筛选热点
  fastify.get('/by-source', { preHandler: authenticate }, async (request) => {
    const { source, limit = 20 } = request.query as any;
    
    let topics;
    switch (source) {
      case 'rss':
        topics = await topicUnification.getUnifiedTopics({ limit: parseInt(limit as string), hasRss: true });
        break;
      case 'web':
        topics = await topicUnification.getUnifiedTopics({ limit: parseInt(limit as string), hasWeb: true });
        break;
      case 'community':
        topics = await topicUnification.getUnifiedTopics({ limit: parseInt(limit as string), hasCommunity: true });
        break;
      default:
        topics = await topicUnification.getUnifiedTopics({ limit: parseInt(limit as string) });
    }

    return { items: topics, source, total: topics.length };
  });

  // 执行话题归并
  fastify.post('/unify', { preHandler: authenticate }, async () => {
    try {
      const stats = await topicUnification.unifyTopics();
      return {
        success: true,
        message: 'Topic unification completed',
        stats,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unification failed',
      };
    }
  });

  // 使用 Web Search 验证话题
  fastify.post('/:id/verify', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    
    try {
      const result = await topicUnification.verifyTopicWithSearch(id);
      return result;
    } catch (error) {
      reply.status(500);
      return {
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  });
}
