import { describe, it, expect, beforeEach } from 'vitest';

// ==================== SentimentAnalyzer 测试 ====================

describe('SentimentAnalyzer', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
  });

  describe('情感极性分析', () => {
    it('应该识别正面情感', () => {
      const text = '公司业绩大幅增长，利润创新高，前景光明';
      const result = analyzer.analyzePolarity(text);
      expect(result.polarity).toBe('positive');
    });

    it('应该识别负面情感', () => {
      const text = '公司亏损严重，裁员风波不断，前景堪忧';
      const result = analyzer.analyzePolarity(text);
      expect(result.polarity).toBe('negative');
    });

    it('应该识别中性情感', () => {
      const text = '公司发布第三季度财报，营收100亿元';
      const result = analyzer.analyzePolarity(text);
      expect(result.polarity).toBe('neutral');
    });

    it('应该处理混合情感', () => {
      const text = '虽然公司业绩大幅增长创新高，但市场担忧经济衰退风险';
      const result = analyzer.analyzeMixedSentiment(text);
      expect(result.dominant).toBeDefined();
      expect(result.hasBothPolarities).toBe(true);
    });
  });

  describe('情感强度计算', () => {
    it('应该计算高强度正面情感', () => {
      const text = '绝对是重大突破！前所未有的成功！';
      const result = analyzer.analyzeIntensity(text);
      expect(result.intensity).toBeGreaterThanOrEqual(80);
    });

    it('应该计算低强度正面情感', () => {
      const text = '略有增长，表现尚可';
      const result = analyzer.analyzeIntensity(text);
      expect(result.intensity).toBeLessThan(50);
    });

    it('应该识别情感关键词', () => {
      const text = '暴涨暴跌震荡起伏';
      const keywords = analyzer.extractEmotionKeywords(text);
      expect(keywords.length).toBeGreaterThan(0);
    });
  });

  describe('市场情绪指数 (MSI)', () => {
    it('应该计算市场情绪指数', () => {
      const topics = [
        { title: '股市大涨，投资者欢欣鼓舞', sentiment: 'positive', weight: 1 },
        { title: '经济数据向好', sentiment: 'positive', weight: 0.8 },
        { title: '政策利好出台', sentiment: 'positive', weight: 0.9 }
      ];

      const msi = analyzer.calculateMSI(topics);
      expect(msi.value).toBeGreaterThan(50);
      expect(msi.level).toMatch(/greed|extreme_greed/);
    });

    it('应该识别极度恐慌市场', () => {
      const topics = [
        { title: '股市崩盘，恐慌性抛售', sentiment: 'negative', weight: 1 },
        { title: '经济危机来袭', sentiment: 'negative', weight: 0.9 },
        { title: '大规模裁员', sentiment: 'negative', weight: 0.8 }
      ];

      const msi = analyzer.calculateMSI(topics);
      expect(msi.value).toBeLessThan(30);
      expect(msi.level).toMatch(/fear|extreme_fear/);
    });

    it('应该计算24小时变化', () => {
      const currentMSI = { value: 75 };
      const previousMSI = { value: 65 };
      const change = analyzer.calculateMSIChange(currentMSI, previousMSI);
      expect(change).toBe(10);
    });
  });

  describe('情绪异常预警', () => {
    it('应该在情绪剧烈变化时预警', () => {
      const history = [
        { timestamp: Date.now() - 3600000, msi: 50 },
        { timestamp: Date.now(), msi: 80 }
      ];
      const alert = analyzer.detectAnomaly(history);
      expect(alert.triggered).toBe(true);
      expect(alert.type).toBe('sentiment_spike');
    });

    it('应该在极度贪婪时预警', () => {
      const msi = { value: 95, level: 'extreme_greed' };
      const alert = analyzer.checkExtremeSentiment(msi);
      expect(alert.triggered).toBe(true);
      expect(alert.level).toBe('extreme_greed');
    });

    it('应该在极度恐慌时预警', () => {
      const msi = { value: 10, level: 'extreme_fear' };
      const alert = analyzer.checkExtremeSentiment(msi);
      expect(alert.triggered).toBe(true);
      expect(alert.level).toBe('extreme_fear');
    });
  });

  describe('批量分析', () => {
    it('应该批量分析多篇文章', async () => {
      const articles = [
        { id: '1', content: '好消息，业绩增长' },
        { id: '2', content: '坏消息，市场下跌' },
        { id: '3', content: '平平淡淡的数据' }
      ];

      const results = await analyzer.batchAnalyze(articles);
      expect(results).toHaveLength(3);
      expect(results[0].polarity).toBe('positive');
      expect(results[1].polarity).toBe('negative');
    });

    it('应该聚合话题情感', () => {
      const articles = [
        { polarity: 'positive', intensity: 80 },
        { polarity: 'positive', intensity: 60 },
        { polarity: 'negative', intensity: 40 }
      ];

      const aggregated = analyzer.aggregateSentiment(articles);
      expect(aggregated.distribution.positive).toBeGreaterThan(0);
      expect(aggregated.overall).toBeGreaterThan(0);
    });
  });

  describe('性能要求', () => {
    it('单条分析应该在100ms内完成', () => {
      const text = '这是一段测试文本';
      const start = Date.now();
      analyzer.analyze(text);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('批量100条应该在1秒内完成', async () => {
      const articles = Array(100).fill(null).map((_, i) => ({
        id: `a${i}`,
        content: `测试内容 ${i}`
      }));

      const start = Date.now();
      await analyzer.batchAnalyze(articles);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });
});

// ==================== 类型定义 ====================

interface SentimentResult {
  polarity: 'positive' | 'negative' | 'neutral';
  intensity: number;
  confidence: number;
  keywords: string[];
}

interface MSIResult {
  value: number;
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  change24h: number;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

interface SentimentAlert {
  triggered: boolean;
  type?: string;
  level?: string;
  message?: string;
  timestamp: Date;
}

// ==================== 实现 ====================

class SentimentAnalyzer {
  private positiveWords = new Set(['增长', '突破', '利好', '成功', '创新', '强劲', '乐观', '上涨', '大涨', '飙升', '创历史新高', '新高']);
  private negativeWords = new Set(['下跌', '亏损', '裁员', '危机', '担忧', '恐慌', '暴跌', '崩盘', '萎缩', '衰退', '风险']);
  private intensifiers = new Set(['非常', '极其', '绝对', '前所未有', '大幅', '严重']);

  analyze(text: string): SentimentResult {
    const polarity = this.analyzePolarity(text);
    const intensity = this.analyzeIntensity(text);
    const keywords = this.extractEmotionKeywords(text);

    return {
      polarity: polarity.polarity,
      intensity: intensity.intensity,
      confidence: 0.85,
      keywords
    };
  }

  analyzePolarity(text: string): { polarity: 'positive' | 'negative' | 'neutral' } {
    let positiveScore = 0;
    let negativeScore = 0;

    for (const word of this.positiveWords) {
      if (text.includes(word)) positiveScore++;
    }

    for (const word of this.negativeWords) {
      if (text.includes(word)) negativeScore++;
    }

    if (positiveScore > negativeScore) return { polarity: 'positive' };
    if (negativeScore > positiveScore) return { polarity: 'negative' };
    return { polarity: 'neutral' };
  }

  analyzeIntensity(text: string): { intensity: number } {
    let intensity = 30; // 基础强度

    // 检查强化词
    for (const word of this.intensifiers) {
      if (text.includes(word)) intensity += 20;
    }

    // 检查标点（感叹号表示强烈情感）
    const exclamationCount = (text.match(/!/g) || []).length;
    intensity += exclamationCount * 10;

    // 检查情感词密度
    let emotionWordCount = 0;
    for (const word of [...this.positiveWords, ...this.negativeWords]) {
      if (text.includes(word)) emotionWordCount++;
    }
    intensity += emotionWordCount * 5;

    return { intensity: Math.min(100, intensity) };
  }

  analyzeMixedSentiment(text: string): { dominant: string; hasBothPolarities: boolean } {
    const positiveCount = [...this.positiveWords].filter(w => text.includes(w)).length;
    const negativeCount = [...this.negativeWords].filter(w => text.includes(w)).length;

    return {
      dominant: positiveCount > negativeCount ? 'positive' : 'negative',
      hasBothPolarities: positiveCount > 0 && negativeCount > 0
    };
  }

  extractEmotionKeywords(text: string): string[] {
    const keywords: string[] = [];

    for (const word of this.positiveWords) {
      if (text.includes(word)) keywords.push(word);
    }

    for (const word of this.negativeWords) {
      if (text.includes(word)) keywords.push(word);
    }

    return [...new Set(keywords)];
  }

  calculateMSI(topics: Array<{ sentiment: string; weight: number }>): MSIResult {
    let totalScore = 50; // 中性基准
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    for (const topic of topics) {
      if (topic.sentiment === 'positive') {
        totalScore += topic.weight * 10;
        positiveCount++;
      } else if (topic.sentiment === 'negative') {
        totalScore -= topic.weight * 10;
        negativeCount++;
      } else {
        neutralCount++;
      }
    }

    const value = Math.max(0, Math.min(100, totalScore));

    let level: MSIResult['level'] = 'neutral';
    if (value >= 90) level = 'extreme_greed';
    else if (value >= 75) level = 'greed';
    else if (value <= 10) level = 'extreme_fear';
    else if (value <= 25) level = 'fear';

    const total = positiveCount + negativeCount + neutralCount || 1;

    return {
      value,
      level,
      change24h: 0,
      distribution: {
        positive: positiveCount / total,
        neutral: neutralCount / total,
        negative: negativeCount / total
      }
    };
  }

  calculateMSIChange(current: { value: number }, previous: { value: number }): number {
    return current.value - previous.value;
  }

  detectAnomaly(history: Array<{ timestamp: number; msi: number }>): SentimentAlert {
    if (history.length < 2) {
      return { triggered: false, timestamp: new Date() };
    }

    const recent = history[history.length - 1];
    const previous = history[history.length - 2];
    const change = Math.abs(recent.msi - previous.msi);

    if (change > 20) {
      return {
        triggered: true,
        type: 'sentiment_spike',
        message: `市场情绪剧烈变化: ${change}点`,
        timestamp: new Date()
      };
    }

    return { triggered: false, timestamp: new Date() };
  }

  checkExtremeSentiment(msi: { value: number; level: string }): SentimentAlert {
    if (msi.level === 'extreme_greed' || msi.level === 'extreme_fear') {
      return {
        triggered: true,
        type: 'extreme_sentiment',
        level: msi.level,
        message: msi.level === 'extreme_greed' ? '市场极度贪婪，注意风险' : '市场极度恐慌，可能存在机会',
        timestamp: new Date()
      };
    }

    return { triggered: false, timestamp: new Date() };
  }

  async batchAnalyze(articles: Array<{ id: string; content: string }>): Promise<SentimentResult[]> {
    return articles.map(article => this.analyze(article.content));
  }

  aggregateSentiment(results: Array<{ polarity: string; intensity: number }>): { overall: number; distribution: { positive: number; neutral: number; negative: number } } {
    const total = results.length || 1;
    const positive = results.filter(r => r.polarity === 'positive').length;
    const negative = results.filter(r => r.polarity === 'negative').length;
    const neutral = results.filter(r => r.polarity === 'neutral').length;

    const avgIntensity = results.reduce((sum, r) => sum + r.intensity, 0) / total;
    const sentimentScore = (positive - negative) / total * 50 + 50;

    return {
      overall: Math.round((sentimentScore + avgIntensity) / 2),
      distribution: {
        positive: positive / total,
        neutral: neutral / total,
        negative: negative / total
      }
    };
  }
}

export { SentimentAnalyzer };
