// v3.4 RSS爬虫 - 热点追踪
import Parser from 'rss-parser';
import { query } from '../db/connection.js';
import { hotTopicService } from './hotTopicService.js';

const rssParser = new Parser();

interface RSSSource {
  id: string;
  name: string;
  url: string;
  category: string;
}

// 抓取所有RSS源
export async function crawlRSSFeeds(): Promise<void> {
  console.log('[RSSCrawler] Starting RSS crawl...');

  try {
    // 获取所有启用的RSS源
    const result = await query(
      `SELECT * FROM rss_sources WHERE is_active = true`
    );
    const sources: RSSSource[] = result.rows;

    for (const source of sources) {
      try {
        await crawlSingleSource(source);
      } catch (error) {
        console.error(`[RSSCrawler] Failed to crawl ${source.name}:`, error);
      }
    }

    // 更新最后抓取时间
    await query(
      `UPDATE rss_sources SET last_crawled_at = NOW() WHERE is_active = true`
    );

    console.log('[RSSCrawler] RSS crawl completed');
  } catch (error) {
    console.error('[RSSCrawler] RSS crawl failed:', error);
  }
}

// 抓取单个RSS源
async function crawlSingleSource(source: RSSSource): Promise<void> {
  console.log(`[RSSCrawler] Crawling ${source.name}...`);

  const feed = await rssParser.parseURL(source.url);

  for (const item of feed.items.slice(0, 10)) { // 只处理最新10条
    if (!item.title || !item.link) continue;

    // 计算热度分数（基于发布时间）
    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
    const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    const hotScore = Math.max(0, 100 - hoursAgo * 2); // 每小时衰减2分

    // 判断趋势
    const trend = hotScore > 80 ? 'up' : hotScore > 50 ? 'stable' : 'down';

    // 分析情绪（简单规则）
    const sentiment = analyzeSentiment(item.title + ' ' + (item.contentSnippet || ''));

    // 保存热点
    await hotTopicService.upsertHotTopic({
      title: item.title,
      source: source.name,
      sourceUrl: item.link,
      hotScore: Math.round(hotScore),
      trend,
      sentiment,
      publishedAt
    });
  }

  console.log(`[RSSCrawler] Crawled ${feed.items.length} items from ${source.name}`);
}

// 简单情绪分析
function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positiveWords = ['增长', '上涨', '突破', '利好', '强劲', '创新高', '成功', '提升'];
  const negativeWords = ['下降', '下跌', '跌破', '利空', '疲软', '创新低', '失败', '下滑'];

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

// 启动定时抓取
export function startRSSCron(intervalMinutes: number = 30): void {
  console.log(`[RSSCrawler] Starting RSS cron job, interval: ${intervalMinutes} minutes`);

  // 立即执行一次
  crawlRSSFeeds();

  // 定时执行
  setInterval(() => {
    crawlRSSFeeds();
  }, intervalMinutes * 60 * 1000);
}
