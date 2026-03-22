// 社区话题抓取服务 - Community Crawler Service
// 支持小红书、微博、知乎、抖音、B站、即刻、雪球等平台

import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

// ===== 类型定义 =====

export interface CommunityTopic {
  id: string;
  title: string;
  platform: string;
  platformId: string;
  platformUrl: string;
  
  // 热度指标
  hotScore: number;
  platformRank?: number;
  
  // 互动数据
  engagement: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  
  // 内容特征
  contentType: 'text' | 'image' | 'video' | 'mixed';
  keyOpinions: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  
  // 元数据
  tags: string[];
  creatorInfo?: {
    name: string;
    followers?: number;
    verified?: boolean;
  };
  
  // 分类
  category?: string;
  isFiltered: boolean;
  filterReason?: string;
  
  publishedAt: Date;
  crawledAt: Date;
}

export interface CrawlConfig {
  platform: string;
  enabled: boolean;
  sources: ('hot' | 'trending' | 'search' | 'follow')[];
  keywords?: string[];
  minEngagement: number;
  categoryFilter?: string[];
}

export interface CrawlResult {
  platform: string;
  topics: CommunityTopic[];
  errors: string[];
  crawledAt: Date;
}

// ===== 平台配置 =====

const PLATFORM_CONFIGS: Record<string, CrawlConfig> = {
  xiaohongshu: {
    platform: 'xiaohongshu',
    enabled: true,
    sources: ['hot', 'trending'],
    minEngagement: 1000,
    categoryFilter: ['财经', '职场', '教育', '科技'],
  },
  weibo: {
    platform: 'weibo',
    enabled: true,
    sources: ['hot'],
    minEngagement: 5000,
    categoryFilter: ['财经', '社会', '科技'],
  },
  zhihu: {
    platform: 'zhihu',
    enabled: true,
    sources: ['hot'],
    minEngagement: 2000,
  },
  douyin: {
    platform: 'douyin',
    enabled: false, // 默认关闭，需要第三方API
    sources: ['hot'],
    minEngagement: 10000,
  },
  bilibili: {
    platform: 'bilibili',
    enabled: true,
    sources: ['hot'],
    minEngagement: 5000,
  },
  jike: {
    platform: 'jike',
    enabled: false, // 需要API权限
    sources: ['hot'],
    minEngagement: 500,
  },
  xueqiu: {
    platform: 'xueqiu',
    enabled: true,
    sources: ['hot'],
    minEngagement: 1000,
  },
};

// ===== 主服务 =====

export class CommunityCrawlerService {
  private configs: Record<string, CrawlConfig>;

  constructor() {
    this.configs = { ...PLATFORM_CONFIGS };
  }

  /**
   * 抓取所有启用平台的社区话题
   */
  async crawlAllPlatforms(): Promise<CrawlResult[]> {
    const enabledPlatforms = Object.values(this.configs).filter(c => c.enabled);
    const results: CrawlResult[] = [];

    console.log(`[CommunityCrawler] Starting crawl for ${enabledPlatforms.length} platforms`);

    for (const config of enabledPlatforms) {
      try {
        const result = await this.crawlPlatform(config.platform);
        results.push(result);
        console.log(`[CommunityCrawler] ✓ ${config.platform}: ${result.topics.length} topics`);
      } catch (error) {
        console.error(`[CommunityCrawler] ✗ ${config.platform} failed:`, error);
        results.push({
          platform: config.platform,
          topics: [],
          errors: [error instanceof Error ? error.message : String(error)],
          crawledAt: new Date(),
        });
      }
    }

    // 保存到数据库
    await this.saveTopics(results.flatMap(r => r.topics));

    return results;
  }

  /**
   * 抓取单个平台
   */
  async crawlPlatform(platform: string): Promise<CrawlResult> {
    const config = this.configs[platform];
    if (!config) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    console.log(`[CommunityCrawler] Crawling ${platform}...`);

    switch (platform) {
      case 'xiaohongshu':
        return this.crawlXiaohongshu(config);
      case 'weibo':
        return this.crawlWeibo(config);
      case 'zhihu':
        return this.crawlZhihu(config);
      case 'bilibili':
        return this.crawlBilibili(config);
      case 'xueqiu':
        return this.crawlXueqiu(config);
      case 'douyin':
        return this.crawlDouyin(config);
      case 'jike':
        return this.crawlJike(config);
      default:
        throw new Error(`Crawler not implemented for platform: ${platform}`);
    }
  }

  /**
   * 小红书抓取
   */
  private async crawlXiaohongshu(config: CrawlConfig): Promise<CrawlResult> {
    const topics: CommunityTopic[] = [];
    const errors: string[] = [];

    try {
      // 模拟抓取热搜榜
      const hotSearchResults = await this.mockXiaohongshuHotSearch();
      
      for (const item of hotSearchResults.slice(0, 20)) {
        const topic = await this.createCommunityTopic({
          id: `xhs_hot_${item.id}`,
          title: item.keyword,
          platform: 'xiaohongshu',
          platformId: item.id,
          platformUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.keyword)}`,
          hotScore: this.calculateXHSScore(item.hotIndex),
          platformRank: item.rank,
          engagement: {
            views: item.viewCount,
            likes: item.likeCount,
          },
          contentType: 'mixed',
          tags: item.tags || [],
          category: item.category,
          publishedAt: new Date(),
        });

        if (topic && !topic.isFiltered) {
          topics.push(topic);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      platform: 'xiaohongshu',
      topics,
      errors,
      crawledAt: new Date(),
    };
  }

  /**
   * 微博抓取
   */
  private async crawlWeibo(config: CrawlConfig): Promise<CrawlResult> {
    const topics: CommunityTopic[] = [];
    const errors: string[] = [];

    try {
      // 模拟抓取微博热搜
      const hotSearchResults = await this.mockWeiboHotSearch();
      
      for (const item of hotSearchResults
        .filter(i => !['娱乐', '明星'].includes(i.category || ''))
        .slice(0, 20)) {
        
        const topic = await this.createCommunityTopic({
          id: `weibo_${item.mid}`,
          title: item.topic,
          platform: 'weibo',
          platformId: item.mid,
          platformUrl: item.link,
          hotScore: this.normalizeWeiboScore(item.rawHot),
          platformRank: item.rank,
          engagement: {
            views: item.readCount,
            comments: item.discussionCount,
          },
          contentType: 'mixed',
          tags: [item.category].filter(Boolean),
          category: item.category,
          sentiment: item.emotion || 'neutral',
          publishedAt: new Date(item.createTime),
        });

        if (topic && !topic.isFiltered) {
          topics.push(topic);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      platform: 'weibo',
      topics,
      errors,
      crawledAt: new Date(),
    };
  }

  /**
   * 知乎抓取
   */
  private async crawlZhihu(config: CrawlConfig): Promise<CrawlResult> {
    const topics: CommunityTopic[] = [];
    const errors: string[] = [];

    try {
      // 模拟知乎热榜
      const hotList = await this.mockZhihuHotList();
      
      for (const item of hotList.slice(0, 20)) {
        const topic = await this.createCommunityTopic({
          id: `zhihu_${item.id}`,
          title: item.title,
          platform: 'zhihu',
          platformId: item.id,
          platformUrl: `https://www.zhihu.com/question/${item.id}`,
          hotScore: Math.min(100, item.hotScore / 100),
          platformRank: item.rank,
          engagement: {
            views: item.visitCount,
            comments: item.answerCount,
          },
          contentType: 'text',
          tags: item.topics || [],
          category: item.type,
          publishedAt: new Date(),
        });

        if (topic && !topic.isFiltered) {
          topics.push(topic);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      platform: 'zhihu',
      topics,
      errors,
      crawledAt: new Date(),
    };
  }

  /**
   * B站抓取
   */
  private async crawlBilibili(config: CrawlConfig): Promise<CrawlResult> {
    const topics: CommunityTopic[] = [];
    const errors: string[] = [];

    try {
      // 模拟B站热门
      const hotList = await this.mockBilibiliHotList();
      
      for (const item of hotList.slice(0, 15)) {
        const topic = await this.createCommunityTopic({
          id: `bilibili_${item.bvid}`,
          title: item.title,
          platform: 'bilibili',
          platformId: item.bvid,
          platformUrl: `https://www.bilibili.com/video/${item.bvid}`,
          hotScore: Math.min(100, item.stat.view / 10000),
          platformRank: item.rank,
          engagement: {
            views: item.stat.view,
            likes: item.stat.like,
            comments: item.stat.reply,
            shares: item.stat.share,
          },
          contentType: 'video',
          tags: item.tag || [],
          category: item.tname,
          publishedAt: new Date(item.pubdate * 1000),
        });

        if (topic && !topic.isFiltered) {
          topics.push(topic);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      platform: 'bilibili',
      topics,
      errors,
      crawledAt: new Date(),
    };
  }

  /**
   * 雪球抓取
   */
  private async crawlXueqiu(config: CrawlConfig): Promise<CrawlResult> {
    const topics: CommunityTopic[] = [];
    const errors: string[] = [];

    try {
      // 模拟雪球热帖
      const hotList = await this.mockXueqiuHotList();
      
      for (const item of hotList.slice(0, 15)) {
        const topic = await this.createCommunityTopic({
          id: `xueqiu_${item.id}`,
          title: item.title,
          platform: 'xueqiu',
          platformId: item.id,
          platformUrl: `https://xueqiu.com/${item.userId}/${item.id}`,
          hotScore: Math.min(100, item.viewCount / 1000),
          engagement: {
            views: item.viewCount,
            likes: item.likeCount,
            comments: item.commentCount,
          },
          contentType: 'text',
          tags: item.symbols || [],
          category: '财经',
          publishedAt: new Date(item.createdAt),
        });

        if (topic && !topic.isFiltered) {
          topics.push(topic);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      platform: 'xueqiu',
      topics,
      errors,
      crawledAt: new Date(),
    };
  }

  /**
   * 抖音抓取（模拟）
   */
  private async crawlDouyin(config: CrawlConfig): Promise<CrawlResult> {
    // 抖音需要第三方API或爬虫，这里返回空
    return {
      platform: 'douyin',
      topics: [],
      errors: ['Douyin crawler requires third-party API'],
      crawledAt: new Date(),
    };
  }

  /**
   * 即刻抓取（模拟）
   */
  private async crawlJike(config: CrawlConfig): Promise<CrawlResult> {
    // 即刻需要API权限
    return {
      platform: 'jike',
      topics: [],
      errors: ['Jike crawler requires API token'],
      crawledAt: new Date(),
    };
  }

  // ===== 数据创建和处理 =====

  private async createCommunityTopic(data: Partial<CommunityTopic> & { title: string; platform: string }): Promise<CommunityTopic | null> {
    const config = this.configs[data.platform];
    
    // 检查最低互动门槛
    const totalEngagement = (data.engagement?.views || 0) + 
                           (data.engagement?.likes || 0) * 10 + 
                           (data.engagement?.comments || 0) * 20;
    
    let isFiltered = false;
    let filterReason = '';

    if (totalEngagement < config.minEngagement) {
      isFiltered = true;
      filterReason = `Low engagement: ${totalEngagement} < ${config.minEngagement}`;
    }

    // 检查分类过滤
    if (config.categoryFilter && data.category && !config.categoryFilter.includes(data.category)) {
      isFiltered = true;
      filterReason = `Category filtered: ${data.category}`;
    }

    // 提取关键观点
    const keyOpinions = await this.extractKeyOpinions(data.title, data.platform);
    
    // 分析情感
    const sentiment = await this.analyzeSentiment(data.title);

    return {
      id: data.id || uuidv4(),
      title: data.title,
      platform: data.platform,
      platformId: data.platformId || '',
      platformUrl: data.platformUrl || '',
      hotScore: data.hotScore || 0,
      platformRank: data.platformRank,
      engagement: data.engagement || {},
      contentType: data.contentType || 'text',
      keyOpinions,
      sentiment,
      tags: data.tags || [],
      category: data.category,
      isFiltered,
      filterReason,
      publishedAt: data.publishedAt || new Date(),
      crawledAt: new Date(),
    };
  }

  private async extractKeyOpinions(keyword: string, platform: string): Promise<string[]> {
    // 这里可以实现真实的观点提取逻辑
    // 目前返回基于关键词的模拟观点
    const mockOpinions: Record<string, string[]> = {
      '保租房': ['租金定价机制待完善', '年轻人租房压力较大', '政策支持力度需要加强'],
      '房地产': ['市场观望情绪浓厚', '刚需购房需求仍在', '政策调控效果显现'],
      'AI': ['技术发展迅速', '应用场景不断拓展', '监管政策需要跟进'],
      'default': ['引发广泛讨论', '观点分歧较大', '值得关注后续发展'],
    };

    for (const [key, opinions] of Object.entries(mockOpinions)) {
      if (keyword.includes(key)) {
        return opinions;
      }
    }

    return mockOpinions.default;
  }

  private async analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative' | 'mixed'> {
    const positiveWords = ['增长', '上涨', '突破', '利好', 'rise', 'growth', 'surge', 'strong', 'gain', '成功', '创新'];
    const negativeWords = ['下降', '下跌', '跌破', '利空', 'fall', 'decline', 'drop', 'weak', 'loss', '失败', '危机'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (text.includes(word)) positiveCount++;
    }

    for (const word of negativeWords) {
      if (text.includes(word)) negativeCount++;
    }

    if (positiveCount > 0 && negativeCount > 0) return 'mixed';
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // ===== 分数计算 =====

  private calculateXHSScore(hotIndex: number): number {
    // 小红书热度指数归一化到0-100
    return Math.min(100, Math.max(0, hotIndex / 1000));
  }

  private normalizeWeiboScore(rawHot: number): number {
    // 微博热度归一化
    // 微博热搜通常在几十万到几百万
    return Math.min(100, Math.max(0, rawHot / 100000));
  }

  // ===== 模拟数据 =====

  private async mockXiaohongshuHotSearch(): Promise<any[]> {
    // 模拟小红书热搜数据
    return [
      { id: '1', keyword: '保租房申请攻略', hotIndex: 85000, rank: 1, viewCount: 120000, likeCount: 3500, category: '财经', tags: ['租房', '保障房'] },
      { id: '2', keyword: '2024房地产趋势', hotIndex: 72000, rank: 2, viewCount: 98000, likeCount: 2800, category: '财经', tags: ['房地产', '投资'] },
      { id: '3', keyword: 'AI工具推荐', hotIndex: 68000, rank: 3, viewCount: 85000, likeCount: 4200, category: '科技', tags: ['AI', '工具'] },
      { id: '4', keyword: '职场新人避坑指南', hotIndex: 55000, rank: 4, viewCount: 72000, likeCount: 1900, category: '职场', tags: ['职场', '新人'] },
      { id: '5', keyword: '个人养老金解读', hotIndex: 48000, rank: 5, viewCount: 65000, likeCount: 2200, category: '财经', tags: ['养老', '理财'] },
    ];
  }

  private async mockWeiboHotSearch(): Promise<any[]> {
    // 模拟微博热搜数据
    return [
      { mid: '1', topic: '保租房定价机制出台', rawHot: 4500000, rank: 1, readCount: 8900000, discussionCount: 12500, category: '财经', emotion: 'neutral', createTime: Date.now() - 3600000, link: 'https://s.weibo.com/weibo?q=保租房' },
      { mid: '2', topic: '央行降准0.5个百分点', rawHot: 6200000, rank: 2, readCount: 12000000, discussionCount: 25800, category: '财经', emotion: 'positive', createTime: Date.now() - 7200000, link: 'https://s.weibo.com/weibo?q=央行降准' },
      { mid: '3', topic: '某明星新剧开播', rawHot: 8900000, rank: 3, readCount: 15000000, discussionCount: 56000, category: '娱乐', emotion: 'positive', createTime: Date.now() - 1800000, link: 'https://s.weibo.com/weibo?q=新剧' },
      { mid: '4', topic: 'AI技术突破引发热议', rawHot: 3200000, rank: 4, readCount: 5600000, discussionCount: 8900, category: '科技', emotion: 'mixed', createTime: Date.now() - 10800000, link: 'https://s.weibo.com/weibo?q=AI技术' },
      { mid: '5', topic: '房地产市场回暖迹象', rawHot: 2800000, rank: 5, readCount: 4800000, discussionCount: 6700, category: '财经', emotion: 'positive', createTime: Date.now() - 14400000, link: 'https://s.weibo.com/weibo?q=房地产' },
    ];
  }

  private async mockZhihuHotList(): Promise<any[]> {
    // 模拟知乎热榜数据
    return [
      { id: '123456', title: '如何看待2024年保租房政策变化？', hotScore: 8500, rank: 1, visitCount: 120000, answerCount: 328, type: 'question', topics: ['房地产', '租房', '政策'] },
      { id: '123457', title: '人工智能会取代哪些职业？', hotScore: 9200, rank: 2, visitCount: 145000, answerCount: 456, type: 'question', topics: ['AI', '职业', '未来'] },
      { id: '123458', title: '个人如何进行合理的资产配置？', hotScore: 6800, rank: 3, visitCount: 98000, answerCount: 189, type: 'question', topics: ['理财', '投资'] },
    ];
  }

  private async mockBilibiliHotList(): Promise<any[]> {
    // 模拟B站热门数据
    return [
      { bvid: 'BV1xx411c7mD', title: '【硬核】保租房政策深度解读', stat: { view: 850000, like: 45000, reply: 3200, share: 8900 }, rank: 1, tname: '知识', tag: ['房地产', '政策'], pubdate: Math.floor(Date.now() / 1000) - 86400 },
      { bvid: 'BV1yy411c7mE', title: 'AI绘画原理详解', stat: { view: 1200000, like: 78000, reply: 5600, share: 12000 }, rank: 2, tname: '科技', tag: ['AI', '绘画'], pubdate: Math.floor(Date.now() / 1000) - 172800 },
    ];
  }

  private async mockXueqiuHotList(): Promise<any[]> {
    // 模拟雪球热帖数据
    return [
      { id: '456789', title: '保租房REITs投资价值分析', userId: '12345', viewCount: 45000, likeCount: 890, commentCount: 234, symbols: ['SH508058'], createdAt: Date.now() - 3600000 },
      { id: '456790', title: '2024年房地产板块投资策略', userId: '12346', viewCount: 38000, likeCount: 650, commentCount: 178, symbols: ['万科A', '保利地产'], createdAt: Date.now() - 7200000 },
    ];
  }

  // ===== 数据库操作 =====

  private async saveTopics(topics: CommunityTopic[]): Promise<void> {
    for (const topic of topics) {
      try {
        await query(
          `INSERT INTO community_topics (
            id, title, platform, platform_id, platform_url,
            hot_score, platform_rank, view_count, like_count, comment_count, share_count,
            content_type, key_opinions, sentiment, tags,
            creator_name, creator_followers, creator_verified,
            category, is_filtered, filter_reason,
            published_at, crawled_at, unified_topic_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
          ON CONFLICT (id) DO UPDATE SET
            hot_score = EXCLUDED.hot_score,
            platform_rank = EXCLUDED.platform_rank,
            view_count = EXCLUDED.view_count,
            like_count = EXCLUDED.like_count,
            comment_count = EXCLUDED.comment_count,
            sentiment = EXCLUDED.sentiment,
            crawled_at = EXCLUDED.crawled_at`,
          [
            topic.id,
            topic.title,
            topic.platform,
            topic.platformId,
            topic.platformUrl,
            topic.hotScore,
            topic.platformRank,
            topic.engagement.views,
            topic.engagement.likes,
            topic.engagement.comments,
            topic.engagement.shares,
            topic.contentType,
            JSON.stringify(topic.keyOpinions),
            topic.sentiment,
            JSON.stringify(topic.tags),
            topic.creatorInfo?.name,
            topic.creatorInfo?.followers,
            topic.creatorInfo?.verified,
            topic.category,
            topic.isFiltered,
            topic.filterReason,
            topic.publishedAt,
            topic.crawledAt,
            null, // unified_topic_id
          ]
        );
      } catch (error) {
        console.error(`[CommunityCrawler] Failed to save topic ${topic.id}:`, error);
      }
    }
  }

  // ===== 公共方法 =====

  /**
   * 获取最近抓取的社区话题
   */
  async getRecentTopics(platform?: string, limit: number = 50): Promise<CommunityTopic[]> {
    let sql = `
      SELECT * FROM community_topics 
      WHERE is_filtered = false 
      ${platform ? 'AND platform = $2' : ''}
      ORDER BY crawled_at DESC, hot_score DESC 
      LIMIT $1
    `;
    const params: any[] = [limit];
    if (platform) params.push(platform);

    const result = await query(sql, params);
    
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      platform: row.platform,
      platformId: row.platform_id,
      platformUrl: row.platform_url,
      hotScore: row.hot_score,
      platformRank: row.platform_rank,
      engagement: {
        views: row.view_count,
        likes: row.like_count,
        comments: row.comment_count,
        shares: row.share_count,
      },
      contentType: row.content_type,
      keyOpinions: row.key_opinions || [],
      sentiment: row.sentiment,
      tags: row.tags || [],
      category: row.category,
      isFiltered: row.is_filtered,
      filterReason: row.filter_reason,
      publishedAt: row.published_at,
      crawledAt: row.crawled_at,
    }));
  }

  /**
   * 获取平台统计
   */
  async getStats(): Promise<{
    totalTopics: number;
    byPlatform: Record<string, number>;
    todayTopics: number;
  }> {
    const totalResult = await query(`SELECT COUNT(*) FROM community_topics WHERE is_filtered = false`);
    const todayResult = await query(`SELECT COUNT(*) FROM community_topics WHERE is_filtered = false AND crawled_at > NOW() - INTERVAL '1 day'`);
    const byPlatformResult = await query(`
      SELECT platform, COUNT(*) as count 
      FROM community_topics 
      WHERE is_filtered = false 
      GROUP BY platform
    `);

    const byPlatform: Record<string, number> = {};
    for (const row of byPlatformResult.rows) {
      byPlatform[row.platform] = parseInt(row.count);
    }

    return {
      totalTopics: parseInt(totalResult.rows[0]?.count || '0'),
      byPlatform,
      todayTopics: parseInt(todayResult.rows[0]?.count || '0'),
    };
  }
}

// 单例实例
let communityCrawlerService: CommunityCrawlerService | null = null;

export function getCommunityCrawlerService(): CommunityCrawlerService {
  if (!communityCrawlerService) {
    communityCrawlerService = new CommunityCrawlerService();
  }
  return communityCrawlerService;
}
