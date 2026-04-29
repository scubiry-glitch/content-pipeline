// 智能推荐服务 - Smart Recommendation Service
// FR-028 ~ FR-030: 基于历史数据的智能推荐

import { query } from '../db/connection.js';

export interface RecommendationRequest {
  type: 'topic' | 'material' | 'expert';
  context?: string;
  userId?: string;
  limit?: number;
  workspaceId?: string;
}

export interface RecommendationResult {
  id: string;
  type: string;
  title: string;
  description?: string;
  relevanceScore: number;
  reason: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface TopicRecommendation extends RecommendationResult {
  type: 'topic';
  noveltyScore: number;
  dataAvailability: number;
  relatedTopics: string[];
}

export interface MaterialRecommendation extends RecommendationResult {
  type: 'material';
  sourceType: 'asset' | 'rss' | 'annotation';
  sourceUrl?: string;
  citationCount: number;
  qualityScore: number;
}

export interface ExpertRecommendation extends RecommendationResult {
  type: 'expert';
  expertise: string[];
  matchScore: number;
  pastReviews: number;
  avgRating: number;
}

/**
 * 获取智能推荐
 */
export async function getRecommendations(
  request: RecommendationRequest
): Promise<RecommendationResult[]> {
  const { type, context, limit = 5, workspaceId } = request;

  switch (type) {
    case 'topic':
      return recommendTopics(context, limit, workspaceId);
    case 'material':
      return recommendMaterials(context, limit, workspaceId);
    case 'expert':
      // 专家推荐基于 blue_team_reviews 历史评审统计 (无 workspace_id 列, 全局视图)
      return recommendExperts(context, limit);
    default:
      throw new Error(`Unknown recommendation type: ${type}`);
  }
}

/**
 * 推荐选题 (FR-028)
 * 基于：历史热门选题 + RSS 热点 + 知识库空白
 */
async function recommendTopics(
  context?: string,
  limit: number = 5,
  workspaceId?: string,
): Promise<TopicRecommendation[]> {
  const recommendations: TopicRecommendation[] = [];

  // 1. 基于 RSS 热点推荐 (按 ws 过滤)
  const rssWsClause = workspaceId ? ' AND workspace_id = $2' : '';
  const rssParams = workspaceId ? [limit * 2, workspaceId] : [limit * 2];
  const rssHotTopics = await query(
    `SELECT
      title,
      tags,
      relevance_score,
      COUNT(*) as mention_count
    FROM rss_items
    WHERE published_at > NOW() - INTERVAL '7 days'
      AND relevance_score >= 0.6${rssWsClause}
    GROUP BY title, tags, relevance_score
    ORDER BY mention_count DESC, relevance_score DESC
    LIMIT $1`,
    rssParams
  );

  for (const row of rssHotTopics.rows) {
    const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
    recommendations.push({
      id: `rss-${Buffer.from(row.title).toString('base64').slice(0, 16)}`,
      type: 'topic',
      title: extractTopicTitle(row.title),
      description: `基于 ${row.mention_count} 篇 RSS 文章的热点话题`,
      relevanceScore: parseFloat(row.relevance_score),
      noveltyScore: calculateNovelty(tags),
      dataAvailability: 0.7 + Math.random() * 0.3,
      relatedTopics: tags.slice(0, 3),
      reason: '近期 RSS 热点',
      tags,
    });
  }

  // 2. 基于历史任务主题推荐延伸话题 (按 ws 过滤)
  if (context) {
    const taskWsClause = workspaceId ? ' AND workspace_id = $3' : '';
    const taskParams = workspaceId ? [context, limit, workspaceId] : [context, limit];
    const relatedTasks = await query(
      `SELECT
        topic,
        tags,
        similarity(topic, $1) as sim
      FROM tasks
      WHERE topic % $1${taskWsClause}
      ORDER BY similarity(topic, $1) DESC
      LIMIT $2`,
      taskParams
    );

    for (const row of relatedTasks.rows) {
      const tags = row.tags || [];
      recommendations.push({
        id: `history-${Buffer.from(row.topic).toString('base64').slice(0, 16)}`,
        type: 'topic',
        title: generateRelatedTopic(row.topic, context),
        description: `基于历史主题 "${row.topic}" 的延伸`,
        relevanceScore: parseFloat(row.sim) * 0.8 + 0.2,
        noveltyScore: 0.6,
        dataAvailability: 0.75,
        relatedTopics: tags.slice(0, 3),
        reason: '历史任务延伸',
        tags,
      });
    }
  }

  // 3. 基于知识库空白推荐 (按 ws 过滤)
  const knowledgeGaps = await identifyKnowledgeGaps(workspaceId);
  for (const gap of knowledgeGaps.slice(0, limit)) {
    recommendations.push({
      id: `gap-${Buffer.from(gap).toString('base64').slice(0, 16)}`,
      type: 'topic',
      title: gap,
      description: '知识库覆盖空白领域',
      relevanceScore: 0.6,
      noveltyScore: 0.9,
      dataAvailability: 0.5,
      relatedTopics: [],
      reason: '知识库空白',
    });
  }

  // 去重并按相关度排序
  const unique = deduplicateRecommendations(recommendations);
  return unique
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

/**
 * 推荐素材 (FR-029)
 * 基于：内容相似度 + 引用历史 + 质量评分
 */
async function recommendMaterials(
  context?: string,
  limit: number = 5,
  workspaceId?: string,
): Promise<MaterialRecommendation[]> {
  const recommendations: MaterialRecommendation[] = [];

  if (!context) {
    // 返回高质量素材 (按 ws 过滤)
    const topWsClause = workspaceId ? ' WHERE workspace_id = $2' : '';
    const topParams = workspaceId ? [limit, workspaceId] : [limit];
    const topMaterials = await query(
      `SELECT
        id, title, content_type, source, source_url,
        tags, quality_score, citation_count
      FROM assets${topWsClause}
      ORDER BY quality_score DESC, citation_count DESC
      LIMIT $1`,
      topParams
    );

    return topMaterials.rows.map(row => ({
      id: row.id,
      type: 'material',
      title: row.title,
      relevanceScore: parseFloat(row.quality_score),
      reason: '高质量素材推荐',
      sourceType: 'asset',
      sourceUrl: row.source_url,
      citationCount: parseInt(row.citation_count) || 0,
      qualityScore: parseFloat(row.quality_score),
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    }));
  }

  // 基于上下文搜索相关素材 (按 ws 过滤)
  const relWsClause = workspaceId ? ' AND workspace_id = $3' : '';
  const relParams = workspaceId ? [context, limit * 2, workspaceId] : [context, limit * 2];
  const relatedAssets = await query(
    `SELECT
      id, title, content, content_type, source, source_url,
      tags, quality_score, citation_count,
      similarity(title, $1) as title_sim
    FROM assets
    WHERE (title % $1 OR content % $1)${relWsClause}
    ORDER BY GREATEST(similarity(title, $1), similarity(content, $1)) DESC
    LIMIT $2`,
    relParams
  );

  for (const row of relatedAssets.rows) {
    const similarity = parseFloat(row.title_sim) || 0.5;
    recommendations.push({
      id: row.id,
      type: 'material',
      title: row.title,
      relevanceScore: similarity * 0.6 + parseFloat(row.quality_score) * 0.4,
      reason: `与 "${context}" 内容相关`,
      sourceType: 'asset',
      sourceUrl: row.source_url,
      citationCount: parseInt(row.citation_count) || 0,
      qualityScore: parseFloat(row.quality_score),
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    });
  }

  // 基于向量相似度搜索（如果启用 pgvector） (按 ws 过滤)
  try {
    const vectorResults = await searchByVectorSimilarity(context, limit, workspaceId);
    recommendations.push(...vectorResults);
  } catch (error) {
    console.warn('[Recommendation] Vector search failed:', error);
  }

  return deduplicateRecommendations(recommendations)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

/**
 * 推荐专家 (FR-030)
 * 基于：专业领域匹配 + 历史评审表现
 */
async function recommendExperts(
  context?: string,
  limit: number = 4
): Promise<ExpertRecommendation[]> {
  const recommendations: ExpertRecommendation[] = [];

  // 从 blue_team_reviews 统计专家表现
  const expertStats = await query(
    `SELECT
      expert_role,
      COUNT(*) as review_count,
      AVG(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as acceptance_rate
    FROM blue_team_reviews
    GROUP BY expert_role
    ORDER BY review_count DESC`
  );

  const roleMap: Record<string, { name: string; expertise: string[] }> = {
    'fact_checker': { name: '事实核查员', expertise: ['数据验证', '来源核实', '统计检查'] },
    'logic_checker': { name: '逻辑检察官', expertise: ['论证分析', '逻辑检查', '因果推理'] },
    'domain_expert': { name: '行业专家', expertise: ['行业洞察', '趋势判断', '专业术语'] },
    'reader_rep': { name: '读者代表', expertise: ['可读性', '表达优化', '结构建议'] },
  };

  for (const row of expertStats.rows) {
    const role = roleMap[row.expert_role];
    if (!role) continue;

    recommendations.push({
      id: row.expert_role,
      type: 'expert',
      title: role.name,
      description: `已参与 ${row.review_count} 次评审，建议采纳率 ${(parseFloat(row.acceptance_rate) * 100).toFixed(1)}%`,
      relevanceScore: parseFloat(row.acceptance_rate) * 0.8 + 0.2,
      reason: '基于历史评审表现',
      expertise: role.expertise,
      matchScore: context ? calculateExpertMatch(role.expertise, context) : 0.7,
      pastReviews: parseInt(row.review_count),
      avgRating: parseFloat(row.acceptance_rate) * 5,
    });
  }

  // 补充默认专家
  for (const [roleId, role] of Object.entries(roleMap)) {
    if (!recommendations.find(r => r.id === roleId)) {
      recommendations.push({
        id: roleId,
        type: 'expert',
        title: role.name,
        description: '标准评审专家',
        relevanceScore: 0.7,
        reason: '默认推荐',
        expertise: role.expertise,
        matchScore: 0.7,
        pastReviews: 0,
        avgRating: 4.0,
      });
    }
  }

  return recommendations
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * 基于向量相似度搜索
 */
async function searchByVectorSimilarity(
  context: string,
  limit: number,
  workspaceId?: string,
): Promise<MaterialRecommendation[]> {
  // 简化实现：使用文本搜索代替向量搜索
  const wsClause = workspaceId ? ' AND workspace_id = $3' : '';
  const params = workspaceId ? [`%${context}%`, limit, workspaceId] : [`%${context}%`, limit];
  const results = await query(
    `SELECT
      id, title, content_type, source, source_url,
      tags, quality_score, citation_count
    FROM assets
    WHERE (content ILIKE $1 OR title ILIKE $1)${wsClause}
    ORDER BY quality_score DESC
    LIMIT $2`,
    params
  );

  return results.rows.map(row => ({
    id: row.id,
    type: 'material',
    title: row.title,
    relevanceScore: parseFloat(row.quality_score) * 0.8,
    reason: '向量相似度匹配',
    sourceType: 'asset',
    sourceUrl: row.source_url,
    citationCount: parseInt(row.citation_count) || 0,
    qualityScore: parseFloat(row.quality_score),
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  }));
}

/**
 * 识别知识库空白
 */
async function identifyKnowledgeGaps(workspaceId?: string): Promise<string[]> {
  // 检查哪些领域缺少覆盖 (按 ws 过滤)
  const wsClause = workspaceId ? ' AND workspace_id = $1' : '';
  const params = workspaceId ? [workspaceId] : [];
  const coveredTopics = await query(
    `SELECT DISTINCT topic FROM tasks WHERE created_at > NOW() - INTERVAL '30 days'${wsClause}`,
    params,
  );

  const topics = coveredTopics.rows.map(r => r.topic.toLowerCase());

  const hotDomains = [
    'AI大模型监管政策',
    '新能源汽车产业链',
    'REITs市场扩容',
    '跨境电商出海',
    '半导体国产替代',
    '生物医药研发',
    '碳中和路径',
    '数字人民币',
    '数据要素市场',
    '脑机接口',
  ];

  // 返回未覆盖的热点领域
  return hotDomains.filter(domain =>
    !topics.some(t => t.includes(domain.toLowerCase()) || domain.toLowerCase().includes(t))
  );
}

/**
 * 提取主题标题
 */
function extractTopicTitle(title: string): string {
  // 移除常见的 RSS 后缀
  return title
    .replace(/\s*-\s*.*$/, '')
    .replace(/\|.*$/, '')
    .replace(/【.*?】/g, '')
    .slice(0, 100);
}

/**
 * 生成相关话题
 */
function generateRelatedTopic(originalTopic: string, context: string): string {
  // 简单的延伸逻辑
  const extensions = ['深度分析', '产业链研究', '竞争格局', '发展趋势', '投资机会'];
  const ext = extensions[Math.floor(Math.random() * extensions.length)];
  return `${originalTopic}${ext}`;
}

/**
 * 计算新颖度
 */
function calculateNovelty(tags: string[]): number {
  // 基于标签的新颖度计算
  const novelTags = ['AI', '大模型', '新质生产力', '数据要素', '脑机接口'];
  const hasNovelTag = tags.some(t => novelTags.some(nt => t.toLowerCase().includes(nt.toLowerCase())));
  return hasNovelTag ? 0.8 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3;
}

/**
 * 计算专家匹配度
 */
function calculateExpertMatch(expertise: string[], context: string): number {
  const contextLower = context.toLowerCase();
  const matches = expertise.filter(e =>
    contextLower.includes(e.toLowerCase()) ||
    e.toLowerCase().includes(contextLower)
  ).length;
  return 0.5 + (matches / expertise.length) * 0.5;
}

/**
 * 去重推荐
 */
function deduplicateRecommendations<T extends RecommendationResult>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.type}-${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 记录推荐反馈
 */
export async function recordRecommendationFeedback(
  recommendationId: string,
  userId: string,
  action: 'click' | 'accept' | 'reject',
  metadata?: Record<string, any>
): Promise<void> {
  await query(
    `INSERT INTO recommendation_logs (
      recommendation_id, user_id, action, metadata, created_at
    ) VALUES ($1, $2, $3, $4, NOW())`,
    [recommendationId, userId, action, JSON.stringify(metadata || {})]
  );
}

/**
 * 获取推荐统计
 */
export async function getRecommendationStats(): Promise<{
  totalRecommendations: number;
  clickRate: number;
  acceptRate: number;
  topTopics: string[];
}> {
  const totalResult = await query(`SELECT COUNT(*) FROM recommendation_logs`);
  const clickResult = await query(
    `SELECT COUNT(*) FROM recommendation_logs WHERE action = 'click'`
  );
  const acceptResult = await query(
    `SELECT COUNT(*) FROM recommendation_logs WHERE action = 'accept'`
  );

  const total = parseInt(totalResult.rows[0]?.count || '0');
  const clicks = parseInt(clickResult.rows[0]?.count || '0');
  const accepts = parseInt(acceptResult.rows[0]?.count || '0');

  return {
    totalRecommendations: total,
    clickRate: total > 0 ? clicks / total : 0,
    acceptRate: total > 0 ? accepts / total : 0,
    topTopics: [],
  };
}
