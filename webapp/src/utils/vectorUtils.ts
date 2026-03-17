// 向量工具函数 - Vector Utilities

/**
 * 计算两个向量的余弦相似度
 * @param vec1 向量1
 * @param vec2 向量2
 * @returns 余弦相似度 (-1 到 1)
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('向量维度不匹配');
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * 计算两个向量的欧氏距离
 * @param vec1 向量1
 * @param vec2 向量2
 * @returns 欧氏距离
 */
export function euclideanDistance(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('向量维度不匹配');
  }

  let sum = 0;
  for (let i = 0; i < vec1.length; i++) {
    sum += Math.pow(vec1[i] - vec2[i], 2);
  }

  return Math.sqrt(sum);
}

/**
 * 向量归一化
 * @param vec 输入向量
 * @returns 归一化后的向量
 */
export function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));

  if (magnitude === 0) {
    return vec;
  }

  return vec.map(val => val / magnitude);
}

/**
 * 向量加权平均
 * @param vectors 向量数组
 * @param weights 权重数组
 * @returns 加权平均后的向量
 */
export function weightedAverage(
  vectors: number[][],
  weights: number[]
): number[] {
  if (vectors.length !== weights.length) {
    throw new Error('向量数量和权重数量不匹配');
  }

  if (vectors.length === 0) {
    return [];
  }

  const dimension = vectors[0].length;
  const result = new Array(dimension).fill(0);

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  for (let i = 0; i < dimension; i++) {
    for (let j = 0; j < vectors.length; j++) {
      result[i] += vectors[j][i] * weights[j];
    }
    result[i] /= totalWeight;
  }

  return result;
}

/**
 * 向量相加
 * @param vec1 向量1
 * @param vec2 向量2
 * @returns 相加后的向量
 */
export function addVectors(vec1: number[], vec2: number[]): number[] {
  if (vec1.length !== vec2.length) {
    throw new Error('向量维度不匹配');
  }

  return vec1.map((val, idx) => val + vec2[idx]);
}

/**
 * 向量数乘
 * @param vec 向量
 * @param scalar 标量
 * @returns 数乘后的向量
 */
export function scaleVector(vec: number[], scalar: number): number[] {
  return vec.map(val => val * scalar);
}

/**
 * 计算向量的L2范数
 * @param vec 向量
 * @returns L2范数
 */
export function l2Norm(vec: number[]): number {
  return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}

/**
 * 向量截断（限制每个元素的绝对值）
 * @param vec 向量
 * @param maxValue 最大绝对值
 * @returns 截断后的向量
 */
export function clipVector(vec: number[], maxValue: number): number[] {
  return vec.map(val => Math.max(-maxValue, Math.min(maxValue, val)));
}

/**
 * 找到与查询向量最相似的Top-K个向量
 * @param query 查询向量
 * @param candidates 候选向量数组
 * @param k Top-K数量
 * @returns 最相似的K个向量的索引和相似度
 */
export function findTopKSimilar(
  query: number[],
  candidates: number[][],
  k: number
): { index: number; similarity: number }[] {
  const similarities = candidates.map((candidate, index) => ({
    index,
    similarity: cosineSimilarity(query, candidate),
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * 计算向量集合的质心
 * @param vectors 向量数组
 * @returns 质心向量
 */
export function calculateCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }

  const dimension = vectors[0].length;
  const sum = new Array(dimension).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dimension; i++) {
      sum[i] += vec[i];
    }
  }

  return sum.map(val => val / vectors.length);
}

/**
 * 计算向量集合的平均相似度
 * @param vectors 向量数组
 * @returns 平均成对相似度
 */
export function averagePairwiseSimilarity(vectors: number[][]): number {
  if (vectors.length < 2) {
    return 1;
  }

  let totalSimilarity = 0;
  let count = 0;

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      totalSimilarity += cosineSimilarity(vectors[i], vectors[j]);
      count++;
    }
  }

  return count > 0 ? totalSimilarity / count : 0;
}

/**
 * 生成随机单位向量
 * @param dimension 维度
 * @returns 随机单位向量
 */
export function randomUnitVector(dimension: number): number[] {
  const vec = Array.from({ length: dimension }, () => Math.random() * 2 - 1);
  return normalizeVector(vec);
}

/**
 * 计算向量之间的两两距离矩阵
 * @param vectors 向量数组
 * @returns 距离矩阵
 */
export function pairwiseDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = euclideanDistance(vectors[i], vectors[j]);
      matrix[i][j] = dist;
      matrix[j][i] = dist;
    }
  }

  return matrix;
}

/**
 * 使用主成分分析(PCA)降维（简化版）
 * 注意：这是简化实现，仅用于演示
 * @param vectors 高维向量数组
 * @param targetDim 目标维度
 * @returns 降维后的向量数组
 */
export function pcaReduction(
  vectors: number[][],
  targetDim: number
): number[][] {
  // 实际应用应使用完整的PCA实现或调用库
  // 这里使用简单的截断作为占位
  return vectors.map(vec => vec.slice(0, targetDim));
}

/**
 * 相似度分数转换为置信度等级
 * @param similarity 相似度分数 (0-1)
 * @returns 置信度等级
 */
export function similarityToConfidence(
  similarity: number
): { level: 'high' | 'medium' | 'low'; emoji: string; description: string } {
  if (similarity >= 0.8) {
    return { level: 'high', emoji: '🔥', description: '高度匹配' };
  } else if (similarity >= 0.6) {
    return { level: 'medium', emoji: '✓', description: '良好匹配' };
  } else {
    return { level: 'low', emoji: '~', description: '一般匹配' };
  }
}

/**
 * 批量计算余弦相似度
 * @param query 查询向量
 * @param candidates 候选向量数组
 * @returns 相似度数组
 */
export function batchCosineSimilarity(
  query: number[],
  candidates: number[][]
): number[] {
  return candidates.map(candidate => cosineSimilarity(query, candidate));
}
