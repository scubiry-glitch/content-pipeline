import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface RSSSource {
  id: string;
  name: string;
  url: string;
  priority: 'P0' | 'P1' | 'P2';
  fetchInterval: number;
  status: 'active' | 'paused' | 'error';
  keywords: string[];
  language: string;
  category: string;
}

interface RSSArticle {
  id?: string;
  sourceId: string;
  title: string;
  url: string;
  content?: string;
  summary?: string;
  publishedAt: Date;
  hotScore?: number;
  fetchedAt: Date;
}

interface HotTopic {
  title: string;
  score: number;
  source: string;
  url: string;
  publishedAt: Date;
}

export class RSSFeedManager {
  private sources: Map<string, RSSSource> = new Map();
  private configPath: string;
  private dbPool?: Pool;

  constructor(configPath?: string, dbPool?: Pool) {
    this.configPath = configPath || path.join(__dirname, '../config/rss-sources.json');
    this.dbPool = dbPool;
  }

  /**
   * 加载RSS源配置
   */
  loadConfig(): void {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

      for (const [categoryKey, category] of Object.entries(config.categories)) {
        const cat = category as any;
        for (const source of cat.sources) {
          this.sources.set(source.id, {
            ...source,
            category: cat.name
          });
        }
      }

      console.log(`[RSS] Loaded ${this.sources.size} RSS sources`);
    } catch (error) {
      console.error('[RSS] Failed to load config:', error);
    }
  }

  /**
   * 获取所有活跃的RSS源
   */
  getActiveSources(): RSSSource[] {
    return Array.from(this.sources.values())
      .filter(s => s.status === 'active')
      .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority));
  }

  /**
   * 按优先级排序
   */
  private priorityWeight(p: string): number {
    return { 'P0': 3, 'P1': 2, 'P2': 1 }[p] || 0;
  }

  /**
   * 按类别获取RSS源
   */
  getSourcesByCategory(category: string): RSSSource[] {
    return Array.from(this.sources.values())
      .filter(s => s.category === category && s.status === 'active');
  }

  /**
   * 获取P0优先级的源（核心源）
   */
  getCoreSources(): RSSSource[] {
    return Array.from(this.sources.values())
      .filter(s => s.priority === 'P0' && s.status === 'active');
  }

  /**
   * 添加新的RSS源
   */
  addSource(source: Omit<RSSSource, 'id'>): RSSSource {
    const id = source.name.toLowerCase().replace(/\s+/g, '-');
    const newSource: RSSSource = { ...source, id };
    this.sources.set(id, newSource);
    this.saveConfig();
    return newSource;
  }

  /**
   * 更新RSS源状态
   */
  updateSourceStatus(id: string, status: 'active' | 'paused' | 'error'): void {
    const source = this.sources.get(id);
    if (source) {
      source.status = status;
      this.sources.set(id, source);
      this.saveConfig();
    }
  }

  /**
   * 保存配置到文件
   */
  private saveConfig(): void {
    // 实际实现中应该更新JSON文件
    // 这里简化处理
  }

  /**
   * 模拟抓取RSS文章
   */
  async fetchArticles(sourceId: string): Promise<RSSArticle[]> {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);

    // 模拟抓取数据
    // 实际实现应该使用RSS解析库如rss-parser
    const mockArticles: RSSArticle[] = [
      {
        sourceId,
        title: `${source.name} - AI技术突破新闻`,
        url: `${source.url}/article/1`,
        summary: '这是一篇关于AI技术突破的新闻摘要...',
        publishedAt: new Date(Date.now() - Math.random() * 86400000),
        fetchedAt: new Date()
      },
      {
        sourceId,
        title: `${source.name} - 新能源市场分析`,
        url: `${source.url}/article/2`,
        summary: '新能源市场最新动态分析...',
        publishedAt: new Date(Date.now() - Math.random() * 172800000),
        fetchedAt: new Date()
      }
    ];

    return mockArticles;
  }

  /**
   * 从所有活跃源抓取文章
   */
  async fetchAllArticles(): Promise<RSSArticle[]> {
    const sources = this.getActiveSources();
    const allArticles: RSSArticle[] = [];

    for (const source of sources) {
      try {
        const articles = await this.fetchArticles(source.id);
        allArticles.push(...articles);
      } catch (error) {
        console.error(`[RSS] Failed to fetch from ${source.name}:`, error);
        this.updateSourceStatus(source.id, 'error');
      }
    }

    return allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  /**
   * 根据关键词过滤文章
   */
  filterByKeywords(articles: RSSArticle[], keywords: string[]): RSSArticle[] {
    return articles.filter(article => {
      const text = `${article.title} ${article.summary || ''}`.toLowerCase();
      return keywords.some(kw => text.includes(kw.toLowerCase()));
    });
  }

  /**
   * 计算热点分数
   */
  calculateHotScore(article: RSSArticle, source: RSSSource): number {
    // 基于时间、来源优先级计算热点分数
    const ageHours = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60);
    const freshness = Math.max(0, 100 - ageHours * 2);
    const sourceWeight = this.priorityWeight(source.priority) * 20;

    return Math.min(100, Math.round(freshness * 0.6 + sourceWeight * 0.4));
  }

  /**
   * 发现热点话题
   */
  async discoverHotTopics(limit: number = 10): Promise<HotTopic[]> {
    const articles = await this.fetchAllArticles();
    const topics: HotTopic[] = [];

    for (const article of articles.slice(0, 20)) {
      const source = this.sources.get(article.sourceId);
      if (!source) continue;

      const score = this.calculateHotScore(article, source);

      topics.push({
        title: article.title,
        score,
        source: source.name,
        url: article.url,
        publishedAt: article.publishedAt
      });
    }

    return topics
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 存储文章到数据库
   */
  async storeArticle(article: RSSArticle): Promise<void> {
    if (!this.dbPool) return;

    await this.dbPool.query(
      `INSERT INTO rss_articles (source_id, title, url, summary, published_at, fetched_at, hot_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (url) DO NOTHING`,
      [article.sourceId, article.title, article.url, article.summary,
       article.publishedAt, article.fetchedAt, article.hotScore]
    );
  }

  /**
   * 获取源统计信息
   */
  getStats(): { total: number; active: number; error: number; byCategory: Record<string, number> } {
    const sources = Array.from(this.sources.values());
    const byCategory: Record<string, number> = {};

    for (const s of sources) {
      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    }

    return {
      total: sources.length,
      active: sources.filter(s => s.status === 'active').length,
      error: sources.filter(s => s.status === 'error').length,
      byCategory
    };
  }

  /**
   * 生成源配置报告
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines = [
      '=== RSS源配置报告 ===',
      `总计: ${stats.total} 个源`,
      `活跃: ${stats.active} 个`,
      `异常: ${stats.error} 个`,
      '',
      '按类别分布:',
      ...Object.entries(stats.byCategory).map(([cat, count]) => `  ${cat}: ${count} 个`),
      '',
      'P0核心源:',
      ...this.getCoreSources().map(s => `  ✓ ${s.name} (${s.category})`)
    ];

    return lines.join('\n');
  }
}

// 导出单例实例
export const rssManager = new RSSFeedManager();
