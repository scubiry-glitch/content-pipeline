// Smart Asset Library Service
// 负责: 文档导入 → 自动标签 → 向量化 → 质量评分 → 事实提取(v7.0)

import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { AssetLibraryItem, AutoTag, QualityFactors } from '../types/index.js';
import { isContentLibraryInitialized, getContentLibraryEngine } from '../modules/content-library/singleton.js';

export interface ImportAssetInput {
  content: string;
  contentType: 'text' | 'image' | 'pdf' | 'url';
  source: string;
  sourceUrl?: string;
  publishDate?: Date;
}

export interface ImportResult {
  assetId: string;
  tags: AutoTag[];
  qualityScore: number;
  embeddingStored: boolean;
  /** v7.0: 事实提取结果 */
  factsExtracted?: number;
  entitiesRegistered?: number;
}

export class AssetLibraryService {
  private llmRouter: LLMRouter;

  constructor(llmRouter: LLMRouter) {
    this.llmRouter = llmRouter;
  }

  async importAsset(input: ImportAssetInput): Promise<ImportResult> {
    console.log(`[AssetLibrary] Importing from ${input.source}`);

    // Step 1: Generate auto tags
    const tags = await this.generateTags(input.content);

    // Step 2: Calculate quality factors
    const qualityFactors = await this.calculateQualityFactors(input);

    // Step 3: Calculate combined quality score
    const qualityScore = this.calculateQualityScore(qualityFactors);

    // Step 4: Generate embedding
    const embedding = await this.generateEmbedding(input.content);

    // Step 5: Calculate initial combined weight
    const combinedWeight = this.calculateCombinedWeight(qualityScore, 0, new Date());

    // Step 6: Save to database
    const result = await query(
      `INSERT INTO asset_library (
        content, content_type, auto_tags, quality_score, quality_factors,
        reference_weight, combined_weight, embedding, source, source_url, publish_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        input.content,
        input.contentType,
        JSON.stringify(tags),
        qualityScore,
        JSON.stringify(qualityFactors),
        0,
        combinedWeight,
        embedding ? JSON.stringify(embedding) : null,
        input.source,
        input.sourceUrl,
        input.publishDate,
      ]
    );

    const assetId = result.rows[0].id;

    console.log(`[AssetLibrary] Asset ${assetId} imported with quality ${qualityScore.toFixed(3)}`);

    // v7.0: 异步触发事实提取 (如果 Content Library 已初始化)
    let factsExtracted = 0;
    let entitiesRegistered = 0;
    if (isContentLibraryInitialized()) {
      try {
        const clEngine = getContentLibraryEngine();
        const extraction = await clEngine.extractFacts({
          content: input.content.substring(0, 8000),
          assetId,
        });
        factsExtracted = extraction.facts.length;
        entitiesRegistered = extraction.entities.length;
        console.log(`[AssetLibrary] v7.0: Extracted ${factsExtracted} facts, ${entitiesRegistered} entities`);
      } catch (err) {
        console.warn('[AssetLibrary] v7.0: Fact extraction failed (non-blocking):', err);
      }
    }

    return {
      assetId,
      tags,
      qualityScore,
      embeddingStored: !!embedding,
      factsExtracted,
      entitiesRegistered,
    };
  }

  async batchImport(inputs: ImportAssetInput[]): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    for (const input of inputs) {
      try {
        const result = await this.importAsset(input);
        results.push(result);
      } catch (error) {
        console.error(`[AssetLibrary] Failed to import from ${input.source}:`, error);
      }
    }
    return results;
  }

  async searchSimilar(searchQuery: string, limit: number = 10): Promise<AssetLibraryItem[]> {
    const embedding = await this.llmRouter.embed(searchQuery);

    const result = await query(
      `SELECT id, content, content_type, auto_tags, quality_score,
              reference_weight, combined_weight, source, source_url,
              1 - (embedding <=> $1::vector) as similarity
       FROM asset_library
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      tags: row.auto_tags || [],
      qualityScore: row.quality_score,
      source: row.source,
      sourceUrl: row.source_url,
    }));
  }

  async searchByTags(tags: string[], limit: number = 10): Promise<AssetLibraryItem[]> {
    const result = await query(
      `SELECT id, content, content_type, auto_tags, quality_score,
              reference_weight, combined_weight, source, source_url
       FROM asset_library
       WHERE auto_tags @> ANY($1::jsonb[])
       ORDER BY combined_weight DESC, quality_score DESC
       LIMIT $2`,
      [tags.map(t => JSON.stringify([{ tag: t }])), limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      tags: row.auto_tags || [],
      qualityScore: row.quality_score,
      source: row.source,
      sourceUrl: row.source_url,
    }));
  }

  async updateReferenceWeight(assetId: string, delta: number): Promise<void> {
    await query(
      `UPDATE asset_library
       SET reference_weight = LEAST(GREATEST(reference_weight + $1, 0), 1),
           last_used_at = NOW()
       WHERE id = $2`,
      [delta, assetId]
    );

    // Recalculate combined weight
    await this.recalculateCombinedWeight(assetId);
  }

  async recalculateAllCombinedWeights(): Promise<void> {
    const result = await query(
      `SELECT id, quality_score, reference_weight, created_at FROM asset_library`
    );

    for (const row of result.rows) {
      const age = Date.now() - new Date(row.created_at).getTime();
      const combinedWeight = this.calculateCombinedWeight(
        row.quality_score,
        row.reference_weight,
        new Date(row.created_at)
      );

      await query(
        `UPDATE asset_library SET combined_weight = $1 WHERE id = $2`,
        [combinedWeight, row.id]
      );
    }
  }

  private async generateTags(content: string): Promise<AutoTag[]> {
    const prompt = `请从以下文本中提取关键标签。

文本内容（前2000字）：
${content.substring(0, 2000)}

要求：
1. 提取5-10个关键词或短语
2. 标注每个标签的置信度(0-1)
3. 标注提取方法(NER命名实体识别 / LDA主题模型 / KeyBERT关键词)

输出JSON格式：
[{"tag": "标签", "confidence": 0.9, "method": "NER"}]

只输出JSON，不要有其他内容。`;

    try {
      const result = await this.llmRouter.generate(prompt, 'tagging', {
        temperature: 0.3,
        maxTokens: 1000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const tags = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(tags)) {
          return tags.slice(0, 10);
        }
      }
    } catch (error) {
      console.warn('[AssetLibrary] Tag generation failed:', error);
    }

    // Fallback: simple keyword extraction
    return this.fallbackTagExtraction(content);
  }

  private fallbackTagExtraction(content: string): AutoTag[] {
    const words = content.split(/\s+/);
    const freq: Record<string, number> = {};

    for (const word of words) {
      const clean = word.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
      if (clean.length >= 2) {
        freq[clean] = (freq[clean] || 0) + 1;
      }
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({
        tag,
        confidence: Math.min(count / 10, 0.9),
        method: 'KeyBERT' as const,
      }));
  }

  private async calculateQualityFactors(input: ImportAssetInput): Promise<QualityFactors> {
    const factors: QualityFactors = {
      sourceCredibility: 0.5,
      completeness: 0.5,
      freshness: 0.5,
      credibility: 0.5,
      relevance: 0.5,
      timeliness: 0.5,
    };

    // Source credibility scoring
    const credibleSources = ['gov.cn', 'edu.cn', 'arxiv', 'Reuters', 'Bloomberg'];
    if (credibleSources.some(s => input.source.includes(s))) {
      factors.sourceCredibility = 0.9;
    } else if (input.source.includes('wikipedia')) {
      factors.sourceCredibility = 0.6;
    } else if (input.contentType === 'pdf') {
      factors.sourceCredibility = 0.7;
    }

    // Completeness scoring based on content length and structure
    const contentLength = input.content.length;
    if (contentLength > 10000) {
      factors.completeness = 0.9;
    } else if (contentLength > 5000) {
      factors.completeness = 0.8;
    } else if (contentLength > 2000) {
      factors.completeness = 0.6;
    }

    // Freshness scoring
    if (input.publishDate) {
      const ageDays = (Date.now() - input.publishDate.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < 30) {
        factors.freshness = 0.95;
      } else if (ageDays < 90) {
        factors.freshness = 0.85;
      } else if (ageDays < 365) {
        factors.freshness = 0.7;
      } else {
        factors.freshness = 0.5;
      }
    }

    return factors;
  }

  private calculateQualityScore(factors: QualityFactors): number {
    const weights = {
      sourceCredibility: 0.4,
      completeness: 0.35,
      freshness: 0.25,
    };

    return (
      (factors.sourceCredibility || 0.5) * weights.sourceCredibility +
      (factors.completeness || 0.5) * weights.completeness +
      (factors.freshness || 0.5) * weights.freshness
    );
  }

  private async generateEmbedding(content: string): Promise<number[] | null> {
    try {
      // Truncate content for embedding
      const truncated = content.substring(0, 8000);
      return await this.llmRouter.embed(truncated);
    } catch (error) {
      console.warn('[AssetLibrary] Embedding generation failed:', error);
      return null;
    }
  }

  private calculateCombinedWeight(
    qualityScore: number,
    referenceWeight: number,
    createdAt: Date
  ): number {
    // Time decay factor: older content gets lower weight
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.exp(-ageDays / 365); // 1 year half-life

    // Combined weight formula
    return qualityScore * 0.4 + referenceWeight * 0.4 + timeDecay * 0.2;
  }

  private async recalculateCombinedWeight(assetId: string): Promise<void> {
    const result = await query(
      `SELECT quality_score, reference_weight, created_at FROM asset_library WHERE id = $1`,
      [assetId]
    );

    if (result.rows.length === 0) return;

    const row = result.rows[0];
    const combinedWeight = this.calculateCombinedWeight(
      row.quality_score,
      row.reference_weight,
      new Date(row.created_at)
    );

    await query(
      `UPDATE asset_library SET combined_weight = $1 WHERE id = $2`,
      [combinedWeight, assetId]
    );
  }
}
