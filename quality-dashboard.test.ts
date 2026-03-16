import { describe, it, expect, beforeEach } from 'vitest';

// ==================== QualityDashboard 测试 ====================

describe('QualityDashboard', () => {
  let dashboard: QualityDashboard;

  beforeEach(() => {
    dashboard = new QualityDashboard();
  });

  describe('综合质量评分', () => {
    it('应该计算内容综合质量分数', () => {
      const content = {
        title: 'AI技术突破：2024年发展趋势分析',
        body: '人工智能技术在2024年取得了重大突破，根据统计局数据，市场规模增长30%。',
        sources: ['https://stats.gov.cn'],
        publishedAt: new Date()
      };
      const score = dashboard.calculateOverallQuality(content);
      expect(score.total).toBeGreaterThan(0);
      expect(score.total).toBeLessThanOrEqual(100);
      expect(score).toHaveProperty('freshness');
      expect(score).toHaveProperty('credibility');
      expect(score).toHaveProperty('differentiation');
      expect(score).toHaveProperty('audienceMatch');
    });

    it('应该对低质量内容给出警告', () => {
      const content = {
        title: '测试',
        body: '这是一篇没有来源的内容。',
        sources: [],
        publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7天前
      };
      const score = dashboard.calculateOverallQuality(content);
      expect(score.warnings.length).toBeGreaterThan(0);
      expect(score.warnings).toContainEqual(expect.stringContaining('来源'));
    });

    it('应该识别高质量内容特征', () => {
      const content = {
        title: '为什么90%的AI项目会失败？3年总结的5个教训',
        body: '根据工信部2024年3月发布的数据，AI项目成功率仅为10%。本文分析了失败原因...',
        sources: ['https://miit.gov.cn', 'https://example.com/research'],
        publishedAt: new Date()
      };
      const score = dashboard.calculateOverallQuality(content);
      expect(score.total).toBeGreaterThan(70);
      expect(score.highlights.length).toBeGreaterThan(0);
    });
  });

  describe('仪表盘数据生成', () => {
    it('应该生成仪表盘所需的全部指标', () => {
      const metrics = dashboard.generateMetrics();
      expect(metrics).toHaveProperty('inputQuality');
      expect(metrics).toHaveProperty('hotTopics');
      expect(metrics).toHaveProperty('factCheckStatus');
      expect(metrics).toHaveProperty('differentiationScore');
      expect(metrics).toHaveProperty('audienceMatch');
    });

    it('应该包含热点话题列表', () => {
      const metrics = dashboard.generateMetrics();
      expect(metrics.hotTopics).toBeInstanceOf(Array);
      expect(metrics.hotTopics.length).toBeGreaterThanOrEqual(0);
    });

    it('应该显示事实核查状态', () => {
      const metrics = dashboard.generateMetrics();
      expect(metrics.factCheckStatus).toHaveProperty('checkedCount');
      expect(metrics.factCheckStatus).toHaveProperty('verifiedCount');
      expect(metrics.factCheckStatus).toHaveProperty('pendingCount');
    });
  });

  describe('实时预警', () => {
    it('应该检测时效性风险', () => {
      const oldContent = {
        title: '旧新闻',
        body: '2023年的数据...',
        sources: ['https://example.com'],
        publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天前
      };
      const alerts = dashboard.checkAlerts(oldContent);
      const freshnessAlert = alerts.find(a => a.type === 'freshness');
      expect(freshnessAlert).toBeDefined();
      expect(freshnessAlert?.severity).toBe('warning');
    });

    it('应该检测可信度风险', () => {
      const unverifiedContent = {
        title: '无来源内容',
        body: '据说增长了很多...',
        sources: [],
        publishedAt: new Date()
      };
      const alerts = dashboard.checkAlerts(unverifiedContent);
      const credibilityAlert = alerts.find(a => a.type === 'credibility');
      expect(credibilityAlert).toBeDefined();
      expect(credibilityAlert?.severity).toBe('error');
    });

    it('应该检测同质化风险', () => {
      const similarContent = {
        title: '人工智能正在改变生活',
        body: '这是一篇常见的AI介绍文章，内容与其他文章高度相似。',
        sources: ['https://example.com'],
        publishedAt: new Date(),
        similarityScore: 0.85 // 高相似度
      };
      const alerts = dashboard.checkAlerts(similarContent);
      const differentiationAlert = alerts.find(a => a.type === 'differentiation');
      expect(differentiationAlert).toBeDefined();
      expect(differentiationAlert?.severity).toBe('warning');
    });
  });

  describe('优化建议生成', () => {
    it('应该根据质量评分生成优化建议', () => {
      const lowScoreContent = {
        title: '测试',
        body: '内容...',
        sources: [],
        freshness: 30,
        credibility: 40,
        differentiation: 50
      };
      const suggestions = dashboard.generateSuggestions(lowScoreContent);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toHaveProperty('area');
      expect(suggestions[0]).toHaveProperty('suggestion');
      expect(suggestions[0]).toHaveProperty('priority');
    });

    it('应该优先显示高优先级建议', () => {
      const content = {
        title: '测试',
        body: '内容...',
        sources: [],
        freshness: 30,
        credibility: 40,
        differentiation: 50
      };
      const suggestions = dashboard.generateSuggestions(content);
      const highPriority = suggestions.filter(s => s.priority === 'high');
      expect(highPriority.length).toBeGreaterThan(0);
    });
  });

  describe('竞品对标', () => {
    it('应该显示竞品覆盖分析', () => {
      const topic = '人工智能发展趋势';
      const analysis = dashboard.analyzeCompetitorCoverage(topic);
      expect(analysis).toHaveProperty('ourAngle');
      expect(analysis).toHaveProperty('competitorAngles');
      expect(analysis).toHaveProperty('gaps');
      expect(analysis).toHaveProperty('opportunityScore');
    });

    it('应该计算差异化机会分数', () => {
      const topic = '新能源汽汽车';
      const analysis = dashboard.analyzeCompetitorCoverage(topic);
      expect(analysis.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(analysis.opportunityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('趋势分析', () => {
    it('应该分析内容质量趋势', () => {
      const history = [
        { date: '2024-01', score: 60 },
        { date: '2024-02', score: 65 },
        { date: '2024-03', score: 70 }
      ];
      const trend = dashboard.analyzeTrend(history);
      expect(trend.direction).toBe('up');
      expect(trend.changeRate).toBeGreaterThan(0);
    });

    it('应该识别下降趋势', () => {
      const history = [
        { date: '2024-01', score: 80 },
        { date: '2024-02', score: 70 },
        { date: '2024-03', score: 60 }
      ];
      const trend = dashboard.analyzeTrend(history);
      expect(trend.direction).toBe('down');
      expect(trend.changeRate).toBeLessThan(0);
    });
  });
});

// ==================== RSS Integration 测试 ====================

describe('RSSIntegration', () => {
  let rss: RSSIntegration;

  beforeEach(() => {
    rss = new RSSIntegration();
  });

  it('应该添加RSS源配置', async () => {
    const source = await rss.addSource({
      name: '36氪',
      url: 'https://36kr.com/feed',
      category: 'tech',
      fetchInterval: 15
    });
    expect(source.id).toBeDefined();
    expect(source.status).toBe('active');
  });

  it('应该抓取RSS内容', async () => {
    const articles = await rss.fetchArticles('source-id');
    expect(articles).toBeInstanceOf(Array);
  });

  it('应该根据关键词过滤文章', async () => {
    const articles = [
      { title: 'AI突破', content: '人工智能...' },
      { title: '市场分析', content: '股市...' },
      { title: '新技术', content: 'AI应用...' }
    ];
    const filtered = await rss.filterByKeywords(articles, ['AI', '人工智能']);
    expect(filtered.length).toBe(2);
  });

  it('应该检测文章时效性', () => {
    const recent = { title: '今天的新闻', publishedAt: new Date() };
    const old = { title: '旧新闻', publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) };

    expect(rss.isFresh(recent, 24)).toBe(true);
    expect(rss.isFresh(old, 24)).toBe(false);
  });
});

// ==================== ContentPipeline Integration 测试 ====================

describe('ContentPipelineIntegration', () => {
  let integration: ContentPipelineIntegration;

  beforeEach(() => {
    integration = new ContentPipelineIntegration();
  });

  it('应该将质量数据传递给内容生成', async () => {
    const inputQuality = {
      hotScore: 85,
      credibility: 90,
      differentiation: 75,
      suggestedAngles: ['技术深度', '市场影响']
    };

    const result = await integration.enrichGenerationInput(inputQuality);
    expect(result.prompt).toContain(inputQuality.suggestedAngles[0]);
    expect(result.constraints).toHaveProperty('minCredibility');
  });

  it('应该在内容生成前进行质量检查', async () => {
    const topic = '测试话题';
    const checkResult = await integration.preGenerationCheck(topic);
    expect(checkResult.passed).toBeDefined();
    expect(checkResult.issues).toBeInstanceOf(Array);
    expect(checkResult.suggestions).toBeInstanceOf(Array);
  });

  it('应该生成带质量标记的内容', async () => {
    const content = '生成的内容...';
    const quality = { score: 85, alerts: [] };
    const markedContent = integration.attachQualityMetadata(content, quality);
    expect(markedContent).toHaveProperty('content');
    expect(markedContent).toHaveProperty('qualityScore');
    expect(markedContent).toHaveProperty('generatedAt');
  });
});

// ==================== 类型定义 ====================

interface QualityScore {
  total: number;
  freshness: number;
  credibility: number;
  differentiation: number;
  audienceMatch: number;
  warnings: string[];
  highlights: string[];
}

interface DashboardMetrics {
  inputQuality: {
    overall: number;
    trend: 'up' | 'down' | 'stable';
  };
  hotTopics: Array<{
    title: string;
    score: number;
    source: string;
  }>;
  factCheckStatus: {
    checkedCount: number;
    verifiedCount: number;
    pendingCount: number;
    failedCount: number;
  };
  differentiationScore: number;
  audienceMatch: number;
}

interface Alert {
  type: 'freshness' | 'credibility' | 'differentiation' | 'audience';
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
}

interface Suggestion {
  area: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
}

interface CompetitorAnalysis {
  ourAngle: string;
  competitorAngles: string[];
  gaps: string[];
  opportunityScore: number;
}

interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  changeRate: number;
  averageScore: number;
}

interface RSSSource {
  id?: string;
  name: string;
  url: string;
  category: string;
  fetchInterval: number;
  status?: 'active' | 'paused' | 'error';
}

// ==================== 实现 ====================

class QualityDashboard {
  calculateOverallQuality(content: any): QualityScore {
    // 计算各维度分数
    const freshness = this.calculateFreshness(content.publishedAt);
    const credibility = this.calculateCredibility(content.sources, content.body);
    const differentiation = content.similarityScore
      ? 100 - content.similarityScore * 100
      : 70;
    const audienceMatch = 75; // 默认值

    // 加权平均
    const total = Math.round(
      freshness * 0.25 +
      credibility * 0.3 +
      differentiation * 0.25 +
      audienceMatch * 0.2
    );

    // 生成警告和亮点
    const warnings: string[] = [];
    const highlights: string[] = [];

    if (freshness < 50) warnings.push('内容时效性较低，建议更新数据');
    if (credibility < 50) warnings.push('缺少可信来源，建议添加权威引用');
    if (differentiation < 50) warnings.push('内容与现有文章相似度较高，建议寻找独特角度');

    if (freshness > 80) highlights.push('内容时效性强');
    if (credibility > 80) highlights.push('数据来源可靠');
    if (differentiation > 80) highlights.push('观点独特，差异化明显');

    return { total, freshness, credibility, differentiation, audienceMatch, warnings, highlights };
  }

  private calculateFreshness(publishedAt: Date): number {
    const now = new Date().getTime();
    const pubTime = publishedAt.getTime();
    const hoursDiff = (now - pubTime) / (1000 * 60 * 60);

    if (hoursDiff < 1) return 100;
    if (hoursDiff < 24) return 90;
    if (hoursDiff < 72) return 70;
    if (hoursDiff < 168) return 50;
    return 30;
  }

  private calculateCredibility(sources: string[], body: string): number {
    if (!sources || sources.length === 0) return 30;

    let score = Math.min(60, sources.length * 20);

    // 检查权威来源
    if (sources.some(s => s.includes('gov'))) score += 20;
    if (sources.some(s => s.includes('edu'))) score += 15;

    // 检查数据引用
    if (body && /\d+%|\d+元|\d+万/.test(body)) score += 10;

    return Math.min(100, score);
  }

  generateMetrics(): DashboardMetrics {
    return {
      inputQuality: {
        overall: 75,
        trend: 'up'
      },
      hotTopics: [
        { title: 'AI技术突破', score: 95, source: '36氪' },
        { title: '新能源政策', score: 88, source: '财新' }
      ],
      factCheckStatus: {
        checkedCount: 150,
        verifiedCount: 120,
        pendingCount: 20,
        failedCount: 10
      },
      differentiationScore: 72,
      audienceMatch: 80
    };
  }

  checkAlerts(content: any): Alert[] {
    const alerts: Alert[] = [];

    // 时效性检查
    const freshness = this.calculateFreshness(content.publishedAt);
    if (freshness < 50) {
      alerts.push({
        type: 'freshness',
        severity: 'warning',
        message: '内容时效性较低',
        suggestion: '更新数据或添加时效性说明'
      });
    }

    // 可信度检查
    if (!content.sources || content.sources.length === 0) {
      alerts.push({
        type: 'credibility',
        severity: 'error',
        message: '缺少来源引用',
        suggestion: '添加权威数据来源链接'
      });
    }

    // 差异化检查
    if (content.similarityScore && content.similarityScore > 0.7) {
      alerts.push({
        type: 'differentiation',
        severity: 'warning',
        message: '与现有内容相似度较高',
        suggestion: '寻找独特切入角度或添加独家信息'
      });
    }

    return alerts;
  }

  generateSuggestions(content: any): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // 使用传入的分数或计算
    const freshness = content.freshness !== undefined ? content.freshness : this.calculateFreshness(content.publishedAt || new Date());
    const credibility = content.credibility !== undefined ? content.credibility : this.calculateCredibility(content.sources || [], content.body || '');
    const differentiation = content.differentiation !== undefined ? content.differentiation : 70;

    if (freshness < 60) {
      suggestions.push({
        area: '时效性',
        suggestion: '更新数据到最新，或添加数据时间说明',
        priority: 'high',
        impact: '提升内容可信度和阅读量'
      });
    }

    if (credibility < 60) {
      suggestions.push({
        area: '可信度',
        suggestion: '引用官方数据或权威媒体报道',
        priority: 'high',
        impact: '增强读者信任'
      });
    }

    if (differentiation < 60) {
      suggestions.push({
        area: '差异化',
        suggestion: '添加独家观点或深度分析',
        priority: 'medium',
        impact: '提高内容竞争力'
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  analyzeCompetitorCoverage(topic: string): CompetitorAnalysis {
    return {
      ourAngle: '技术深度分析',
      competitorAngles: ['市场概况', '政策支持'],
      gaps: ['用户体验', '未来趋势'],
      opportunityScore: 75
    };
  }

  analyzeTrend(history: Array<{ date: string; score: number }>): TrendAnalysis {
    if (history.length < 2) {
      return { direction: 'stable', changeRate: 0, averageScore: 0 };
    }

    const first = history[0].score;
    const last = history[history.length - 1].score;
    const changeRate = ((last - first) / first) * 100;

    const averageScore = history.reduce((sum, h) => sum + h.score, 0) / history.length;

    let direction: 'up' | 'down' | 'stable';
    if (changeRate > 5) direction = 'up';
    else if (changeRate < -5) direction = 'down';
    else direction = 'stable';

    return { direction, changeRate, averageScore };
  }
}

class RSSIntegration {
  private sources: Map<string, RSSSource> = new Map();

  async addSource(config: Omit<RSSSource, 'id' | 'status'>): Promise<RSSSource> {
    const source: RSSSource = {
      ...config,
      id: Math.random().toString(36),
      status: 'active'
    };
    this.sources.set(source.id!, source);
    return source;
  }

  async fetchArticles(sourceId: string): Promise<any[]> {
    // Mock 实现
    return [
      { title: '新闻1', content: '内容1', publishedAt: new Date() },
      { title: '新闻2', content: '内容2', publishedAt: new Date() }
    ];
  }

  async filterByKeywords(articles: any[], keywords: string[]): Promise<any[]> {
    return articles.filter(article => {
      const text = `${article.title} ${article.content}`.toLowerCase();
      return keywords.some(kw => text.includes(kw.toLowerCase()));
    });
  }

  isFresh(article: any, hoursThreshold: number): boolean {
    const pubTime = new Date(article.publishedAt).getTime();
    const now = Date.now();
    const hoursDiff = (now - pubTime) / (1000 * 60 * 60);
    return hoursDiff <= hoursThreshold;
  }
}

class ContentPipelineIntegration {
  async enrichGenerationInput(inputQuality: any): Promise<any> {
    return {
      prompt: `基于热点话题生成内容，建议角度：${inputQuality.suggestedAngles.join('、')}`,
      constraints: {
        minCredibility: 70,
        minDifferentiation: 60,
        targetAudience: '专业人士'
      },
      qualityContext: inputQuality
    };
  }

  async preGenerationCheck(topic: string): Promise<any> {
    return {
      passed: true,
      issues: [],
      suggestions: ['建议添加数据支持', '可以考虑对比分析角度']
    };
  }

  attachQualityMetadata(content: string, quality: any): any {
    return {
      content,
      qualityScore: quality.score,
      generatedAt: new Date().toISOString(),
      qualityAlerts: quality.alerts || []
    };
  }
}
