// 话题归并服务 - Topic Unification Service
// 负责将 RSS、Web Search、社区等多个源的话题进行实体链接和归并

import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getWebSearchService } from './webSearch.js';

// ===== 类型定义 =====

export interface SourceTopic {
  id: string;
  title: string;
  source: 'rss' | 'web_search' | 'community';
  platform?: string;
  url?: string;
  hotScore: number;
  publishedAt: Date;
  keyOpinions?: string[];
  sentiment?: string;
  tags?: string[];
  content?: string;
}

export interface UnifiedTopic {
  id: string;
  title: string;
  canonicalTitle: string;
  
  // 聚合热度
  hotScore: number;
  confidence: number;
  
  // 来源分布
  hasRssSource: boolean;
  hasWebSource: boolean;
  hasCommunitySource: boolean;
  sourceCount: number;
  
  // 来源详情
  sources: TopicSource[];
  
  // 内容聚合
  keyOpinions: string[];
  crossPlatformSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  
  // 时间
  firstSeenAt: Date;
  lastUpdatedAt: Date;
  
  // 状态
  status: 'pending' | 'processing' | 'completed';
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicSource {
  type: 'rss' | 'web_search' | 'community';
  platform?: string;
  url?: string;
  hotScore: number;
  topicId: string;
}

export interface MultiSourceHotScore {
  rssScore: number;
  webSearchScore: number;
  communityScore: number;
  crossPlatformValidation: {
    sourceCount: number;
    consistencyScore: number;
    authorityBoost: number;
  };
  finalScore: number;
  confidence: number;
}

// ===== 主服务 =====

export class TopicUnificationService {
  private webSearchService = getWebSearchService();

  /**
   * 执行话题归并流程
   * 1. 收集所有源的话题
   * 2. 实体链接（识别同一话题）
   * 3. 合并话题数据
   * 4. 保存到数据库
   */
  async unifyTopics(): Promise<{
    unified: number;
    fromRss: number;
    fromWeb: number;
    fromCommunity: number;
  }> {
    console.log('[TopicUnification] Starting topic unification...');

    // 1. 收集各源话题
    const [rssTopics, webTopics, communityTopics] = await Promise.all([
      this.collectRssTopics(),
      this.collectWebSearchTopics(),
      this.collectCommunityTopics(),
    ]);

    console.log(`[TopicUnification] Collected: ${rssTopics.length} RSS, ${webTopics.length} Web, ${communityTopics.length} Community`);

    // 2. 合并所有话题
    const allTopics = [...rssTopics, ...webTopics, ...communityTopics];

    // 3. 实体链接（聚类）
    const clusters = await this.entityLinking(allTopics);
    console.log(`[TopicUnification] Formed ${clusters.length} topic clusters`);

    // 4. 创建归并话题
    const unifiedTopics: UnifiedTopic[] = [];
    for (const cluster of clusters) {
      const unified = await this.createUnifiedTopic(cluster);
      if (unified) {
        unifiedTopics.push(unified);
      }
    }

    // 5. 保存到数据库
    await this.saveUnifiedTopics(unifiedTopics);

    // 6. 更新源话题的 unified_topic_id
    await this.updateSourceTopicIds(unifiedTopics);

    console.log(`[TopicUnification] Completed: ${unifiedTopics.length} unified topics created`);

    return {
      unified: unifiedTopics.length,
      fromRss: rssTopics.length,
      fromWeb: webTopics.length,
      fromCommunity: communityTopics.length,
    };
  }

  /**
   * 收集 RSS 话题
   */
  private async collectRssTopics(): Promise<SourceTopic[]> {
    try {
      const result = await query(
        `SELECT id, title, source_name, link, hot_score, published_at, tags
         FROM rss_items 
         WHERE hot_score >= 20 
         AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY hot_score DESC 
         LIMIT 100`
      );

      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        source: 'rss',
        platform: row.source_name,
        url: row.link,
        hotScore: row.hot_score || 0,
        publishedAt: row.published_at,
        tags: row.tags || [],
      }));
    } catch (error) {
      console.error('[TopicUnification] Failed to collect RSS topics:', error);
      return [];
    }
  }

  /**
   * 收集 Web Search 话题
   */
  private async collectWebSearchTopics(): Promise<SourceTopic[]> {
    try {
      const result = await query(
        `SELECT id, title, url, source_domain, relevance_score, published_at
         FROM web_search_results 
         WHERE created_at > NOW() - INTERVAL '24 hours'
         AND related_topic_id IS NULL
         ORDER BY relevance_score DESC 
         LIMIT 50`
      );

      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        source: 'web_search',
        platform: row.source_domain,
        url: row.url,
        hotScore: Math.round((row.relevance_score || 0) * 100),
        publishedAt: row.published_at,
      }));
    } catch (error) {
      console.error('[TopicUnification] Failed to collect Web Search topics:', error);
      return [];
    }
  }

  /**
   * 收集社区话题
   */
  private async collectCommunityTopics(): Promise<SourceTopic[]> {
    try {
      const result = await query(
        `SELECT id, title, platform, platform_url, hot_score, published_at, 
                key_opinions, sentiment, tags
         FROM community_topics 
         WHERE is_filtered = false 
         AND unified_topic_id IS NULL
         AND crawled_at > NOW() - INTERVAL '24 hours'
         ORDER BY hot_score DESC 
         LIMIT 100`
      );

      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        source: 'community',
        platform: row.platform,
        url: row.platform_url,
        hotScore: row.hot_score || 0,
        publishedAt: row.published_at,
        keyOpinions: row.key_opinions || [],
        sentiment: row.sentiment,
        tags: row.tags || [],
      }));
    } catch (error) {
      console.error('[TopicUnification] Failed to collect Community topics:', error);
      return [];
    }
  }

  /**
   * 实体链接 - 将相同话题聚类
   */
  private async entityLinking(topics: SourceTopic[]): Promise<SourceTopic[][]> {
    if (topics.length === 0) return [];

    // 1. 基于标题相似度初步聚类
    const clusters: SourceTopic[][] = [];
    const processed = new Set<string>();

    for (const topic of topics) {
      if (processed.has(topic.id)) continue;

      const cluster: SourceTopic[] = [topic];
      processed.add(topic.id);

      for (const other of topics) {
        if (processed.has(other.id)) continue;

        // 计算相似度
        const similarity = this.calculateSimilarity(topic.title, other.title);
        
        if (similarity > 0.7) {
          cluster.push(other);
          processed.add(other.id);
        }
      }

      clusters.push(cluster);
    }

    // 2. 对于边界情况，使用关键词匹配进行二次检查
    const refinedClusters: SourceTopic[][] = [];
    for (const cluster of clusters) {
      if (cluster.length === 1) {
        // 检查是否与其他聚类有关键词重叠
        let merged = false;
        for (const existingCluster of refinedClusters) {
          if (this.hasKeywordOverlap(cluster[0], existingCluster)) {
            existingCluster.push(cluster[0]);
            merged = true;
            break;
          }
        }
        if (!merged) {
          refinedClusters.push(cluster);
        }
      } else {
        refinedClusters.push(cluster);
      }
    }

    return refinedClusters;
  }

  /**
   * 计算两个标题的相似度
   */
  private calculateSimilarity(title1: string, title2: string): number {
    const t1 = title1.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
    const t2 = title2.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');

    if (t1 === t2) return 1.0;

    // Jaccard 相似度
    const set1 = new Set(t1.split(''));
    const set2 = new Set(t2.split(''));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * 检查关键词重叠
   */
  private hasKeywordOverlap(topic: SourceTopic, cluster: SourceTopic[]): boolean {
    const keywords1 = this.extractKeywords(topic.title);
    
    for (const existing of cluster) {
      const keywords2 = this.extractKeywords(existing.title);
      const overlap = keywords1.filter(k => keywords2.includes(k));
      
      // 如果有超过50%的关键词重叠，认为是同一话题
      if (overlap.length >= Math.min(keywords1.length, keywords2.length) * 0.5) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(title: string): string[] {
    // 简单的关键词提取：去掉停用词，保留名词性词汇
    const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
    
    return title
      .split(/\s+|[，。？！；：""''（）【】]/)
      .filter(w => w.length >= 2 && !stopWords.has(w));
  }

  /**
   * 选择标准标题
   */
  private selectCanonicalTitle(titles: string[]): string {
    // 优先选择最长的标题（通常包含更多信息）
    return titles.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );
  }

  /**
   * 创建归并话题
   */
  private async createUnifiedTopic(cluster: SourceTopic[]): Promise<UnifiedTopic | null> {
    if (cluster.length === 0) return null;

    const titles = cluster.map(t => t.title);
    const canonicalTitle = this.selectCanonicalTitle(titles);

    // 计算多源热度
    const multiScore = this.calculateMultiSourceHotScore(cluster);

    // 收集来源
    const sources: TopicSource[] = cluster.map(t => ({
      type: t.source,
      platform: t.platform,
      url: t.url,
      hotScore: t.hotScore,
      topicId: t.id,
    }));

    // 聚合关键观点
    const allOpinions = cluster
      .flatMap(t => t.keyOpinions || [])
      .filter(Boolean);

    // 计算跨平台情感
    const sentiments = cluster.map(t => t.sentiment).filter(Boolean) as string[];
    const crossPlatformSentiment = this.aggregateSentiment(sentiments);

    // 确定最早发现时间
    const firstSeenAt = new Date(Math.min(...cluster.map(t => t.publishedAt.getTime())));

    return {
      id: uuidv4(),
      title: cluster[0].title, // 保留第一个标题作为原始标题
      canonicalTitle,
      hotScore: multiScore.finalScore,
      confidence: multiScore.confidence,
      hasRssSource: sources.some(s => s.type === 'rss'),
      hasWebSource: sources.some(s => s.type === 'web_search'),
      hasCommunitySource: sources.some(s => s.type === 'community'),
      sourceCount: sources.length,
      sources,
      keyOpinions: this.deduplicateOpinions(allOpinions).slice(0, 10),
      crossPlatformSentiment,
      firstSeenAt,
      lastUpdatedAt: new Date(),
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * 计算多源热度分数
   */
  private calculateMultiSourceHotScore(cluster: SourceTopic[]): MultiSourceHotScore {
    // 各源热度归一化
    const rssItems = cluster.filter(t => t.source === 'rss');
    const webItems = cluster.filter(t => t.source === 'web_search');
    const communityItems = cluster.filter(t => t.source === 'community');

    const rssScore = rssItems.length > 0 
      ? Math.max(...rssItems.map(t => t.hotScore)) * 0.3 
      : 0;
    
    const webScore = webItems.length > 0 
      ? Math.max(...webItems.map(t => t.hotScore)) * 0.35 
      : 0;
    
    const communityScore = communityItems.length > 0 
      ? Math.max(...communityItems.map(t => t.hotScore)) * 0.35 
      : 0;

    // 交叉验证计算
    const sourceCount = [
      rssItems.length > 0,
      webItems.length > 0,
      communityItems.length > 0,
    ].filter(Boolean).length;

    // 多源一致性奖励
    const consistencyMultiplier: Record<number, number> = {
      1: 0.6,
      2: 1.0,
      3: 1.2,
    };

    // 权威源加权
    const authoritySources = ['证监会', '央行', '国务院', '财新', '第一财经', '人民网', '新华网'];
    const hasAuthority = cluster.some(t => 
      authoritySources.some(auth => t.platform?.includes(auth))
    );
    const authorityBoost = hasAuthority ? 1.15 : 1.0;

    // 最终热度计算
    const baseScore = rssScore + webScore + communityScore;
    const finalScore = Math.min(100, baseScore * (consistencyMultiplier[sourceCount] || 0.6) * authorityBoost);

    // 可信度评估
    const confidence = Math.min(1.0, sourceCount * 0.3 + (hasAuthority ? 0.2 : 0));

    return {
      rssScore,
      webSearchScore: webScore,
      communityScore,
      crossPlatformValidation: {
        sourceCount,
        consistencyScore: consistencyMultiplier[sourceCount] || 0.6,
        authorityBoost,
      },
      finalScore: Math.round(finalScore),
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * 聚合情感
   */
  private aggregateSentiment(sentiments: string[]): 'positive' | 'neutral' | 'negative' | 'mixed' {
    if (sentiments.length === 0) return 'neutral';

    const counts: Record<string, number> = {};
    for (const s of sentiments) {
      counts[s] = (counts[s] || 0) + 1;
    }

    const hasPositive = counts['positive'] > 0;
    const hasNegative = counts['negative'] > 0;

    if (hasPositive && hasNegative) return 'mixed';
    if (hasPositive) return 'positive';
    if (hasNegative) return 'negative';
    return 'neutral';
  }

  /**
   * 去重观点
   */
  private deduplicateOpinions(opinions: string[]): string[] {
    const seen = new Set<string>();
    return opinions.filter(op => {
      const key = op.slice(0, 10); // 使用前10个字符作为去重键
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 保存归并话题到数据库
   */
  private async saveUnifiedTopics(topics: UnifiedTopic[]): Promise<void> {
    for (const topic of topics) {
      try {
        await query(
          `INSERT INTO unified_topics (
            id, title, canonical_title, hot_score, confidence,
            has_rss_source, has_web_source, has_community_source, source_count,
            sources, key_opinions, cross_platform_sentiment,
            first_seen_at, last_updated_at, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO UPDATE SET
            hot_score = EXCLUDED.hot_score,
            confidence = EXCLUDED.confidence,
            source_count = EXCLUDED.source_count,
            sources = EXCLUDED.sources,
            key_opinions = EXCLUDED.key_opinions,
            last_updated_at = EXCLUDED.last_updated_at,
            updated_at = EXCLUDED.updated_at`,
          [
            topic.id,
            topic.title,
            topic.canonicalTitle,
            topic.hotScore,
            topic.confidence,
            topic.hasRssSource,
            topic.hasWebSource,
            topic.hasCommunitySource,
            topic.sourceCount,
            JSON.stringify(topic.sources),
            JSON.stringify(topic.keyOpinions),
            topic.crossPlatformSentiment,
            topic.firstSeenAt,
            topic.lastUpdatedAt,
            topic.status,
            topic.createdAt,
            topic.updatedAt,
          ]
        );
      } catch (error) {
        console.error(`[TopicUnification] Failed to save unified topic ${topic.id}:`, error);
      }
    }
  }

  /**
   * 更新源话题的 unified_topic_id
   */
  private async updateSourceTopicIds(unifiedTopics: UnifiedTopic[]): Promise<void> {
    for (const unified of unifiedTopics) {
      for (const source of unified.sources) {
        try {
          if (source.type === 'rss') {
            await query(
              `UPDATE rss_items SET unified_topic_id = $1 WHERE id = $2`,
              [unified.id, source.topicId]
            );
          } else if (source.type === 'web_search') {
            await query(
              `UPDATE web_search_results SET related_topic_id = $1 WHERE id = $2`,
              [unified.id, source.topicId]
            );
          } else if (source.type === 'community') {
            await query(
              `UPDATE community_topics SET unified_topic_id = $1 WHERE id = $2`,
              [unified.id, source.topicId]
            );
          }
        } catch (error) {
          console.error(`[TopicUnification] Failed to update source topic ${source.topicId}:`, error);
        }
      }
    }
  }

  // ===== 公共方法 =====

  /**
   * 获取归并话题列表
   */
  async getUnifiedTopics(options: {
    limit?: number;
    minConfidence?: number;
    hasRss?: boolean;
    hasWeb?: boolean;
    hasCommunity?: boolean;
  } = {}): Promise<UnifiedTopic[]> {
    const { limit = 50, minConfidence = 0.5, hasRss, hasWeb, hasCommunity } = options;

    let sql = `SELECT * FROM unified_topics WHERE confidence >= $1`;
    const params: any[] = [minConfidence];

    if (hasRss !== undefined) {
      sql += ` AND has_rss_source = $${params.length + 1}`;
      params.push(hasRss);
    }
    if (hasWeb !== undefined) {
      sql += ` AND has_web_source = $${params.length + 1}`;
      params.push(hasWeb);
    }
    if (hasCommunity !== undefined) {
      sql += ` AND has_community_source = $${params.length + 1}`;
      params.push(hasCommunity);
    }

    sql += ` ORDER BY hot_score DESC, confidence DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      canonicalTitle: row.canonical_title,
      hotScore: row.hot_score,
      confidence: row.confidence,
      hasRssSource: row.has_rss_source,
      hasWebSource: row.has_web_source,
      hasCommunitySource: row.has_community_source,
      sourceCount: row.source_count,
      sources: row.sources || [],
      keyOpinions: row.key_opinions || [],
      crossPlatformSentiment: row.cross_platform_sentiment,
      firstSeenAt: row.first_seen_at,
      lastUpdatedAt: row.last_updated_at,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 验证话题热度（使用 Web Search 交叉验证）
   */
  async verifyTopicWithSearch(topicId: string): Promise<{
    verified: boolean;
    searchResults: number;
    newsCoverage: number;
    adjustedScore: number;
  }> {
    try {
      // 获取话题标题
      const result = await query(
        `SELECT canonical_title FROM unified_topics WHERE id = $1`,
        [topicId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Topic not found');
      }

      const title = result.rows[0].canonical_title;

      // 执行多维度搜索
      const [generalSearch, newsSearch] = await Promise.all([
        this.webSearchService.search({ query: title, maxResults: 10 }),
        this.webSearchService.search({ query: `${title} news`, maxResults: 5 }),
      ]);

      const searchResults = generalSearch.length;
      const newsCoverage = newsSearch.length;

      // 根据搜索结果调整热度分数
      const adjustedScore = Math.min(100, searchResults * 5 + newsCoverage * 10);

      return {
        verified: searchResults >= 3,
        searchResults,
        newsCoverage,
        adjustedScore,
      };
    } catch (error) {
      console.error('[TopicUnification] Failed to verify topic:', error);
      return {
        verified: false,
        searchResults: 0,
        newsCoverage: 0,
        adjustedScore: 0,
      };
    }
  }
}

// 单例实例
let topicUnificationService: TopicUnificationService | null = null;

export function getTopicUnificationService(): TopicUnificationService {
  if (!topicUnificationService) {
    topicUnificationService = new TopicUnificationService();
  }
  return topicUnificationService;
}
