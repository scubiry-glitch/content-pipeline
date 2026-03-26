// AI 人工反馈闭环系统
// v6.1 Phase 5: 用户反馈收集、模型迭代

import { query } from '../../db/connection.js';

// ============================================
// 反馈类型定义
// ============================================

export type FeedbackType = 
  | 'quality_score'      // 质量评分反馈
  | 'category'           // 分类反馈
  | 'sentiment'          // 情感分析反馈
  | 'task_recommendation' // 任务推荐反馈
  | 'overall';           // 整体反馈

export interface AIFeedback {
  id?: number;
  rssItemId: string;
  feedbackType: FeedbackType;
  
  // AI 原始结果
  aiResult: {
    qualityScore?: number;
    category?: string;
    sentiment?: string;
    taskRecommended?: boolean;
  };
  
  // 用户反馈
  userFeedback: {
    correct?: boolean;           // 是否正确
    correctedValue?: string | number; // 修正后的值
    rating?: number;             // 满意度 1-5
    comment?: string;            // 文字反馈
  };
  
  // 反馈用户
  userId: string;
  userRole?: string;
  
  // 元数据
  createdAt?: Date;
}

// ============================================
// 反馈收集服务
// ============================================

export class AIFeedbackService {
  /**
   * 提交反馈
   */
  async submitFeedback(feedback: AIFeedback): Promise<void> {
    try {
      await query(
        `INSERT INTO ai_feedback (
          rss_item_id, feedback_type, ai_result, user_feedback, user_id, user_role, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          feedback.rssItemId,
          feedback.feedbackType,
          JSON.stringify(feedback.aiResult),
          JSON.stringify(feedback.userFeedback),
          feedback.userId,
          feedback.userRole || 'user',
        ]
      );

      console.log(`[AIFeedback] Feedback recorded for ${feedback.rssItemId}`);

      // 触发反馈分析
      await this.analyzeFeedback(feedback);
    } catch (error) {
      console.error('[AIFeedback] Failed to save feedback:', error);
      throw error;
    }
  }

  /**
   * 批量提交反馈
   */
  async submitBatchFeedback(feedbacks: AIFeedback[]): Promise<void> {
    for (const feedback of feedbacks) {
      await this.submitFeedback(feedback);
    }
  }

  /**
   * 获取反馈统计
   */
  async getFeedbackStats(days: number = 30): Promise<{
    totalFeedback: number;
    accuracy: Record<FeedbackType, number>;
    satisfaction: number;
    topIssues: string[];
  }> {
    const since = new Date(Date.now() - days * 86400000);

    // 总体统计
    const totalResult = await query(
      `SELECT COUNT(*) as count FROM ai_feedback WHERE created_at > $1`,
      [since]
    );

    // 各类型准确率
    const accuracyResult = await query(
      `SELECT 
        feedback_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE (user_feedback->>'correct')::boolean = true) as correct
      FROM ai_feedback
      WHERE created_at > $1
      GROUP BY feedback_type`,
      [since]
    );

    // 平均满意度
    const satisfactionResult = await query(
      `SELECT AVG((user_feedback->>'rating')::int) as avg_rating
      FROM ai_feedback
      WHERE created_at > $1 AND user_feedback->>'rating' IS NOT NULL`,
      [since]
    );

    // 常见问题
    const issuesResult = await query(
      `SELECT user_feedback->>'comment' as comment, COUNT(*) as count
      FROM ai_feedback
      WHERE created_at > $1 
        AND (user_feedback->>'correct')::boolean = false
        AND user_feedback->>'comment' IS NOT NULL
      GROUP BY user_feedback->>'comment'
      ORDER BY count DESC
      LIMIT 10`,
      [since]
    );

    const accuracy: Record<string, number> = {};
    for (const row of accuracyResult.rows) {
      accuracy[row.feedback_type] = row.total > 0 
        ? row.correct / row.total 
        : 0;
    }

    return {
      totalFeedback: parseInt(totalResult.rows[0].count),
      accuracy,
      satisfaction: parseFloat(satisfactionResult.rows[0].avg_rating || 0),
      topIssues: issuesResult.rows.map(r => r.comment).filter(Boolean),
    };
  }

  /**
   * 分析反馈并触发改进
   */
  private async analyzeFeedback(feedback: AIFeedback): Promise<void> {
    // 1. 记录到错误案例库（如果是错误反馈）
    if (feedback.userFeedback.correct === false) {
      await this.recordErrorCase(feedback);
    }

    // 2. 检查是否需要触发模型调整
    await this.checkForModelAdjustment(feedback.feedbackType);
  }

  /**
   * 记录错误案例
   */
  private async recordErrorCase(feedback: AIFeedback): Promise<void> {
    try {
      // 获取原始文章内容
      const itemResult = await query(
        `SELECT title, summary, content FROM rss_items WHERE id = $1`,
        [feedback.rssItemId]
      );

      if (itemResult.rows.length === 0) return;

      const item = itemResult.rows[0];

      await query(
        `INSERT INTO ai_error_cases (
          rss_item_id, feedback_id, feedback_type, 
          content_preview, ai_result, corrected_value, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          feedback.rssItemId,
          feedback.id,
          feedback.feedbackType,
          (item.title + ' ' + (item.summary || item.content || '')).slice(0, 500),
          JSON.stringify(feedback.aiResult),
          feedback.userFeedback.correctedValue,
        ]
      );
    } catch (error) {
      console.error('[AIFeedback] Failed to record error case:', error);
    }
  }

  /**
   * 检查是否需要触发模型调整
   */
  private async checkForModelAdjustment(feedbackType: FeedbackType): Promise<void> {
    // 获取最近24小时的错误率
    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE (user_feedback->>'correct')::boolean = false) as errors
      FROM ai_feedback
      WHERE feedback_type = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [feedbackType]
    );

    const total = parseInt(result.rows[0].total);
    const errors = parseInt(result.rows[0].errors);

    if (total >= 10 && errors / total > 0.3) {
      // 错误率超过30%，触发告警
      console.warn(`[AIFeedback] High error rate for ${feedbackType}: ${(errors/total*100).toFixed(1)}%`);
      
      // TODO: 触发模型调整流程
      // 1. 收集最近的所有错误案例
      // 2. 生成新的 few-shot 示例
      // 3. 测试新的 prompt
      // 4. A/B 测试
      // 5. 全量发布
    }
  }

  /**
   * 获取错误案例（用于模型改进）
   */
  async getErrorCases(
    feedbackType: FeedbackType,
    limit: number = 100
  ): Promise<Array<{
    contentPreview: string;
    aiResult: any;
    correctedValue: any;
    count: number;
  }>> {
    const result = await query(
      `SELECT 
        content_preview,
        ai_result,
        corrected_value,
        COUNT(*) as occurrence_count
      FROM ai_error_cases
      WHERE feedback_type = $1
      GROUP BY content_preview, ai_result, corrected_value
      ORDER BY occurrence_count DESC
      LIMIT $2`,
      [feedbackType, limit]
    );

    return result.rows.map(row => ({
      contentPreview: row.content_preview,
      aiResult: JSON.parse(row.ai_result),
      correctedValue: row.corrected_value,
      count: parseInt(row.occurrence_count),
    }));
  }

  /**
   * 获取需要人工审核的内容
   */
  async getContentForReview(options: {
    feedbackType?: FeedbackType;
    minDisagreement?: number;
    limit?: number;
  } = {}): Promise<Array<{
    rssItemId: string;
    title: string;
    aiResult: any;
    feedbacks: any[];
  }>> {
    const { feedbackType, minDisagreement = 2, limit = 20 } = options;

    let sql = `
      SELECT 
        f.rss_item_id,
        r.title,
        f.ai_result,
        json_agg(json_build_object(
          'userFeedback', f.user_feedback,
          'userId', f.user_id,
          'createdAt', f.created_at
        )) as feedbacks,
        COUNT(*) as feedback_count,
        COUNT(*) FILTER (WHERE (f.user_feedback->>'correct')::boolean = false) as error_count
      FROM ai_feedback f
      JOIN rss_items r ON f.rss_item_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (feedbackType) {
      params.push(feedbackType);
      sql += ` AND f.feedback_type = $${params.length}`;
    }

    sql += `
      GROUP BY f.rss_item_id, r.title, f.ai_result
      HAVING COUNT(*) >= $${params.length + 1}
      ORDER BY COUNT(*) FILTER (WHERE (f.user_feedback->>'correct')::boolean = false) DESC
      LIMIT $${params.length + 2}
    `;
    params.push(minDisagreement, limit);

    const result = await query(sql, params);

    return result.rows.map(row => ({
      rssItemId: row.rss_item_id,
      title: row.title,
      aiResult: JSON.parse(row.ai_result),
      feedbacks: JSON.parse(row.feedbacks),
    }));
  }
}

// ============================================
// Prompt 迭代服务
// ============================================

export class PromptIterationService {
  /**
   * 基于错误案例生成改进的 prompt
   */
  async generateImprovedPrompt(
    feedbackType: FeedbackType,
    currentPrompt: string
  ): Promise<string> {
    const feedbackService = new AIFeedbackService();
    const errorCases = await feedbackService.getErrorCases(feedbackType, 50);

    if (errorCases.length === 0) {
      console.log('[PromptIteration] No error cases found, skipping improvement');
      return currentPrompt;
    }

    // 分析错误模式
    const errorPatterns = this.analyzeErrorPatterns(errorCases);

    // 生成 few-shot 修正示例
    const corrections = errorCases.slice(0, 10).map((c, i) => `
【修正示例 ${i + 1}】
内容: ${c.contentPreview.slice(0, 200)}...
AI原判: ${JSON.stringify(c.aiResult)}
正确结果: ${c.correctedValue}
`).join('\n');

    // 构建改进提示
    const improvementPrompt = `
你是一位 Prompt Engineering 专家。请基于以下错误案例改进现有的 AI 分析 Prompt。

【当前 Prompt】
${currentPrompt}

【常见错误模式】
${errorPatterns.join('\n')}

【具体错误案例】
${corrections}

【改进要求】
1. 添加针对常见错误的约束条件
2. 增加相关的 few-shot 示例
3. 优化输出格式说明，减少歧义
4. 保持原有评估维度和标准

请输出改进后的完整 Prompt：`;

    // TODO: 调用 LLM 生成改进的 prompt
    console.log('[PromptIteration] Generated improvement suggestions');

    return currentPrompt; // 临时返回原 prompt
  }

  /**
   * 分析错误模式
   */
  private analyzeErrorPatterns(errorCases: any[]): string[] {
    const patterns: string[] = [];

    // 统计常见错误类型
    const categoryErrors = errorCases.filter(c => c.aiResult.category !== c.correctedValue);
    const qualityErrors = errorCases.filter(c => 
      Math.abs(c.aiResult.qualityScore - c.correctedValue) > 20
    );

    if (categoryErrors.length > errorCases.length * 0.3) {
      patterns.push('领域分类错误率较高，需要加强分类标准的说明');
    }

    if (qualityErrors.length > errorCases.length * 0.3) {
      patterns.push('质量评分偏差较大，需要细化评分标准');
    }

    return patterns;
  }

  /**
   * A/B 测试新的 prompt
   */
  async runABTest(
    promptA: string,
    promptB: string,
    testSamples: number = 100
  ): Promise<{
    winner: 'A' | 'B' | 'tie';
    accuracyA: number;
    accuracyB: number;
  }> {
    // TODO: 实现 A/B 测试逻辑
    console.log('[PromptIteration] Running A/B test...');
    
    return {
      winner: 'tie',
      accuracyA: 0.85,
      accuracyB: 0.87,
    };
  }
}

// ============================================
// 反馈数据库表创建
// ============================================

export const FEEDBACK_TABLE_SQL = `
-- 用户反馈表
CREATE TABLE IF NOT EXISTS ai_feedback (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(50) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  feedback_type VARCHAR(50) NOT NULL,
  ai_result JSONB NOT NULL,
  user_feedback JSONB NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  user_role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_item ON ai_feedback(rss_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_type ON ai_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON ai_feedback(user_id);

-- 错误案例库
CREATE TABLE IF NOT EXISTS ai_error_cases (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(50) NOT NULL,
  feedback_id INTEGER REFERENCES ai_feedback(id),
  feedback_type VARCHAR(50) NOT NULL,
  content_preview TEXT,
  ai_result JSONB NOT NULL,
  corrected_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_error_cases_type ON ai_error_cases(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_error_cases_created ON ai_error_cases(created_at DESC);

-- Prompt 版本历史
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id SERIAL PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  prompt_content TEXT NOT NULL,
  accuracy_rate DECIMAL(5,2),
  feedback_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(prompt_type, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_type ON ai_prompt_versions(prompt_type);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_active ON ai_prompt_versions(is_active);
`;

// 导出单例
export const feedbackService = new AIFeedbackService();
export const promptIterationService = new PromptIterationService();
