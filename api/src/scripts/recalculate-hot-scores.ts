#!/usr/bin/env node
/**
 * 重新计算热点分数脚本
 * 
 * 使用新的热度算法，批量更新历史数据
 * 时间衰减基于文章的 published_at 重新计算
 */

import { query } from '../db/connection.js';

interface RSSItem {
  id: string;
  title: string;
  source_name: string;
  summary: string;
  content: string;
  published_at: Date;
  relevance_score: number;
  tags: string[];
}

/**
 * 重新计算热度分数
 * 
 * 时间衰减基于 published_at 重新计算：
 * - 现在时间是 Date.now()
 * - 发布时间是 published_at
 * - hoursAgo = (now - published_at) / (1000 * 60 * 60)
 * - timeScore = 100 * exp(-hoursAgo / 24)
 * 
 * 例如：
 * - 刚发布（0小时）: timeScore = 100
 * - 24小时前: timeScore = 100 * exp(-1) ≈ 37
 * - 48小时前: timeScore = 100 * exp(-2) ≈ 13
 * - 72小时前: timeScore = 100 * exp(-3) ≈ 5
 */
async function recalculateHotScores() {
  console.log('🔄 开始重新计算热度分数...\n');

  try {
    // 1. 获取所有 RSS 文章
    const itemsResult = await query(
      `SELECT id, title, source_name, summary, content, published_at, 
              relevance_score, tags
       FROM rss_items 
       WHERE is_deleted = false OR is_deleted IS NULL
       ORDER BY published_at DESC`
    );

    const items: RSSItem[] = itemsResult.rows.map(row => ({
      ...row,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      relevance_score: parseFloat(row.relevance_score || 0),
    }));

    console.log(`📊 共找到 ${items.length} 篇文章需要重新计算\n`);

    // 2. 获取来源权威性配置
    const authorityResult = await query(`SELECT source_name, authority_score FROM source_authority`);
    const authorityMap = new Map(authorityResult.rows.map(r => [r.source_name, r.authority_score]));

    // 3. 获取关键词统计
    const keywordResult = await query(`SELECT keyword, count FROM keyword_stats`);
    const keywordMap = new Map(keywordResult.rows.map(r => [r.keyword, r.count]));

    // 4. 批量重新计算
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      try {
        // 使用新的算法计算热度
        const hotScoreResult = calculateHotScore(item, authorityMap, keywordMap);
        
        // 更新 rss_items 表
        await query(
          `UPDATE rss_items 
           SET hot_score = $1, trend = $2
           WHERE id = $3`,
          [hotScoreResult.score, hotScoreResult.trend, item.id]
        );

        // 同时更新 hot_topics 表（如果存在）
        await query(
          `UPDATE hot_topics 
           SET hot_score = $1, trend = $2, updated_at = NOW()
           WHERE id = $3`,
          [hotScoreResult.score, hotScoreResult.trend, `rss-${item.id}`]
        );

        updatedCount++;
        
        // 每50条打印一次进度
        if (updatedCount % 50 === 0) {
          console.log(`  ✓ 已处理 ${updatedCount}/${items.length} 篇`);
        }
      } catch (error) {
        console.error(`  ✗ 处理失败: ${item.title?.substring(0, 30)}...`, error);
        skippedCount++;
      }
    }

    console.log(`\n✅ 完成！`);
    console.log(`   成功更新: ${updatedCount} 篇`);
    console.log(`   跳过失败: ${skippedCount} 篇`);

    // 5. 打印统计信息
    await printStats();

  } catch (error) {
    console.error('❌ 重新计算失败:', error);
    process.exit(1);
  }
}

/**
 * 计算热度分数（基于当前时间重新计算时间衰减）
 */
function calculateHotScore(
  item: RSSItem,
  authorityMap: Map<string, number>,
  keywordMap: Map<string, number>
): { score: number; trend: 'up' | 'stable' | 'down' } {
  const now = Date.now();
  const publishedAt = new Date(item.published_at).getTime();
  
  // 1. 时间衰减分数 (40%) - 基于当前时间重新计算！
  const hoursAgo = (now - publishedAt) / (1000 * 60 * 60);
  const timeScore = 100 * Math.exp(-hoursAgo / 24); // 24小时半衰期

  // 2. 内容相关度分数 (25%)
  const relevanceScore = (item.relevance_score || 0.3) * 100;

  // 3. 来源权威性分数 (15%)
  const sourceAuthority = (authorityMap.get(item.source_name) || 0.5) * 100;

  // 4. 关键词热度分数 (20%)
  const keywordScore = calculateKeywordScore(item.tags, item.title, keywordMap);

  // 综合分数
  const finalScore = Math.round(
    timeScore * 0.40 +
    relevanceScore * 0.25 +
    keywordScore * 0.20 +
    sourceAuthority * 0.15
  );

  const clampedScore = Math.max(0, Math.min(100, finalScore));

  // 计算趋势
  const trend = calculateTrend(clampedScore, hoursAgo);

  return { score: clampedScore, trend };
}

/**
 * 计算关键词热度分数
 */
function calculateKeywordScore(
  tags: string[],
  title: string,
  keywordMap: Map<string, number>
): number {
  if (!tags || tags.length === 0) return 30;

  let totalScore = 0;
  let matchedCount = 0;

  for (const tag of tags) {
    const tagLower = tag.toLowerCase();
    const count = keywordMap.get(tagLower) || 1;
    
    // 标题中的关键词权重更高
    const isInTitle = title.toLowerCase().includes(tagLower);
    const weight = isInTitle ? 1.5 : 1.0;
    
    // 频率分数 (对数防止大数主导)
    const frequencyScore = Math.min(100, 20 * Math.log10(count + 1));
    totalScore += frequencyScore * weight;
    matchedCount++;
  }

  const avgScore = matchedCount > 0 ? totalScore / matchedCount : 0;
  const matchBonus = Math.min(20, matchedCount * 2);

  return Math.min(100, avgScore + matchBonus);
}

/**
 * 计算趋势
 */
function calculateTrend(score: number, hoursAgo: number): 'up' | 'stable' | 'down' {
  if (hoursAgo < 6 && score > 70) return 'up';
  if (score > 80) return 'up';
  if (score > 40) return 'stable';
  return 'down';
}

/**
 * 打印统计信息
 */
async function printStats() {
  console.log('\n📈 热度分布统计:');
  
  const stats = await query(`
    SELECT 
      CASE 
        WHEN hot_score >= 80 THEN '80-100 (高热)'
        WHEN hot_score >= 60 THEN '60-79 (中热)'
        WHEN hot_score >= 40 THEN '40-59 (低热)'
        ELSE '0-39 (冷却)'
      END as range,
      COUNT(*) as count,
      ROUND(AVG(hot_score), 1) as avg_score
    FROM rss_items
    WHERE is_deleted = false OR is_deleted IS NULL
    GROUP BY 
      CASE 
        WHEN hot_score >= 80 THEN '80-100 (高热)'
        WHEN hot_score >= 60 THEN '60-79 (中热)'
        WHEN hot_score >= 40 THEN '40-59 (低热)'
        ELSE '0-39 (冷却)'
      END
    ORDER BY MIN(hot_score) DESC
  `);

  for (const row of stats.rows) {
    console.log(`   ${row.range}: ${row.count} 篇 (平均 ${row.avg_score} 分)`);
  }

  // 打印来源统计
  console.log('\n📰 来源平均热度 TOP 5:');
  const sourceStats = await query(`
    SELECT 
      source_name,
      ROUND(AVG(hot_score), 1) as avg_score,
      COUNT(*) as count
    FROM rss_items
    WHERE is_deleted = false OR is_deleted IS NULL
    GROUP BY source_name
    ORDER BY AVG(hot_score) DESC
    LIMIT 5
  `);

  for (const row of sourceStats.rows) {
    console.log(`   ${row.source_name}: ${row.avg_score} 分 (${row.count} 篇)`);
  }
}

// 运行
recalculateHotScores().then(() => {
  console.log('\n🏁 脚本执行完毕');
  process.exit(0);
}).catch(err => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
