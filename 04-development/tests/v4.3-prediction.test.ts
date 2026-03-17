/**
 * v4.3 内容表现预测 - 测试用例
 * 总计: 32个测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  predictionService,
  scheduleService,
  historicalAnalysisService
} from '../api/src/services/predictionService';

describe('v4.3 内容表现预测测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. 传播潜力评估 (10个)', () => {
    it('TC-PRED-001: 应能生成内容表现预测', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '新能源汽车政策解读内容...',
        '新能源政策深度解读',
        'article',
        {
          titleLength: 20,
          wordCount: 1500,
          imageCount: 3,
          hasHotTopic: true,
          hotTopicScore: 85,
          contentDepth: 80,
          freshness: 90,
          originality: 85,
          professionalism: 75
        }
      );

      expect(result).toBeDefined();
      expect(result.draftId).toBe('draft-1');
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('TC-PRED-002: 预测应包含阅读量预估', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '内容...',
        '标题',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.predictedViews).toBeGreaterThan(0);
      expect(result.predictedViewsRange).toHaveProperty('min');
      expect(result.predictedViewsRange).toHaveProperty('max');
    });

    it('TC-PRED-003: 预测应包含互动量预估', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '内容...',
        '标题',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.predictedEngagement).toBeGreaterThan(0);
      expect(result.predictedShares).toBeGreaterThan(0);
      expect(result.predictedSaves).toBeGreaterThan(0);
    });

    it('TC-PRED-004: 预测应包含置信度', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '内容...',
        '标题',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: true, hotTopicScore: 80, contentDepth: 75, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('TC-PRED-005: 热点内容应获得更高分数', async () => {
      const withHot = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: true, hotTopicScore: 90, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      const withoutHot = await predictionService.predictPerformance(
        'draft-2', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(withHot.overallScore).toBeGreaterThan(withoutHot.overallScore);
    });

    it('TC-PRED-006: 深度内容应获得更高分数', async () => {
      const deepContent = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 2000, imageCount: 5, hasHotTopic: false, contentDepth: 90, freshness: 80, originality: 75, professionalism: 80 }
      );

      const shallowContent = await predictionService.predictPerformance(
        'draft-2', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 500, imageCount: 1, hasHotTopic: false, contentDepth: 40, freshness: 80, originality: 75, professionalism: 50 }
      );

      expect(deepContent.overallScore).toBeGreaterThan(shallowContent.overallScore);
    });

    it('TC-PRED-007: 应能获取预测详情', async () => {
      const prediction = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      const fetched = await predictionService.getPredictionById(prediction.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(prediction.id);
    });

    it('TC-PRED-008: 应能获取文稿的所有预测', async () => {
      const predictions = await predictionService.getPredictionsByDraft('draft-1');
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('TC-PRED-009: 预测应包含平台分数', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.platformScores).toHaveProperty('wechat');
      expect(result.platformScores).toHaveProperty('zhihu');
    });

    it('TC-PRED-010: 预测阅读量范围应合理', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.predictedViewsRange.min).toBeLessThan(result.predictedViewsRange.max);
      expect(result.predictedViews).toBeGreaterThanOrEqual(result.predictedViewsRange.min);
      expect(result.predictedViews).toBeLessThanOrEqual(result.predictedViewsRange.max);
    });
  });

  describe('2. 最佳发布时间 (8个)', () => {
    it('TC-TIME-001: 预测应包含时间推荐', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(Array.isArray(result.recommendedTimes)).toBe(true);
      expect(result.recommendedTimes.length).toBeGreaterThan(0);
    });

    it('TC-TIME-002: 时间推荐应包含分数和原因', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      const first = result.recommendedTimes[0];
      expect(first).toHaveProperty('time');
      expect(first).toHaveProperty('score');
      expect(first).toHaveProperty('reason');
      expect(first).toHaveProperty('recommendation');
    });

    it('TC-TIME-003: 最高分数应为强烈推荐', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      const top = result.recommendedTimes[0];
      expect(top.score).toBeGreaterThanOrEqual(90);
      expect(top.recommendation).toContain('推荐');
    });

    it('TC-TIME-004: 时间推荐应按分数降序排列', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1', '内容...', '标题', 'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      for (let i = 0; i < result.recommendedTimes.length - 1; i++) {
        expect(result.recommendedTimes[i].score).toBeGreaterThanOrEqual(result.recommendedTimes[i + 1].score);
      }
    });

    it('TC-TIME-005: 应能预约发布', async () => {
      const schedule = await scheduleService.schedulePublish(
        'draft-1',
        'wechat',
        new Date(Date.now() + 3600000)
      );

      expect(schedule).toBeDefined();
      expect(schedule.draftId).toBe('draft-1');
      expect(schedule.platform).toBe('wechat');
      expect(schedule.status).toBe('pending');
    });

    it('TC-TIME-006: 应能取消预约', async () => {
      const schedule = await scheduleService.schedulePublish(
        'draft-1',
        'wechat',
        new Date(Date.now() + 3600000)
      );

      const cancelled = await scheduleService.cancelSchedule(schedule.id);
      expect(cancelled).toBe(true);
    });

    it('TC-TIME-007: 应能获取待发布任务', async () => {
      const pending = await scheduleService.getPendingSchedules();
      expect(Array.isArray(pending)).toBe(true);
    });

    it('TC-TIME-008: 应能获取文稿的预约列表', async () => {
      await scheduleService.schedulePublish('draft-1', 'wechat', new Date(Date.now() + 3600000));
      const schedules = await scheduleService.getSchedulesByDraft('draft-1');
      expect(Array.isArray(schedules)).toBe(true);
    });
  });

  describe('3. 平台适配度 (6个)', () => {
    it('TC-PLAT-001: 应能分析平台适配度', async () => {
      const fits = await predictionService.analyzePlatformFit(
        'draft-1',
        '投资股票基金内容...',
        { titleLength: 20, wordCount: 1500, imageCount: 3, hasHotTopic: false, contentDepth: 80, freshness: 80, originality: 75, professionalism: 80 }
      );

      expect(Array.isArray(fits)).toBe(true);
      expect(fits.length).toBeGreaterThan(0);
    });

    it('TC-PLAT-002: 平台适配应包含分数和原因', async () => {
      const fits = await predictionService.analyzePlatformFit(
        'draft-1',
        '内容...',
        { titleLength: 20, wordCount: 1500, imageCount: 3, hasHotTopic: false, contentDepth: 80, freshness: 80, originality: 75, professionalism: 80 }
      );

      const first = fits[0];
      expect(first).toHaveProperty('platform');
      expect(first).toHaveProperty('score');
      expect(first).toHaveProperty('reason');
      expect(first).toHaveProperty('suggestions');
    });

    it('TC-PLAT-003: 平台适配应按分数降序排列', async () => {
      const fits = await predictionService.analyzePlatformFit(
        'draft-1',
        '内容...',
        { titleLength: 20, wordCount: 1500, imageCount: 3, hasHotTopic: false, contentDepth: 80, freshness: 80, originality: 75, professionalism: 80 }
      );

      for (let i = 0; i < fits.length - 1; i++) {
        expect(fits[i].score).toBeGreaterThanOrEqual(fits[i + 1].score);
      }
    });

    it('TC-PLAT-004: 投资内容应适配雪球', async () => {
      const fits = await predictionService.analyzePlatformFit(
        'draft-1',
        '股票投资分析内容...',
        { titleLength: 20, wordCount: 1500, imageCount: 3, hasHotTopic: false, contentDepth: 80, freshness: 80, originality: 75, professionalism: 85 }
      );

      const xueqiu = fits.find(f => f.platform === '雪球');
      expect(xueqiu?.score).toBeGreaterThan(60);
    });

    it('TC-PLAT-005: 深度内容应适配知乎', async () => {
      const fits = await predictionService.analyzePlatformFit(
        'draft-1',
        '深度专业分析内容...',
        { titleLength: 20, wordCount: 2000, imageCount: 5, hasHotTopic: false, contentDepth: 90, freshness: 80, originality: 75, professionalism: 90 }
      );

      const zhihu = fits.find(f => f.platform === '知乎');
      expect(zhihu?.score).toBeGreaterThan(60);
    });

    it('TC-PLAT-006: 短内容应有改进建议', async () => {
      const fits = await predictionService.analyzePlatformFit(
        'draft-1',
        '短内容',
        { titleLength: 20, wordCount: 300, imageCount: 1, hasHotTopic: false, contentDepth: 40, freshness: 80, originality: 75, professionalism: 50 }
      );

      const wechat = fits.find(f => f.platform === '公众号');
      expect(wechat?.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('4. 风险预警 (8个)', () => {
    it('TC-RISK-001: 应检测舆情风险', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '某些车企存在虚假宣传行为',
        '车企虚假宣传曝光',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.riskWarnings.length).toBeGreaterThan(0);
      expect(result.riskWarnings.some(w => w.type === 'sentiment')).toBe(true);
    });

    it('TC-RISK-002: 应检测广告法风险', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '这是最优惠的价格，绝对最低价',
        '最优惠价格',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.riskWarnings.some(w => w.type === 'compliance')).toBe(true);
    });

    it('TC-RISK-003: 风险应有级别', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '某些车企存在虚假宣传行为',
        '标题',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.riskLevel).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.riskLevel);
    });

    it('TC-RISK-004: 风险应包含处理建议', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '某些车企存在虚假宣传行为',
        '标题',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      if (result.riskWarnings.length > 0) {
        expect(result.riskWarnings[0]).toHaveProperty('suggestion');
        expect(result.riskWarnings[0].suggestion.length).toBeGreaterThan(0);
      }
    });

    it('TC-RISK-005: 安全内容应为低风险', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '这是一篇普通的技术分析文章，客观中立地讨论了行业发展趋势',
        '行业趋势分析',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.riskLevel).toBe('low');
    });

    it('TC-RISK-006: 应检测时效性风险', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '本次活动即将开始，倒计时三天',
        '活动倒计时',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(result.riskWarnings.some(w => w.type === 'timeliness')).toBe(true);
    });

    it('TC-RISK-007: 高风险应影响整体评分', async () => {
      const risky = await predictionService.predictPerformance(
        'draft-1',
        '最优惠最低价第一绝对虚假宣传',
        '最优惠',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      const safe = await predictionService.predictPerformance(
        'draft-2',
        '客观分析',
        '分析',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      expect(risky.overallScore).toBeLessThan(safe.overallScore);
    });

    it('TC-RISK-008: 风险警告应包含类型和消息', async () => {
      const result = await predictionService.predictPerformance(
        'draft-1',
        '某些车企存在虚假宣传行为',
        '标题',
        'article',
        { titleLength: 20, wordCount: 1000, imageCount: 2, hasHotTopic: false, contentDepth: 70, freshness: 80, originality: 75, professionalism: 70 }
      );

      if (result.riskWarnings.length > 0) {
        expect(result.riskWarnings[0]).toHaveProperty('type');
        expect(result.riskWarnings[0]).toHaveProperty('message');
        expect(result.riskWarnings[0]).toHaveProperty('level');
      }
    });
  });
})
