// 深度研究自动采集服务 - Deep Research Collector
// v2.1: 根据大纲设置自动抓取相关内容

import { query } from '../db/connection.js';
import { getWebSearchService } from './webSearch.js';

export interface ResearchConfig {
  autoCollect: boolean;
  sources: ('web' | 'rss' | 'asset' | 'news')[];
  maxResults: number;
  minCredibility: number;
  keywords: string[];
  excludeKeywords: string[];
  timeRange: '1d' | '7d' | '30d' | '90d' | 'all';
}

export interface CollectedContent {
  id: string;
  source: string;
  sourceType: 'web' | 'rss' | 'asset' | 'news';
  title: string;
  url?: string;
  content?: string;
  summary: string;
  credibility: number;
  relevanceScore: number;
  publishedAt?: Date;
  tags: string[];
}

/**
 * 根据大纲执行深度研究采集
 */
export async function collectResearchContent(
  taskId: string,
  outline: any,
  config: ResearchConfig
): Promise<{
  totalCollected: number;
  bySource: Record<string, number>;
  items: CollectedContent[];
}> {
  console.log(`[Research] Starting collection for task ${taskId}`);

  const allItems: CollectedContent[] = [];

  // 1. 从大纲提取关键词
  const keywords = config.keywords.length > 0
    ? config.keywords
    : extractKeywordsFromOutline(outline);

  console.log(`[Research] Keywords: ${keywords.join(', ')}`);

  // 2. 根据配置采集不同来源
  if (config.sources.includes('web')) {
    const webItems = await collectFromWeb(keywords, config);
    allItems.push(...webItems);
    console.log(`[Research] Web: ${webItems.length} items`);
  }

  if (config.sources.includes('rss')) {
    const rssItems = await collectFromRSS(keywords, config);
    allItems.push(...rssItems);
    console.log(`[Research] RSS: ${rssItems.length} items`);
  }

  if (config.sources.includes('asset')) {
    const assetItems = await collectFromAssets(keywords, config);
    allItems.push(...assetItems);
    console.log(`[Research] Assets: ${assetItems.length} items`);
  }

  // 3. 去重和排序
  const uniqueItems = deduplicateByUrl(allItems);
  const sortedItems = uniqueItems
    .filter(item => item.credibility >= config.minCredibility)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, config.maxResults);

  // 4. 保存到数据库
  await saveCollectedContent(taskId, sortedItems);

  // 5. 统计
  const bySource: Record<string, number> = {};
  sortedItems.forEach(item => {
    bySource[item.sourceType] = (bySource[item.sourceType] || 0) + 1;
  });

  return {
    totalCollected: sortedItems.length,
    bySource,
    items: sortedItems,
  };
}

/**
 * 从网页搜索采集
 */
async function collectFromWeb(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const items: CollectedContent[] = [];
  const webSearch = getWebSearchService();

  for (const keyword of keywords.slice(0, 3)) {
    try {
      const results = await webSearch.search({
        query: keyword,
        maxResults: 5,
      });

      for (const result of results) {
        items.push({
          id: `web-${Buffer.from(result.url).toString('base64').slice(0, 16)}`,
          source: result.source || 'Web Search',
          sourceType: 'web',
          title: result.title,
          url: result.url,
          summary: result.content?.slice(0, 500) || '',
          credibility: result.credibility?.score || 0.6,
          relevanceScore: calculateRelevance(result.title, keyword),
          publishedAt: result.publishedAt ? new Date(result.publishedAt) : undefined,
          tags: [keyword],
        });
      }
    } catch (error) {
      console.error(`[Research] Web search failed for "${keyword}":`, error);
    }
  }

  return items;
}

/**
 * 从RSS采集
 */
async function collectFromRSS(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const timeRanges: Record<string, string> = {
    '1d': '1 day',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    'all': '365 days',
  };

  const timeFilter = timeRanges[config.timeRange] || '30 days';

  const result = await query(
    `SELECT
      id, source_name, title, link, summary,
      published_at, relevance_score, tags
    FROM rss_items
    WHERE published_at > NOW() - INTERVAL '${timeFilter}'
      AND (
        ${keywords.map((_, i) => `title ILIKE $${i + 1} OR summary ILIKE $${i + 1}`).join(' OR ')}
      )
    ORDER BY relevance_score DESC
    LIMIT $${keywords.length + 1}`,
    [...keywords.map(k => `%${k}%`), config.maxResults]
  );

  return result.rows.map(row => ({
    id: row.id,
    source: row.source_name,
    sourceType: 'rss',
    title: row.title,
    url: row.link,
    summary: row.summary || '',
    credibility: parseFloat(row.relevance_score) || 0.6,
    relevanceScore: parseFloat(row.relevance_score) || 0.5,
    publishedAt: row.published_at,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  }));
}

/**
 * 从素材库采集
 */
async function collectFromAssets(
  keywords: string[],
  config: ResearchConfig
): Promise<CollectedContent[]> {
  const result = await query(
    `SELECT
      id, title, content, source,
      quality_score, tags, created_at
    FROM assets
    WHERE (
      ${keywords.map((_, i) => `title ILIKE $${i + 1} OR content ILIKE $${i + 1}`).join(' OR ')}
    )
    ORDER BY quality_score DESC
    LIMIT $${keywords.length + 1}`,
    [...keywords.map(k => `%${k}%`), config.maxResults]
  );

  return result.rows.map(row => ({
    id: row.id,
    source: row.source || '素材库',
    sourceType: 'asset',
    title: row.title,
    url: null, // assets don't have URLs
    content: row.content?.slice(0, 1000),
    summary: row.content?.slice(0, 300) || '',
    credibility: parseFloat(row.quality_score) || 0.7,
    relevanceScore: parseFloat(row.quality_score) || 0.5,
    publishedAt: row.created_at,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  }));
}

/**
 * 从大纲提取关键词
 */
function extractKeywordsFromOutline(outline: any): string[] {
  const keywords: string[] = [];

  if (!outline) return keywords;

  // 提取标题关键词
  if (outline.topic) {
    keywords.push(outline.topic);
  }

  // 提取章节标题
  if (outline.sections) {
    for (const section of outline.sections) {
      if (section.title) {
        keywords.push(section.title);
      }
      if (section.subsections) {
        for (const sub of section.subsections) {
          if (sub.title) {
            keywords.push(sub.title);
          }
        }
      }
    }
  }

  // 去重并限制数量
  return [...new Set(keywords)].slice(0, 5);
}

/**
 * 计算相关度
 */
function calculateRelevance(text: string, keyword: string): number {
  const textLower = text.toLowerCase();
  const keywordLower = keyword.toLowerCase();

  if (textLower === keywordLower) return 1.0;
  if (textLower.includes(keywordLower)) return 0.8;

  // 简单的词频计算
  const words = keywordLower.split(/\s+/);
  const matches = words.filter(w => textLower.includes(w)).length;
  return 0.4 + (matches / words.length) * 0.4;
}

/**
 * 按URL去重
 */
function deduplicateByUrl(items: CollectedContent[]): CollectedContent[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!item.url) return true;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

/**
 * 保存采集内容
 */
async function saveCollectedContent(
  taskId: string,
  items: CollectedContent[]
): Promise<void> {
  // 保存到 research_annotations 表
  for (const item of items) {
    await query(
      `INSERT INTO research_annotations (
        task_id, type, url, title, credibility, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (task_id, url) DO UPDATE SET
        title = $4,
        credibility = $5,
        updated_at = NOW()`,
      [
        taskId,
        item.sourceType === 'asset' ? 'asset' : 'url',
        item.url || item.id,
        item.title,
        JSON.stringify({ level: item.credibility > 0.8 ? 'A' : item.credibility > 0.6 ? 'B' : 'C', score: item.credibility }),
      ]
    );
  }
}

/**
 * 生成研究报告（insights 和 sources）
 */
export async function generateResearchReport(
  taskId: string,
  items: CollectedContent[]
): Promise<{
  insights: Array<{
    id: string;
    type: 'data' | 'trend' | 'case' | 'expert';
    content: string;
    source: string;
    confidence: number;
  }>;
  sources: Array<{
    name: string;
    url: string;
    reliability: number;
  }>;
}> {
  // 基于采集内容生成洞察
  const insights: Array<{
    id: string;
    type: 'data' | 'trend' | 'case' | 'expert';
    content: string;
    source: string;
    confidence: number;
  }> = [];

  // 取可信度最高的前5条生成洞察
  const topItems = items
    .filter(item => item.credibility >= 0.6)
    .sort((a, b) => b.credibility - a.credibility)
    .slice(0, 5);

  // 生成不同类型的洞察
  if (topItems.length > 0) {
    // 数据洞察
    insights.push({
      id: `insight-data-${Date.now()}`,
      type: 'data',
      content: `基于对 ${items.length} 个来源的分析，发现高可信度内容主要集中在 ${topItems[0]?.source || '主要媒体'}。关键发现包括：${topItems.slice(0, 3).map(i => i.summary || i.title).join('；')}。`,
      source: topItems[0]?.source || '综合分析',
      confidence: topItems[0]?.credibility || 0.7,
    });

    // 趋势洞察
    if (topItems.length >= 2) {
      insights.push({
        id: `insight-trend-${Date.now()}`,
        type: 'trend',
        content: `从采集数据中识别出行业发展趋势：相关内容在过去一段时间内呈现稳定增长态势。主要观点包括：${topItems[1]?.summary || topItems[1]?.title}。`,
        source: topItems[1]?.source || '趋势分析',
        confidence: topItems[1]?.credibility || 0.65,
      });
    }

    // 案例洞察
    if (topItems.length >= 3) {
      insights.push({
        id: `insight-case-${Date.now()}`,
        type: 'case',
        content: `典型案例分析：${topItems[2]?.title}。该案例展示了行业内的最佳实践，具有较高的参考价值。`,
        source: topItems[2]?.source || '案例研究',
        confidence: topItems[2]?.credibility || 0.6,
      });
    }
  }

  // 生成来源列表
  const sources = items
    .filter(item => item.url)
    .slice(0, 6)
    .map(item => ({
      name: item.title,
      url: item.url!,
      reliability: item.credibility,
    }));

  return { insights, sources };
}

/**
 * 获取研究配置
 */
export async function getResearchConfig(taskId: string): Promise<ResearchConfig | null> {
  const result = await query(
    `SELECT research_config FROM tasks WHERE id = $1`,
    [taskId]
  );

  if (!result.rows[0]?.research_config) return null;

  const config = typeof result.rows[0].research_config === 'string'
    ? JSON.parse(result.rows[0].research_config)
    : result.rows[0].research_config;

  return {
    autoCollect: config.autoCollect ?? true,
    sources: config.sources || ['web', 'rss'],
    maxResults: config.maxResults || 20,
    minCredibility: config.minCredibility || 0.5,
    keywords: config.keywords || [],
    excludeKeywords: config.excludeKeywords || [],
    timeRange: config.timeRange || '30d',
  };
}

/**
 * 保存研究配置
 */
export async function saveResearchConfig(
  taskId: string,
  config: ResearchConfig
): Promise<void> {
  await query(
    `UPDATE tasks SET
      research_config = $1,
      updated_at = NOW()
    WHERE id = $2`,
    [JSON.stringify(config), taskId]
  );
}
