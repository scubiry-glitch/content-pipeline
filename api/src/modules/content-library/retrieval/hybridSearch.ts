// Layer 3: 混合检索 (← RetainDB Vector + BM25 + Reranking)
// 语义检索 + 关键词检索 + RRF/LLM 重排序 + 质量加权

import type {
  DatabaseAdapter,
  EmbeddingAdapter,
  TextSearchAdapter,
  ContentLibraryOptions,
  HybridSearchRequest,
  HybridSearchResult,
  SearchResultItem,
  TieredContent,
  SearchMode,
} from '../types.js';
import { TieredLoader } from './tieredLoader.js';

interface RankedCandidate {
  assetId: string;
  semanticRank?: number;
  keywordRank?: number;
  semanticScore?: number;
  keywordScore?: number;
  qualityScore: number;
  freshness: number;
  source: 'asset' | 'expert_knowledge';
}

export class HybridSearch {
  private db: DatabaseAdapter;
  private embedding: EmbeddingAdapter;
  private textSearch: TextSearchAdapter;
  private tieredLoader: TieredLoader;
  private options: Required<ContentLibraryOptions>;

  constructor(
    db: DatabaseAdapter,
    embedding: EmbeddingAdapter,
    textSearch: TextSearchAdapter,
    options: Required<ContentLibraryOptions>
  ) {
    this.db = db;
    this.embedding = embedding;
    this.textSearch = textSearch;
    this.options = options;
    this.tieredLoader = new TieredLoader(db, options);
  }

  async search(request: HybridSearchRequest): Promise<HybridSearchResult> {
    const startTime = Date.now();
    const mode = request.mode || 'hybrid';
    const limit = request.limit || this.options.defaultSearchLimit;
    const tier = request.tier || 'L0';
    const rerankStrategy = request.rerankStrategy || 'rrf';

    let candidates: RankedCandidate[] = [];

    if (mode === 'semantic' || mode === 'hybrid') {
      const semanticResults = await this.semanticSearch(request, limit * 2);
      candidates.push(...semanticResults);
    }

    if (mode === 'keyword' || mode === 'hybrid') {
      const keywordResults = await this.keywordSearch(request, limit * 2);
      candidates = this.mergeCandidates(candidates, keywordResults);
    }

    // Rerank
    const ranked = this.rrfRerank(candidates, { k: 60 });

    // 质量加权
    const weighted = ranked.map(c => ({
      ...c,
      finalScore: this.calculateFinalScore(c),
    }));

    // 排序并截断
    weighted.sort((a, b) => b.finalScore - a.finalScore);
    const topCandidates = weighted.slice(0, limit);

    // 加载层级内容
    const items: SearchResultItem[] = await Promise.all(
      topCandidates.map(async (c) => {
        let content: TieredContent;
        try {
          content = await this.tieredLoader.load(c.assetId, { level: tier });
        } catch {
          // 资产可能已删除
          content = {
            assetId: c.assetId,
            level: tier,
            data: { assetId: c.assetId, title: '(unavailable)', summary: '', tags: [], qualityScore: 0, entityCount: 0, contentType: 'text', createdAt: new Date() },
            tokenCount: 0,
            canExpand: false,
          };
        }

        return {
          assetId: c.assetId,
          content,
          scores: {
            semantic: c.semanticScore,
            keyword: c.keywordScore,
            quality: c.qualityScore,
            freshness: c.freshness,
            final: c.finalScore,
          },
          source: c.source,
        };
      })
    );

    return {
      items,
      totalCount: weighted.length,
      searchMode: mode,
      rerankStrategy,
      latencyMs: Date.now() - startTime,
    };
  }

  // ============================================================
  // Semantic Search (pgvector cosine)
  // ============================================================

  private async semanticSearch(request: HybridSearchRequest, limit: number): Promise<RankedCandidate[]> {
    const queryEmbedding = await this.embedding.embed(request.query);

    const conditions: string[] = [];
    const params: any[] = [JSON.stringify(queryEmbedding), limit];
    let paramIndex = 3;

    if (request.minQualityScore) {
      conditions.push(`COALESCE(ai.quality_score, a.quality_score, 0) >= $${paramIndex++}`);
      params.push(request.minQualityScore);
    }
    if (request.dateRange?.from) {
      conditions.push(`a.created_at >= $${paramIndex++}`);
      params.push(request.dateRange.from);
    }
    if (request.dateRange?.to) {
      conditions.push(`a.created_at <= $${paramIndex++}`);
      params.push(request.dateRange.to);
    }

    const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // 搜索 asset_embeddings (分块向量)
    const result = await this.db.query(`
      SELECT DISTINCT ON (a.id)
        a.id as asset_id,
        1 - (ae.embedding <=> $1::vector) as similarity,
        COALESCE(ai.quality_score, a.quality_score, 0) as quality_score,
        a.created_at
      FROM asset_embeddings ae
      JOIN assets a ON ae.asset_id = a.id
      LEFT JOIN asset_ai_analysis ai ON ai.asset_id = a.id
      WHERE 1=1 ${where}
      ORDER BY a.id, ae.embedding <=> $1::vector ASC
      LIMIT $2
    `, params);

    return result.rows.map((row: any, index: number) => ({
      assetId: row.asset_id,
      semanticRank: index + 1,
      semanticScore: Number(row.similarity),
      qualityScore: Number(row.quality_score),
      freshness: this.calculateFreshness(new Date(row.created_at)),
      source: 'asset' as const,
    }));
  }

  // ============================================================
  // Keyword Search (TextSearchAdapter — PostgreSQL tsvector 或其他)
  // ============================================================

  private async keywordSearch(request: HybridSearchRequest, limit: number): Promise<RankedCandidate[]> {
    const results = await this.textSearch.search(request.query, {
      limit,
      filters: {
        ...(request.domainFilter ? { domain: request.domainFilter } : {}),
        ...(request.minQualityScore ? { minQuality: request.minQualityScore } : {}),
      },
    });

    return results.map((r, index) => ({
      assetId: r.id,
      keywordRank: index + 1,
      keywordScore: r.score,
      qualityScore: r.metadata?.qualityScore || 0,
      freshness: r.metadata?.createdAt ? this.calculateFreshness(new Date(r.metadata.createdAt)) : 0.5,
      source: 'asset' as const,
    }));
  }

  // ============================================================
  // RRF (Reciprocal Rank Fusion) Reranking
  // ============================================================

  private rrfRerank(candidates: RankedCandidate[], opts: { k: number }): RankedCandidate[] {
    // RRF: score = Σ 1/(k + rank_i)
    for (const c of candidates) {
      let rrfScore = 0;
      if (c.semanticRank) {
        rrfScore += 1 / (opts.k + c.semanticRank);
      }
      if (c.keywordRank) {
        rrfScore += 1 / (opts.k + c.keywordRank);
      }
      // 存入 semanticScore 作为复用字段
      c.semanticScore = (c.semanticScore || 0) + rrfScore;
    }

    return candidates;
  }

  // ============================================================
  // Helpers
  // ============================================================

  private mergeCandidates(existing: RankedCandidate[], incoming: RankedCandidate[]): RankedCandidate[] {
    const merged = new Map<string, RankedCandidate>();

    for (const c of existing) {
      merged.set(c.assetId, c);
    }

    for (const c of incoming) {
      const prev = merged.get(c.assetId);
      if (prev) {
        prev.keywordRank = c.keywordRank;
        prev.keywordScore = c.keywordScore;
      } else {
        merged.set(c.assetId, c);
      }
    }

    return Array.from(merged.values());
  }

  private calculateFinalScore(c: RankedCandidate & { finalScore?: number }): number {
    const alpha = 0.4;  // semantic weight
    const beta = 0.3;   // keyword weight
    const gamma = 0.2;  // quality weight
    const delta = 0.1;  // freshness weight

    return (
      alpha * (c.semanticScore || 0) +
      beta * (c.keywordScore || 0) +
      gamma * (c.qualityScore / 10) +
      delta * c.freshness
    );
  }

  private calculateFreshness(date: Date): number {
    const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysSince / 365);
  }
}
