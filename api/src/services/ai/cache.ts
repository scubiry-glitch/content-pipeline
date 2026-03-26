// AI 批量处理缓存系统
// v6.1 Phase 5: Embedding Cache + Response Cache

import { createHash } from 'crypto';
import { query } from '../../db/connection.js';

// ============================================
// Embedding Cache
// 缓存文本的 Embedding，用于相似度计算
// ============================================

interface EmbeddingCacheEntry {
  text: string;
  embedding: number[];
  createdAt: Date;
}

export class EmbeddingCache {
  private memoryCache: Map<string, EmbeddingCacheEntry> = new Map();
  private maxMemorySize: number;
  private ttlMs: number;

  constructor(options: { maxMemorySize?: number; ttlMinutes?: number } = {}) {
    this.maxMemorySize = options.maxMemorySize || 10000;
    this.ttlMs = (options.ttlMinutes || 60 * 24) * 60 * 1000; // 默认24小时
  }

  /**
   * 生成文本的缓存键
   */
  private generateKey(text: string): string {
    // 标准化文本：去空白、转小写、取前500字符
    const normalized = text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 500);
    return createHash('md5').update(normalized).digest('hex');
  }

  /**
   * 获取缓存的 Embedding
   */
  async get(text: string): Promise<number[] | null> {
    const key = this.generateKey(text);

    // 1. 检查内存缓存
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && Date.now() - memoryEntry.createdAt.getTime() < this.ttlMs) {
      console.log(`[EmbeddingCache] Memory cache hit: ${key.slice(0, 8)}...`);
      return memoryEntry.embedding;
    }

    // 2. 检查数据库缓存
    try {
      const result = await query(
        `SELECT embedding, created_at FROM ai_embedding_cache 
         WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [key]
      );

      if (result.rows.length > 0) {
        const embedding = JSON.parse(result.rows[0].embedding);
        // 更新内存缓存
        this.memoryCache.set(key, {
          text: text.slice(0, 100),
          embedding,
          createdAt: new Date(result.rows[0].created_at),
        });
        console.log(`[EmbeddingCache] DB cache hit: ${key.slice(0, 8)}...`);
        return embedding;
      }
    } catch (error) {
      console.error('[EmbeddingCache] DB query failed:', error);
    }

    return null;
  }

  /**
   * 设置缓存
   */
  async set(text: string, embedding: number[]): Promise<void> {
    const key = this.generateKey(text);

    // 1. 更新内存缓存
    this.memoryCache.set(key, {
      text: text.slice(0, 100),
      embedding,
      createdAt: new Date(),
    });

    // 2. 清理过期内存缓存
    this.cleanMemoryCache();

    // 3. 异步保存到数据库
    try {
      await query(
        `INSERT INTO ai_embedding_cache (cache_key, text_preview, embedding, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET
           text_preview = EXCLUDED.text_preview,
           embedding = EXCLUDED.embedding,
           created_at = NOW()`,
        [key, text.slice(0, 200), JSON.stringify(embedding)]
      );
    } catch (error) {
      console.error('[EmbeddingCache] DB save failed:', error);
    }
  }

  /**
   * 批量获取缓存
   */
  async getBatch(texts: string[]): Promise<Map<string, number[] | null>> {
    const results = new Map<string, number[] | null>();
    
    await Promise.all(
      texts.map(async (text) => {
        const embedding = await this.get(text);
        results.set(text, embedding);
      })
    );

    return results;
  }

  /**
   * 清理内存缓存
   */
  private cleanMemoryCache(): void {
    if (this.memoryCache.size <= this.maxMemorySize) return;

    // LRU 策略：删除最老的条目
    const sorted = Array.from(this.memoryCache.entries()).sort(
      (a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime()
    );

    const toDelete = sorted.slice(0, sorted.length - this.maxMemorySize);
    toDelete.forEach(([key]) => this.memoryCache.delete(key));

    console.log(`[EmbeddingCache] Cleaned ${toDelete.length} entries, remaining: ${this.memoryCache.size}`);
  }

  /**
   * 计算文本相似度
   */
  async calculateSimilarity(text1: string, text2: string): Promise<number> {
    let embedding1 = await this.get(text1);
    let embedding2 = await this.get(text2);

    // 如果缓存中没有，需要外部提供 embedding
    if (!embedding1 || !embedding2) {
      return 0;
    }

    return this.cosineSimilarity(embedding1, embedding2);
  }

  /**
   * 余弦相似度计算
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 获取缓存统计
   */
  getStats(): { memorySize: number; maxSize: number; ttlMinutes: number } {
    return {
      memorySize: this.memoryCache.size,
      maxSize: this.maxMemorySize,
      ttlMinutes: this.ttlMs / 60000,
    };
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await query('DELETE FROM ai_embedding_cache', []);
      console.log('[EmbeddingCache] All cache cleared');
    } catch (error) {
      console.error('[EmbeddingCache] Clear failed:', error);
    }
  }
}

// ============================================
// Response Cache
// 缓存 LLM 的响应结果，避免重复调用
// ============================================

interface ResponseCacheEntry {
  prompt: string;
  response: string;
  model: string;
  createdAt: Date;
  hitCount: number;
}

export class ResponseCache {
  private memoryCache: Map<string, ResponseCacheEntry> = new Map();
  private maxMemorySize: number;
  private ttlMs: number;

  constructor(options: { maxMemorySize?: number; ttlMinutes?: number } = {}) {
    this.maxMemorySize = options.maxMemorySize || 5000;
    this.ttlMs = (options.ttlMinutes || 60) * 60 * 1000; // 默认1小时
  }

  /**
   * 生成缓存键
   */
  private generateKey(prompt: string, model: string): string {
    const content = `${model}:${prompt.trim().toLowerCase().slice(0, 1000)}`;
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * 获取缓存的响应
   */
  async get(prompt: string, model: string): Promise<string | null> {
    const key = this.generateKey(prompt, model);

    // 1. 检查内存缓存
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && Date.now() - memoryEntry.createdAt.getTime() < this.ttlMs) {
      memoryEntry.hitCount++;
      console.log(`[ResponseCache] Memory cache hit: ${key.slice(0, 8)}... (hits: ${memoryEntry.hitCount})`);
      return memoryEntry.response;
    }

    // 2. 检查数据库缓存
    try {
      const result = await query(
        `SELECT response, created_at FROM ai_response_cache 
         WHERE cache_key = $1 AND model = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
        [key, model]
      );

      if (result.rows.length > 0) {
        const response = result.rows[0].response;
        // 更新内存缓存
        this.memoryCache.set(key, {
          prompt: prompt.slice(0, 100),
          response,
          model,
          createdAt: new Date(result.rows[0].created_at),
          hitCount: 1,
        });
        console.log(`[ResponseCache] DB cache hit: ${key.slice(0, 8)}...`);
        return response;
      }
    } catch (error) {
      console.error('[ResponseCache] DB query failed:', error);
    }

    return null;
  }

  /**
   * 设置缓存
   */
  async set(prompt: string, model: string, response: string): Promise<void> {
    const key = this.generateKey(prompt, model);

    // 1. 更新内存缓存
    this.memoryCache.set(key, {
      prompt: prompt.slice(0, 100),
      response,
      model,
      createdAt: new Date(),
      hitCount: 0,
    });

    // 2. 清理过期缓存
    this.cleanMemoryCache();

    // 3. 异步保存到数据库
    try {
      await query(
        `INSERT INTO ai_response_cache (cache_key, model, prompt_preview, response, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (cache_key, model) DO UPDATE SET
           prompt_preview = EXCLUDED.prompt_preview,
           response = EXCLUDED.response,
           created_at = NOW()`,
        [key, model, prompt.slice(0, 200), response]
      );
    } catch (error) {
      console.error('[ResponseCache] DB save failed:', error);
    }
  }

  /**
   * 查找相似缓存（基于文本相似度）
   * 用于处理稍微不同的 prompt 但语义相同的情况
   */
  async findSimilar(prompt: string, model: string, threshold: number = 0.95): Promise<string | null> {
    // 简化版本：检查前200字符是否相同
    const promptPrefix = prompt.trim().toLowerCase().slice(0, 200);
    
    for (const [key, entry] of this.memoryCache) {
      if (entry.model === model && entry.prompt.toLowerCase().slice(0, 200) === promptPrefix) {
        const similarity = this.textSimilarity(prompt, entry.prompt);
        if (similarity >= threshold) {
          entry.hitCount++;
          console.log(`[ResponseCache] Similar cache hit: ${key.slice(0, 8)}... (similarity: ${similarity.toFixed(2)})`);
          return entry.response;
        }
      }
    }

    return null;
  }

  /**
   * 计算文本相似度（简单版本）
   */
  private textSimilarity(a: string, b: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const na = normalize(a);
    const nb = normalize(b);
    
    if (na === nb) return 1;
    
    // Jaccard 相似度
    const setA = new Set(na.split(' '));
    const setB = new Set(nb.split(' '));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return intersection.size / union.size;
  }

  /**
   * 清理内存缓存
   */
  private cleanMemoryCache(): void {
    if (this.memoryCache.size <= this.maxMemorySize) return;

    // LRU + LFU 混合策略
    const entries = Array.from(this.memoryCache.entries());
    
    // 优先删除老的、且命中次数少的
    const sorted = entries.sort((a, b) => {
      const ageDiff = a[1].createdAt.getTime() - b[1].createdAt.getTime();
      if (Math.abs(ageDiff) > 3600000) { // 年龄差距超过1小时
        return ageDiff;
      }
      return a[1].hitCount - b[1].hitCount; // 否则按命中次数
    });

    const toDelete = sorted.slice(0, sorted.length - this.maxMemorySize);
    toDelete.forEach(([key]) => this.memoryCache.delete(key));

    console.log(`[ResponseCache] Cleaned ${toDelete.length} entries, remaining: ${this.memoryCache.size}`);
  }

  /**
   * 获取缓存统计
   */
  getStats(): { 
    memorySize: number; 
    maxSize: number; 
    ttlMinutes: number;
    totalHits: number;
  } {
    let totalHits = 0;
    for (const entry of this.memoryCache.values()) {
      totalHits += entry.hitCount;
    }

    return {
      memorySize: this.memoryCache.size,
      maxSize: this.maxMemorySize,
      ttlMinutes: this.ttlMs / 60000,
      totalHits,
    };
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await query('DELETE FROM ai_response_cache', []);
      console.log('[ResponseCache] All cache cleared');
    } catch (error) {
      console.error('[ResponseCache] Clear failed:', error);
    }
  }
}

// ============================================
// 缓存数据库表创建
// ============================================

export const CACHE_TABLE_SQL = `
-- Embedding 缓存表
CREATE TABLE IF NOT EXISTS ai_embedding_cache (
  cache_key VARCHAR(32) PRIMARY KEY,
  text_preview VARCHAR(500),
  embedding JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_cache_created 
  ON ai_embedding_cache(created_at);

-- Response 缓存表
CREATE TABLE IF NOT EXISTS ai_response_cache (
  cache_key VARCHAR(32),
  model VARCHAR(50),
  prompt_preview VARCHAR(500),
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (cache_key, model)
);

CREATE INDEX IF NOT EXISTS idx_response_cache_created 
  ON ai_response_cache(created_at);

CREATE INDEX IF NOT EXISTS idx_response_cache_model 
  ON ai_response_cache(model, created_at);
`;

// 导出单例
export const embeddingCache = new EmbeddingCache();
export const responseCache = new ResponseCache();
