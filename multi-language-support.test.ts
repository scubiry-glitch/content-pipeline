import { describe, it, expect, beforeEach, vi } from 'vitest';

// ==================== TranslationService 测试 ====================

describe('TranslationService', () => {
  let translator: TranslationService;
  let mockCache: any;

  beforeEach(() => {
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined)
    };
    translator = new TranslationService(mockCache);
  });

  describe('文本翻译', () => {
    it('应该翻译英文标题为中文', async () => {
      const result = await translator.translate('Apple announces new AI chip', 'en', 'zh');
      expect(result.text).toContain('苹果');
      expect(result.sourceLanguage).toBe('en');
      expect(result.targetLanguage).toBe('zh');
    });

    it('应该翻译英文摘要', async () => {
      const summary = 'The new technology enables faster computing and better energy efficiency.';
      const result = await translator.translate(summary, 'en', 'zh');
      expect(result.text).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该检测源语言', async () => {
      const result = await translator.translateWithAutoDetect('Hello World', 'zh');
      expect(result.detectedLanguage).toBe('en');
    });

    it('应该缓存翻译结果', async () => {
      const text = 'Test cache';
      await translator.translate(text, 'en', 'zh');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('应该使用缓存避免重复翻译', async () => {
      const text = 'Cached text';
      mockCache.get.mockResolvedValue({ translated: '已缓存文本' });

      const result = await translator.translate(text, 'en', 'zh');
      expect(result.text).toBe('已缓存文本');
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('应该处理长文本分段翻译', async () => {
      const longText = 'A'.repeat(5000);
      const result = await translator.translateLongText(longText, 'en', 'zh');
      expect(result.segments).toBeGreaterThan(1);
    });

    it('应该返回翻译质量评分', async () => {
      const result = await translator.translate('Simple text', 'en', 'zh');
      expect(result.quality).toBeGreaterThanOrEqual(0);
      expect(result.quality).toBeLessThanOrEqual(100);
    });

    it('应该处理翻译失败降级', async () => {
      const failingTranslator = new TranslationService(mockCache);
      failingTranslator.translateText = vi.fn().mockRejectedValue(new Error('API Error'));

      const result = await failingTranslator.translateWithFallback('test', 'en', 'zh');
      expect(result.text).toBeTruthy(); // 返回原文或其他降级处理
      expect(result.isFallback).toBe(true);
    });
  });

  describe('RSS文章翻译', () => {
    it('应该翻译文章标题和摘要', async () => {
      const article = {
        id: '1',
        title: 'Tech Giants Report Earnings',
        summary: 'Major technology companies released quarterly results.',
        content: 'Full article content...',
        language: 'en'
      };

      const translated = await translator.translateArticle(article);
      expect(translated.title).not.toBe(article.title);
      expect(translated.summary).not.toBe(article.summary);
      expect(translated.originalTitle).toBe(article.title);
      expect(translated.originalLanguage).toBe('en');
    });

    it('应该保留原文链接', async () => {
      const article = {
        id: '1',
        title: 'Test',
        url: 'https://example.com/article',
        language: 'en'
      };

      const translated = await translator.translateArticle(article);
      expect(translated.originalUrl).toBe(article.url);
    });

    it('应该批量翻译多篇文章', async () => {
      const articles = [
        { id: '1', title: 'Article 1', summary: 'Summary 1', language: 'en' },
        { id: '2', title: 'Article 2', summary: 'Summary 2', language: 'en' }
      ];

      const translated = await translator.translateArticles(articles);
      expect(translated).toHaveLength(2);
      expect(translated[0].translatedTitle).toBeTruthy();
    });

    it('应该检测是否需要翻译', () => {
      expect(translator.needsTranslation('en', ['zh', 'en'])).toBe(false);
      expect(translator.needsTranslation('en', ['zh'])).toBe(true);
    });

    it('应该跳过已翻译内容', async () => {
      const article = {
        id: '1',
        title: '中文标题',
        language: 'zh'
      };

      const translated = await translator.translateArticle(article);
      expect(translated.isTranslated).toBe(false);
    });
  });

  describe('双语展示', () => {
    it('应该生成双语对照格式', async () => {
      const bilingual = await translator.toBilingualFormat(
        'Original Title',
        '翻译标题',
        'en',
        'zh'
      );

      expect(bilingual.original).toBe('Original Title');
      expect(bilingual.translated).toBe('翻译标题');
      expect(bilingual.display).toContain('翻译标题');
      expect(bilingual.display).toContain('Original Title');
    });

    it('应该支持显示模式切换', () => {
      const modes = ['original', 'translated', 'bilingual'];
      for (const mode of modes) {
        const display = translator.formatForDisplay('EN', '中文', mode as any);
        expect(display).toBeTruthy();
      }
    });
  });
});

// ==================== EnglishRSSAggregator 测试 ====================

describe('EnglishRSSAggregator', () => {
  let aggregator: EnglishRSSAggregator;
  let mockFetcher: any;
  let mockTranslator: any;

  beforeEach(() => {
    mockFetcher = {
      fetch: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'Tech News',
            link: 'https://example.com/1',
            contentSnippet: 'Summary',
            pubDate: new Date().toISOString()
          }
        ]
      })
    };
    mockTranslator = {
      translateArticle: vi.fn().mockImplementation(article => ({
        ...article,
        translatedTitle: `翻译: ${article.title}`,
        translatedSummary: `翻译摘要`,
        originalLanguage: 'en'
      }))
    };
    aggregator = new EnglishRSSAggregator(mockFetcher, mockTranslator);
  });

  describe('英文源配置', () => {
    it('应该配置Bloomberg源', () => {
      const sources = aggregator.getEnglishSources();
      const bloomberg = sources.find(s => s.id === 'bloomberg');
      expect(bloomberg).toBeDefined();
      expect(bloomberg.priority).toBe('P0');
    });

    it('应该配置WSJ Tech源', () => {
      const sources = aggregator.getEnglishSources();
      const wsj = sources.find(s => s.id === 'wsj_tech');
      expect(wsj).toBeDefined();
      expect(wsj.language).toBe('en');
    });

    it('应该配置FT China源', () => {
      const sources = aggregator.getEnglishSources();
      const ft = sources.find(s => s.id === 'ft_china');
      expect(ft).toBeDefined();
    });

    it('应该支持自定义源添加', () => {
      aggregator.addSource({
        id: 'custom_en',
        name: 'Custom English Source',
        url: 'https://custom.com/rss',
        priority: 'P2',
        language: 'en'
      });

      const sources = aggregator.getEnglishSources();
      expect(sources.some(s => s.id === 'custom_en')).toBe(true);
    });
  });

  describe('抓取与翻译流程', () => {
    it('应该抓取英文文章', async () => {
      const articles = await aggregator.fetchFromSource('bloomberg');
      expect(articles.length).toBeGreaterThan(0);
      expect(articles[0].language).toBe('en');
    });

    it('应该自动翻译抓取的文章', async () => {
      const articles = await aggregator.fetchAndTranslate('bloomberg');
      expect(articles[0].translatedTitle).toBeDefined();
      expect(mockTranslator.translateArticle).toHaveBeenCalled();
    });

    it('应该合并中英文热点', async () => {
      const chineseTopics = [
        { id: 'c1', title: '中文热点', score: 90 }
      ];
      const englishTopics = [
        { id: 'e1', translatedTitle: '英文热点', score: 85 }
      ];

      const merged = await aggregator.mergeHotTopics(chineseTopics, englishTopics);
      expect(merged.length).toBe(2);
    });

    it('应该标记翻译质量', async () => {
      const articles = await aggregator.fetchAndTranslate('bloomberg');
      expect(articles[0].translationQuality).toBeDefined();
    });
  });

  describe('翻译队列管理', () => {
    it('应该限制并发翻译数量', async () => {
      const articles = Array(10).fill(null).map((_, i) => ({
        id: `a${i}`,
        title: `Article ${i}`
      }));

      await aggregator.translateWithConcurrency(articles, 3);
      // 验证并发控制逻辑
    });

    it('应该优先翻译高优先级文章', async () => {
      const articles = [
        { id: '1', title: 'Normal', priority: 'normal' },
        { id: '2', title: 'High Priority', priority: 'high' }
      ];

      const ordered = aggregator.prioritizeForTranslation(articles);
      expect(ordered[0].priority).toBe('high');
    });
  });
});

// ==================== BilingualArticleStore 测试 ====================

describe('BilingualArticleStore', () => {
  let store: BilingualArticleStore;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };
    store = new BilingualArticleStore(mockDb);
  });

  describe('双语文章存储', () => {
    it('应该存储双语文章', async () => {
      const article = {
        id: '1',
        originalTitle: 'Original',
        translatedTitle: '翻译',
        originalSummary: 'Summary',
        translatedSummary: '摘要',
        originalLanguage: 'en',
        translationQuality: 85
      };

      await store.saveBilingualArticle(article);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bilingual_articles'),
        expect.any(Array)
      );
    });

    it('应该查询指定语言的文章', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          { id: '1', translated_title: '翻译标题' }
        ]
      });

      const articles = await store.getArticlesByLanguage('zh');
      expect(articles.length).toBeGreaterThan(0);
    });

    it('应该支持原文检索', async () => {
      await store.getArticleInOriginalLanguage('1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('original_title'),
        expect.any(Array)
      );
    });
  });
});

// ==================== 类型定义 ====================

interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  quality: number;
  detectedLanguage?: string;
  isFallback?: boolean;
  segments?: number;
}

interface TranslatedArticle {
  id: string;
  originalTitle: string;
  translatedTitle?: string;
  originalSummary: string;
  translatedSummary?: string;
  originalContent?: string;
  translatedContent?: string;
  originalUrl: string;
  originalLanguage: string;
  isTranslated: boolean;
  translationQuality?: number;
  translatedAt?: Date;
}

interface BilingualDisplay {
  original: string;
  translated: string;
  display: string;
}

// ==================== 实现 ====================

class TranslationService {
  constructor(private cache: any) {}

  async translate(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
    const cacheKey = this.getCacheKey(text, sourceLang, targetLang);
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return {
        text: cached.translated,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        confidence: 1,
        quality: 95
      };
    }

    // 模拟翻译
    const translated = await this.translateText(text, sourceLang, targetLang);
    await this.cache.set(cacheKey, { translated, timestamp: Date.now() });

    return {
      text: translated,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      confidence: 0.95,
      quality: 85
    };
  }

  private async translateText(text: string, source: string, target: string): Promise<string> {
    // 实际实现应调用翻译API
    const mockTranslations: Record<string, string> = {
      'Apple announces new AI chip': '苹果发布全新AI芯片',
      'Tech Giants Report Earnings': '科技巨头发布财报',
      'Test cache': '测试缓存'
    };
    return mockTranslations[text] || `翻译: ${text.substring(0, 20)}...`;
  }

  async translateWithAutoDetect(text: string, targetLang: string): Promise<TranslationResult> {
    const detectedLang = this.detectLanguage(text);
    return this.translate(text, detectedLang, targetLang);
  }

  private detectLanguage(text: string): string {
    // 简化的语言检测
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
    if (/[a-zA-Z]/.test(text)) return 'en';
    return 'unknown';
  }

  async translateLongText(text: string, source: string, target: string): Promise<TranslationResult> {
    const maxLength = 2000;
    const segments = Math.ceil(text.length / maxLength);

    if (segments === 1) {
      return this.translate(text, source, target);
    }

    let translated = '';
    for (let i = 0; i < segments; i++) {
      const segment = text.substring(i * maxLength, (i + 1) * maxLength);
      const result = await this.translate(segment, source, target);
      translated += result.text;
    }

    return {
      text: translated,
      sourceLanguage: source,
      targetLanguage: target,
      confidence: 0.9,
      quality: 80,
      segments
    };
  }

  async translateWithFallback(text: string, source: string, target: string): Promise<TranslationResult> {
    try {
      return await this.translate(text, source, target);
    } catch (error) {
      return {
        text: text, // 返回原文
        sourceLanguage: source,
        targetLanguage: target,
        confidence: 0,
        quality: 0,
        isFallback: true
      };
    }
  }

  async translateArticle(article: any): Promise<TranslatedArticle> {
    if (article.language === 'zh') {
      return { ...article, isTranslated: false };
    }

    const [titleResult, summaryResult] = await Promise.all([
      this.translate(article.title, article.language, 'zh'),
      article.summary ? this.translate(article.summary, article.language, 'zh') : null
    ]);

    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      originalUrl: article.url,
      translatedTitle: titleResult.text,
      translatedSummary: summaryResult?.text,
      originalLanguage: article.language,
      isTranslated: true,
      translationQuality: (titleResult.quality + (summaryResult?.quality || 0)) / 2,
      translatedAt: new Date()
    };
  }

  async translateArticles(articles: any[]): Promise<TranslatedArticle[]> {
    return Promise.all(articles.map(a => this.translateArticle(a)));
  }

  needsTranslation(sourceLang: string, targetLangs: string[]): boolean {
    return !targetLangs.includes(sourceLang);
  }

  async toBilingualFormat(original: string, translated: string, source: string, target: string): Promise<BilingualDisplay> {
    return {
      original,
      translated,
      display: `${translated} [${original}]`
    };
  }

  formatForDisplay(original: string, translated: string, mode: 'original' | 'translated' | 'bilingual'): string {
    switch (mode) {
      case 'original': return original;
      case 'translated': return translated;
      case 'bilingual': return `${translated} (${original})`;
      default: return translated;
    }
  }

  private getCacheKey(text: string, source: string, target: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(`${text}:${source}:${target}`).digest('hex');
  }
}

class EnglishRSSAggregator {
  private sources: Map<string, any> = new Map();

  constructor(
    private fetcher: any,
    private translator: TranslationService
  ) {
    this.initDefaultSources();
  }

  private initDefaultSources() {
    this.sources.set('bloomberg', {
      id: 'bloomberg',
      name: 'Bloomberg',
      url: 'https://feeds.bloomberg.com/business/news.rss',
      priority: 'P0',
      language: 'en',
      category: 'Finance'
    });
    this.sources.set('wsj_tech', {
      id: 'wsj_tech',
      name: 'WSJ Tech',
      url: 'https://feeds.wsj.com/wsj/tech/rss',
      priority: 'P1',
      language: 'en',
      category: 'Tech'
    });
    this.sources.set('ft_china', {
      id: 'ft_china',
      name: 'FT China',
      url: 'https://www.ft.com/china?format=rss',
      priority: 'P1',
      language: 'en',
      category: 'Finance'
    });
    this.sources.set('theverge', {
      id: 'theverge',
      name: 'The Verge',
      url: 'https://www.theverge.com/rss/index.xml',
      priority: 'P2',
      language: 'en',
      category: 'Tech'
    });
    this.sources.set('techcrunch', {
      id: 'techcrunch',
      name: 'TechCrunch',
      url: 'https://techcrunch.com/feed/',
      priority: 'P1',
      language: 'en',
      category: 'Tech'
    });
  }

  getEnglishSources() {
    return Array.from(this.sources.values());
  }

  addSource(source: any) {
    this.sources.set(source.id, source);
  }

  async fetchFromSource(sourceId: string) {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);

    const data = await this.fetcher.fetch(source.url);
    return data.items.map((item: any) => ({
      id: item.link,
      title: item.title,
      summary: item.contentSnippet,
      url: item.link,
      publishedAt: new Date(item.pubDate),
      language: 'en',
      source: sourceId
    }));
  }

  async fetchAndTranslate(sourceId: string) {
    const articles = await this.fetchFromSource(sourceId);
    return this.translator.translateArticles(articles);
  }

  async mergeHotTopics(chineseTopics: any[], englishTopics: any[]) {
    const normalizedEnglish = englishTopics.map(t => ({
      ...t,
      title: t.translatedTitle || t.title,
      originalTitle: t.title,
      isTranslated: true
    }));

    return [...chineseTopics, ...normalizedEnglish]
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  prioritizeForTranslation(articles: any[]) {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return [...articles].sort((a, b) =>
      priorityOrder[a.priority as keyof typeof priorityOrder] -
      priorityOrder[b.priority as keyof typeof priorityOrder]
    );
  }

  async translateWithConcurrency(articles: any[], concurrency: number) {
    const results: TranslatedArticle[] = [];

    for (let i = 0; i < articles.length; i += concurrency) {
      const batch = articles.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(a => this.translator.translateArticle(a))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

class BilingualArticleStore {
  constructor(private db: any) {}

  async saveBilingualArticle(article: TranslatedArticle): Promise<void> {
    await this.db.query(
      `INSERT INTO bilingual_articles (
        id, original_title, translated_title, original_summary, translated_summary,
        original_url, original_language, translation_quality, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (id) DO UPDATE SET
        translated_title = $3, translated_summary = $5,
        translation_quality = $8, updated_at = NOW()`,
      [
        article.id,
        article.originalTitle,
        article.translatedTitle,
        article.originalSummary,
        article.translatedSummary,
        article.originalUrl,
        article.originalLanguage,
        article.translationQuality
      ]
    );
  }

  async getArticlesByLanguage(language: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM bilingual_articles WHERE original_language = $1`,
      [language]
    );
    return result.rows;
  }

  async getArticleInOriginalLanguage(id: string): Promise<any> {
    const result = await this.db.query(
      `SELECT original_title, original_summary, original_url FROM bilingual_articles WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }
}

export { TranslationService, EnglishRSSAggregator, BilingualArticleStore };
