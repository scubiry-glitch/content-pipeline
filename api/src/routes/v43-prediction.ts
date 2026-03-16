// v4.3 内容表现预测路由
import { FastifyInstance } from 'fastify';
import {
  predictionService,
  scheduleService,
  historicalAnalysisService
} from '../services/predictionService.js';
import { authenticate } from '../middleware/auth.js';

export async function v43PredictionRoutes(fastify: FastifyInstance) {
  // ============ 传播潜力评估 ============

  // 生成预测
  fastify.post('/performance', { preHandler: authenticate }, async (request, reply) => {
    const {
      draftId,
      content,
      title,
      contentType,
      features
    } = request.body as any;

    if (!draftId || !content || !title || !contentType) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, content, title, contentType' };
    }

    const prediction = await predictionService.predictPerformance(
      draftId,
      content,
      title,
      contentType,
      features || {}
    );

    reply.status(201);
    return prediction;
  });

  // 获取预测结果
  fastify.get('/performance/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const prediction = await predictionService.getPredictionById(id);

    if (!prediction) {
      reply.status(404);
      return { error: 'Prediction not found' };
    }

    return prediction;
  });

  // 获取文稿的所有预测
  fastify.get('/performance', { preHandler: authenticate }, async (request) => {
    const { draftId } = request.query as { draftId: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const predictions = await predictionService.getPredictionsByDraft(draftId);
    return { items: predictions };
  });

  // ============ 最佳发布时间 ============

  // 获取时间推荐
  fastify.post('/schedule', { preHandler: authenticate }, async (request, reply) => {
    const { draftId, content, title, contentType, features } = request.body as any;

    if (!draftId || !content || !title || !contentType) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, content, title, contentType' };
    }

    const prediction = await predictionService.predictPerformance(
      draftId,
      content,
      title,
      contentType,
      features || {}
    );

    return {
      draftId,
      recommendedTimes: prediction.recommendedTimes,
      overallScore: prediction.overallScore,
      confidence: prediction.confidence
    };
  });

  // ============ 平台适配度 ============

  // 分析平台适配度
  fastify.post('/platforms', { preHandler: authenticate }, async (request, reply) => {
    const { draftId, content, features } = request.body as any;

    if (!draftId || !content) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, content' };
    }

    const platformFits = await predictionService.analyzePlatformFit(
      draftId,
      content,
      features || {}
    );

    return { items: platformFits };
  });

  // ============ 风险检测 ============

  // 检测风险
  fastify.post('/risks', { preHandler: authenticate }, async (request, reply) => {
    const { draftId, content, title, contentType, features } = request.body as any;

    if (!draftId || !content || !title || !contentType) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, content, title, contentType' };
    }

    const prediction = await predictionService.predictPerformance(
      draftId,
      content,
      title,
      contentType,
      features || {}
    );

    return {
      draftId,
      riskLevel: prediction.riskLevel,
      warnings: prediction.riskWarnings,
      overallScore: prediction.overallScore
    };
  });

  // ============ 预约发布 ============

  // 预约发布
  fastify.post('/schedule/book', { preHandler: authenticate }, async (request, reply) => {
    const { draftId, platform, scheduledTime, predictionId } = request.body as any;

    if (!draftId || !platform || !scheduledTime) {
      reply.status(400);
      return { error: 'Missing required fields: draftId, platform, scheduledTime' };
    }

    const schedule = await scheduleService.schedulePublish(
      draftId,
      platform,
      new Date(scheduledTime),
      predictionId
    );

    reply.status(201);
    return schedule;
  });

  // 获取文稿的预约
  fastify.get('/schedule', { preHandler: authenticate }, async (request) => {
    const { draftId } = request.query as { draftId: string };

    if (!draftId) {
      return { error: 'Missing required query parameter: draftId' };
    }

    const schedules = await scheduleService.getSchedulesByDraft(draftId);
    return { items: schedules };
  });

  // 取消预约
  fastify.delete('/schedule/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cancelled = await scheduleService.cancelSchedule(id);

    if (!cancelled) {
      reply.status(404);
      return { error: 'Schedule not found or already processed' };
    }

    reply.status(204);
    return;
  });

  // ============ 历史数据分析 ============

  // 分析同类内容表现
  fastify.get('/history/similar', { preHandler: authenticate }, async (request) => {
    const { contentType, topicCategory } = request.query as {
      contentType: string;
      topicCategory?: string;
    };

    if (!contentType) {
      return { error: 'Missing required query parameter: contentType' };
    }

    const analysis = await historicalAnalysisService.analyzeSimilarContent(
      contentType,
      topicCategory
    );

    return analysis;
  });

  // 记录内容表现
  fastify.post('/history/record', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.contentType || !data.actualViews) {
      reply.status(400);
      return { error: 'Missing required fields: contentType, actualViews' };
    }

    await historicalAnalysisService.recordPerformance(data);

    reply.status(201);
    return { success: true };
  });
}
