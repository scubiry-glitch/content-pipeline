// 数据审核服务 - Data Review Service
// FR-011 ~ FR-014: 数据收集结果展示与审核

import { query } from '../db/connection.js';
import { evaluateSource } from './sourceCredibility.js';

export interface DataItem {
  id: string;
  type: 'url' | 'asset' | 'extracted';
  title: string;
  content?: string;
  url?: string;
  source: string;
  credibility: {
    level: string;
    score: number;
  };
  publishedAt?: string;
  extractedAt: string;
  isSelected: boolean;
  isKeyData: boolean;
  relevance: number;
  citationCount: number;
}

export interface DataReviewResult {
  items: DataItem[];
  stats: {
    total: number;
    selected: number;
    byLevel: Record<string, number>;
    keyDataComplete: number;
    keyDataMissing: number;
  };
  keyDataRequirements: {
    requirement: string;
    found: boolean;
    matchingItems: string[];
  }[];
}

/**
 * 获取任务的数据审核列表
 */
export async function getDataReviewList(taskId: string): Promise<DataReviewResult> {
  // 获取所有数据标注
  const annotationsResult = await query(
    `SELECT * FROM research_annotations WHERE task_id = $1 ORDER BY created_at DESC`,
    [taskId]
  );

  // 获取任务的大纲（用于识别关键数据需求）
  const taskResult = await query(
    `SELECT outline FROM tasks WHERE id = $1`,
    [taskId]
  );
  const outline = taskResult.rows[0]?.outline || {};

  // 转换为数据项
  const items: DataItem[] = annotationsResult.rows.map(row => {
    const credibility = row.credibility || { level: 'C', score: 0.6 };
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      url: row.url,
      source: row.type === 'url' ? new URL(row.url || 'http://example.com').hostname : '素材库',
      credibility: {
        level: credibility.level,
        score: credibility.score,
      },
      extractedAt: row.created_at,
      isSelected: true, // 默认选中
      isKeyData: false, // 需要进一步分析
      relevance: 0.8,
      citationCount: 0,
    };
  });

  // 分析关键数据需求
  const keyDataRequirements = analyzeKeyDataRequirements(outline, items);

  // 统计
  const stats = {
    total: items.length,
    selected: items.filter(i => i.isSelected).length,
    byLevel: {
      'A': items.filter(i => i.credibility.level === 'A').length,
      'B': items.filter(i => i.credibility.level === 'B').length,
      'C': items.filter(i => i.credibility.level === 'C').length,
      'D': items.filter(i => i.credibility.level === 'D').length,
    },
    keyDataComplete: keyDataRequirements.filter(r => r.found).length,
    keyDataMissing: keyDataRequirements.filter(r => !r.found).length,
  };

  return {
    items,
    stats,
    keyDataRequirements,
  };
}

/**
 * 更新数据项选择状态
 */
export async function updateDataSelection(
  taskId: string,
  itemId: string,
  isSelected: boolean
): Promise<void> {
  await query(
    `UPDATE research_annotations
     SET is_selected = $1, updated_at = NOW()
     WHERE id = $2 AND task_id = $3`,
    [isSelected, itemId, taskId]
  );
}

/**
 * 批量更新数据选择
 */
export async function batchUpdateSelection(
  taskId: string,
  selections: { itemId: string; isSelected: boolean }[]
): Promise<void> {
  for (const { itemId, isSelected } of selections) {
    await updateDataSelection(taskId, itemId, isSelected);
  }
}

/**
 * 分析关键数据需求
 * 基于大纲内容识别需要的关键数据类型
 */
function analyzeKeyDataRequirements(
  outline: any,
  items: DataItem[]
): { requirement: string; found: boolean; matchingItems: string[] }[] {
  const requirements: { requirement: string; keywords: string[] }[] = [
    { requirement: '政策文件', keywords: ['政策', '法规', '通知', '意见', '办法'] },
    { requirement: '市场数据', keywords: ['市场规模', '增长率', '份额', '销量'] },
    { requirement: '财务数据', keywords: ['营收', '利润', '财报', '业绩'] },
    { requirement: '企业信息', keywords: ['公司', '企业', '龙头', '厂商'] },
    { requirement: '行业趋势', keywords: ['趋势', '预测', '展望', '前景'] },
  ];

  const sections = outline.sections || [];
  const outlineText = JSON.stringify(sections).toLowerCase();

  return requirements.map(req => {
    // 检查大纲是否需要此类型数据
    const isRequired = req.keywords.some(k => outlineText.includes(k));

    if (!isRequired) {
      return { requirement: req.requirement, found: true, matchingItems: [] };
    }

    // 检查是否有匹配的数据
    const matchingItems = items
      .filter(item =>
        req.keywords.some(k =>
          item.title.toLowerCase().includes(k) ||
          (item.content && item.content.toLowerCase().includes(k))
        )
      )
      .map(item => item.id);

    return {
      requirement: req.requirement,
      found: matchingItems.length > 0,
      matchingItems,
    };
  });
}

/**
 * 过滤低可信度数据
 */
export function filterLowCredibility(
  items: DataItem[],
  minLevel: string = 'C'
): DataItem[] {
  const levelOrder = ['D', 'C', 'B', 'A'];
  const minIndex = levelOrder.indexOf(minLevel);

  return items.filter(item => {
    const itemIndex = levelOrder.indexOf(item.credibility.level);
    return itemIndex >= minIndex;
  });
}

/**
 * 获取数据审核统计
 */
export async function getDataReviewStats(taskId: string): Promise<{
  total: number;
  selected: number;
  byLevel: Record<string, number>;
  avgCredibility: number;
}> {
  const result = await query(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN is_selected = true THEN 1 END) as selected,
      AVG((credibility->>'score')::float) as avg_credibility
     FROM research_annotations
     WHERE task_id = $1`,
    [taskId]
  );

  const byLevelResult = await query(
    `SELECT
      credibility->>'level' as level,
      COUNT(*) as count
     FROM research_annotations
     WHERE task_id = $1
     GROUP BY credibility->>'level'`,
    [taskId]
  );

  const byLevel: Record<string, number> = {};
  byLevelResult.rows.forEach(row => {
    byLevel[row.level] = parseInt(row.count);
  });

  return {
    total: parseInt(result.rows[0]?.total || '0'),
    selected: parseInt(result.rows[0]?.selected || '0'),
    byLevel,
    avgCredibility: parseFloat(result.rows[0]?.avg_credibility || '0'),
  };
}
