// ============================================
// v6.2 Assets AI 批量处理 - 向量化服务
// 支持多种 Embedding 来源：SiliconFlow / OpenAI / Dashboard LLM / 本地 Fallback
// ============================================

import { DocumentChunk, AssetVectorization } from './types.js';
import { query } from '../../db/connection.js';
import { callKimiCodingText } from '../kimi-coding.js';
import { DashboardLlmSdk } from '../../libs/dashboard-llm-sdk/src/index.js';

// ============================================
// Embedding 配置
// ============================================
export interface EmbeddingConfig {
  provider: 'siliconflow' | 'openai' | 'kimi' | 'dashboard-llm' | 'local';
  model: string;
  dimensions: number;
  batchSize: number;
  apiEndpoint?: string;
  apiKey?: string;
}

// ============================================
// 向量化服务
// ============================================
export class EmbeddingService {
  private config: EmbeddingConfig;
  private dashboardSdk: DashboardLlmSdk;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    // 自动检测最佳 Embedding 提供商
    this.config = this.detectBestProvider(config);
    this.dashboardSdk = new DashboardLlmSdk();
    console.log(`[EmbeddingService] Using provider: ${this.config.provider}, model: ${this.config.model}`);
  }

  /**
   * 自动检测最佳 Embedding 提供商
   * 优先级: SiliconFlow > OpenAI > Dashboard LLM > Local
   */
  private detectBestProvider(userConfig: Partial<EmbeddingConfig>): EmbeddingConfig {
    // 1. 用户明确指定了配置
    if (userConfig.provider && userConfig.provider !== 'local') {
      return {
        provider: userConfig.provider,
        model: userConfig.model || this.getDefaultModel(userConfig.provider),
        dimensions: userConfig.dimensions || 1024,
        batchSize: userConfig.batchSize || 10,
        apiKey: userConfig.apiKey,
        apiEndpoint: userConfig.apiEndpoint,
      };
    }

    // 2. 检查是否有 SiliconFlow 配置 (SILICONFLOW_API_KEY + embedding_model)
    // SiliconFlow 提供专门的 Embedding API，优先级最高
    if (process.env.SILICONFLOW_API_KEY && process.env.embedding_model) {
      return {
        provider: 'siliconflow',
        model: process.env.embedding_model, // e.g., netease-youdao/bce-embedding-base_v1
        dimensions: 768, // SiliconFlow 模型实际输出 768 维
        batchSize: 10,
        apiKey: process.env.SILICONFLOW_API_KEY,
        apiEndpoint: 'https://api.siliconflow.cn/v1',
      };
    }

    // 3. 检查是否有 OpenAI API Key
    if (process.env.OPENAI_API_KEY) {
      return {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536, // OpenAI text-embedding-3-small
        batchSize: 10,
        apiKey: process.env.OPENAI_API_KEY,
      };
    }

    // 4. 检查是否有 Dashboard LLM 配置 (DASHBOARD_LLM_MODEL + LLM_API_TOKEN)
    // 支持使用 KIMI_API_KEY 作为备选
    const llmToken = process.env.LLM_API_TOKEN || process.env.KIMI_API_KEY;
    if (llmToken && process.env.DASHBOARD_LLM_MODEL) {
      return {
        provider: 'dashboard-llm',
        model: process.env.DASHBOARD_LLM_MODEL,
        dimensions: 768, // Dashboard LLM fallback 生成 768 维
        batchSize: 5,
        apiKey: llmToken,
        apiEndpoint: process.env.LLM_API_BASE_URL || 'http://127.0.0.1:3004',
      };
    }

    // 5. 使用本地 Fallback (基于 LLM 生成摘要哈希)
    return {
      provider: 'local',
      model: 'local-fallback',
      dimensions: 768, // 本地模式使用较小的维度
      batchSize: 1,
    };
  }

  /**
   * 获取默认模型
   */
  private getDefaultModel(provider: string): string {
    switch (provider) {
      case 'siliconflow':
        return 'netease-youdao/bce-embedding-base_v1';
      case 'openai':
        return 'text-embedding-3-small';
      default:
        return 'text-embedding-3-small';
    }
  }

  /**
   * 生成文本的 Embedding
   */
  async embed(text: string): Promise<number[]> {
    switch (this.config.provider) {
      case 'siliconflow':
        return this.embedWithSiliconFlow(text);
      case 'openai':
        return this.embedWithOpenAI(text);
      case 'dashboard-llm':
        return this.embedWithDashboardLLM(text);
      case 'local':
      default:
        return this.embedWithLocalFallback(text);
    }
  }

  /**
   * 使用 SiliconFlow API 生成 Embedding
   * API 文档: https://docs.siliconflow.cn/cn/api-reference/embeddings/create-embeddings
   */
  private async embedWithSiliconFlow(text: string): Promise<number[]> {
    try {
      const apiKey = this.config.apiKey || process.env.SILICONFLOW_API_KEY;
      const model = this.config.model || process.env.embedding_model || 'netease-youdao/bce-embedding-base_v1';
      const baseUrl = this.config.apiEndpoint || 'https://api.siliconflow.cn/v1';

      if (!apiKey) {
        throw new Error('SILICONFLOW_API_KEY is not configured');
      }

      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          input: text.slice(0, 8000), // 限制输入长度
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SiliconFlow API error: ${response.status} - ${errorText}`);
      }

      const data: { 
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { prompt_tokens: number; total_tokens: number };
      } = await response.json();

      if (!data.data || data.data.length === 0) {
        throw new Error('SiliconFlow API returned empty embedding');
      }

      // 更新配置中的维度（根据实际返回）
      const embedding = data.data[0].embedding;
      if (this.config.dimensions !== embedding.length) {
        this.config.dimensions = embedding.length;
      }

      return embedding;
    } catch (error) {
      console.error('[EmbeddingService] SiliconFlow embedding failed:', error);
      // Fallback 到本地模式
      return this.embedWithLocalFallback(text);
    }
  }

  /**
   * 使用 OpenAI API 生成 Embedding
   */
  private async embedWithOpenAI(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey || process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'text-embedding-3-small',
          input: text.slice(0, 8000),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data: { data: Array<{ embedding: number[] }> } = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('[EmbeddingService] OpenAI embedding failed:', error);
      // Fallback 到本地模式
      return this.embedWithLocalFallback(text);
    }
  }

  /**
   * 使用 Dashboard LLM 生成 Embedding
   * 通过 LLM 生成文本的语义摘要，然后转换为向量
   */
  private async embedWithDashboardLLM(text: string): Promise<number[]> {
    try {
      // 使用 LLM 生成文本的语义表示
      const prompt = `请将以下文本转换为用于语义检索的向量表示。
要求：
1. 提取文本的核心主题和关键概念
2. 生成一段简洁的语义描述（100字以内）
3. 列出5-10个关键词
4. 返回格式必须是纯文本，不要任何解释

文本内容：
${text.slice(0, 2000)}

语义表示：`;

      const result = await this.dashboardSdk.chat({
        prompt,
        model: this.config.model,
        maxTokens: 512,
      });

      // 将 LLM 生成的语义表示转换为向量
      // 使用简单的哈希算法将文本转换为固定维度的向量
      return this.textToVector(result.reply, this.config.dimensions);
    } catch (error) {
      console.error('[EmbeddingService] Dashboard LLM embedding failed:', error);
      return this.embedWithLocalFallback(text);
    }
  }

  /**
   * 本地 Fallback - 使用文本哈希生成向量
   * 不依赖外部 API，适用于离线环境
   */
  private async embedWithLocalFallback(text: string): Promise<number[]> {
    // 使用多种特征提取方法组合
    const features: number[] = [];
    
    // 1. 词频特征 (前 256 维)
    const wordFreqVector = this.extractWordFrequencyVector(text, 256);
    features.push(...wordFreqVector);
    
    // 2. 文本统计特征 (64 维)
    const statsVector = this.extractTextStatsVector(text, 64);
    features.push(...statsVector);
    
    // 3. N-gram 特征 (256 维)
    const ngramVector = this.extractNgramVector(text, 256);
    features.push(...ngramVector);
    
    // 4. 哈希特征 (192 维) - 填充到 768 维
    const hashVector = this.extractHashVector(text, 192);
    features.push(...hashVector);
    
    // 归一化
    const magnitude = Math.sqrt(features.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      return features.map(v => v / magnitude);
    }
    
    return features;
  }

  /**
   * 提取词频向量
   */
  private extractWordFrequencyVector(text: string, dimensions: number): number[] {
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 1);
    const freq: Record<string, number> = {};
    
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }
    
    // 取最常见的词
    const sortedWords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, dimensions);
    
    const vector = new Array(dimensions).fill(0);
    const maxFreq = sortedWords[0]?.[1] || 1;
    
    for (let i = 0; i < sortedWords.length; i++) {
      vector[i] = sortedWords[i][1] / maxFreq;
    }
    
    return vector;
  }

  /**
   * 提取文本统计特征
   */
  private extractTextStatsVector(text: string, dimensions: number): number[] {
    const vector = new Array(dimensions).fill(0);
    
    // 基础统计
    vector[0] = text.length / 10000;
    vector[1] = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length; // 中文比例
    vector[2] = (text.match(/[a-zA-Z]/g) || []).length / text.length; // 英文比例
    vector[3] = (text.match(/\d/g) || []).length / text.length; // 数字比例
    vector[4] = (text.match(/[.!?。！？]/g) || []).length / 100; // 句子数量
    vector[5] = (text.match(/\n/g) || []).length / 100; // 段落数量
    
    // 关键词特征
    const keywords = ['报告', '研究', '分析', '市场', '行业', '数据', '趋势', '预测', '策略', '投资'];
    for (let i = 0; i < Math.min(keywords.length, dimensions - 10); i++) {
      vector[10 + i] = text.includes(keywords[i]) ? 1 : 0;
    }
    
    return vector;
  }

  /**
   * 提取 N-gram 特征
   */
  private extractNgramVector(text: string, dimensions: number): number[] {
    const vector = new Array(dimensions).fill(0);
    const chars = text.replace(/\s/g, '').split('');
    
    // 2-gram 特征
    const ngrams: Record<string, number> = {};
    for (let i = 0; i < chars.length - 1; i++) {
      const ngram = chars[i] + chars[i + 1];
      ngrams[ngram] = (ngrams[ngram] || 0) + 1;
    }
    
    // 取最常见的 n-grams
    const sortedNgrams = Object.entries(ngrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, dimensions);
    
    for (let i = 0; i < sortedNgrams.length; i++) {
      vector[i] = sortedNgrams[i][1] / (chars.length || 1);
    }
    
    return vector;
  }

  /**
   * 提取哈希特征
   */
  private extractHashVector(text: string, dimensions: number): number[] {
    const vector = new Array(dimensions).fill(0);
    
    // 使用多个不同的哈希种子
    for (let seed = 0; seed < 4; seed++) {
      let hash = seed;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) & 0x7fffffff;
      }
      
      // 将哈希值分布到向量中
      for (let i = 0; i < dimensions / 4; i++) {
        const idx = seed * (dimensions / 4) + i;
        if (idx < dimensions) {
          vector[idx] = ((hash >> (i % 30)) & 1) * 2 - 1; // 转换为 -1 或 1
        }
      }
    }
    
    return vector;
  }

  /**
   * 将文本转换为向量（简单哈希方法）
   */
  private textToVector(text: string, dimensions: number): number[] {
    return this.extractHashVector(text, dimensions);
  }

  /**
   * 批量生成 Embedding
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      
      if (this.config.provider === 'siliconflow' || this.config.provider === 'openai') {
        // SiliconFlow 和 OpenAI 支持批量 Embedding
        const batchEmbeddings = await this.embedBatchAPI(batch);
        embeddings.push(...batchEmbeddings);
      } else {
        // 其他提供商逐个处理
        const batchEmbeddings = await Promise.all(
          batch.map(text => this.embed(text))
        );
        embeddings.push(...batchEmbeddings);
      }
    }

    return embeddings;
  }

  /**
   * API 批量 Embedding (SiliconFlow / OpenAI)
   */
  private async embedBatchAPI(texts: string[]): Promise<number[][]> {
    try {
      let url: string;
      let headers: Record<string, string>;
      let body: Record<string, any>;

      if (this.config.provider === 'siliconflow') {
        url = `${this.config.apiEndpoint || 'https://api.siliconflow.cn/v1'}/embeddings`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey || process.env.SILICONFLOW_API_KEY}`,
        };
        body = {
          model: this.config.model || process.env.embedding_model,
          input: texts.map(t => t.slice(0, 8000)),
          encoding_format: 'float',
        };
      } else {
        url = 'https://api.openai.com/v1/embeddings';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey || process.env.OPENAI_API_KEY}`,
        };
        body = {
          model: this.config.model || 'text-embedding-3-small',
          input: texts.map(t => t.slice(0, 8000)),
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${this.config.provider} batch embedding error: ${response.status} - ${error}`);
      }

      const data: { data: Array<{ embedding: number[]; index: number }> } = await response.json();
      
      // 按索引排序
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => d.embedding);
    } catch (error) {
      console.error(`[EmbeddingService] Batch embedding failed, falling back to single:`, error);
      return Promise.all(texts.map(text => this.embedWithLocalFallback(text)));
    }
  }

  /**
   * 为 Asset 生成向量化表示
   */
  async vectorizeAsset(
    assetId: string,
    chunks: DocumentChunk[]
  ): Promise<AssetVectorization> {
    const startTime = Date.now();

    try {
      // 1. 分块向量化
      const chunkTexts = chunks.map((c) => c.text);
      const chunkEmbeddings = await this.embedBatch(chunkTexts);

      // 2. 生成文档级向量（使用摘要块或加权平均）
      const abstractChunk = chunks.find((c) => c.type === 'abstract');
      let documentEmbedding: number[];

      if (abstractChunk) {
        documentEmbedding = await this.embed(abstractChunk.text);
      } else {
        // 使用所有 chunk 的加权平均
        documentEmbedding = this.calculateWeightedAverage(chunkEmbeddings, chunks);
      }

      const vectorization: AssetVectorization = {
        assetId,
        documentEmbedding,
        chunks: chunks.map((chunk, i) => ({
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.text,
          chunkEmbedding: chunkEmbeddings[i],
          chunkType: chunk.type,
          chapterTitle: chunk.chapterTitle,
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          priority: chunk.priority,
        })),
        vectorModel: `${this.config.provider}:${this.config.model}`,
        createdAt: new Date().toISOString(),
      };

      // 3. 保存到数据库
      await this.saveEmbeddings(vectorization);

      // 4. 更新 asset 表
      // 将 embedding 数组转换为 pgvector 格式
      const docEmbeddingStr = '[' + documentEmbedding.join(',') + ']';
      await query(
        `UPDATE assets SET 
          ai_document_embedding = $2::vector,
          ai_embedding_model = $3
        WHERE id = $1`,
        [assetId, docEmbeddingStr, vectorization.vectorModel]
      );

      console.log(
        `[EmbeddingService] Vectorized asset ${assetId} with ${chunks.length} chunks using ${this.config.provider} in ${Date.now() - startTime}ms`
      );

      return vectorization;
    } catch (error) {
      console.error(`[EmbeddingService] Failed to vectorize asset ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * 保存 Embeddings 到数据库
   */
  private async saveEmbeddings(vectorization: AssetVectorization): Promise<void> {
    const { assetId, chunks } = vectorization;

    try {
      // 删除旧的 embeddings
      await query('DELETE FROM asset_embeddings WHERE asset_id = $1', [assetId]);

      // 插入新的 embeddings
      for (const chunk of chunks) {
        // 将 embedding 数组转换为 pgvector 格式: [0.1, 0.2, ...]
        const embeddingStr = '[' + chunk.chunkEmbedding.join(',') + ']';
        
        await query(
          `INSERT INTO asset_embeddings (
            asset_id, chunk_index, chunk_text, chunk_embedding, 
            chunk_type, chapter_title, start_page, end_page, priority
          ) VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9)`,
          [
            assetId,
            chunk.chunkIndex,
            chunk.chunkText,
            embeddingStr,
            chunk.chunkType,
            chunk.chapterTitle,
            chunk.startPage,
            chunk.endPage,
            chunk.priority,
          ]
        );
      }

      console.log(`[EmbeddingService] Saved ${chunks.length} embeddings for asset ${assetId}`);
    } catch (error) {
      console.error(`[EmbeddingService] Failed to save embeddings:`, error);
      throw error;
    }
  }

  /**
   * 计算加权平均向量
   */
  private calculateWeightedAverage(embeddings: number[][], chunks: DocumentChunk[]): number[] {
    const dimensions = embeddings[0]?.length || this.config.dimensions;
    const weights = chunks.map((c) => c.priority / 10); // 优先级转换为权重
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const weightedSum = new Array(dimensions).fill(0);

    for (let i = 0; i < embeddings.length; i++) {
      const weight = weights[i] / totalWeight;
      for (let j = 0; j < dimensions; j++) {
        weightedSum[j] += embeddings[i][j] * weight;
      }
    }

    return weightedSum;
  }

  /**
   * 搜索相似文档
   */
  async searchSimilar(
    queryEmbedding: number[],
    threshold: number = 0.7,
    limit: number = 10
  ): Promise<Array<{ assetId: string; similarity: number; chunkText: string }>> {
    try {
      // 将 embedding 数组转换为 pgvector 格式字符串
      const embeddingStr = '[' + queryEmbedding.join(',') + ']';
      
      const result = await query(
        `SELECT 
          asset_id,
          chunk_text,
          1 - (chunk_embedding <=> $1::vector) AS similarity
        FROM asset_embeddings
        WHERE 1 - (chunk_embedding <=> $1::vector) > $2
        ORDER BY chunk_embedding <=> $1::vector
        LIMIT $3`,
        [embeddingStr, threshold, limit]
      );

      return result.rows.map((row) => ({
        assetId: row.asset_id,
        similarity: parseFloat(row.similarity),
        chunkText: row.chunk_text,
      }));
    } catch (error) {
      console.error('[EmbeddingService] Search failed:', error);
      return [];
    }
  }

  /**
   * 获取 Asset 的文档级向量
   */
  async getDocumentEmbedding(assetId: string): Promise<number[] | null> {
    try {
      const result = await query(
        'SELECT ai_document_embedding FROM assets WHERE id = $1',
        [assetId]
      );

      return result.rows[0]?.ai_document_embedding || null;
    } catch (error) {
      console.error(`[EmbeddingService] Failed to get embedding for ${assetId}:`, error);
      return null;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }
}

// ============================================
// 导出单例（延迟初始化，确保环境变量已加载）
// ============================================
let _embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!_embeddingService) {
    _embeddingService = new EmbeddingService();
  }
  return _embeddingService;
}

// 兼容旧代码的导出（延迟初始化）
export const embeddingService: EmbeddingService = {
  get config() { return getEmbeddingService().config; },
  embed(text: string) { return getEmbeddingService().embed(text); },
  embedBatch(texts: string[]) { return getEmbeddingService().embedBatch(texts); },
  vectorizeAsset(assetId: string, chunks: DocumentChunk[], metadata?: any) { return getEmbeddingService().vectorizeAsset(assetId, chunks, metadata); },
  saveEmbeddings(vectorization: AssetVectorization) { return getEmbeddingService().saveEmbeddings(vectorization); },
  searchSimilar(queryEmbedding: number[], threshold?: number, limit?: number) { return getEmbeddingService().searchSimilar(queryEmbedding, threshold, limit); },
  getDocumentEmbedding(assetId: string) { return getEmbeddingService().getDocumentEmbedding(assetId); },
} as EmbeddingService;
