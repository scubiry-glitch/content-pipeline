// 语义匹配服务 - Semantic Matching Service
// v5.1.1: 专家语义向量匹配 - 384维向量 + 多维度嵌入

import type { Expert, ExpertMatchRequest, ExpertAssignment } from '../types';
import {
  cosineSimilarity,
  normalizeVector,
  weightedAverage,
  findTopKSimilar,
} from '../utils/vectorUtils';

// 嵌入维度配置
const EMBEDDING_DIMENSIONS = 384;

// 领域关键词映射 - 用于构建领域语义向量
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  // E01 宏观经济
  E01: ['宏观', '经济', 'GDP', '通胀', '利率', '货币政策', '财政政策', '经济周期', '增长', '衰退'],
  // E02 新能源
  E02: ['新能源', '光伏', '储能', '电池', '电动车', '碳中和', '清洁能源', '锂电', '氢能', '风电'],
  // E03 科技与互联网
  E03: ['科技', '互联网', 'AI', '人工智能', '软件', '平台', '数字化', '大数据', '云计算', '芯片'],
  // E04 消费零售
  E04: ['消费', '零售', '品牌', '电商', '供应链', '用户体验', '渠道', '营销', '产品', '服务'],
  // E05 医疗健康
  E05: ['医疗', '健康', '医药', '生物科技', '医疗器械', '创新药', '疫苗', '诊断', '治疗'],
  // E06 金融科技
  E06: ['金融', '科技', '支付', '区块链', '数字货币', '保险科技', '财富管理', '风控', '信贷'],
  // E07 先进制造
  E07: ['制造', '工业', '机器人', '自动化', '半导体', '精密仪器', '供应链', '产能', '工艺'],
  // E08 传媒娱乐
  E08: ['传媒', '娱乐', '内容', '视频', '游戏', '社交', 'IP', '流量', '用户', '订阅'],
  // E09 房地产
  E09: ['房地产', '地产', '物业', '商业', '住宅', '城市', '城镇化', '土地', '开发'],
  // E10 教育
  E10: ['教育', '培训', '学习', '知识', '技能', '在线', '职业', 'K12', '终身学习'],
  // E11 企业服务
  E11: ['企业', 'SaaS', '软件', '服务', 'B2B', '效率', '协作', '管理', '数字化'],
  // E12 投资与资本
  E12: ['投资', '资本', 'VC', 'PE', '并购', '估值', '股权', '融资', '退出', '回报'],
};

// 专家嵌入向量接口
export interface ExpertEmbedding {
  expertId: string;
  domainCode: string;
  // 多维度嵌入向量
  domainEmbedding: number[]; // 领域语义向量
  philosophyEmbedding: number[]; // 思想体系向量
  achievementsEmbedding: number[]; // 成功案例向量
  // 综合嵌入向量（加权组合）
  combinedEmbedding: number[];
  // 元数据
  updatedAt: Date;
}

// 专家嵌入缓存
const expertEmbeddings: Map<string, ExpertEmbedding> = new Map();

// 领域基向量缓存
const domainBaseEmbeddings: Map<string, number[]> = new Map();

/**
 * 初始化领域基向量
 * 基于领域关键词构建语义向量
 */
function initDomainBaseEmbeddings(): void {
  Object.entries(DOMAIN_KEYWORDS).forEach(([code, keywords]) => {
    const text = keywords.join(' ');
    domainBaseEmbeddings.set(code, textToEmbedding(text));
  });
}

/**
 * 文本转换为嵌入向量
 * 使用简单的词哈希方法生成384维向量
 * @param text 输入文本
 * @returns 384维归一化向量
 */
export function textToEmbedding(text: string): number[] {
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
  const words = text.toLowerCase().split(/[\s,，。！？；：""''（）【】]+/);

  words.forEach((word, idx) => {
    if (word.length === 0) return;

    // 使用多个哈希函数增加区分度
    for (let i = 0; i < word.length; i++) {
      const charCode = word.charCodeAt(i);
      const pos1 = (charCode * 7 + idx * 13) % EMBEDDING_DIMENSIONS;
      const pos2 = (charCode * 13 + idx * 7) % EMBEDDING_DIMENSIONS;
      const pos3 = (charCode * 31 + i * 17) % EMBEDDING_DIMENSIONS;

      vector[pos1] += 1.0;
      vector[pos2] += 0.5;
      vector[pos3] += 0.25;
    }
  });

  return normalizeVector(vector);
}

/**
 * 组合多个嵌入向量（加权平均）
 * @param embeddings 嵌入向量数组
 * @param weights 权重数组
 * @returns 组合后的向量
 */
export function combineEmbeddings(
  embeddings: number[][],
  weights: number[]
): number[] {
  if (embeddings.length !== weights.length) {
    throw new Error('嵌入向量数量和权重数量不匹配');
  }
  return weightedAverage(embeddings, weights);
}

/**
 * 生成专家的多维度嵌入向量
 * @param expert 专家对象
 * @returns 专家嵌入对象
 */
function generateExpertEmbedding(expert: Expert): ExpertEmbedding {
  // 1. 领域嵌入 - 基于领域名称+代码+关键词
  const domainText = `${expert.domainCode} ${expert.domainName} ${
    DOMAIN_KEYWORDS[expert.domainCode]?.join(' ') || ''
  }`;
  const domainEmbedding = textToEmbedding(domainText);

  // 2. 思想体系嵌入 - 基于核心思想+名言
  const philosophyText = [
    ...expert.philosophy.core,
    ...expert.philosophy.quotes,
  ].join(' ');
  const philosophyEmbedding = textToEmbedding(philosophyText);

  // 3. 成功案例嵌入 - 基于成功案例标题+影响+描述
  const achievementsText = expert.achievements
    ?.map((a) => `${a.title} ${a.impact} ${a.description || ''}`)
    .join(' ') || '';
  const achievementsEmbedding = textToEmbedding(achievementsText);

  // 4. 组合嵌入 - 加权平均
  const combinedEmbedding = combineEmbeddings(
    [domainEmbedding, philosophyEmbedding, achievementsEmbedding],
    [0.5, 0.3, 0.2] // 领域权重最高，思想次之，案例再次
  );

  return {
    expertId: expert.id,
    domainCode: expert.domainCode,
    domainEmbedding,
    philosophyEmbedding,
    achievementsEmbedding,
    combinedEmbedding,
    updatedAt: new Date(),
  };
}

/**
 * 初始化专家嵌入向量缓存
 * @param experts 专家列表
 */
export function initExpertEmbeddings(experts: Expert[]): void {
  // 先初始化领域基向量
  initDomainBaseEmbeddings();

  // 生成每个专家的嵌入向量
  experts.forEach((expert) => {
    const embedding = generateExpertEmbedding(expert);
    expertEmbeddings.set(expert.id, embedding);
  });

  console.log(`[v5.1.1] 已初始化 ${experts.length} 位专家的语义嵌入向量`);
}

/**
 * 更新专家嵌入向量
 * @param expert 专家对象
 */
export function updateExpertEmbedding(expert: Expert): void {
  const embedding = generateExpertEmbedding(expert);
  expertEmbeddings.set(expert.id, embedding);
}

/**
 * 计算主题与领域的语义相似度
 * @param topic 主题文本
 * @returns 各领域相似度分数
 */
function calculateDomainSimilarities(
  topic: string
): Array<{ domainCode: string; similarity: number }> {
  const topicEmbedding = textToEmbedding(topic);

  const similarities: Array<{ domainCode: string; similarity: number }> = [];

  domainBaseEmbeddings.forEach((domainEmbedding, domainCode) => {
    const similarity = cosineSimilarity(topicEmbedding, domainEmbedding);
    similarities.push({ domainCode, similarity });
  });

  return similarities.sort((a, b) => b.similarity - a.similarity);
}

/**
 * 语义匹配专家
 * @param request 匹配请求
 * @param options 可选参数
 * @param allExperts 所有专家列表
 * @returns 专家分配结果
 */
export function semanticMatchExperts(
  request: ExpertMatchRequest,
  options?: { topK?: number; threshold?: number },
  allExperts?: Expert[]
): ExpertAssignment {
  const { topic, context, requiredDimensions } = request;
  const { topK = 3, threshold = 0.3 } = options || {};

  // 1. 生成主题嵌入向量
  const topicText = `${topic} ${context || ''} ${requiredDimensions?.join(' ') || ''}`;
  const topicEmbedding = textToEmbedding(topicText);

  // 2. 获取Top-K相关领域
  const domainSimilarities = calculateDomainSimilarities(topic);
  const topDomains = domainSimilarities.slice(0, 3);

  // 3. 在相关领域内匹配专家
  const candidateExperts: Expert[] = [];
  expertEmbeddings.forEach((embedding, expertId) => {
    // 只考虑Top-3领域内的专家
    if (topDomains.some((d) => d.domainCode === embedding.domainCode)) {
      // 这里需要获取专家对象，实际应从全局缓存获取
      // 简化处理，假设expertService会传入
    }
  });

  // 4. 计算与所有专家的相似度
  const similarities: Array<{
    expertId: string;
    similarity: number;
    domainSim: number;
    philosophySim: number;
  }> = [];

  // 使用传入的专家列表或缓存中的嵌入
  const expertIdsToUse = allExperts?.map(e => e.id) || Array.from(expertEmbeddings.keys());

  expertIdsToUse.forEach((expertId) => {
    const embedding = expertEmbeddings.get(expertId);
    if (!embedding) return;
    const combinedSim = cosineSimilarity(topicEmbedding, embedding.combinedEmbedding);
    const domainSim = cosineSimilarity(topicEmbedding, embedding.domainEmbedding);
    const philosophySim = cosineSimilarity(topicEmbedding, embedding.philosophyEmbedding);

    // 加权综合分数
    const weightedSim = combinedSim * 0.5 + domainSim * 0.3 + philosophySim * 0.2;

    if (weightedSim >= threshold) {
      similarities.push({
        expertId,
        similarity: weightedSim,
        domainSim,
        philosophySim,
      });
    }
  });

  // 5. 排序并返回Top-K
  const sortedSimilarities = similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  // 构建匹配结果（返回部分结果，expertService会补充完整）
  return {
    experts: sortedSimilarities.map((s) => ({
      expertId: s.expertId,
      role: 'primary',
      reasoning: `语义相似度: ${(s.similarity * 100).toFixed(1)}%`,
    })),
    domainExperts: [], // expertService会填充
    universalExperts: {
      factChecker: {} as Expert,
      logicChecker: {} as Expert,
      readerRep: {} as Expert,
    }, // expertService会填充
    matchReasons: [], // expertService会填充
    confidence: sortedSimilarities[0]?.similarity || 0,
    matchingMethod: 'semantic',
    domainScores: topDomains.map((d) => ({
      domain: d.domainCode,
      score: d.similarity,
    })),
  };
}

/**
 * 获取匹配解释
 * 解释为什么这个专家被匹配到
 * @param expertId 专家ID
 * @param topic 主题文本
 * @returns 匹配解释文本
 */
export function getMatchingExplanation(expertId: string, topic: string): string {
  const embedding = expertEmbeddings.get(expertId);
  if (!embedding) {
    return '专家信息未找到';
  }

  const topicEmbedding = textToEmbedding(topic);

  // 计算各维度相似度
  const domainSim = cosineSimilarity(topicEmbedding, embedding.domainEmbedding);
  const philosophySim = cosineSimilarity(topicEmbedding, embedding.philosophyEmbedding);
  const achievementsSim = cosineSimilarity(topicEmbedding, embedding.achievementsEmbedding);

  const explanations: string[] = [];

  if (domainSim > 0.5) {
    explanations.push(`领域匹配度 ${(domainSim * 100).toFixed(0)}% - 专家对${embedding.domainCode}领域有深入研究`);
  }

  if (philosophySim > 0.4) {
    explanations.push(`思想体系契合 - 专家的核心思想与主题高度相关`);
  }

  if (achievementsSim > 0.3) {
    explanations.push(`成功案例关联 - 专家的相关经验可直接应用于该主题`);
  }

  if (explanations.length === 0) {
    explanations.push('基于语义分析的匹配结果');
  }

  return explanations.join('；');
}

/**
 * 获取领域相似度分数（用于调试）
 * @param topic 主题文本
 * @returns 各领域相似度
 */
export function getDomainSimilarityScores(
  topic: string
): Array<{ domainCode: string; domainName: string; similarity: number }> {
  const domainNames: Record<string, string> = {
    E01: '宏观经济', E02: '新能源', E03: '科技与互联网',
    E04: '消费零售', E05: '医疗健康', E06: '金融科技',
    E07: '先进制造', E08: '传媒娱乐', E09: '房地产',
    E10: '教育', E11: '企业服务', E12: '投资与资本',
  };

  return calculateDomainSimilarities(topic).map((d) => ({
    domainCode: d.domainCode,
    domainName: domainNames[d.domainCode] || d.domainCode,
    similarity: d.similarity,
  }));
}

/**
 * 批量计算主题与专家的相似度
 * @param topic 主题文本
 * @returns 所有专家的相似度分数
 */
export function calculateAllExpertSimilarities(
  topic: string
): Array<{ expertId: string; similarity: number; domainSim: number }> {
  const topicEmbedding = textToEmbedding(topic);
  const results: Array<{ expertId: string; similarity: number; domainSim: number }> = [];

  expertEmbeddings.forEach((embedding, expertId) => {
    const similarity = cosineSimilarity(topicEmbedding, embedding.combinedEmbedding);
    const domainSim = cosineSimilarity(topicEmbedding, embedding.domainEmbedding);
    results.push({ expertId, similarity, domainSim });
  });

  return results.sort((a, b) => b.similarity - a.similarity);
}

// 导出领域关键词供其他模块使用
export { DOMAIN_KEYWORDS };
