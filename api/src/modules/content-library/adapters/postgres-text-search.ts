// TextSearchAdapter — PostgreSQL tsvector 实现
// 嵌入模式使用，可替换为 Elasticsearch/Meilisearch

import type { DatabaseAdapter, TextSearchAdapter, TextSearchOptions, TextSearchResult } from '../types.js';

export class PostgresTextSearch implements TextSearchAdapter {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async search(query: string, options?: TextSearchOptions): Promise<TextSearchResult[]> {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const minScore = options?.minScore || 0;

    // 将查询转换为 tsquery 格式 (空格分隔的词用 & 连接)
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.replace(/[^\w\u4e00-\u9fff]/g, ''))
      .filter(Boolean)
      .join(' & ');

    if (!tsQuery) return [];

    const conditions: string[] = [];
    const params: any[] = [tsQuery, limit, offset];
    let paramIndex = 4;

    if (options?.filters?.minQuality) {
      conditions.push(`COALESCE(a.quality_score, 0) >= $${paramIndex++}`);
      params.push(options.filters.minQuality);
    }

    const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const result = await this.db.query(`
      SELECT
        a.id,
        a.title,
        ts_rank_cd(a.content_tsv, to_tsquery('simple', $1)) as score,
        ts_headline('simple', a.content, to_tsquery('simple', $1),
          'MaxWords=30, MinWords=15, StartSel=<<, StopSel=>>') as highlight,
        a.quality_score,
        a.created_at
      FROM assets a
      WHERE a.content_tsv @@ to_tsquery('simple', $1)
      ${where}
      ORDER BY score DESC
      LIMIT $2 OFFSET $3
    `, params);

    return result.rows
      .filter((row: any) => Number(row.score) >= minScore)
      .map((row: any) => ({
        id: row.id,
        score: Number(row.score),
        highlights: row.highlight ? [row.highlight] : undefined,
        metadata: {
          title: row.title,
          qualityScore: Number(row.quality_score),
          createdAt: row.created_at,
        },
      }));
  }

  async index(id: string, content: string, metadata?: Record<string, any>): Promise<void> {
    // tsvector 由触发器自动维护，但也支持手动更新
    await this.db.query(
      `UPDATE assets SET content_tsv = to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, ''))
       WHERE id = $1`,
      [id]
    );
  }

  async indexBatch(items: Array<{ id: string; content: string }>): Promise<void> {
    for (const item of items) {
      await this.index(item.id, item.content);
    }
  }

  async remove(id: string): Promise<void> {
    // tsvector 会随 assets 行删除自动清理
  }
}
