// 热度分数定时更新服务
// 定期重新计算所有文章的热度分数（实现时间衰减）

import cron from 'node-cron';
import { query } from '../db/connection.js';

// 调度器状态
let isRunning = false;
let task: cron.ScheduledTask | null = null;

/**
 * 计算热度分数（基于当前时间）
 */
function calculateHotScore(
  publishedAt: Date,
  relevanceScore: number,
  sourceAuthority: number,
  keywordScore: number
): { score: number; trend: 'up' | 'stable' | 'down' } {
  const now = Date.now();
  const pubTime = new Date(publishedAt).getTime();
  
  // 1. 时间衰减分数 (40%) - 指数衰减，24小时半衰期
  const hoursAgo = Math.max(0, (now - pubTime) / (1000 * 60 * 60));
  const timeScore = 100 * Math.exp(-hoursAgo / 24);

  // 2. 内容相关度分数 (25%)
  const relevanceScoreNorm = (relevanceScore || 0.3) * 100;

  // 3. 来源权威性分数 (15%)
  const sourceAuthScore = (sourceAuthority || 0.5) * 100;

  // 4. 关键词热度分数 (20%)
  const kwScore = keywordScore || 30;

  // 综合分数
  const finalScore = Math.round(
    timeScore * 0.40 +
    relevanceScoreNorm * 0.25 +
    kwScore * 0.20 +
    sourceAuthScore * 0.15
  );

  const clampedScore = Math.max(0, Math.min(100, finalScore));

  // 计算趋势
  let trend: 'up' | 'stable' | 'down' = 'stable';
  if (hoursAgo < 6 && clampedScore > 70) {
    trend = 'up';
  } else if (clampedScore > 80) {
    trend = 'up';
  } else if (clampedScore > 40) {
    trend = 'stable';
  } else {
    trend = 'down';
  }

  return { score: clampedScore, trend };
}

/**
 * 批量更新所有文章的热度
 */
async function updateAllHotScores(): Promise<void> {
  if (isRunning) {
    console.log('[HotScoreScheduler] 上一次更新尚未完成，跳过本次');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  
  try {
    console.log('[HotScoreScheduler] 开始更新热度分数...');

    // 获取来源权威性配置
    const authorityResult = await query(`SELECT source_name, authority_score FROM source_authority`);
    const authorityMap = new Map(authorityResult.rows.map(r => [r.source_name, r.authority_score]));

    // 获取所有 RSS 文章
    const itemsResult = await query(
      `SELECT id, published_at, relevance_score, source_name, tags
       FROM rss_items 
       WHERE is_deleted = false OR is_deleted IS NULL`
    );

    const items = itemsResult.rows;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      try {
        const sourceAuthority = authorityMap.get(item.source_name) || 0.5;
        
        // 计算关键词分数（简化版）
        const tags = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags;
        const keywordScore = tags && tags.length > 0 ? Math.min(100, 30 + tags.length * 10) : 30;

        // 重新计算热度
        const { score, trend } = calculateHotScore(
          item.published_at,
          parseFloat(item.relevance_score || 0.3),
          sourceAuthority,
          keywordScore
        );

        // 更新数据库
        await query(
          `UPDATE rss_items SET hot_score = $1, trend = $2 WHERE id = $3`,
          [score, trend, item.id]
        );

        // 同时更新 hot_topics
        await query(
          `UPDATE hot_topics SET hot_score = $1, trend = $2, updated_at = NOW() WHERE id = $3`,
          [score, trend, `rss-${item.id}`]
        );

        updatedCount++;
      } catch (error) {
        skippedCount++;
        console.warn(`[HotScoreScheduler] 更新失败 ${item.id}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[HotScoreScheduler] 更新完成: ${updatedCount} 成功, ${skippedCount} 失败, 耗时 ${duration}ms`);

  } catch (error) {
    console.error('[HotScoreScheduler] 更新失败:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * 启动定时任务
 * 
 * 默认每 30 分钟更新一次
 * 可以调整为：
 * - 每10分钟：'0-59/10 * * * *'（高频）
 * - 每30分钟：'0-59/30 * * * *'（默认）
 * - 每小时：'0 * * * *'（低频）
 */
export function startHotScoreScheduler(cronExpression: string = '*/30 * * * *'): void {
  if (task) {
    console.log('[HotScoreScheduler] 调度器已在运行');
    return;
  }

  console.log(`[HotScoreScheduler] 启动定时任务，表达式: ${cronExpression}`);
  
  // 立即执行一次
  updateAllHotScores();
  
  // 设置定时任务
  task = cron.schedule(cronExpression, () => {
    console.log('[HotScoreScheduler] 定时触发更新...');
    updateAllHotScores();
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai'
  });

  console.log('[HotScoreScheduler] 定时任务已启动');
}

/**
 * 停止定时任务
 */
export function stopHotScoreScheduler(): void {
  if (task) {
    task.stop();
    task = null;
    console.log('[HotScoreScheduler] 定时任务已停止');
  }
}

/**
 * 手动触发更新
 */
export async function triggerHotScoreUpdate(): Promise<void> {
  await updateAllHotScores();
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus(): { isRunning: boolean; hasTask: boolean } {
  return {
    isRunning,
    hasTask: !!task
  };
}
