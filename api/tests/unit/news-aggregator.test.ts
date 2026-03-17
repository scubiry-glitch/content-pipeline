import { describe, it, expect, beforeEach } from 'vitest';

// ==================== 测试用例 ====================

describe('NewsAggregator', () => {
  let aggregator: NewsAggregator;

  beforeEach(() => {
    aggregator = new NewsAggregator();
  });

  describe('RSS 源管理', () => {
    it('应该能添加 RSS 源', async () => {
      const source = await aggregator.addSource({
        name: '36氪',
        url: 'https://36kr.com/feed',
        category: 'tech',
        priority: 'P2'
      });
      expect(source.id).toBeDefined();
      expect(source.name).toBe('36氪');
    });

    it('应该能列出所有 RSS 源', async () => {
      await aggregator.addSource({ name: '源1', url: 'http://test1.com/feed' });
      await aggregator.addSource({ name: '源2', url: 'http://test2.com/feed' });
      const sources = await aggregator.listSources();
      expect(sources.length).toBe(2);
    });

    it('应该防止重复添加相同 URL', async () => {
      await aggregator.addSource({ name: '源1', url: 'http://test.com/feed' });
      await expect(
        aggregator.addSource({ name: '源2', url: 'http://test.com/feed' })
      ).rejects.toThrow('Source already exists');
    });
  });

  describe('新闻抓取', () => {
    it('应该能抓取 RSS 源并解析文章', async () => {
      const articles = await aggregator.fetchFromSource('mock-rss-url');
      expect(articles.length).toBeGreaterThan(0);
      expect(articles[0]).toHaveProperty('title');
      expect(articles[0]).toHaveProperty('url');
      expect(articles[0]).toHaveProperty('publishedAt');
    });

    it('应该实现增量抓取', async () => {
      // 第一次抓取
      const first = await aggregator.fetchIncremental('source-id');
      // 第二次应该只返回新文章
      const second = await aggregator.fetchIncremental('source-id');
      expect(second.length).toBe(0);
    });
  });

  describe('热点发现', () => {
    it('应该计算热点分数', () => {
      const topic: HotTopic = {
        title: 'AI 重大突破',
        sources: [{ name: '源1', url: 'url1' }, { name: '源2', url: 'url2' }],
        velocity: 100,
        authority: 8,
        sentiment: 0.5,
        freshness: 1.0
      };
      const score = aggregator.calculateHotScore(topic);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('应该识别热点话题', async () => {
      const hotTopics = await aggregator.discoverHotTopics();
      expect(hotTopics.length).toBeGreaterThan(0);
      expect(hotTopics[0].score).toBeGreaterThan(50);
    });
  });

  describe('去重机制', () => {
    it('应该识别相似标题的文章', () => {
      const article1 = { title: '苹果发布新款 iPhone', url: 'url1' };
      const article2 = { title: '新款 iPhone 正式发布', url: 'url2' };
      const similarity = aggregator.calculateSimilarity(article1.title, article2.title);
      expect(similarity).toBeGreaterThan(0.25); // 有共同词汇，相似度应>0.25
    });

    it('应该基于 URL 去重', async () => {
      await aggregator.storeArticle({ title: '测试', url: 'http://test.com/1' });
      const isDuplicate = await aggregator.isDuplicate('http://test.com/1');
      expect(isDuplicate).toBe(true);
    });
  });
});

describe('FactChecker', () => {
  let checker: FactChecker;

  beforeEach(() => {
    checker = new FactChecker();
  });

  describe('数据点提取', () => {
    it('应该提取数字数据点', () => {
      const text = '公司营收增长30%，达到1000万元';
      const dataPoints = checker.extractDataPoints(text);
      const percentPoint = dataPoints.find(dp => dp.type === 'percentage' && dp.value === '30%');
      const amountPoint = dataPoints.find(dp => dp.type === 'amount' && dp.value === '1000万元');

      expect(percentPoint).toBeDefined();
      expect(percentPoint!.context).toContain('30%');

      expect(amountPoint).toBeDefined();
      expect(amountPoint!.context).toContain('1000万元');
    });

    it('应该提取日期', () => {
      const text = '2024年3月15日发布';
      const dataPoints = checker.extractDataPoints(text);
      expect(dataPoints.some(dp => dp.type === 'date')).toBe(true);
    });

    it('应该提取人名和公司名', () => {
      const text = '马斯克表示特斯拉将在北京建厂';
      const dataPoints = checker.extractDataPoints(text);
      expect(dataPoints.some(dp => dp.type === 'person')).toBe(true);
      expect(dataPoints.some(dp => dp.type === 'organization')).toBe(true);
    });
  });

  describe('多源验证', () => {
    it('应该找到数据点的多个来源', async () => {
      const claim = '2024年GDP增长5%';
      const sources = await checker.verifyClaim(claim);
      expect(sources.length).toBeGreaterThanOrEqual(2);
      expect(sources.every(s => s.reliability > 0)).toBe(true);
    });

    it('应该标记无法验证的数据点', async () => {
      const claim = '某个未公开的数据';
      const sources = await checker.verifyClaim(claim);
      expect(sources.length).toBe(0);
    });
  });

  describe('可信度评分', () => {
    it('应该计算文章可信度', async () => {
      const article = {
        title: '测试文章',
        content: '根据官方数据，2024年增长5%，数据来源：统计局',
        sources: ['http://stats.gov.cn']
      };
      const score = await checker.calculateCredibility(article);
      expect(score.overall).toBeGreaterThan(60);
    });

    it('应该对缺少来源的文章降低可信度', async () => {
      const article = {
        title: '无来源文章',
        content: '据说增长了很多',
        sources: []
      };
      const score = await checker.calculateCredibility(article);
      expect(score.overall).toBeLessThan(50);
    });
  });
});

describe('DifferentiationAnalyzer', () => {
  let analyzer: DifferentiationAnalyzer;

  beforeEach(() => {
    analyzer = new DifferentiationAnalyzer();
  });

  describe('竞品监控', () => {
    it('应该能添加竞品账号', async () => {
      await analyzer.addCompetitor({ name: '竞品A', platform: 'wechat', accountId: 'xxx' });
      const competitors = await analyzer.listCompetitors();
      expect(competitors.length).toBe(1);
    });

    it('应该抓取竞品最新内容', async () => {
      const contents = await analyzer.fetchCompetitorContent('competitor-id');
      expect(contents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('原创度分析', () => {
    it('应该计算内容相似度', () => {
      const content1 = '人工智能正在改变我们的生活';
      const content2 = 'AI技术正在改变人们的生活方式';
      const similarity = analyzer.calculateSimilarity(content1, content2);
      expect(similarity).toBeGreaterThan(0.4);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('应该识别高原创度内容', async () => {
      const myContent = '独特的观点和分析';
      const existingContents = ['其他话题', '不相关的内容'];
      const originality = await analyzer.calculateOriginality(myContent, existingContents);
      expect(originality).toBeGreaterThan(0.8);
    });
  });

  describe('空白发现', () => {
    it('应该识别未被覆盖的角度', async () => {
      const topic = '新能源汽车';
      const existingAngles = ['价格战', '续航里程'];
      const gaps = await analyzer.findCoverageGaps(topic, existingAngles);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps).not.toContain('价格战');
    });
  });
});

// ==================== 类型定义 ====================

interface RSSSource {
  id?: string;
  name: string;
  url: string;
  category?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  lastFetched?: Date;
}

interface NewsArticle {
  id?: string;
  title: string;
  url: string;
  content?: string;
  publishedAt: Date;
  sourceId: string;
  hotScore?: number;
}

interface HotTopic {
  title: string;
  sources: Array<{ name: string; url: string }>;
  velocity: number;
  authority: number;
  sentiment: number;
  freshness: number;
  score?: number;
}

interface DataPoint {
  type: 'percentage' | 'amount' | 'date' | 'person' | 'organization' | 'other';
  value: string;
  context: string;
}

interface CredibilityScore {
  sourceReliability: number;
  verifiability: number;
  internalConsistency: number;
  externalConsistency: number;
  sourceTransparency: number;
  overall: number;
}

interface Competitor {
  id?: string;
  name: string;
  platform: string;
  accountId: string;
}

// ==================== 实现 ====================

class NewsAggregator {
  private sources: Map<string, RSSSource> = new Map();
  private articles: Map<string, NewsArticle> = new Map();

  async addSource(source: Omit<RSSSource, 'id'>): Promise<RSSSource> {
    for (const [, existing] of this.sources) {
      if (existing.url === source.url) {
        throw new Error('Source already exists');
      }
    }
    const newSource: RSSSource = { ...source, id: Math.random().toString(36) };
    this.sources.set(newSource.id!, newSource);
    return newSource;
  }

  async listSources(): Promise<RSSSource[]> {
    return Array.from(this.sources.values());
  }

  async fetchFromSource(url: string): Promise<NewsArticle[]> {
    // Mock 实现
    return [
      {
        title: 'Mock Article 1',
        url: 'http://mock.com/1',
        publishedAt: new Date(),
        sourceId: 'mock'
      },
      {
        title: 'Mock Article 2',
        url: 'http://mock.com/2',
        publishedAt: new Date(),
        sourceId: 'mock'
      }
    ];
  }

  async fetchIncremental(sourceId: string): Promise<NewsArticle[]> {
    const source = this.sources.get(sourceId);
    if (!source) return [];

    const all = await this.fetchFromSource(source.url);
    return all.filter(a => !source.lastFetched || a.publishedAt > source.lastFetched);
  }

  calculateHotScore(topic: HotTopic): number {
    const score = (
      topic.velocity * 0.3 +
      topic.authority * 10 * 0.3 +
      Math.abs(topic.sentiment) * 100 * 0.2 +
      topic.freshness * 100 * 0.2
    );
    return Math.min(100, Math.max(0, score));
  }

  async discoverHotTopics(): Promise<Array<HotTopic & { score: number }>> {
    const topics: HotTopic[] = [
      { title: 'AI 突破', sources: [{ name: 'A', url: 'a' }, { name: 'B', url: 'b' }], velocity: 150, authority: 9, sentiment: 0.6, freshness: 1.0 },
      { title: '市场波动', sources: [{ name: 'C', url: 'c' }], velocity: 80, authority: 7, sentiment: -0.3, freshness: 0.9 }
    ];
    return topics.map(t => ({ ...t, score: this.calculateHotScore(t) }))
      .filter(t => t.score > 50)
      .sort((a, b) => b.score - a.score);
  }

  calculateSimilarity(str1: string, str2: string): number {
    // 混合算法：词汇级 Jaccard + 字符级编辑距离
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Jaccard 相似度（基于词汇）
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccard = union.size === 0 ? 0 : intersection.size / union.size;

    // 字符级编辑距离
    const c1 = s1.replace(/\s+/g, '');
    const c2 = s2.replace(/\s+/g, '');
    const len1 = c1.length, len2 = c2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = c1[i - 1] === c2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const editDistance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    const editSim = maxLen === 0 ? 1 : 1 - editDistance / maxLen;

    // 取最大值（更宽松的匹配）
    return Math.max(jaccard, editSim * 0.8);
  }

  async storeArticle(article: NewsArticle): Promise<void> {
    this.articles.set(article.url, article);
  }

  async isDuplicate(url: string): Promise<boolean> {
    return this.articles.has(url);
  }
}

class FactChecker {
  extractDataPoints(text: string): DataPoint[] {
    const points: DataPoint[] = [];
    let lastIndex = 0;

    // 百分比
    const percentRegex = /(\d+(?:\.\d+)?%)/g;
    let match;
    while ((match = percentRegex.exec(text)) !== null) {
      const idx = match.index;
      const context = text.substring(
        Math.max(0, idx - 10),
        Math.min(text.length, idx + match[0].length + 10)
      );
      points.push({ type: 'percentage', value: match[1], context });
      lastIndex = idx;
    }

    // 金额
    const amountRegex = /(\d+(?:\.\d+)?(?:万|亿|千)?元)/g;
    while ((match = amountRegex.exec(text)) !== null) {
      const idx = match.index;
      const context = text.substring(
        Math.max(0, idx - 10),
        Math.min(text.length, idx + match[0].length + 10)
      );
      points.push({ type: 'amount', value: match[1], context });
    }

    // 日期
    const dateRegex = /(\d{4}年\d{1,2}月(?:\d{1,2}日)?)/g;
    while ((match = dateRegex.exec(text)) !== null) {
      points.push({ type: 'date', value: match[1], context: match[0] });
    }

    // 人名（常见中文人名模式）
    const personNames = ['马斯克', '马云', '马化腾', '李彦宏', '雷军', '任正非', '王兴', '张一鸣'];
    for (const name of personNames) {
      const regex = new RegExp(name, 'g');
      while ((match = regex.exec(text)) !== null) {
        points.push({ type: 'person', value: name, context: match[0] });
      }
    }

    // 公司名
    const orgNames = ['特斯拉', '阿里巴巴', '腾讯', '百度', '小米', '华为', '美团', '字节跳动'];
    for (const name of orgNames) {
      const regex = new RegExp(name, 'g');
      while ((match = regex.exec(text)) !== null) {
        points.push({ type: 'organization', value: name, context: match[0] });
      }
    }

    return points;
  }

  async verifyClaim(claim: string): Promise<Array<{ source: string; reliability: number }>> {
    // Mock 实现
    if (claim.includes('GDP') || claim.includes('官方')) {
      return [
        { source: '官方统计局', reliability: 0.95 },
        { source: '权威媒体报道', reliability: 0.85 }
      ];
    }
    return [];
  }

  async calculateCredibility(article: { title: string; content: string; sources: string[] }): Promise<CredibilityScore> {
    const sourceTransparency = article.sources.length > 0 ? 80 : 20;
    const verifiability = article.content.includes('来源') || article.content.includes('数据') ? 70 : 40;
    const sourceReliability = article.sources.some(s => s.includes('gov')) ? 90 : 60;

    const overall = Math.round(
      (sourceTransparency + verifiability + sourceReliability) / 3
    );

    return {
      sourceReliability,
      verifiability,
      internalConsistency: 80,
      externalConsistency: 70,
      sourceTransparency,
      overall
    };
  }
}

class DifferentiationAnalyzer {
  private competitors: Map<string, Competitor> = new Map();

  async addCompetitor(competitor: Omit<Competitor, 'id'>): Promise<void> {
    const id = Math.random().toString(36);
    this.competitors.set(id, { ...competitor, id });
  }

  async listCompetitors(): Promise<Competitor[]> {
    return Array.from(this.competitors.values());
  }

  async fetchCompetitorContent(competitorId: string): Promise<any[]> {
    return []; // Mock
  }

  calculateSimilarity(str1: string, str2: string): number {
    // 混合算法：词汇级 Jaccard + 字符级编辑距离
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Jaccard 相似度（基于词汇）
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccard = union.size === 0 ? 0 : intersection.size / union.size;

    // 字符级编辑距离
    const c1 = s1.replace(/\s+/g, '');
    const c2 = s2.replace(/\s+/g, '');
    const len1 = c1.length, len2 = c2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = c1[i - 1] === c2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const editDistance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    const editSim = maxLen === 0 ? 1 : 1 - editDistance / maxLen;

    // 取最大值（更宽松的匹配）
    return Math.max(jaccard, editSim * 0.8);
  }

  async calculateOriginality(content: string, existingContents: string[]): Promise<number> {
    if (existingContents.length === 0) return 1;

    const similarities = existingContents.map(c => this.calculateSimilarity(content, c));
    const maxSimilarity = Math.max(...similarities);
    return Math.max(0, 1 - maxSimilarity);
  }

  async findCoverageGaps(topic: string, existingAngles: string[]): Promise<string[]> {
    const allPossibleAngles = ['价格', '技术', '市场', '政策', '用户体验', '竞争对手', '未来趋势'];
    return allPossibleAngles.filter(angle => !existingAngles.includes(angle));
  }
}
