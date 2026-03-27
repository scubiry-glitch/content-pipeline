// v4.3 内容表现预测服务
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

// ============ 类型定义 ============
export interface ContentFeatures {
  titleLength: number;
  wordCount: number;
  imageCount: number;
  hasHotTopic: boolean;
  hotTopicScore?: number;
  contentDepth: number;
  originality: number;
  professionalism: number;
  freshness: number;
}

export interface PerformancePrediction {
  id: string;
  draftId: string;
  contentType: string;
  overallScore: number;
  confidence: number;
  predictedViews: number;
  predictedEngagement: number;
  predictedShares: number;
  predictedSaves: number;
  predictedViewsRange: { min: number; max: number };
  recommendedTimes: TimeRecommendation[];
  platformScores: Record<string, number>;
  riskLevel: 'low' | 'medium' | 'high';
  riskWarnings: RiskWarning[];
  createdAt: Date;
}

export interface TimeRecommendation {
  time: string;
  score: number;
  reason: string;
  recommendation: string;
}

export interface RiskWarning {
  type: 'sentiment' | 'compliance' | 'competition' | 'timeliness';
  level: 'low' | 'medium' | 'high';
  message: string;
  suggestion: string;
}

export interface PlatformFit {
  platform: string;
  score: number;
  reason: string;
  suggestions: string[];
}

export interface PredictionModel {
  id: string;
  name: string;
  modelType: string;
  version: string;
  weights: Record<string, number>;
  accuracy?: number;
  isActive: boolean;
}

export interface ScheduledPublish {
  id: string;
  draftId: string;
  platform: string;
  scheduledTime: Date;
  status: 'pending' | 'published' | 'cancelled' | 'failed';
  predictionId?: string;
}

// ============ 预测服务 ============
export class PredictionService {
  // 传播潜力评估
  async predictPerformance(
    draftId: string,
    content: string,
    title: string,
    contentType: string,
    features: ContentFeatures
  ): Promise<PerformancePrediction> {
    const id = uuidv4();

    // 1. 计算内容质量分数
    const contentScore = this.calculateContentScore(features);

    // 2. 预测各项指标
    const predictedViews = this.predictViews(contentScore, features);
    const predictedEngagement = this.predictEngagement(contentScore, features);
    const predictedShares = Math.floor(predictedViews * 0.025);
    const predictedSaves = Math.floor(predictedViews * 0.015);

    // 3. 计算置信度
    const confidence = this.calculateConfidence(features);

    // 4. 生成推荐时间
    const recommendedTimes = this.generateTimeRecommendations(contentType);

    // 5. 分析平台适配度
    const platformScores = this.analyzePlatformScores(content, features);

    // 6. 风险检测
    const { riskLevel, warnings } = this.detectRisks(content, title);

    // 7. 计算综合分数
    const overallScore = Math.round(
      contentScore * 0.4 +
      (platformScores['wechat'] || 50) * 0.3 +
      (100 - (riskLevel === 'high' ? 50 : riskLevel === 'medium' ? 25 : 0)) * 0.3
    );

    // 8. 保存到数据库
    const result = await query(
      `INSERT INTO content_predictions (
        id, draft_id, content_type, content_features,
        overall_score, confidence,
        predicted_views, predicted_engagement, predicted_shares, predicted_saves,
        predicted_views_range, recommended_times, platform_scores,
        risk_level, risk_warnings, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING *`,
      [
        id, draftId, contentType, JSON.stringify(features),
        overallScore, confidence,
        predictedViews, predictedEngagement, predictedShares, predictedSaves,
        JSON.stringify({ min: Math.floor(predictedViews * 0.8), max: Math.floor(predictedViews * 1.2) }),
        JSON.stringify(recommendedTimes),
        JSON.stringify(platformScores),
        riskLevel,
        JSON.stringify(warnings)
      ]
    );

    return this.formatPrediction(result.rows[0]);
  }

  // 计算内容质量分数
  private calculateContentScore(features: ContentFeatures): number {
    let score = 0;

    // 标题吸引力 (20%)
    const titleScore = features.titleLength >= 10 && features.titleLength <= 30 ? 80 : 60;
    score += titleScore * 0.20;

    // 内容深度 (20%)
    score += Math.min(features.contentDepth, 100) * 0.20;

    // 热点关联度 (15%)
    score += (features.hasHotTopic ? (features.hotTopicScore || 50) : 30) * 0.15;

    // 新鲜度 (15%)
    score += Math.min(features.freshness, 100) * 0.15;

    // 原创度 (15%)
    score += Math.min(features.originality, 100) * 0.15;

    // 专业度 (15%)
    score += Math.min(features.professionalism, 100) * 0.15;

    return Math.round(score);
  }

  // 预测阅读量
  private predictViews(contentScore: number, features: ContentFeatures): number {
    const baseViews = 5000;
    const scoreMultiplier = contentScore / 50;
    const hotBoost = features.hasHotTopic ? 1.5 : 1.0;
    const lengthFactor = Math.min(features.wordCount / 1000, 2);

    return Math.floor(baseViews * scoreMultiplier * hotBoost * (1 + lengthFactor * 0.3));
  }

  // 预测互动量
  private predictEngagement(contentScore: number, features: ContentFeatures): number {
    const baseEngagement = 300;
    const scoreMultiplier = contentScore / 50;
    const controversyBoost = features.contentDepth > 70 ? 1.3 : 1.0;

    return Math.floor(baseEngagement * scoreMultiplier * controversyBoost);
  }

  // 计算置信度
  private calculateConfidence(features: ContentFeatures): number {
    let confidence = 70;

    // 有热点数据增加置信度
    if (features.hasHotTopic && features.hotTopicScore) {
      confidence += 10;
    }

    // 内容质量高增加置信度
    if (features.contentDepth > 70) {
      confidence += 5;
    }

    // 字数适中增加置信度
    if (features.wordCount >= 800 && features.wordCount <= 3000) {
      confidence += 5;
    }

    return Math.min(confidence, 95);
  }

  // 生成时间推荐
  private generateTimeRecommendations(contentType: string): TimeRecommendation[] {
    const now = new Date();
    const recommendations: TimeRecommendation[] = [];

    // 今天 20:00
    const today20 = new Date(now);
    today20.setHours(20, 0, 0, 0);
    if (today20 > now) {
      recommendations.push({
        time: today20.toISOString(),
        score: 92,
        reason: '用户活跃高峰 + 热点上升期',
        recommendation: '强烈推荐'
      });
    }

    // 明天 08:00
    const tomorrow8 = new Date(now);
    tomorrow8.setDate(tomorrow8.getDate() + 1);
    tomorrow8.setHours(8, 0, 0, 0);
    recommendations.push({
      time: tomorrow8.toISOString(),
      score: 78,
      reason: '通勤阅读时段 + 早间新闻习惯',
      recommendation: '推荐'
    });

    // 明天 12:30
    const tomorrow12 = new Date(now);
    tomorrow12.setDate(tomorrow12.getDate() + 1);
    tomorrow12.setHours(12, 30, 0, 0);
    recommendations.push({
      time: tomorrow12.toISOString(),
      score: 65,
      reason: '午休时段 + 碎片化阅读',
      recommendation: '一般'
    });

    return recommendations;
  }

  // 分析平台适配度
  private analyzePlatformScores(content: string, features: ContentFeatures): Record<string, number> {
    const scores: Record<string, number> = {};

    // 公众号评分
    const wechatScore = Math.min(
      50 +
      (features.wordCount > 1000 ? 20 : 10) +
      (features.contentDepth > 60 ? 15 : 5) +
      (features.hasHotTopic ? 10 : 0) +
      (features.imageCount >= 3 ? 5 : 0),
      100
    );
    scores['wechat'] = wechatScore;

    // 知乎评分
    const zhihuScore = Math.min(
      40 +
      (features.contentDepth > 70 ? 25 : 10) +
      (features.professionalism > 70 ? 20 : 10) +
      (features.wordCount > 1500 ? 15 : 5),
      100
    );
    scores['zhihu'] = zhihuScore;

    // 即刻评分
    const jikeScore = Math.min(
      35 +
      (features.hasHotTopic ? 25 : 10) +
      (features.wordCount < 1000 ? 20 : 5) +
      (features.titleLength < 20 ? 10 : 5),
      100
    );
    scores['jike'] = jikeScore;

    // 雪球评分
    const xueqiuScore = Math.min(
      45 +
      (content.includes('投资') || content.includes('股票') || content.includes('基金') ? 30 : 5) +
      (features.professionalism > 60 ? 15 : 5) +
      (features.contentDepth > 50 ? 10 : 5),
      100
    );
    scores['xueqiu'] = xueqiuScore;

    // LinkedIn评分
    const linkedinScore = Math.min(
      40 +
      (features.professionalism > 70 ? 25 : 10) +
      (features.wordCount > 800 && features.wordCount < 2000 ? 15 : 5) +
      (features.hasHotTopic ? 10 : 0),
      100
    );
    scores['linkedin'] = linkedinScore;

    return scores;
  }

  // 风险检测
  private detectRisks(content: string, title: string): { riskLevel: 'low' | 'medium' | 'high'; warnings: RiskWarning[] } {
    const warnings: RiskWarning[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // 检测争议性内容
    const controversialWords = ['最', '第一', '绝对', '虚假宣传'];
    for (const word of controversialWords) {
      if (content.includes(word) || title.includes(word)) {
        warnings.push({
          type: 'sentiment',
          level: 'medium',
          message: `检测到可能引发争议的表述: "${word}"`,
          suggestion: '建议增加 attribution 或改为更中立的表述'
        });
        riskLevel = 'medium';
      }
    }

    // 检测广告法敏感词
    const adSensitiveWords = ['最优惠', '最低价', '最佳', '第一'];
    for (const word of adSensitiveWords) {
      if (content.includes(word) || title.includes(word)) {
        warnings.push({
          type: 'compliance',
          level: 'medium',
          message: `可能违反广告法: "${word}"`,
          suggestion: `建议改为"较${word.substring(1)}"或"更${word.substring(1)}"`
        });
        riskLevel = 'medium';
      }
    }

    // 检测时效性
    if (content.includes('即将') || content.includes('马上') || content.includes('倒计时')) {
      warnings.push({
        type: 'timeliness',
        level: 'low',
        message: '检测到时效性表述',
        suggestion: '建议尽快发布或添加具体时间节点'
      });
    }

    return { riskLevel, warnings };
  }

  // 获取预测结果
  async getPredictionById(id: string): Promise<PerformancePrediction | null> {
    const result = await query(
      `SELECT * FROM content_predictions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatPrediction(result.rows[0]);
  }

  // 获取文稿的所有预测
  async getPredictionsByDraft(draftId: string): Promise<PerformancePrediction[]> {
    const result = await query(
      `SELECT * FROM content_predictions
       WHERE draft_id = $1
       ORDER BY created_at DESC`,
      [draftId]
    );
    return result.rows.map(row => this.formatPrediction(row));
  }

  // 平台适配度详细分析
  async analyzePlatformFit(draftId: string, content: string, features: ContentFeatures): Promise<PlatformFit[]> {
    const platformScores = this.analyzePlatformScores(content, features);

    const platformFits: PlatformFit[] = [
      {
        platform: '公众号',
        score: platformScores['wechat'] || 50,
        reason: platformScores['wechat'] > 70 ? '适合深度长文' : '内容可能过短或不够深入',
        suggestions: platformScores['wechat'] < 70 ? ['增加内容深度', '添加更多图片'] : []
      },
      {
        platform: '知乎',
        score: platformScores['zhihu'] || 50,
        reason: platformScores['zhihu'] > 70 ? '专业内容匹配' : '需要增强专业引用',
        suggestions: platformScores['zhihu'] < 70 ? ['增加数据引用', '添加专业分析'] : []
      },
      {
        platform: '即刻',
        score: platformScores['jike'] || 50,
        reason: platformScores['jike'] > 60 ? '热点话题适合' : '话题热度一般',
        suggestions: platformScores['jike'] < 60 ? ['关联当前热点', '缩短内容长度'] : []
      },
      {
        platform: '雪球',
        score: platformScores['xueqiu'] || 50,
        reason: platformScores['xueqiu'] > 70 ? '投资者关注话题' : '与投资理财关联度低',
        suggestions: platformScores['xueqiu'] < 70 ? ['增加投资角度分析', '关联财经热点'] : []
      },
      {
        platform: 'LinkedIn',
        score: platformScores['linkedin'] || 50,
        reason: platformScores['linkedin'] > 65 ? '商务场景适配' : '不够职业化',
        suggestions: platformScores['linkedin'] < 65 ? ['增强专业度', '调整语言风格'] : []
      }
    ];

    return platformFits.sort((a, b) => b.score - a.score);
  }

  private formatPrediction(row: any): PerformancePrediction {
    return {
      id: row.id,
      draftId: row.draft_id,
      contentType: row.content_type,
      overallScore: row.overall_score,
      confidence: row.confidence,
      predictedViews: row.predicted_views,
      predictedEngagement: row.predicted_engagement,
      predictedShares: row.predicted_shares,
      predictedSaves: row.predicted_saves,
      predictedViewsRange: typeof row.predicted_views_range === 'string'
        ? JSON.parse(row.predicted_views_range)
        : row.predicted_views_range,
      recommendedTimes: typeof row.recommended_times === 'string'
        ? JSON.parse(row.recommended_times)
        : row.recommended_times,
      platformScores: typeof row.platform_scores === 'string'
        ? JSON.parse(row.platform_scores)
        : row.platform_scores,
      riskLevel: row.risk_level,
      riskWarnings: typeof row.risk_warnings === 'string'
        ? JSON.parse(row.risk_warnings)
        : row.risk_warnings,
      createdAt: row.created_at
    };
  }
}

// ============ 预约发布服务 ============
export class ScheduleService {
  // 预约发布
  async schedulePublish(
    draftId: string,
    platform: string,
    scheduledTime: Date,
    predictionId?: string
  ): Promise<ScheduledPublish> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO scheduled_publishes (
        id, draft_id, platform, scheduled_time, status, prediction_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *`,
      [id, draftId, platform, scheduledTime, 'pending', predictionId]
    );

    return this.formatScheduledPublish(result.rows[0]);
  }

  // 获取待发布的任务
  async getPendingSchedules(): Promise<ScheduledPublish[]> {
    const result = await query(
      `SELECT * FROM scheduled_publishes
       WHERE status = 'pending'
       AND scheduled_time <= NOW() + INTERVAL '5 minutes'
       ORDER BY scheduled_time ASC`
    );

    return result.rows.map(row => this.formatScheduledPublish(row));
  }

  // 取消预约
  async cancelSchedule(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE scheduled_publishes
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id]
    );

    return result.rows.length > 0;
  }

  // 标记为已发布
  async markAsPublished(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE scheduled_publishes
       SET status = 'published', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    return result.rows.length > 0;
  }

  // 获取文稿的预约
  async getSchedulesByDraft(draftId: string): Promise<ScheduledPublish[]> {
    const result = await query(
      `SELECT * FROM scheduled_publishes
       WHERE draft_id = $1
       ORDER BY scheduled_time DESC`,
      [draftId]
    );

    return result.rows.map(row => this.formatScheduledPublish(row));
  }

  private formatScheduledPublish(row: any): ScheduledPublish {
    return {
      id: row.id,
      draftId: row.draft_id,
      platform: row.platform,
      scheduledTime: row.scheduled_time,
      status: row.status,
      predictionId: row.prediction_id
    };
  }
}

// ============ 历史数据分析服务 ============
export class HistoricalAnalysisService {
  // 分析同类内容表现
  async analyzeSimilarContent(contentType: string, topicCategory?: string): Promise<{
    avgViews: number;
    avgEngagement: number;
    bestPerformingTopic: string;
    insights: string[];
  }> {
    let sql = `
      SELECT
        AVG(actual_views) as avg_views,
        AVG(actual_engagement) as avg_engagement,
        topic_category
      FROM content_performance_history
      WHERE content_type = $1
    `;
    const params: any[] = [contentType];

    if (topicCategory) {
      sql += ` AND topic_category = $2`;
      params.push(topicCategory);
    }

    sql += ` GROUP BY topic_category ORDER BY avg_views DESC LIMIT 1`;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return {
        avgViews: 8000,
        avgEngagement: 400,
        bestPerformingTopic: topicCategory || 'general',
        insights: ['暂无历史数据，使用默认值']
      };
    }

    const row = result.rows[0];
    return {
      avgViews: Math.round(parseFloat(row.avg_views)),
      avgEngagement: Math.round(parseFloat(row.avg_engagement)),
      bestPerformingTopic: row.topic_category,
      insights: [
        `同类内容平均阅读量: ${Math.round(parseFloat(row.avg_views))}`,
        `建议关注"${row.topic_category}"相关内容`
      ]
    };
  }

  // 记录内容表现
  async recordPerformance(data: {
    contentType: string;
    topicCategory?: string;
    actualViews: number;
    actualEngagement: number;
    actualShares: number;
    actualSaves: number;
    publishTime: Date;
    platform: string;
    contentFeatures?: ContentFeatures;
  }): Promise<void> {
    await query(
      `INSERT INTO content_performance_history (
        content_type, topic_category,
        actual_views, actual_engagement, actual_shares, actual_saves,
        publish_time, platform, content_features, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        data.contentType,
        data.topicCategory,
        data.actualViews,
        data.actualEngagement,
        data.actualShares,
        data.actualSaves,
        data.publishTime,
        data.platform,
        data.contentFeatures ? JSON.stringify(data.contentFeatures) : null
      ]
    );
  }
}

// ============ 导出服务实例 ============
export const predictionService = new PredictionService();
export const scheduleService = new ScheduleService();
export const historicalAnalysisService = new HistoricalAnalysisService();
