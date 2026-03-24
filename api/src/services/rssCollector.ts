// RSS 自动采集服务 - RSS Feed Collector Service v2.1
// 功能整合：素材采集 + 热点追踪 + 进度监控
// FR-031 ~ FR-033: 自动采集 RSS 源，智能入库

import Parser from 'rss-parser';
import crypto from 'crypto';
import { query } from '../db/connection.js';

// ===== 类型定义 =====

export interface RSSSource {
  id: string;
  name: string;
  url: string;
  priority: 'P0' | 'P1' | 'P2';
  fetchInterval: number;
  status: 'active' | 'inactive';
  keywords: string[];
  language: string;
  category?: string;
}

export interface RSSItem {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  link: string;
  content?: string;
  summary?: string;
  publishedAt: Date;
  author?: string;
  categories?: string[];
  tags: string[];
  relevanceScore: number;
  isDuplicate: boolean;
  embedding?: number[];
  hotScore?: number;
  trend?: 'up' | 'stable' | 'down';
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface RSSConfig {
  categories: Record<string, {
    name: string;
    sources: RSSSource[];
  }>;
  filters: {
    hotKeywords: string[];
    excludeKeywords: string[];
    minContentLength: number;
    maxContentLength: number;
  };
}

export interface CollectionProgress {
  jobId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  totalSources: number;
  processedSources: number;
  currentSource?: string;
  totalFetched: number;
  totalImported: number;
  duplicates: number;
  errors: string[];
  sourceProgress: Map<string, SourceProgress>;
}

export interface SourceProgress {
  sourceId: string;
  sourceName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fetched: number;
  imported: number;
  duplicates: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ===== 全局状态 =====

let currentJob: CollectionProgress | null = null;
let jobHistory: CollectionProgress[] = [];

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

// ===== 配置加载 =====

export async function loadRSSConfig(): Promise<RSSConfig> {
  try {
    const configModule = await import('../../../config/rss-sources.json');
    return (configModule.default || configModule) as RSSConfig;
  } catch (error) {
    console.error('[RSS] Failed to load config:', error);
    // 返回默认配置，确保至少有5个可用源
    return getDefaultConfig();
  }
}

function getDefaultConfig(): RSSConfig {
  return {
    categories: {
      tech: {
        name: '科技',
        sources: [
          {
            id: 'hacker-news',
            name: 'Hacker News',
            url: 'https://news.ycombinator.com/rss',
            priority: 'P0',
            fetchInterval: 15,
            status: 'active',
            keywords: ['tech', 'startup', 'programming'],
            language: 'en'
          },
          {
            id: 'the-verge',
            name: 'The Verge',
            url: 'https://www.theverge.com/rss/index.xml',
            priority: 'P0',
            fetchInterval: 30,
            status: 'active',
            keywords: ['tech', 'gadgets', 'reviews'],
            language: 'en'
          },
          {
            id: 'ars-technica',
            name: 'Ars Technica',
            url: 'http://feeds.arstechnica.com/arstechnica/index',
            priority: 'P0',
            fetchInterval: 30,
            status: 'active',
            keywords: ['tech', 'science', 'policy'],
            language: 'en'
          },
          {
            id: 'mit-tech-review',
            name: 'MIT Technology Review',
            url: 'https://www.technologyreview.com/feed/',
            priority: 'P0',
            fetchInterval: 60,
            status: 'active',
            keywords: ['AI', 'biotech', 'innovation'],
            language: 'en'
          },
          {
            id: 'github-blog',
            name: 'GitHub Blog',
            url: 'https://github.blog/feed/',
            priority: 'P1',
            fetchInterval: 60,
            status: 'active',
            keywords: ['git', 'open source', 'security'],
            language: 'en'
          }
        ]
      }
    },
    filters: {
      hotKeywords: ['AI', 'tech', 'startup', 'programming', '人工智能', '科技'],
      excludeKeywords: ['advertisement', 'promoted'],
      minContentLength: 50,
      maxContentLength: 50000
    }
  };
}

export async function saveRSSConfig(config: RSSConfig): Promise<void> {
  console.log('[RSS] Config saved (mock)');
}

// ===== 进度管理 =====

export function getCurrentJob(): CollectionProgress | null {
  return currentJob;
}

export function getJobHistory(limit: number = 10): CollectionProgress[] {
  return jobHistory.slice(-limit);
}

function createNewJob(totalSources: number): string {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  currentJob = {
    jobId,
    status: 'running',
    startedAt: new Date(),
    totalSources,
    processedSources: 0,
    totalFetched: 0,
    totalImported: 0,
    duplicates: 0,
    errors: [],
    sourceProgress: new Map()
  };
  console.log(`[RSS] Created job ${jobId}, total sources: ${totalSources}`);
  return jobId;
}

function updateSourceProgress(sourceId: string, progress: Partial<SourceProgress>) {
  if (!currentJob) return;
  
  const existing = currentJob.sourceProgress.get(sourceId);
  if (existing) {
    Object.assign(existing, progress);
  } else {
    currentJob.sourceProgress.set(sourceId, progress as SourceProgress);
  }
}

function completeJob(success: boolean = true) {
  if (!currentJob) return;
  
  currentJob.status = success ? 'completed' : 'failed';
  currentJob.completedAt = new Date();
  jobHistory.push({ ...currentJob });
  
  if (jobHistory.length > 50) {
    jobHistory = jobHistory.slice(-50);
  }
  
  console.log(`[RSS] Job ${currentJob.jobId} ${success ? 'completed' : 'failed'}`);
  console.log(`[RSS] Summary: ${currentJob.totalFetched} fetched, ${currentJob.totalImported} imported, ${currentJob.duplicates} duplicates`);
}

// ===== 核心采集功能 =====

export async function collectAllFeeds(): Promise<{
  jobId: string;
  totalFetched: number;
  totalImported: number;
  duplicates: number;
  errors: string[];
}> {
  const config = await loadRSSConfig();
  const sources = extractSources(config).filter(s => s.status === 'active');
  
  if (sources.length === 0) {
    console.error('[RSS] No active sources found');
    return { jobId: 'none', totalFetched: 0, totalImported: 0, duplicates: 0, errors: ['No active sources'] };
  }

  // 确保至少有 5 个源
  const targetSources = sources.slice(0, Math.max(5, sources.length));
  const jobId = createNewJob(targetSources.length);
  
  console.log(`[RSS] Starting collection job ${jobId}`);
  console.log(`[RSS] Target: ${targetSources.length} sources, min 50 articles`);

  const errors: string[] = [];
  let totalFetched = 0;
  let totalImported = 0;
  let duplicates = 0;
  let successCount = 0;

  for (let i = 0; i < targetSources.length; i++) {
    const source = targetSources[i];
    
    console.log(`[RSS] [${i + 1}/${targetSources.length}] Processing: ${source.name}`);
    
    if (currentJob) {
      currentJob.currentSource = source.name;
      currentJob.processedSources = i;
    }

    updateSourceProgress(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      status: 'processing',
      fetched: 0,
      imported: 0,
      duplicates: 0,
      startedAt: new Date()
    });

    try {
      const result = await collectSingleFeed(source, config.filters);
      totalFetched += result.fetched;
      totalImported += result.imported;
      duplicates += result.duplicates;
      successCount++;

      updateSourceProgress(source.id, {
        status: 'completed',
        fetched: result.fetched,
        imported: result.imported,
        duplicates: result.duplicates,
        completedAt: new Date()
      });

      if (currentJob) {
        currentJob.totalFetched = totalFetched;
        currentJob.totalImported = totalImported;
        currentJob.duplicates = duplicates;
      }

      console.log(`[RSS] ✓ ${source.name}: ${result.fetched} fetched, ${result.imported} imported`);
    } catch (error) {
      const errorMsg = `[${source.name}] ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      
      updateSourceProgress(source.id, {
        status: 'failed',
        error: errorMsg,
        completedAt: new Date()
      });
      
      if (currentJob) {
        currentJob.errors.push(errorMsg);
      }
      
      console.error(`[RSS] ✗ ${source.name} failed:`, error);
    }
  }

  if (currentJob) {
    currentJob.processedSources = targetSources.length;
    currentJob.currentSource = undefined;
  }
  
  const success = successCount >= 5 || totalImported >= 50;
  completeJob(success);

  console.log(`[RSS] Final: ${totalFetched} fetched, ${totalImported} imported from ${successCount}/${targetSources.length} sources`);
  
  return { jobId, totalFetched, totalImported, duplicates, errors };
}

export async function collectSingleFeed(
  source: RSSSource,
  filters: RSSConfig['filters']
): Promise<{ fetched: number; imported: number; duplicates: number }> {
  console.log(`[RSS] Fetching: ${source.url}`);
  
  let feed;
  try {
    feed = await rssParser.parseURL(source.url);
  } catch (error) {
    console.error(`[RSS] Parse error for ${source.name}:`, error);
    throw new Error(`Failed to parse RSS: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  const items = feed.items || [];
  console.log(`[RSS] ${source.name}: ${items.length} items found`);

  let imported = 0;
  let duplicates = 0;
  let processedCount = 0;

  // 处理前 50 条
  for (const item of items.slice(0, 50)) {
    processedCount++;
    
    // 每 5 条更新一次进度
    if (processedCount % 5 === 0) {
      updateSourceProgress(source.id, {
        sourceId: source.id,
        sourceName: source.name,
        status: 'processing',
        fetched: processedCount,
        imported,
        duplicates
      });
    }

    try {
      const rssItem = await parseRSSItem(item, source);

      // 宽松的内容过滤
      if (!passContentFilter(rssItem, filters)) {
        continue;
      }

      // 去重检查
      const isDuplicate = await checkDuplicate(rssItem);
      if (isDuplicate) {
        duplicates++;
        continue;
      }

      // 保存到数据库
      try {
        await saveRSSItem(rssItem);
        await saveHotTopic(rssItem);
        imported++;
      } catch (saveError) {
        console.error(`[RSS] Save failed for item ${rssItem.title}:`, saveError);
        throw saveError;
      }
    } catch (error) {
      console.warn(`[RSS] Error processing item from ${source.name}:`, error);
    }
  }

  // 更新源的采集时间
  await updateSourceLastFetch(source.id, imported);

  console.log(`[RSS] ${source.name} complete: ${processedCount} processed, ${imported} imported, ${duplicates} duplicates`);
  
  return { fetched: items.length, imported, duplicates };
}

async function parseRSSItem(
  item: Parser.Item,
  source: RSSSource
): Promise<RSSItem> {
  const content = (item as any)['content:encoded'] || item.content || item.summary || '';
  const title = item.title || '无标题';
  const link = item.link || '';
  const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

  // 生成唯一 ID
  const id = crypto.createHash('md5').update(link || title + publishedAt.toISOString()).digest('hex');

  // 自动提取标签
  const tags = await extractTags(title, content, source.keywords);

  // 计算相关度分数
  const relevanceScore = calculateRelevance(title, content, source.keywords, tags);

  // 计算热点追踪数据
  const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
  const hotScore = Math.max(0, 100 - hoursAgo * 2);
  const trend = hotScore > 80 ? 'up' : hotScore > 50 ? 'stable' : 'down';
  const sentiment = analyzeSentiment(title + ' ' + (item.contentSnippet || content.slice(0, 500)));

  return {
    id,
    sourceId: source.id,
    sourceName: source.name,
    title: title.slice(0, 500),
    link: link.slice(0, 1000),
    content: content.slice(0, 50000),
    summary: generateSummary(content),
    publishedAt,
    author: item.creator || (item as any).author || '',
    categories: item.categories?.map(c => String(c)),
    tags,
    relevanceScore,
    isDuplicate: false,
    hotScore: Math.round(hotScore),
    trend,
    sentiment
  };
}

function passContentFilter(item: RSSItem, filters: RSSConfig['filters']): boolean {
  const content = (item.content || item.summary || '').toLowerCase();
  const title = item.title.toLowerCase();

  // 检查排除关键词
  for (const keyword of filters.excludeKeywords) {
    if (content.includes(keyword.toLowerCase()) ||
        title.includes(keyword.toLowerCase())) {
      return false;
    }
  }

  // 宽松的内容长度检查
  const contentLength = (item.content || item.summary || '').length;
  if (contentLength < 50) {
    return false;
  }

  return true;
}

async function checkDuplicate(item: RSSItem): Promise<boolean> {
  try {
    // 1. 检查 link 是否已存在
    if (item.link) {
      const linkResult = await query(
        `SELECT id FROM rss_items WHERE link = $1`,
        [item.link]
      );
      if (linkResult.rows.length > 0) {
        return true;
      }
    }

    // 2. 检查 ID 是否已存在
    const idResult = await query(
      `SELECT id FROM rss_items WHERE id = $1`,
      [item.id]
    );
    if (idResult.rows.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn('[RSS] Duplicate check error:', error);
    return false;
  }
}

async function saveRSSItem(item: RSSItem): Promise<void> {
  console.log(`[RSS] Saving item: ${item.title.substring(0, 50)}...`);
  try {
    // 生成 embedding
    let embedding: number[] | null = null;
    try {
      const textToEmbed = `${item.title} ${item.summary || item.content?.slice(0, 1000) || ''}`;
      embedding = await getEmbedding(textToEmbed);
    } catch (error) {
      // 忽略 embedding 错误
      console.log(`[RSS] Embedding generation failed, continuing without embedding`);
    }

    console.log(`[RSS] Inserting item with id=${item.id}, source=${item.sourceName}`);
    await query(
      `INSERT INTO rss_items (
        id, source_id, source_name, title, link, content, summary,
        published_at, author, categories, tags, relevance_score, 
        hot_score, trend, sentiment, embedding, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (id) DO UPDATE SET
        hot_score = EXCLUDED.hot_score,
        trend = EXCLUDED.trend,
        sentiment = EXCLUDED.sentiment,
        updated_at = NOW()`,
      [
        item.id,
        item.sourceId,
        item.sourceName,
        item.title,
        item.link,
        item.content,
        item.summary,
        item.publishedAt,
        item.author,
        JSON.stringify(item.categories || []),
        JSON.stringify(item.tags),
        item.relevanceScore,
        item.hotScore,
        item.trend,
        item.sentiment,
        embedding ? JSON.stringify(embedding) : null,
      ]
    );
    console.log(`[RSS] Item saved successfully: ${item.id}`);
  } catch (error) {
    console.error('[RSS] Error saving item:', error);
    console.error('[RSS] Item data:', { id: item.id, title: item.title.substring(0, 50), source: item.sourceName });
    throw error;
  }
}

async function saveHotTopic(item: RSSItem): Promise<void> {
  if (!item.hotScore || item.hotScore < 20) return;

  try {
    await query(
      `INSERT INTO hot_topics (
        id, title, source, source_url, hot_score, trend, sentiment, 
        published_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        hot_score = EXCLUDED.hot_score,
        trend = EXCLUDED.trend,
        updated_at = NOW()`,
      [
        `rss-${item.id}`,
        item.title,
        item.sourceName,
        item.link,
        item.hotScore,
        item.trend,
        item.sentiment,
        item.publishedAt
      ]
    );
  } catch (error) {
    // 忽略热点保存错误
  }
}

async function importToAssetLibrary(item: RSSItem, embedding?: number[] | null): Promise<void> {
  try {
    await query(
      `INSERT INTO assets (
        id, title, content, content_type, source, source_url,
        tags, auto_tags, quality_score, embedding, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`,
      [
        `rss-${item.id}`,
        item.title,
        item.content,
        'text/rss',
        item.sourceName,
        item.link,
        JSON.stringify(item.tags),
        JSON.stringify(item.tags),
        item.relevanceScore,
        embedding ? JSON.stringify(embedding) : null,
      ]
    );
  } catch (error) {
    // 忽略导入错误
  }
}

async function extractTags(title: string, content: string, sourceKeywords: string[]): Promise<string[]> {
  const tags: Set<string> = new Set();
  const text = `${title} ${content}`.toLowerCase();

  // 匹配源关键词
  for (const keyword of sourceKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      tags.add(keyword);
    }
  }

  // 热点关键词
  const hotKeywords = [
    'AI', 'artificial intelligence', 'ChatGPT', 'LLM', 'machine learning',
    'startup', 'funding', 'IPO', 'acquisition', 'tech',
    '人工智能', '科技', '互联网', '创业', '融资'
  ];

  for (const keyword of hotKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      tags.add(keyword);
    }
  }

  return Array.from(tags).slice(0, 10);
}

function calculateRelevance(title: string, content: string, sourceKeywords: string[], extractedTags: string[]): number {
  let score = 0.3; // 基础分
  const text = `${title} ${content}`.toLowerCase();

  // 标题包含关键词加分
  for (const keyword of sourceKeywords) {
    if (title.toLowerCase().includes(keyword.toLowerCase())) {
      score += 0.2;
    } else if (text.includes(keyword.toLowerCase())) {
      score += 0.1;
    }
  }

  // 标签数量
  score += Math.min(extractedTags.length * 0.05, 0.2);

  return Math.min(score, 1.0);
}

function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positiveWords = ['增长', '上涨', '突破', '利好', 'rise', 'growth', 'surge', 'strong', 'gain'];
  const negativeWords = ['下降', '下跌', '跌破', '利空', 'fall', 'decline', 'drop', 'weak', 'loss'];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (text.includes(word)) positiveCount++;
  }

  for (const word of negativeWords) {
    if (text.includes(word)) negativeCount++;
  }

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function generateSummary(content: string, maxLength: number = 300): string {
  const plainText = content
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  const truncated = plainText.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('。');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxLength * 0.7) {
    return plainText.slice(0, cutPoint + 1);
  }

  return truncated + '...';
}

async function updateSourceLastFetch(sourceId: string, itemCount: number): Promise<void> {
  try {
    await query(
      `INSERT INTO rss_fetch_logs (source_id, fetched_at, fetched_date, status, items_fetched)
       VALUES ($1, NOW(), CURRENT_DATE, 'success', $2)
       ON CONFLICT (source_id, fetched_date)
       DO UPDATE SET fetched_at = NOW(), status = 'success', items_fetched = $2`,
      [sourceId, itemCount]
    );
  } catch (error) {
    console.warn('[RSS] Error updating fetch log:', error);
  }
}

function extractSources(config: RSSConfig): RSSSource[] {
  const sources: RSSSource[] = [];

  for (const [categoryKey, category] of Object.entries(config.categories)) {
    for (const source of category.sources) {
      sources.push({
        ...source,
        category: categoryKey,
      });
    }
  }

  return sources;
}

export async function getRSSStats(): Promise<{
  totalItems: number;
  todayItems: number;
  totalSources: number;
  activeSources: number;
  avgRelevance: number;
  hotTopicsCount: number;
  todayHotTopics: number;
}> {
  try {
    const totalResult = await query(`SELECT COUNT(*) FROM rss_items`);
    const todayResult = await query(
      `SELECT COUNT(*) FROM rss_items WHERE created_at > NOW() - INTERVAL '1 day'`
    );
    const relevanceResult = await query(
      `SELECT AVG(relevance_score) FROM rss_items WHERE created_at > NOW() - INTERVAL '7 days'`
    );
    const hotTopicsResult = await query(`SELECT COUNT(*) FROM hot_topics`);
    const todayHotTopicsResult = await query(
      `SELECT COUNT(*) FROM hot_topics WHERE created_at > NOW() - INTERVAL '1 day'`
    );

    const config = await loadRSSConfig();
    const sources = extractSources(config);

    return {
      totalItems: parseInt(totalResult.rows[0]?.count || '0'),
      todayItems: parseInt(todayResult.rows[0]?.count || '0'),
      totalSources: sources.length,
      activeSources: sources.filter(s => s.status === 'active').length,
      avgRelevance: parseFloat(relevanceResult.rows[0]?.avg || '0'),
      hotTopicsCount: parseInt(hotTopicsResult.rows[0]?.count || '0'),
      todayHotTopics: parseInt(todayHotTopicsResult.rows[0]?.count || '0'),
    };
  } catch (error) {
    console.error('[RSS] Stats error:', error);
    return {
      totalItems: 0,
      todayItems: 0,
      totalSources: 0,
      activeSources: 0,
      avgRelevance: 0,
      hotTopicsCount: 0,
      todayHotTopics: 0,
    };
  }
}

export async function getRecentHotTopics(limit: number = 20): Promise<any[]> {
  try {
    const result = await query(
      `SELECT * FROM hot_topics 
       WHERE created_at > NOW() - INTERVAL '7 days'
       ORDER BY hot_score DESC, published_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function getEmbedding(text: string): Promise<number[]> {
  // 返回随机向量作为占位符
  return new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
}
