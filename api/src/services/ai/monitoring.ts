// AI 批量处理监控告警系统
// v6.1 Phase 5: 日志、指标、告警

import { query } from '../../db/connection.js';

// ============================================
// 日志级别
// ============================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, any>;
}

// ============================================
// AI 处理日志系统
// ============================================

export class AIMonitoringLogger {
  private component: string;
  private enableConsole: boolean;
  private enableDB: boolean;

  constructor(component: string, options: { enableConsole?: boolean; enableDB?: boolean } = {}) {
    this.component = component;
    this.enableConsole = options.enableConsole ?? true;
    this.enableDB = options.enableDB ?? true;
  }

  private async log(level: LogLevel, message: string, metadata?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.component,
      message,
      metadata,
    };

    // 控制台输出
    if (this.enableConsole) {
      const timestamp = entry.timestamp.toISOString();
      const metaStr = metadata ? JSON.stringify(metadata) : '';
      
      switch (level) {
        case 'debug':
          console.log(`[${timestamp}] [${this.component}] [DEBUG] ${message}`, metaStr);
          break;
        case 'info':
          console.log(`[${timestamp}] [${this.component}] [INFO] ${message}`, metaStr);
          break;
        case 'warn':
          console.warn(`[${timestamp}] [${this.component}] [WARN] ${message}`, metaStr);
          break;
        case 'error':
          console.error(`[${timestamp}] [${this.component}] [ERROR] ${message}`, metaStr);
          break;
      }
    }

    // 数据库记录
    if (this.enableDB && level !== 'debug') {
      try {
        await query(
          `INSERT INTO ai_processing_logs (level, component, message, metadata, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [level, this.component, message, JSON.stringify(metadata || {})]
        );
      } catch (err) {
        console.error('[AIMonitoringLogger] Failed to save log to DB:', err);
      }
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata);
  }

  /**
   * 记录处理指标
   */
  async recordMetrics(metrics: {
    itemId?: string;
    processingTimeMs: number;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    success: boolean;
    errorType?: string;
    qualityScore?: number;
    category?: string;
  }): Promise<void> {
    await this.log('info', 'Processing metrics', metrics);

    try {
      await query(
        `INSERT INTO ai_processing_metrics (
          item_id, processing_time_ms, model, prompt_tokens, completion_tokens,
          success, error_type, quality_score, category, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          metrics.itemId || null,
          metrics.processingTimeMs,
          metrics.model,
          metrics.promptTokens || 0,
          metrics.completionTokens || 0,
          metrics.success,
          metrics.errorType || null,
          metrics.qualityScore || null,
          metrics.category || null,
        ]
      );
    } catch (err) {
      console.error('[AIMonitoringLogger] Failed to save metrics:', err);
    }
  }
}

// ============================================
// 告警规则
// ============================================

interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: SystemMetrics) => boolean;
  severity: 'warning' | 'critical';
  message: string;
  cooldownMinutes: number;
  lastTriggered?: Date;
}

interface SystemMetrics {
  errorRate: number;
  avgProcessingTime: number;
  queueSize: number;
  apiLatency: number;
  dailyCost: number;
}

// ============================================
// 告警管理器
// ============================================

export class AIAlertManager {
  private rules: AlertRule[] = [];
  private logger: AIMonitoringLogger;

  constructor() {
    this.logger = new AIMonitoringLogger('AlertManager');
    this.setupDefaultRules();
  }

  private setupDefaultRules(): void {
    // 规则1: 错误率过高
    this.addRule({
      id: 'high-error-rate',
      name: '高错误率告警',
      condition: (m) => m.errorRate > 0.2, // 错误率 > 20%
      severity: 'critical',
      message: `AI处理错误率过高: {{errorRate}}%，请立即检查`,
      cooldownMinutes: 15,
    });

    // 规则2: 处理时间过长
    this.addRule({
      id: 'slow-processing',
      name: '处理速度告警',
      condition: (m) => m.avgProcessingTime > 10000, // 平均 > 10s
      severity: 'warning',
      message: `AI处理平均耗时过长: {{avgProcessingTime}}ms，建议优化`,
      cooldownMinutes: 30,
    });

    // 规则3: 队列堆积
    this.addRule({
      id: 'queue-backlog',
      name: '队列堆积告警',
      condition: (m) => m.queueSize > 100,
      severity: 'warning',
      message: `待处理队列堆积: {{queueSize}} 条，建议扩容或限流`,
      cooldownMinutes: 10,
    });

    // 规则4: API 延迟过高
    this.addRule({
      id: 'high-latency',
      name: 'API延迟告警',
      condition: (m) => m.apiLatency > 5000, // > 5s
      severity: 'critical',
      message: `LLM API响应延迟过高: {{apiLatency}}ms，请检查服务状态`,
      cooldownMinutes: 5,
    });

    // 规则5: 成本超标
    this.addRule({
      id: 'cost-limit',
      name: '日成本告警',
      condition: (m) => m.dailyCost > 100, // > $100
      severity: 'warning',
      message: `今日AI处理成本: \${{dailyCost}}，已接近预算上限`,
      cooldownMinutes: 60,
    });
  }

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /**
   * 检查所有告警规则
   */
  async checkAlerts(metrics: SystemMetrics): Promise<void> {
    for (const rule of this.rules) {
      // 检查冷却期
      if (rule.lastTriggered) {
        const cooldownMs = rule.cooldownMinutes * 60000;
        if (Date.now() - rule.lastTriggered.getTime() < cooldownMs) {
          continue;
        }
      }

      // 检查条件
      if (rule.condition(metrics)) {
        await this.triggerAlert(rule, metrics);
      }
    }
  }

  /**
   * 触发告警
   */
  private async triggerAlert(rule: AlertRule, metrics: SystemMetrics): Promise<void> {
    rule.lastTriggered = new Date();

    // 构建告警消息
    let message = rule.message
      .replace('{{errorRate}}', (metrics.errorRate * 100).toFixed(1))
      .replace('{{avgProcessingTime}}', metrics.avgProcessingTime.toFixed(0))
      .replace('{{queueSize}}', metrics.queueSize.toString())
      .replace('{{apiLatency}}', metrics.apiLatency.toFixed(0))
      .replace('{{dailyCost}}', metrics.dailyCost.toFixed(2));

    // 记录告警日志
    this.logger.warn(`[ALERT] ${rule.name}: ${message}`, {
      ruleId: rule.id,
      severity: rule.severity,
      metrics,
    });

    // 保存到数据库
    try {
      await query(
        `INSERT INTO ai_alerts (rule_id, rule_name, severity, message, metrics, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [rule.id, rule.name, rule.severity, message, JSON.stringify(metrics)]
      );
    } catch (err) {
      console.error('[AIAlertManager] Failed to save alert:', err);
    }

    // TODO: 发送通知（邮件、Slack、短信等）
    await this.sendNotification(rule, message);
  }

  /**
   * 发送通知
   */
  private async sendNotification(rule: AlertRule, message: string): Promise<void> {
    // 这里可以集成各种通知渠道
    console.log(`[ALERT NOTIFICATION] ${rule.severity.toUpperCase()}: ${message}`);

    // 示例：Slack webhook
    const slackWebhook = process.env.SLACK_ALERT_WEBHOOK;
    if (slackWebhook && rule.severity === 'critical') {
      try {
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 *AI处理告警*\n*级别:* ${rule.severity.toUpperCase()}\n*规则:* ${rule.name}\n*详情:* ${message}`,
          }),
        });
      } catch (err) {
        console.error('[AIAlertManager] Failed to send Slack notification:', err);
      }
    }
  }

  /**
   * 获取最近告警
   */
  async getRecentAlerts(limit: number = 20): Promise<any[]> {
    const result = await query(
      `SELECT * FROM ai_alerts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

// ============================================
// 系统指标收集器
// ============================================

export class AIMetricsCollector {
  private logger: AIMonitoringLogger;

  constructor() {
    this.logger = new AIMonitoringLogger('MetricsCollector');
  }

  /**
   * 收集系统指标
   */
  async collectMetrics(): Promise<SystemMetrics> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    // 1. 错误率
    const errorResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE success = false) as error_count,
        COUNT(*) as total_count
      FROM ai_processing_metrics
      WHERE created_at > $1`,
      [oneHourAgo]
    );
    const errorRate = errorResult.rows[0].total_count > 0
      ? errorResult.rows[0].error_count / errorResult.rows[0].total_count
      : 0;

    // 2. 平均处理时间
    const timeResult = await query(
      `SELECT AVG(processing_time_ms) as avg_time
      FROM ai_processing_metrics
      WHERE created_at > $1 AND success = true`,
      [oneHourAgo]
    );
    const avgProcessingTime = parseFloat(timeResult.rows[0].avg_time || 0);

    // 3. 队列大小（待分析的 RSS items）
    const queueResult = await query(
      `SELECT COUNT(*) as count FROM rss_items WHERE ai_analyzed_at IS NULL`,
      []
    );
    const queueSize = parseInt(queueResult.rows[0].count);

    // 4. API 延迟（从最近的 metrics 中获取）
    const latencyResult = await query(
      `SELECT AVG(processing_time_ms) as avg_latency
      FROM ai_processing_metrics
      WHERE created_at > $1`,
      [oneHourAgo]
    );
    const apiLatency = parseFloat(latencyResult.rows[0].avg_latency || 0);

    // 5. 日成本（估算）
    const costResult = await query(
      `SELECT 
        SUM((prompt_tokens + completion_tokens) * 0.000002) as estimated_cost
      FROM ai_processing_metrics
      WHERE created_at > CURRENT_DATE`,
      []
    );
    const dailyCost = parseFloat(costResult.rows[0].estimated_cost || 0);

    const metrics: SystemMetrics = {
      errorRate,
      avgProcessingTime,
      queueSize,
      apiLatency,
      dailyCost,
    };

    this.logger.debug('Collected system metrics', metrics);
    return metrics;
  }

  /**
   * 生成处理报告
   */
  async generateReport(hours: number = 24): Promise<{
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    avgQualityScore: number;
    categoryDistribution: Record<string, number>;
    topErrors: string[];
  }> {
    const since = new Date(Date.now() - hours * 3600000);

    // 总体统计
    const statsResult = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as success,
        COUNT(*) FILTER (WHERE success = false) as error,
        AVG(quality_score) as avg_quality
      FROM ai_processing_metrics
      WHERE created_at > $1`,
      [since]
    );

    // 分类分布
    const categoryResult = await query(
      `SELECT category, COUNT(*) as count
      FROM ai_processing_metrics
      WHERE created_at > $1 AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10`,
      [since]
    );

    // 常见错误
    const errorResult = await query(
      `SELECT error_type, COUNT(*) as count
      FROM ai_processing_metrics
      WHERE created_at > $1 AND error_type IS NOT NULL
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 5`,
      [since]
    );

    const categoryDistribution: Record<string, number> = {};
    for (const row of categoryResult.rows) {
      categoryDistribution[row.category] = parseInt(row.count);
    }

    return {
      totalProcessed: parseInt(statsResult.rows[0].total),
      successCount: parseInt(statsResult.rows[0].success),
      errorCount: parseInt(statsResult.rows[0].error),
      avgQualityScore: Math.round(parseFloat(statsResult.rows[0].avg_quality || 0)),
      categoryDistribution,
      topErrors: errorResult.rows.map(r => r.error_type),
    };
  }
}

// ============================================
// 监控数据库表创建
// ============================================

export const MONITORING_TABLE_SQL = `
-- 处理日志表
CREATE TABLE IF NOT EXISTS ai_processing_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL,
  component VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_processing_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_component ON ai_processing_logs(component);
CREATE INDEX IF NOT EXISTS idx_ai_logs_level ON ai_processing_logs(level);

-- 处理指标表
CREATE TABLE IF NOT EXISTS ai_processing_metrics (
  id SERIAL PRIMARY KEY,
  item_id VARCHAR(50),
  processing_time_ms INTEGER NOT NULL,
  model VARCHAR(50) NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_type VARCHAR(100),
  quality_score INTEGER,
  category VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_created ON ai_processing_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_item ON ai_processing_metrics(item_id);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_success ON ai_processing_metrics(success);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_category ON ai_processing_metrics(category);

-- 告警记录表
CREATE TABLE IF NOT EXISTS ai_alerts (
  id SERIAL PRIMARY KEY,
  rule_id VARCHAR(100) NOT NULL,
  rule_name VARCHAR(200) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  metrics JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_created ON ai_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_rule ON ai_alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_severity ON ai_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_acknowledged ON ai_alerts(acknowledged);
`;

// 导出单例
export const alertManager = new AIAlertManager();
export const metricsCollector = new AIMetricsCollector();
