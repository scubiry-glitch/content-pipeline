// 语义匹配服务 - Semantic Matching Service
// v5.1.1: 专家语义向量匹配

import type { Expert } from '../types';

// 专家向量嵌入存储
const expertEmbeddings: Map<string, number[]> = new Map();

// 简单的文本向量化（基于词频）
function textToVector(text: string, dimensions: number = 64): number[] {
  const words = text.toLowerCase().split(/[\s,，。]+/);
  const vector = new Array(dimensions).fill(0);

  words.forEach((word, index) => {
    if (word.length > 0) {
      const hash = word.split('').reduce((acc, char) => {
        return acc + char.charCodeAt(0);
      }, 0);
      vector[hash % dimensions] += 1;
    }
  });

  // 归一化
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return vector.map(val => val / magnitude);
  }

  return vector;
}

// 计算余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/**
 * 初始化专家向量嵌入
 */
export function initExpertEmbeddings(experts: Expert[]): void {
  experts.forEach(expert => {
    const text = `${expert.name} ${expert.domainName} ${expert.profile.title} ${expert.philosophy.core.join(' ')} ${expert.reviewDimensions.join(' ')}`;
    const embedding = textToVector(text);
    expertEmbeddings.set(expert.id, embedding);
  });
}

/**
 * 更新专家向量嵌入
 */
export function updateExpertEmbedding(expert: Expert): void {
  const text = `${expert.name} ${expert.domainName} ${expert.profile.title} ${expert.philosophy.core.join(' ')} ${expert.reviewDimensions.join(' ')}`;
  const embedding = textToVector(text);
  expertEmbeddings.set(expert.id, embedding);
}

/**
 * 语义匹配专家
 */
export function semanticMatchExperts(
  topic: string,
  experts: Expert[],
  topK: number = 5
): Array<{ expert: Expert; similarity: number }> {
  const topicEmbedding = textToVector(topic);

  const similarities = experts.map(expert => {
    const expertEmbedding = expertEmbeddings.get(expert.id);
    if (!expertEmbedding) {
      return { expert, similarity: 0 };
    }
    const similarity = cosineSimilarity(topicEmbedding, expertEmbedding);
    return { expert, similarity };
  });

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * 获取匹配解释
 */
export function getMatchingExplanation(expert: Expert, topic: string): string {
  const explanations: string[] = [];

  // 检查领域匹配
  if (expert.domainName && topic.includes(expert.domainName)) {
    explanations.push(`领域"${expert.domainName}"匹配`);
  }

  // 检查核心思想匹配
  expert.philosophy.core.forEach(core => {
    if (topic.includes(core.slice(0, 4))) {
      explanations.push(`核心思想"${core.slice(0, 8)}..."相关`);
    }
  });

  // 检查评审维度匹配
  expert.reviewDimensions.forEach(dim => {
    if (topic.includes(dim.slice(0, 4))) {
      explanations.push(`评审维度"${dim}"相关`);
    }
  });

  if (explanations.length === 0) {
    return `专家${expert.name}的背景与主题相关`;
  }

  return explanations.slice(0, 2).join('，');
}
