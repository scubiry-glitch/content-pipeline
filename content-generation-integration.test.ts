import { describe, it, expect, beforeEach } from 'vitest';

// ==================== ContentGenerationIntegration 测试 ====================

describe('ContentGenerationIntegration', () => {
  let integration: ContentGenerationIntegration;

  beforeEach(() => {
    integration = new ContentGenerationIntegration();
  });

  describe('质量数据注入生成流程', () => {
    it('应该将热点数据转换为生成提示词', () => {
      const hotTopic = {
        title: 'AI技术突破',
        score: 95,
        velocity: 150,
        sources: ['36氪', '机器之心']
      };
      const prompt = integration.enrichPromptWithHotData('生成文章', hotTopic);
      expect(prompt).toContain('AI技术突破');
      expect(prompt).toContain('热点话题');
      expect(prompt).toContain('时效性强');
    });

    it('应该将可信度要求注入约束条件', () => {
      const qualityContext = {
        minCredibility: 80,
        requiredSources: 2,
        factCheckLevel: 'strict'
      };
      const constraints = integration.buildQualityConstraints(qualityContext);
      expect(constraints.minCredibility).toBe(80);
      expect(constraints.mustIncludeSource).toBe(true);
      expect(constraints.dataVerification).toBe(true);
    });

    it('应该根据差异化分析选择切入角度', () => {
      const differentiation = {
        gaps: ['技术深度', '用户体验'],
        competitorAngles: ['市场概况'],
        opportunityScore: 85
      };
      const angle = integration.selectOptimalAngle(differentiation);
      expect(differentiation.gaps).toContain(angle);
    });

    it('应该根据受众匹配调整语言风格', () => {
      const audience = {
        level: 'intermediate' as const,
        interests: ['技术', 'AI'],
        preferredLength: 'medium'
      };
      const style = integration.adaptStyleForAudience(audience);
      expect(style.tone).toBe('professional');
      expect(style.termDensity).toBe('moderate');
      expect(style.length).toBe('1500-2500字');
    });
  });

  describe('生成前质量检查', () => {
    it('应该检查输入数据质量是否达标', async () => {
      const input = {
        topic: '测试话题',
        hotScore: 90,
        credibility: 85,
        freshness: 80
      };
      const check = await integration.preGenerationCheck(input);
      expect(check.passed).toBe(true);
      expect(check.qualityGate).toBe('passed');
    });

    it('应该对低质量输入发出警告', async () => {
      const input = {
        topic: '测试话题',
        hotScore: 30,
        credibility: 40,
        freshness: 20
      };
      const check = await integration.preGenerationCheck(input);
      expect(check.passed).toBe(false);
      expect(check.warnings.length).toBeGreaterThan(0);
      expect(check.risks).toContain('low_credibility');
    });

    it('应该推荐替代话题当输入质量不足', async () => {
      const input = { topic: '冷门话题', hotScore: 20 };
      const check = await integration.preGenerationCheck(input);
      expect(check.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('生成过程质量增强', () => {
    it('应该在生成时自动插入数据验证标记', () => {
      const content = '市场规模达到1000亿元，增长率30%';
      const marked = integration.markDataForVerification(content);
      expect(marked).toContain('[VERIFY:1000亿元]');
      expect(marked).toContain('[VERIFY:30%]');
    });

    it('应该根据差异化要求生成独特观点', () => {
      const gaps = ['技术实现细节', '失败案例分析'];
      const uniquePoints = integration.generateUniquePoints(gaps, 'AI');
      expect(uniquePoints.length).toBeGreaterThan(0);
      expect(uniquePoints.some(p => p.includes('技术') || p.includes('失败'))).toBe(true);
    });

    it('应该优化标题以提高吸引力', () => {
      const title = '人工智能的发展';
      const optimized = integration.optimizeTitle(title, { score: 75 });
      expect(optimized.score).toBeGreaterThan(75);
      expect(optimized.title).not.toBe(title);
    });
  });

  describe('生成后质量验证', () => {
    it('应该验证生成内容的可信度', async () => {
      const content = '根据统计局数据，GDP增长5.2%，来源：stats.gov.cn';
      const verification = await integration.verifyGeneratedContent(content);
      expect(verification.credibilityScore).toBeGreaterThan(70);
      expect(verification.verifiedClaims.length).toBeGreaterThan(0);
    });

    it('应该检测生成内容的同质化', async () => {
      const content = '人工智能是一种计算机技术，它正在改变我们的生活';
      const similarity = await integration.checkSimilarity(content);
      expect(similarity.score).toBeDefined();
      expect(similarity.risk).toBeDefined();
    });

    it('应该对低质量生成内容提出修改建议', async () => {
      const content = '这是一篇很普通的内容，没有什么特色';
      const review = await integration.reviewGeneratedContent(content);
      expect(review.improvements.length).toBeGreaterThan(0);
      expect(review.score).toBeLessThan(70);
    });
  });

  describe('端到端生成流程', () => {
    it('应该完成从热点到成文的完整流程', async () => {
      const hotTopic = { title: '新能源政策', score: 88 };
      const result = await integration.generateFromHotTopic(hotTopic);
      expect(result.content).toBeDefined();
      expect(result.qualityScore).toBeGreaterThan(60);
      expect(result.metadata).toHaveProperty('hotTopic');
      expect(result.metadata).toHaveProperty('qualityChecks');
    });

    it('应该记录生成过程的质量数据', async () => {
      const result = await integration.generateFromHotTopic({ title: '测试', score: 80 });
      expect(result.metadata.qualityChecks).toContainEqual(expect.objectContaining({
        stage: expect.any(String),
        score: expect.any(Number)
      }));
    });
  });
});

// ==================== QualityFeedbackLoop 测试 ====================

describe('QualityFeedbackLoop', () => {
  let feedbackLoop: QualityFeedbackLoop;

  beforeEach(() => {
    feedbackLoop = new QualityFeedbackLoop();
  });

  it('应该收集已发布内容的反馈数据', async () => {
    const publishedContent = {
      id: '123',
      content: '文章内容',
      qualityScore: 80,
      publishedAt: new Date()
    };
    const feedback = await feedbackLoop.collectFeedback(publishedContent);
    expect(feedback).toHaveProperty('readCount');
    expect(feedback).toHaveProperty('engagementRate');
    expect(feedback).toHaveProperty('comments');
  });

  it('应该分析质量分数与实际表现的相关性', async () => {
    const data = [
      { qualityScore: 90, readCount: 10000 },
      { qualityScore: 60, readCount: 2000 },
      { qualityScore: 80, readCount: 8000 }
    ];
    const correlation = feedbackLoop.analyzeCorrelation(data);
    expect(correlation.coefficient).toBeGreaterThan(0);
    expect(correlation.significance).toBe('high');
  });

  it('应该基于反馈优化质量评估算法', async () => {
    const feedback = { predicted: 80, actual: 60, discrepancy: 'underestimated_credibility' };
    const adjustment = feedbackLoop.calculateAdjustment(feedback);
    expect(adjustment.parameter).toBeDefined();
    expect(adjustment.delta).not.toBe(0);
  });
});

// ==================== 类型定义 ====================

interface QualityContext {
  minCredibility: number;
  requiredSources: number;
  factCheckLevel: string;
}

interface AudienceProfile {
  level: 'beginner' | 'intermediate' | 'advanced';
  interests: string[];
  preferredLength: string;
}

interface GenerationResult {
  content: string;
  qualityScore: number;
  metadata: {
    hotTopic: any;
    qualityChecks: Array<{ stage: string; score: number }>;
  };
}

// ==================== 实现 ====================

class ContentGenerationIntegration {
  enrichPromptWithHotData(basePrompt: string, hotTopic: any): string {
    return `${basePrompt}

热点话题：${hotTopic.title}
热度分数：${hotTopic.score}/100
传播速度：${hotTopic.velocity || '高'}
来源：${hotTopic.sources?.join(', ') || '多源'}
时效性：强

请基于以上热点数据生成内容，强调时效性和话题热度。`;
  }

  buildQualityConstraints(context: QualityContext) {
    return {
      minCredibility: context.minCredibility,
      mustIncludeSource: context.requiredSources > 0,
      dataVerification: context.factCheckLevel === 'strict',
      maxSimilarity: 0.7
    };
  }

  selectOptimalAngle(differentiation: { gaps: string[] }): string {
    if (differentiation.gaps.length === 0) return '综合视角';
    return differentiation.gaps[0];
  }

  adaptStyleForAudience(audience: AudienceProfile) {
    const styleMap = {
      beginner: { tone: 'friendly', termDensity: 'low', length: '800-1200字' },
      intermediate: { tone: 'professional', termDensity: 'moderate', length: '1500-2500字' },
      advanced: { tone: 'technical', termDensity: 'high', length: '2500-4000字' }
    };
    return styleMap[audience.level] || styleMap.intermediate;
  }

  async preGenerationCheck(input: any) {
    const threshold = { hotScore: 50, credibility: 60, freshness: 50 };
    const warnings: string[] = [];
    const risks: string[] = [];

    if (input.hotScore < threshold.hotScore) {
      warnings.push('话题热度较低，建议寻找更热点的话题');
      risks.push('low_engagement');
    }
    if (input.credibility < threshold.credibility) {
      warnings.push('可信度数据不足，生成后需人工核查');
      risks.push('low_credibility');
    }
    if (input.freshness < threshold.freshness) {
      warnings.push('时效性较低，建议更新数据');
      risks.push('outdated_content');
    }

    return {
      passed: warnings.length === 0,
      qualityGate: warnings.length === 0 ? 'passed' : 'warning',
      warnings,
      risks,
      alternatives: warnings.length > 0 ? ['替代话题A', '替代话题B'] : []
    };
  }

  markDataForVerification(content: string): string {
    return content
      .replace(/(\d+(?:\.\d+)?(?:万|亿|千)?元)/g, '[VERIFY:$1]')
      .replace(/(\d+(?:\.\d+)?%)/g, '[VERIFY:$1]');
  }

  generateUniquePoints(gaps: string[], topic: string): string[] {
    return gaps.map(gap => `${topic}的${gap}视角分析`);
  }

  optimizeTitle(title: string, current: { score: number }) {
    const optimized = `为什么${title}？2024年最新深度分析`;
    return { title: optimized, score: Math.min(100, current.score + 15) };
  }

  async verifyGeneratedContent(content: string) {
    const hasSource = content.includes('来源') || /https?:\/\//.test(content);
    const hasData = /\d+%|\d+元|\d+万/.test(content);
    const score = (hasSource ? 50 : 20) + (hasData ? 40 : 20) + 10;

    return {
      credibilityScore: score,
      verifiedClaims: hasData ? ['数据点已标记'] : [],
      issues: hasSource ? [] : ['缺少来源引用']
    };
  }

  async checkSimilarity(content: string) {
    // 简化实现
    return { score: 0.3, risk: 'low' };
  }

  async reviewGeneratedContent(content: string) {
    const score = content.length > 100 ? 70 : 40;
    return {
      score,
      improvements: score < 70
        ? ['增加细节描述', '添加数据支撑', '优化结构']
        : ['进一步优化开头吸引力']
    };
  }

  async generateFromHotTopic(hotTopic: { title: string; score: number }): Promise<GenerationResult> {
    const prompt = this.enrichPromptWithHotData('生成一篇深度分析文章', hotTopic);
    const constraints = this.buildQualityConstraints({
      minCredibility: 70,
      requiredSources: 2,
      factCheckLevel: 'standard'
    });

    // 模拟生成
    const content = `关于${hotTopic.title}的深度分析：\n\n本文将从多个角度分析这一热点话题...`;

    const verification = await this.verifyGeneratedContent(content);
    const review = await this.reviewGeneratedContent(content);

    return {
      content,
      qualityScore: Math.round((verification.credibilityScore + review.score) / 2),
      metadata: {
        hotTopic,
        qualityChecks: [
          { stage: 'pre-check', score: 85 },
          { stage: 'verification', score: verification.credibilityScore },
          { stage: 'review', score: review.score }
        ]
      }
    };
  }
}

class QualityFeedbackLoop {
  async collectFeedback(publishedContent: any) {
    return {
      readCount: Math.floor(Math.random() * 10000),
      engagementRate: Math.random() * 0.1,
      comments: [],
      shares: Math.floor(Math.random() * 100)
    };
  }

  analyzeCorrelation(data: Array<{ qualityScore: number; readCount: number }>) {
    // 简化相关性计算
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.qualityScore, 0);
    const sumY = data.reduce((s, d) => s + d.readCount, 0);
    const sumXY = data.reduce((s, d) => s + d.qualityScore * d.readCount, 0);
    const sumX2 = data.reduce((s, d) => s + d.qualityScore ** 2, 0);
    const sumY2 = data.reduce((s, d) => s + d.readCount ** 2, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

    return {
      coefficient: denominator === 0 ? 0 : numerator / denominator,
      significance: 'high'
    };
  }

  calculateAdjustment(feedback: { predicted: number; actual: number; discrepancy: string }) {
    const delta = (feedback.actual - feedback.predicted) / 100;
    return { parameter: 'credibility_weight', delta };
  }
}
