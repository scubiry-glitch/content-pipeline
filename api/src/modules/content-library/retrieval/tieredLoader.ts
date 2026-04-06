// Layer 2: 层级加载 (← OpenViking L0/L1/L2)
// L0 (~80 tokens): 标题+摘要+标签+质量分
// L1 (~300-500 tokens): 核心观点+关键数据+结论
// L2 (1000+ tokens): 完整内容/分块全文

import type {
  DatabaseAdapter,
  ContentLibraryOptions,
  TieredContent,
  TieredLoadOptions,
  TierLevel,
  TierL0,
  TierL1,
  TierL2,
  ContentChunk,
} from '../types.js';

export class TieredLoader {
  private db: DatabaseAdapter;
  private options: Required<ContentLibraryOptions>;

  constructor(db: DatabaseAdapter, options: Required<ContentLibraryOptions>) {
    this.db = db;
    this.options = options;
  }

  /** 按层级加载单个资产 */
  async load(assetId: string, opts?: TieredLoadOptions): Promise<TieredContent> {
    const level = opts?.level || 'L0';

    switch (level) {
      case 'L0': return this.loadL0(assetId);
      case 'L1': return this.loadL1(assetId);
      case 'L2': return this.loadL2(assetId);
      default: return this.loadL0(assetId);
    }
  }

  /** 批量加载指定层级 */
  async loadBatch(assetIds: string[], level: TierLevel): Promise<TieredContent[]> {
    if (assetIds.length === 0) return [];

    switch (level) {
      case 'L0': return this.loadL0Batch(assetIds);
      case 'L1': return Promise.all(assetIds.map(id => this.loadL1(id)));
      case 'L2': return Promise.all(assetIds.map(id => this.loadL2(id)));
      default: return this.loadL0Batch(assetIds);
    }
  }

  // ============================================================
  // L0: 摘要索引 (~80 tokens)
  // ============================================================

  private async loadL0(assetId: string): Promise<TieredContent> {
    const result = await this.db.query(`
      SELECT
        a.id, a.title, a.content_type, a.created_at,
        COALESCE(ai.l0_summary, LEFT(a.content, ${this.options.l0MaxChars})) as summary,
        COALESCE(ai.quality_score, a.quality_score, 0) as quality_score,
        COALESCE(ai.extracted_tags, a.tags, '[]') as tags,
        (SELECT COUNT(*) FROM content_facts cf WHERE cf.asset_id = a.id AND cf.is_current = true) as entity_count
      FROM assets a
      LEFT JOIN asset_ai_analysis ai ON ai.asset_id = a.id
      WHERE a.id = $1
    `, [assetId]);

    if (result.rows.length === 0) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    const row = result.rows[0];
    const data: TierL0 = {
      assetId: row.id,
      title: row.title || '',
      summary: row.summary || '',
      tags: this.parseTags(row.tags),
      qualityScore: Number(row.quality_score),
      entityCount: Number(row.entity_count),
      contentType: row.content_type || 'text',
      createdAt: new Date(row.created_at),
    };

    return {
      assetId,
      level: 'L0',
      data,
      tokenCount: this.estimateTokens(data),
      canExpand: true,
    };
  }

  private async loadL0Batch(assetIds: string[]): Promise<TieredContent[]> {
    const placeholders = assetIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await this.db.query(`
      SELECT
        a.id, a.title, a.content_type, a.created_at,
        COALESCE(ai.l0_summary, LEFT(a.content, ${this.options.l0MaxChars})) as summary,
        COALESCE(ai.quality_score, a.quality_score, 0) as quality_score,
        COALESCE(ai.extracted_tags, a.tags, '[]') as tags,
        0 as entity_count
      FROM assets a
      LEFT JOIN asset_ai_analysis ai ON ai.asset_id = a.id
      WHERE a.id IN (${placeholders})
    `, assetIds);

    return result.rows.map(row => {
      const data: TierL0 = {
        assetId: row.id,
        title: row.title || '',
        summary: row.summary || '',
        tags: this.parseTags(row.tags),
        qualityScore: Number(row.quality_score),
        entityCount: Number(row.entity_count),
        contentType: row.content_type || 'text',
        createdAt: new Date(row.created_at),
      };
      return {
        assetId: row.id,
        level: 'L0' as TierLevel,
        data,
        tokenCount: this.estimateTokens(data),
        canExpand: true,
      };
    });
  }

  // ============================================================
  // L1: 结构化片段 (~300-500 tokens)
  // ============================================================

  private async loadL1(assetId: string): Promise<TieredContent> {
    const l0 = await this.loadL0(assetId);

    const result = await this.db.query(`
      SELECT
        ai.l1_key_points,
        ai.quality_key_insights,
        ai.quality_summary
      FROM asset_ai_analysis ai
      WHERE ai.asset_id = $1
    `, [assetId]);

    // 从分块中提取 abstract 和 conclusion
    const chunks = await this.db.query(`
      SELECT chunk_type, content FROM asset_content_chunks
      WHERE asset_id = $1 AND chunk_type IN ('abstract', 'conclusion', 'chart')
      ORDER BY chunk_index ASC
    `, [assetId]);

    const aiRow = result.rows[0];
    const l0Data = l0.data as TierL0;

    const keyPoints = aiRow?.l1_key_points
      || aiRow?.quality_key_insights
      || [];
    const conclusion = chunks.rows.find((c: any) => c.chunk_type === 'conclusion')?.content;
    const chartDescs = chunks.rows
      .filter((c: any) => c.chunk_type === 'chart')
      .map((c: any) => c.content);

    const data: TierL1 = {
      ...l0Data,
      keyPoints: Array.isArray(keyPoints) ? keyPoints.slice(0, this.options.l1MaxPoints) : [],
      keyData: [],
      conclusion: conclusion || aiRow?.quality_summary || undefined,
      chartDescriptions: chartDescs.length > 0 ? chartDescs : undefined,
      tokenCount: 0,
    };
    data.tokenCount = this.estimateTokens(data);

    return {
      assetId,
      level: 'L1',
      data,
      tokenCount: data.tokenCount,
      canExpand: true,
    };
  }

  // ============================================================
  // L2: 全文 (1000+ tokens)
  // ============================================================

  private async loadL2(assetId: string): Promise<TieredContent> {
    const l1Result = await this.loadL1(assetId);
    const l1Data = l1Result.data as TierL1;

    // 获取全文
    const contentResult = await this.db.query(
      'SELECT content FROM assets WHERE id = $1',
      [assetId]
    );

    // 获取所有分块
    const chunksResult = await this.db.query(`
      SELECT chunk_index, chunk_type, content FROM asset_content_chunks
      WHERE asset_id = $1
      ORDER BY chunk_index ASC
    `, [assetId]);

    const fullContent = contentResult.rows[0]?.content || '';
    const chunks: ContentChunk[] = chunksResult.rows.map((row: any) => ({
      index: row.chunk_index,
      type: row.chunk_type,
      content: row.content,
    }));

    const data: TierL2 = {
      ...l1Data,
      fullContent,
      chunks: chunks.length > 0 ? chunks : undefined,
    };

    return {
      assetId,
      level: 'L2',
      data,
      tokenCount: this.estimateTokens(data),
      canExpand: false,
    };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private parseTags(raw: any): string[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  }

  /** 粗略估算 token 数 (中文约 1.5 char/token, 英文约 4 char/token) */
  private estimateTokens(data: any): number {
    const str = JSON.stringify(data);
    const cjkCount = (str.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherCount = str.length - cjkCount;
    return Math.round(cjkCount / 1.5 + otherCount / 4);
  }
}
