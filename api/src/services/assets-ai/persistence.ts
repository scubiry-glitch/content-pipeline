// ============================================
// v6.2 Assets AI 批量处理 - 数据持久化服务
// ============================================

import { Asset, AssetAIAnalysisResult, AssetDeepAnalysis, DocumentChunk, SemanticSearchResult } from './types.js';
import { query } from '../../db/connection.js';

// ============================================
// 持久化服务
// ============================================
export class PersistenceService {
  /**
   * 保存分析结果
   */
  async saveResult(result: AssetAIAnalysisResult): Promise<void> {
    const {
      assetId,
      quality,
      classification,
      vectorization,
      duplicate,
      taskRecommendation,
      processingTimeMs,
      modelVersion,
    } = result;

    try {
      // 准备 document_embedding（转换为 pgvector 格式）
      const docEmbedding = vectorization?.documentEmbedding
        ? '[' + vectorization.documentEmbedding.join(',') + ']'
        : null;

      // 1. 保存到 asset_ai_analysis 表
      await query(
        `INSERT INTO asset_ai_analysis (
          asset_id,
          quality_score, quality_dimensions, quality_summary, quality_strengths, quality_weaknesses,
          quality_key_insights, quality_data_highlights, quality_recommendation,
          structure_analysis,
          primary_theme_id, primary_theme_confidence, secondary_themes, expert_library_mapping,
          extracted_tags, extracted_entities,
          embedding_status, document_embedding, chunk_count, embedding_model,
          duplicate_detection_result, similarity_group_id,
          has_recommendation,
          processing_time_ms, model_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        ON CONFLICT (asset_id) DO UPDATE SET
          quality_score = EXCLUDED.quality_score,
          quality_dimensions = EXCLUDED.quality_dimensions,
          quality_summary = EXCLUDED.quality_summary,
          quality_strengths = EXCLUDED.quality_strengths,
          quality_weaknesses = EXCLUDED.quality_weaknesses,
          quality_key_insights = EXCLUDED.quality_key_insights,
          quality_data_highlights = EXCLUDED.quality_data_highlights,
          quality_recommendation = EXCLUDED.quality_recommendation,
          structure_analysis = EXCLUDED.structure_analysis,
          primary_theme_id = EXCLUDED.primary_theme_id,
          primary_theme_confidence = EXCLUDED.primary_theme_confidence,
          secondary_themes = EXCLUDED.secondary_themes,
          expert_library_mapping = EXCLUDED.expert_library_mapping,
          extracted_tags = EXCLUDED.extracted_tags,
          extracted_entities = EXCLUDED.extracted_entities,
          embedding_status = EXCLUDED.embedding_status,
          document_embedding = EXCLUDED.document_embedding,
          chunk_count = EXCLUDED.chunk_count,
          embedding_model = EXCLUDED.embedding_model,
          duplicate_detection_result = EXCLUDED.duplicate_detection_result,
          similarity_group_id = EXCLUDED.similarity_group_id,
          has_recommendation = EXCLUDED.has_recommendation,
          processing_time_ms = EXCLUDED.processing_time_ms,
          model_version = EXCLUDED.model_version,
          analyzed_at = NOW()`,
        [
          assetId,
          quality.overall,
          JSON.stringify(quality.dimensions),
          quality.aiAssessment.summary,
          JSON.stringify(quality.aiAssessment.strengths),
          JSON.stringify(quality.aiAssessment.weaknesses),
          JSON.stringify(quality.aiAssessment.keyInsights),
          JSON.stringify(quality.aiAssessment.dataHighlights),
          quality.aiAssessment.recommendation,
          JSON.stringify(quality.structure),
          classification.primaryTheme.themeId,
          classification.primaryTheme.confidence,
          JSON.stringify(classification.secondaryThemes),
          JSON.stringify(classification.expertLibraryMapping),
          JSON.stringify(classification.tags),
          JSON.stringify(classification.entities),
          vectorization ? 'completed' : 'pending',
          docEmbedding,
          vectorization?.chunks.length || 0,
          vectorization?.vectorModel || null,
          JSON.stringify(duplicate || {}),
          duplicate?.similarityGroupId || null,
          !!taskRecommendation,
          processingTimeMs,
          modelVersion,
        ]
      );

      // 2. 同步到 assets 表
      await query(
        `UPDATE assets SET
          ai_quality_score = $2,
          ai_theme_id = $3,
          ai_theme_confidence = $4,
          ai_tags = $5,
          ai_analyzed_at = NOW(),
          ai_processing_status = 'completed',
          ai_duplicate_of = $6
        WHERE id = $1`,
        [
          assetId,
          quality.overall,
          classification.primaryTheme.themeId,
          classification.primaryTheme.confidence,
          JSON.stringify(classification.tags.map((t) => t.tag)),
          duplicate?.duplicateOf || null,
        ]
      );

      // 3. 如果有任务推荐，保存到 ai_task_recommendations
      if (taskRecommendation) {
        await query(
          `INSERT INTO ai_task_recommendations (
            source_type, source_asset_id, recommendation_data, status
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (source_asset_id, source_type) DO UPDATE SET
            recommendation_data = EXCLUDED.recommendation_data,
            status = 'pending',
            updated_at = NOW()`,
          ['asset', assetId, JSON.stringify(taskRecommendation), 'pending']
        );
      }

      // 4. v7.4: 深度分析结果写入 asset_deep_analysis
      if (result.deepAnalysis) {
        await this.saveDeepAnalysis(result.deepAnalysis);
      }

      console.log(`[PersistenceService] Saved analysis for asset ${assetId}`);
    } catch (error) {
      console.error(`[PersistenceService] Failed to save result for ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * 保存文档分块
   */
  async saveChunks(assetId: string, chunks: DocumentChunk[]): Promise<void> {
    try {
      // 删除旧的分块
      await query('DELETE FROM asset_content_chunks WHERE asset_id = $1', [assetId]);

      // 插入新的分块
      for (const chunk of chunks) {
        await query(
          `INSERT INTO asset_content_chunks (
            asset_id, chunk_index, chunk_text, chunk_type, chapter_title, start_page, end_page, priority
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            assetId,
            chunk.chunkIndex,
            chunk.text,
            chunk.type,
            chunk.chapterTitle || null,
            chunk.startPage || null,
            chunk.endPage || null,
            chunk.priority,
          ]
        );
      }

      console.log(`[PersistenceService] Saved ${chunks.length} chunks for asset ${assetId}`);
    } catch (error) {
      console.error(`[PersistenceService] Failed to save chunks for ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * 获取待处理的 Assets
   * v7.3 调整2: 断点续传 — 恢复卡在 'processing' 超 30 分钟的资产，可选重试 'failed'
   */
  async getUnprocessedAssets(options: {
    limit?: number;
    minQualityScore?: number;
    maxAgeHours?: number;
    /** v7.3: 也重试之前失败的资产 */
    retryFailed?: boolean;
    /** v7.3: 'processing' 超过此分钟数视为 stale，自动重试 (默认 30) */
    staleMinutes?: number;
    /** v7.3: 数据来源筛选 (如 ['upload', 'rss', 'binding']) */
    sources?: string[];
  } = {}): Promise<Asset[]> {
    const { limit = 20, maxAgeHours = 168, retryFailed = false, staleMinutes = 30 } = options;

    // 断点续传: 先把 stale 'processing' 资产重置为 'pending'
    await query(
      `UPDATE assets SET ai_processing_status = 'pending'
       WHERE ai_processing_status = 'processing'
         AND updated_at < NOW() - INTERVAL '${staleMinutes} minutes'`
    );

    // 可选: 重试失败的资产
    if (retryFailed) {
      await query(
        `UPDATE assets SET ai_processing_status = 'pending'
         WHERE ai_processing_status = 'failed'`
      );
    }

    // v7.3: 构建可选的 source 过滤
    // RSS 导入的素材 id 以 'rss-' 开头 (source 列存的是源名称如 "36氪"，不是 'rss')
    // 所以 'rss' 需要特殊处理：用 id LIKE 'rss-%' 匹配
    let sourceCond = '';
    const params: any[] = [limit];
    if (options.sources && options.sources.length > 0) {
      const hasRss = options.sources.includes('rss');
      const otherSources = options.sources.filter(s => s !== 'rss');
      const conditions: string[] = [];
      if (otherSources.length > 0) {
        params.push(otherSources);
        conditions.push(`source = ANY($${params.length}::text[])`);
      }
      if (hasRss) {
        conditions.push(`id LIKE 'rss-%'`);
      }
      if (conditions.length > 0) {
        sourceCond = `AND (${conditions.join(' OR ')})`;
      }
    }

    const result = await query(
      `SELECT
        id, title, file_url as "fileUrl", file_type as "fileType", file_size as "fileSize",
        source, author, published_at as "publishedAt", created_at as "createdAt",
        metadata, content
      FROM assets
      WHERE (ai_processing_status = 'pending' OR ai_processing_status IS NULL)
        AND created_at > NOW() - INTERVAL '${maxAgeHours} hours'
        AND (is_deleted = false OR is_deleted IS NULL)
        ${sourceCond}
      ORDER BY created_at DESC
      LIMIT $1`,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      fileUrl: row.fileUrl,
      fileType: row.fileType,
      fileSize: row.fileSize,
      source: row.source,
      author: row.author,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      metadata: row.metadata || {},
      content: row.content,
    }));
  }

  /**
   * 获取分析结果
   */
  async getAnalysisResult(assetId: string): Promise<AssetAIAnalysisResult | null> {
    const result = await query(
      `SELECT * FROM asset_ai_analysis WHERE asset_id = $1`,
      [assetId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return await this.parseAnalysisResult(row);
  }

  /**
   * 获取处理统计
   */
  async getProcessingStats(): Promise<{
    totalAnalyzed: number;
    analyzedToday: number;
    averageQualityScore: number;
    pendingRecommendations: number;
  }> {
    const totalResult = await query(`SELECT COUNT(*) FROM asset_ai_analysis`);

    const todayResult = await query(
      `SELECT COUNT(*) FROM asset_ai_analysis WHERE analyzed_at > CURRENT_DATE`
    );

    const avgQualityResult = await query(
      `SELECT AVG(quality_score) FROM asset_ai_analysis WHERE quality_score > 0`
    );

    const pendingRecResult = await query(
      `SELECT COUNT(*) FROM ai_task_recommendations WHERE source_type = 'asset' AND status = 'pending'`
    );

    return {
      totalAnalyzed: parseInt(totalResult.rows[0].count),
      analyzedToday: parseInt(todayResult.rows[0].count),
      averageQualityScore: Math.round(parseFloat(avgQualityResult.rows[0].avg || 0)),
      pendingRecommendations: parseInt(pendingRecResult.rows[0].count),
    };
  }

  /**
   * 解析数据库结果为 AssetAIAnalysisResult
   */
  private async parseAnalysisResult(row: any): Promise<AssetAIAnalysisResult> {
    // 查询主题名称
    let themeName = '';
    if (row.primary_theme_id) {
      try {
        const themeResult = await query('SELECT name FROM themes WHERE id = $1', [row.primary_theme_id]);
        if (themeResult.rows.length > 0) {
          themeName = themeResult.rows[0].name;
        }
      } catch {
        // 忽略主题查询错误
      }
    }

    // 查询重复检测结果
    let duplicateResult = null;
    try {
      const dupResult = await query(
        'SELECT duplicate_asset_id, similarity_score FROM asset_duplicate_results WHERE source_asset_id = $1',
        [row.asset_id]
      );
      if (dupResult.rows.length > 0) {
        duplicateResult = {
          isDuplicate: dupResult.rows[0].similarity_score > 0.9,
          duplicateOf: dupResult.rows[0].duplicate_asset_id,
          similarAssets: dupResult.rows.map((r: any) => ({
            assetId: r.duplicate_asset_id,
            assetTitle: '', // 简化处理
            similarity: r.similarity_score,
          })),
        };
      }
    } catch {
      // 忽略重复查询错误
    }

    // 查询任务推荐
    let taskRecommendation = null;
    try {
      const taskResult = await query(
        `SELECT recommendation_data, status FROM ai_task_recommendations 
         WHERE source_asset_id = $1 AND source_type = 'asset' 
         ORDER BY created_at DESC LIMIT 1`,
        [row.asset_id]
      );
      if (taskResult.rows.length > 0) {
        const recData = taskResult.rows[0].recommendation_data;
        taskRecommendation = {
          title: recData.title || '推荐任务',
          format: recData.format || 'article',
          priority: recData.priority || 'medium',
          reason: recData.reason || '',
          content: {
            angle: recData.content?.angle || '',
            keyPoints: recData.content?.keyPoints || [],
          },
        };
      }
    } catch {
      // 忽略任务推荐查询错误
    }

    return {
      assetId: row.asset_id,
      quality: {
        overall: row.quality_score,
        dimensions: row.quality_dimensions || {},
        structure: row.structure_analysis || {},
        aiAssessment: {
          summary: row.quality_summary || '',
          strengths: row.quality_strengths || [],
          weaknesses: row.quality_weaknesses || [],
          keyInsights: row.quality_key_insights || [],
          dataHighlights: row.quality_data_highlights || [],
          recommendation: row.quality_recommendation || 'normal',
          confidence: 0.9, // 从数据库恢复时默认高置信度
        },
      },
      classification: {
        primaryTheme: {
          themeId: row.primary_theme_id || '',
          themeName: themeName,
          confidence: parseFloat(row.primary_theme_confidence) || 0,
          reason: '',
        },
        secondaryThemes: row.secondary_themes || [],
        expertLibraryMapping: row.expert_library_mapping || [],
        tags: row.extracted_tags || [],
        entities: row.extracted_entities || [],
      },
      duplicate: (duplicateResult || {
        isDuplicate: false,
        similarAssets: [],
        confidence: 0,
      }) as any,
      taskRecommendation: taskRecommendation as any,
      processingTimeMs: row.processing_time_ms || 0,
      modelVersion: row.model_version || 'v1.0',
    };
  }

  /**
   * 语义搜索
   */
  async semanticSearch(
    queryText: string,
    options: {
      themeId?: string;
      minQualityScore?: number;
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    const { themeId, minQualityScore = 0, limit = 10, threshold = 0.7 } = options;

    try {
      // 注意：这里需要先生成 query 的 embedding，简化处理
      // 实际应该调用 embeddingService.embed(queryText)

      let sql = `
        SELECT 
          a.id as asset_id,
          a.title,
          a.source,
          a.ai_quality_score,
          1 - (a.ai_document_embedding <=> $1::vector) AS similarity
        FROM assets a
        WHERE a.ai_document_embedding IS NOT NULL
          AND 1 - (a.ai_document_embedding <=> $1::vector) > $2
          AND (a.ai_quality_score IS NULL OR a.ai_quality_score >= $3)
      `;
      const params: any[] = ['[]', threshold, minQualityScore]; // 空向量作为占位符（pgvector格式）

      if (themeId) {
        sql += ` AND a.ai_theme_id = $${params.length + 1}`;
        params.push(themeId);
      }

      sql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await query(sql, params);

      return result.rows.map((row) => ({
        assetId: row.asset_id,
        title: row.title,
        source: row.source,
        qualityScore: row.ai_quality_score,
        relevanceScore: parseFloat(row.similarity),
        matchedChunks: [],
      }));
    } catch (error) {
      console.error('[PersistenceService] Semantic search failed:', error);
      return [];
    }
  }

  /**
   * 查找相似 Assets
   */
  async findSimilarAssets(assetId: string, limit: number = 5): Promise<SemanticSearchResult[]> {
    try {
      // 获取源 asset 的 embedding
      const sourceResult = await query(
        'SELECT ai_document_embedding, title, source, ai_quality_score FROM assets WHERE id = $1',
        [assetId]
      );

      if (sourceResult.rows.length === 0 || !sourceResult.rows[0].ai_document_embedding) {
        return [];
      }

      const source = sourceResult.rows[0];
      // 从数据库获取的 embedding 需要转换为 pgvector 字符串格式
      const embedding = Array.isArray(source.ai_document_embedding)
        ? '[' + source.ai_document_embedding.join(',') + ']'
        : source.ai_document_embedding;

      // 搜索相似 assets
      const result = await query(
        `SELECT 
          id as asset_id,
          title,
          source,
          ai_quality_score,
          1 - (ai_document_embedding <=> $1::vector) AS similarity
        FROM assets
        WHERE id != $2
          AND ai_document_embedding IS NOT NULL
          AND 1 - (ai_document_embedding <=> $1::vector) > 0.7
        ORDER BY ai_document_embedding <=> $1::vector
        LIMIT $3`,
        [embedding, assetId, limit]
      );

      return result.rows.map((row) => ({
        assetId: row.asset_id,
        title: row.title,
        source: row.source,
        qualityScore: row.ai_quality_score,
        relevanceScore: parseFloat(row.similarity),
        matchedChunks: [],
      }));
    } catch (error) {
      console.error('[PersistenceService] Find similar assets failed:', error);
      return [];
    }
  }

  /**
   * v7.4: 保存深度分析结果到 asset_deep_analysis
   */
  async saveDeepAnalysis(deep: AssetDeepAnalysis): Promise<void> {
    try {
      await query(
        `INSERT INTO asset_deep_analysis (
          asset_id,
          matched_domain_expert_ids, matched_senior_expert_id, match_reasons,
          topic_recommendations, trend_signals, differentiation_gaps, knowledge_blanks,
          key_facts, entity_graph, delta_report, stale_facts, knowledge_card,
          insights, material_recommendations, expert_consensus,
          controversies, belief_evolution, cross_domain_insights,
          expert_invocations, model_version, processing_time_ms
        ) VALUES (
          $1,
          $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16,
          $17, $18, $19,
          $20, $21, $22
        )
        ON CONFLICT (asset_id) DO UPDATE SET
          matched_domain_expert_ids = EXCLUDED.matched_domain_expert_ids,
          matched_senior_expert_id = EXCLUDED.matched_senior_expert_id,
          match_reasons = EXCLUDED.match_reasons,
          topic_recommendations = EXCLUDED.topic_recommendations,
          trend_signals = EXCLUDED.trend_signals,
          differentiation_gaps = EXCLUDED.differentiation_gaps,
          knowledge_blanks = EXCLUDED.knowledge_blanks,
          key_facts = EXCLUDED.key_facts,
          entity_graph = EXCLUDED.entity_graph,
          delta_report = EXCLUDED.delta_report,
          stale_facts = EXCLUDED.stale_facts,
          knowledge_card = EXCLUDED.knowledge_card,
          insights = EXCLUDED.insights,
          material_recommendations = EXCLUDED.material_recommendations,
          expert_consensus = EXCLUDED.expert_consensus,
          controversies = EXCLUDED.controversies,
          belief_evolution = EXCLUDED.belief_evolution,
          cross_domain_insights = EXCLUDED.cross_domain_insights,
          expert_invocations = EXCLUDED.expert_invocations,
          model_version = EXCLUDED.model_version,
          processing_time_ms = EXCLUDED.processing_time_ms,
          analyzed_at = NOW()`,
        [
          deep.assetId,
          JSON.stringify(deep.matchedDomainExpertIds),
          deep.matchedSeniorExpertId || null,
          JSON.stringify(deep.matchReasons),
          JSON.stringify(deep.topicRecommendations ?? null),
          JSON.stringify(deep.trendSignals ?? null),
          JSON.stringify(deep.differentiationGaps ?? null),
          JSON.stringify(deep.knowledgeBlanks ?? null),
          JSON.stringify(deep.keyFacts ?? null),
          JSON.stringify(deep.entityGraph ?? null),
          JSON.stringify(deep.deltaReport ?? null),
          JSON.stringify(deep.staleFacts ?? null),
          JSON.stringify(deep.knowledgeCard ?? null),
          JSON.stringify(deep.insights ?? null),
          JSON.stringify(deep.materialRecommendations ?? null),
          JSON.stringify(deep.expertConsensus ?? null),
          JSON.stringify(deep.controversies ?? null),
          JSON.stringify(deep.beliefEvolution ?? null),
          JSON.stringify(deep.crossDomainInsights ?? null),
          JSON.stringify(deep.expertInvocations),
          deep.modelVersion,
          deep.processingTimeMs,
        ],
      );
      console.log(`[PersistenceService] Saved deep analysis for asset ${deep.assetId}`);
    } catch (error) {
      console.error(`[PersistenceService] Failed to save deep analysis for ${deep.assetId}:`, error);
      throw error;
    }
  }

  /**
   * v7.4: 读取深度分析结果
   */
  async getDeepAnalysisResult(assetId: string): Promise<AssetDeepAnalysis | null> {
    const result = await query(
      `SELECT * FROM asset_deep_analysis WHERE asset_id = $1`,
      [assetId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      assetId: row.asset_id,
      matchedDomainExpertIds: row.matched_domain_expert_ids || [],
      matchedSeniorExpertId: row.matched_senior_expert_id || undefined,
      matchReasons: row.match_reasons || [],
      topicRecommendations: row.topic_recommendations,
      trendSignals: row.trend_signals,
      differentiationGaps: row.differentiation_gaps,
      knowledgeBlanks: row.knowledge_blanks,
      keyFacts: row.key_facts,
      entityGraph: row.entity_graph,
      deltaReport: row.delta_report,
      staleFacts: row.stale_facts,
      knowledgeCard: row.knowledge_card,
      insights: row.insights,
      materialRecommendations: row.material_recommendations,
      expertConsensus: row.expert_consensus,
      controversies: row.controversies || [],
      beliefEvolution: row.belief_evolution,
      crossDomainInsights: row.cross_domain_insights,
      expertInvocations: row.expert_invocations || [],
      processingTimeMs: row.processing_time_ms || 0,
      modelVersion: row.model_version || 'v2.0-deep',
    };
  }

  /**
   * 获取去重结果
   */
  async getDuplicateResult(assetId: string): Promise<{
    isDuplicate: boolean;
    duplicateOf?: string;
    similarAssets: Array<{
      assetId: string;
      title: string;
      similarity: number;
    }>;
  } | null> {
    try {
      const result = await query(
        `SELECT duplicate_detection_result FROM asset_ai_analysis WHERE asset_id = $1`,
        [assetId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const data = result.rows[0].duplicate_detection_result;
      return {
        isDuplicate: data?.isDuplicate || false,
        duplicateOf: data?.duplicateOf,
        similarAssets: data?.similarAssets || [],
      };
    } catch (error) {
      console.error('[PersistenceService] Get duplicate result failed:', error);
      return null;
    }
  }
}

// ============================================
// 导出单例
// ============================================
export const persistenceService = new PersistenceService();
