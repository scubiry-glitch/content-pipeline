// v2.2 情感分析 API - Sentiment Analysis Routes
// SA-001 ~ SA-005: 情感分析增强

import { FastifyInstance } from 'fastify';
import { sentimentAnalyzer } from '../services/sentimentAnalyzer.js';

export async function sentimentRoutes(fastify: FastifyInstance): Promise<void> {
  // 分析单条文本情感 (SA-001)
  fastify.post('/analyze', async (request, reply) => {
    const { text } = request.body as { text: string };

    if (!text || typeof text !== 'string') {
      return reply.status(400).send({ error: 'Text is required' });
    }

    const result = sentimentAnalyzer.analyze(text);
    return { success: true, data: result };
  });

  // 批量分析情感 (SA-001)
  fastify.post('/batch-analyze', async (request, reply) => {
    const { items } = request.body as {
      items: Array<{ id: string; text: string; source: string }>
    };

    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'Items array is required' });
    }

    const results = await sentimentAnalyzer.batchAnalyze(items);
    return {
      success: true,
      data: Object.fromEntries(results)
    };
  });

  // 获取话题情感分析 (SA-003)
  fastify.get('/topic/:topicId', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };

    const result = await sentimentAnalyzer.analyzeTopic(topicId);
    if (!result) {
      return reply.status(404).send({ error: 'Topic sentiment not found' });
    }

    return { success: true, data: result };
  });

  // 获取市场情绪指数 MSI (SA-003)
  fastify.get('/msi', async () => {
    const result = await sentimentAnalyzer.calculateMSI();
    return { success: true, data: result };
  });

  // 获取情感统计 (前端 /stats 端点)
  fastify.get('/stats', async () => {
    const msi = await sentimentAnalyzer.calculateMSI();
    const alerts = await sentimentAnalyzer.checkAnomalies();
    return {
      msiIndex: msi.value || 50,
      trendDirection: msi.change24h > 0 ? 'up' : msi.change24h < 0 ? 'down' : 'stable',
      positive: 0,  // TODO: calculate from sentiment_analysis table
      negative: 0,
      neutral: 0,
      alerts: alerts.length
    };
  });

  // 获取情绪异常预警 (SA-004)
  fastify.get('/alerts', async () => {
    const alerts = await sentimentAnalyzer.checkAnomalies();
    return { success: true, data: alerts };
  });

  // 获取话题情感趋势 (SA-005)
  fastify.get('/trend/:topicId', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };
    const { days } = request.query as { days?: string };

    const trend = await sentimentAnalyzer.getTrend(
      topicId,
      days ? parseInt(days) : 7
    );

    return { success: true, data: trend };
  });
}
