// Layer 3: 跨源联合检索
// 打通 asset_embeddings + expert_knowledge_sources 两个数据孤岛

import type {
  DatabaseAdapter,
  EmbeddingAdapter,
  SearchResultItem,
  TierLevel,
} from '../types.js';

export interface CrossSourceSearchOptions {
  query: string;
  tier?: TierLevel;
  limit?: number;
  /** 是否搜索专家知识源 */
  includeExpertKnowledge?: boolean;
  /** 是否搜索内容素材 */
  includeAssets?: boolean;
}

export interface CrossSourceResult {
  assetId: string;
  source: 'asset' | 'expert_knowledge';
  similarity: number;
  title?: string;
  snippet?: string;
}

export class CrossSourceSearch {
  private db: DatabaseAdapter;
  private embedding: EmbeddingAdapter;

  constructor(db: DatabaseAdapter, embedding: EmbeddingAdapter) {
    this.db = db;
    this.embedding = embedding;
  }

  async search(options: CrossSourceSearchOptions): Promise<CrossSourceResult[]> {
    const queryEmbedding = await this.embedding.embed(options.query);
    const limit = options.limit || 20;
    const includeAssets = options.includeAssets !== false;
    const includeExpert = options.includeExpertKnowledge !== false;

    const results: CrossSourceResult[] = [];

    if (includeAssets) {
      const assetResults = await this.searchAssets(queryEmbedding, limit);
      results.push(...assetResults);
    }

    if (includeExpert) {
      const expertResults = await this.searchExpertKnowledge(queryEmbedding, limit);
      results.push(...expertResults);
    }

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  private async searchAssets(embedding: number[], limit: number): Promise<CrossSourceResult[]> {
    const result = await this.db.query(`
      SELECT DISTINCT ON (a.id)
        a.id as asset_id,
        a.title,
        LEFT(a.content, 200) as snippet,
        1 - (ae.embedding <=> $1::vector) as similarity
      FROM asset_embeddings ae
      JOIN assets a ON ae.asset_id = a.id
      ORDER BY a.id, ae.embedding <=> $1::vector ASC
      LIMIT $2
    `, [JSON.stringify(embedding), limit]);

    return result.rows.map((row: any) => ({
      assetId: row.asset_id,
      source: 'asset' as const,
      similarity: Number(row.similarity),
      title: row.title,
      snippet: row.snippet,
    }));
  }

  private async searchExpertKnowledge(embedding: number[], limit: number): Promise<CrossSourceResult[]> {
    try {
      const result = await this.db.query(`
        SELECT
          id,
          expert_id,
          LEFT(parsed_content, 200) as snippet,
          summary as title,
          1 - (content_embedding <=> $1::vector) as similarity
        FROM expert_knowledge_sources
        WHERE content_embedding IS NOT NULL
        ORDER BY content_embedding <=> $1::vector ASC
        LIMIT $2
      `, [JSON.stringify(embedding), limit]);

      return result.rows.map((row: any) => ({
        assetId: row.id,
        source: 'expert_knowledge' as const,
        similarity: Number(row.similarity),
        title: row.title,
        snippet: row.snippet,
      }));
    } catch {
      // expert_knowledge_sources 表可能不存在
      return [];
    }
  }
}
