// RSS 自动采集服务 - RSS Feed Collector Service v2.0
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
  fetchInterval: number; // minutes
  status: 'active' | 'inactive';
  keywords: string[];
  language: string;
  category: string;
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
  // 热点追踪字段
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

// 当前采集任务进度（内存存储，支持实时查询）
let currentJob: CollectionProgress | null = null;
let jobHistory: CollectionProgress[] = [];

const rssParser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; ContentPipeline/1.0;)'
  }
});

// ===== 配置加载 =====

export async function loadRSSConfig(): Promise<RSSConfig> {
  try {
    const configModule = await import('../../../config/rss-sources.json', {
      assert: { type: 'json' }
    });
    return configModule.default as RSSConfig;
  } catch {
    return {
      categories: {},
      filters: {
        hotKeywords: [],
        excludeKeywords: [],
        minContentLength: 200,
        maxContentLength: 50000
      }
    };
  }
}

export async function saveRSSConfig(config: RSSConfig): Promise<void> {
  // 实际项目中应该写入文件或数据库
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
  
  // 保留最近 50 条历史
  if (jobHistory.length > 50) {
    jobHistory = jobHistory.slice(-50);
  }
  
  console.log(`[RSS] Job ${currentJob.jobId} ${success ? 'completed' : 'failed'}`);
}

// ===== 核心采集功能 =====

/**
 * 采集所有活跃 RSS 源（带进度追踪）
 */
export async function collectAllFeeds(): Promise<{
  jobId: string;
  totalFetched: number;
  totalImported: number;
  duplicates: number;
  errors: string[];
}> {
  const config = await loadRSSConfig();
  const sources = extractSources(config).filter(s => s.status === 'active');
  
  // 创建新任务
  const jobId = createNewJob(sources.length);
  console.log(`[RSS] Starting collection job ${jobId}, ${sources.length} sources`);

  const errors: string[] = [];
  let totalFetched = 0;
  let totalImported = 0;
  let duplicates = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    
    // 更新当前处理状态
    if (currentJob) {
      currentJob.currentSource = source.name;
      currentJob.processedSources = i;
    }

    // 初始化源进度
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

      // 更新源进度
      updateSourceProgress(source.id, {
        status: 'completed',
        fetched: result.fetched,
        imported: result.imported,
        duplicates: result.duplicates,
        completedAt: new Date()
      });

      // 更新总进度
      if (currentJob) {
        currentJob.totalFetched = totalFetched;
        currentJob.totalImported = totalImported;
        currentJob.duplicates = duplicates;
      }

      console.log(`[RSS] [${i + 1}/${sources.length}] ${source.name}: fetched ${result.fetched}, imported ${result.imported}`);
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
      
      console.error(`[RSS] Error collecting ${source.name}:`, error);
    }
  }

  // 完成任务
  if (currentJob) {
    currentJob.processedSources = sources.length;
    currentJob.currentSource = undefined;
  }
  completeJob(errors.length === 0);

  return { jobId, totalFetched, totalImported, duplicates, errors };
}

/**
 * 采集单个 RSS 源
 */
export async function collectSingleFeed(
  source: RSSSource,
  filters: RSSConfig['filters']
): Promise<{ fetched: number; imported: number; duplicates: number }> {
  const feed = await rssParser.parseURL(source.url);
  const items = feed.items || [];

  let imported = 0;
  let duplicates = 0;
  let processedCount = 0;

  for (const item of items.slice(0, 50)) { // 每个源最多处理 50 条
    processedCount++;
    
    // 实时更新进度
    updateSourceProgress(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      status: 'processing',
      fetched: processedCount,
      imported,
      duplicates
    });

    const rssItem = await parseRSSItem(item, source);

    // 内容过滤
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
    await saveRSSItem(rssItem);
    
    // 同时保存到热点表（用于热点追踪）
    await saveHotTopic(rssItem);
    
    imported++;
  }

  // 更新源的采集时间
  await updateSourceLastFetch(source.id);

  return { fetched: items.length, imported, duplicates };
}

/**
 * 解析 RSS 条目
 */
async function parseRSSItem(
  item: Parser.Item,
  source: RSSSource
): Promise<RSSItem> {
  const content = (item as any)['content:encoded'] || item.content || item.summary || '';
  const title = item.title || '无标题';
  const link = item.link || '';
  const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

  // 生成唯一 ID
  const id = crypto.createHash('md5').update(link).digest('hex');

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
    content: content.slice(0, filters.maxContentLength),
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

/**
 * 内容过滤
 */
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

  // 检查内容长度
  const contentLength = (item.content || item.summary || '').length;
  if (contentLength < filters.minContentLength) {
    return false;
  }

  // 检查是否包含热点关键词（提高相关度）
  const hasHotKeyword = filters.hotKeywords.some(kw =>
    title.includes(kw.toLowerCase()) ||
    content.includes(kw.toLowerCase())
  );

  // P0/P1 源要求必须包含热点关键词或源关键词
  if ((item.relevanceScore < 0.3) && !hasHotKeyword) {
    return false;
  }

  return true;
}

/**
 * 去重检查
 */
async function checkDuplicate(item: RSSItem): Promise<boolean> {
  // 1. 检查 link 是否已存在
  const linkResult = await query(
    `SELECT id FROM rss_items WHERE link = $1 OR id = $2`,
    [item.link, item.id]
  );

  if (linkResult.rows.length > 0) {
    return true;
  }

  // 2. 检查标题相似度（近 7 天内）
  const titleResult = await query(
    `SELECT id, title FROM rss_items
     WHERE published_at > NOW() - INTERVAL '7 days'
     AND similarity(title, $1) > 0.8`,
    [item.title]
  );

  if (titleResult.rows.length > 0) {
    return true;
  }

  return false;
}

/**
 * 保存 RSS 条目到素材库
 */
async function saveRSSItem(item: RSSItem): Promise<void> {
  // 生成 embedding 用于相似度搜索
  let embedding: number[] | null = null;
  try {
    const textToEmbed = `${item.title} ${item.summary || item.content?.slice(0, 1000) || ''}`;
    embedding = await getEmbedding(textToEmbed);
  } catch (error) {
    console.warn('[RSS] Failed to generate embedding:', error);
  }

  // 保存到 rss_items 表
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

  // 高相关度内容自动导入素材库
  if (item.relevanceScore >= 0.7) {
    await importToAssetLibrary(item, embedding);
  }
}

/**
 * 保存热点数据
 */
async function saveHotTopic(item: RSSItem): Promise<void> {
  // 只保存有热度的内容
  if (!item.hotScore || item.hotScore < 30) return;

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
}

/**
 * 导入到素材库
 */
async function importToAssetLibrary(
  item: RSSItem,
  embedding?: number[] | null
): Promise<void> {
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

  console.log(`[RSS] Auto-imported to asset library: ${item.title.slice(0, 50)}...`);
}

/**
 * 自动提取标签
 */
async function extractTags(
  title: string,
  content: string,
  sourceKeywords: string[]
): Promise<string[]> {
  const tags: Set<string> = new Set();
  const text = `${title} ${content}`.toLowerCase();

  // 1. 匹配源关键词
  for (const keyword of sourceKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      tags.add(keyword);
    }
  }

  // 2. 热点关键词匹配
  const hotKeywords = [
    'AI', '人工智能', 'ChatGPT', '大模型', 'LLM',
    '新能源', '电动车', '比亚迪', '特斯拉',
    '股市', 'A股', '港股', '美股',
    '融资', 'IPO', '上市', '并购',
    '政策', '监管', '央行', '降准', '降息',
    '华为', '苹果', '小米', '字节跳动',
    '房地产', 'REITs', '保租房',
    'startup', 'funding', 'venture capital'
  ];

  for (const keyword of hotKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      tags.add(keyword);
    }
  }

  // 3. 提取命名实体（简化版）
  const companyPattern = /(?:比亚迪|特斯拉|华为|小米|苹果|字节跳动|腾讯|阿里巴巴|京东|美团|拼多多|蔚来|小鹏|理想|OpenAI|Google|Microsoft|Apple|Amazon|Meta|Tesla|Nvidia)/gi;
  const companies = text.match(companyPattern) || [];
  companies.forEach(c => tags.add(c));

  return Array.from(tags).slice(0, 10);
}

/**
 * 计算相关度分数
 */
function calculateRelevance(
  title: string,
  content: string,
  sourceKeywords: string[],
  extractedTags: string[]
): number {
  let score = 0;
  const text = `${title} ${content}`.toLowerCase();

  // 1. 标题包含关键词加分
  for (const keyword of sourceKeywords) {
    if (title.toLowerCase().includes(keyword.toLowerCase())) {
      score += 0.3;
    } else if (text.includes(keyword.toLowerCase())) {
      score += 0.1;
    }
  }

  // 2. 提取到的标签数量
  score += Math.min(extractedTags.length * 0.1, 0.3);

  // 3. 内容长度适中加分
  const contentLength = content.length;
  if (contentLength > 1000 && contentLength < 10000) {
    score += 0.2;
  }

  // 4. 有作者信息加分（可能是专业内容）
  if (content.includes('作者') || content.includes('记者')) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

/**
 * 情绪分析
 */
function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positiveWords = ['增长', '上涨', '突破', '利好', '强劲', '创新高', '成功', '提升', '增长', 'rise', 'growth', 'surge', 'breakthrough', 'strong'];
  const negativeWords = ['下降', '下跌', '跌破', '利空', '疲软', '创新低', '失败', '下滑', '下降', 'fall', 'decline', 'drop', 'crash', 'weak'];

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

/**
 * 生成摘要
 */
function generateSummary(content: string, maxLength: number = 300): string {
  // 移除 HTML 标签
  const plainText = content
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  // 尝试在句子边界截断
  const truncated = plainText.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('。');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxLength * 0.7) {
    return plainText.slice(0, cutPoint + 1);
  }

  return truncated + '...';
}

/**
 * 更新源的采集时间
 */
async function updateSourceLastFetch(sourceId: string): Promise<void> {
  await query(
    `INSERT INTO rss_fetch_logs (source_id, fetched_at, fetched_date, status)
     VALUES ($1, NOW(), CURRENT_DATE, 'success')
     ON CONFLICT (source_id, fetched_date)
     DO UPDATE SET fetched_at = NOW(), status = 'success'`,
    [sourceId]
  );
}

/**
 * 提取所有源
 */
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

// ===== 统计和查询 =====

/**
 * 获取 RSS 采集统计
 */
export async function getRSSStats(): Promise<{
  totalItems: number;
  todayItems: number;
  totalSources: number;
  activeSources: number;
  avgRelevance: number;
  hotTopicsCount: number;
  todayHotTopics: number;
}> {
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
}

/**
 * 获取最近采集的热点话题
 */
export async function getRecentHotTopics(limit: number = 20): Promise<any[]> {
  const result = await query(
    `SELECT * FROM hot_topics 
     WHERE created_at > NOW() - INTERVAL '7 days'
     ORDER BY hot_score DESC, published_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ===== Embedding 工具 =====

async function getEmbedding(text: string): Promise<number[]> {
  // 返回一个空的 1536 维向量作为占位符
  // 实际实现应该调用 OpenAI/Claude 的 embedding API
  return new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
}

// ===== 默认过滤器配置 =====

const filters = {
  hotKeywords: [] as string[],
  excludeKeywords: [] as string[],
  minContentLength: 200,
  maxContentLength: 50000,
};
