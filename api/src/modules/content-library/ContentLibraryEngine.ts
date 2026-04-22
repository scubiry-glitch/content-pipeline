// Content Library Engine — 核心调度中心
// 零框架依赖，所有外部服务通过 Adapter 接口注入
// 灵感来源: Hermes Agent Memory Providers (Hindsight / OpenViking / RetainDB)

import type {
  ContentLibraryDeps,
  ContentLibraryOptions,
  HybridSearchRequest,
  HybridSearchResult,
  TieredContent,
  TieredLoadOptions,
  TierLevel,
  FactExtractionRequest,
  FactExtractionResult,
  ContentFact,
  ContentEntity,
  ContentBelief,
  Contradiction,
  TopicRecommendation,
  TopicRecommendationsPage,
  ContentFactsPage,
  ContentEntitiesPage,
  TrendSignal,
  DeltaReport,
  KnowledgeCard,
  ConsensusMap,
  ProductionExperience,
} from './types.js';
import { DEFAULT_OPTIONS, CONTENT_LIBRARY_EVENTS } from './types.js';
import { TieredLoader } from './retrieval/tieredLoader.js';
import { HybridSearch } from './retrieval/hybridSearch.js';
import { FactExtractor } from './consolidation/factExtractor.js';
import { EntityResolver } from './consolidation/entityResolver.js';
import { DeltaCompressor } from './consolidation/deltaCompressor.js';
import { WikiGenerator } from './wiki/wikiGenerator.js';
import { CommunityDetector } from './reasoning/communityDetector.js';
import {
  dedupeDataPoints,
  shouldKeepAsTrend,
  computeDynamics,
} from './reasoning/trendSignalQuality.js';
import {
  detectEvolutionPatterns,
  buildConfidenceDeltas,
  type EvolutionPattern,
} from './reasoning/beliefPatternDetector.js';

export class ContentLibraryEngine {
  private deps: ContentLibraryDeps;
  private options: Required<ContentLibraryOptions>;
  private tieredLoader: TieredLoader;
  private hybridSearch: HybridSearch;
  private factExtractor: FactExtractor;
  private entityResolver: EntityResolver;
  private deltaCompressor: DeltaCompressor;
  /** v7.1: Wiki 生成器 (Obsidian 兼容物化视图) */
  readonly wikiGenerator: WikiGenerator;
  /** v7.2: Louvain 社区发现 */
  private communityDetector: CommunityDetector;

  constructor(deps: ContentLibraryDeps, options?: ContentLibraryOptions) {
    this.deps = deps;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Layer 2: 层级加载
    this.tieredLoader = new TieredLoader(deps.db, this.options);

    // Layer 3: 混合检索 (LLM reranking 可选)
    this.hybridSearch = new HybridSearch(deps.db, deps.embedding, deps.textSearch, this.options, deps.llm);

    // Layer 1: 知识整合
    this.factExtractor = new FactExtractor(deps.llm, this.options);
    this.entityResolver = new EntityResolver(deps.db, deps.embedding);
    this.deltaCompressor = new DeltaCompressor(deps.db);

    // v7.1: Wiki 生成器
    this.wikiGenerator = new WikiGenerator(deps.db);

    // v7.2: Louvain 社区发现
    this.communityDetector = new CommunityDetector(deps.db);
  }

  /** v7.2: Louvain 社区重算 */
  async recomputeCommunities() {
    return this.communityDetector.recompute();
  }

  // ============================================================
  // v7.2: Task Purpose Docs 目标锚定
  // ============================================================

  /** 设置/更新任务意图书 */
  async setTaskPurpose(params: {
    taskId: string;
    purposeText: string;
    goalEntities?: string[];
  }): Promise<{ taskId: string; updated: boolean }> {
    const { taskId, purposeText, goalEntities } = params;
    let embedding: number[] | null = null;
    try {
      embedding = await this.deps.embedding.embed(purposeText);
    } catch { /* embedding 可选 */ }

    const result = await this.deps.db.query(
      `INSERT INTO task_purpose_docs (task_id, purpose_text, goal_entities, embedding, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (task_id) DO UPDATE SET
         purpose_text = EXCLUDED.purpose_text,
         goal_entities = EXCLUDED.goal_entities,
         embedding = EXCLUDED.embedding,
         updated_at = NOW()
       RETURNING task_id`,
      [taskId, purposeText, goalEntities || [], embedding ? JSON.stringify(embedding) : null]
    );
    return { taskId, updated: result.rows.length > 0 };
  }

  // ============================================================
  // v7.2: 持久化实体关系边表
  // ============================================================

  /** 重算所有实体关系并写入 content_entity_relations */
  async recomputeEntityRelations(): Promise<{
    processed: number; inserted: number; durationMs: number;
  }> {
    const started = Date.now();

    // 清空旧数据
    await this.deps.db.query('DELETE FROM content_entity_relations');

    // 用 v7.1 的 4 信号 + v7.2 的 Adamic-Adar 一次性计算所有 pair
    const sql = `
      WITH center_pairs AS (
        SELECT DISTINCT
          LEAST(cf1.subject, cf1.object) AS name_a,
          GREATEST(cf1.subject, cf1.object) AS name_b
        FROM content_facts cf1
        WHERE cf1.is_current = true AND cf1.subject != cf1.object
      ),
      direct AS (
        SELECT name_a, name_b, COUNT(*) AS direct_count
        FROM (
          SELECT LEAST(subject, object) AS name_a, GREATEST(subject, object) AS name_b
          FROM content_facts WHERE is_current = true AND subject != object
        ) sub
        GROUP BY name_a, name_b
      ),
      source_ov AS (
        SELECT
          LEAST(cf1.subject, cf2.subject) AS name_a,
          GREATEST(cf1.subject, cf2.subject) AS name_b,
          COUNT(DISTINCT cf1.asset_id) FILTER (WHERE cf1.asset_id = cf2.asset_id) AS shared_assets
        FROM content_facts cf1
        JOIN content_facts cf2 ON cf1.asset_id = cf2.asset_id
          AND cf1.subject < cf2.subject
        WHERE cf1.is_current = true AND cf2.is_current = true
        GROUP BY name_a, name_b
      ),
      relation_info AS (
        SELECT
          LEAST(subject, object) AS name_a,
          GREATEST(subject, object) AS name_b,
          MODE() WITHIN GROUP (ORDER BY predicate) AS top_predicate
        FROM content_facts WHERE is_current = true AND subject != object
        GROUP BY name_a, name_b
      )
      INSERT INTO content_entity_relations
        (entity_a_id, entity_b_id, entity_a_name, entity_b_name, relation_type,
         direct_score, source_overlap_score, type_affinity_score, combined_score,
         common_assets, recomputed_at)
      SELECT
        cea.id, ceb.id, d.name_a, d.name_b,
        COALESCE(ri.top_predicate, ''),
        d.direct_count,
        COALESCE(so.shared_assets, 0),
        CASE WHEN cea.entity_type = ceb.entity_type THEN 1 ELSE 0 END,
        ROUND((3.0 * d.direct_count
             + 4.0 * COALESCE(so.shared_assets, 0)
             + 1.0 * CASE WHEN cea.entity_type = ceb.entity_type THEN 1 ELSE 0 END)::numeric, 3),
        COALESCE(so.shared_assets, 0),
        NOW()
      FROM direct d
      JOIN content_entities cea ON cea.canonical_name = d.name_a
      JOIN content_entities ceb ON ceb.canonical_name = d.name_b
      LEFT JOIN source_ov so ON so.name_a = d.name_a AND so.name_b = d.name_b
      LEFT JOIN relation_info ri ON ri.name_a = d.name_a AND ri.name_b = d.name_b
      ON CONFLICT (entity_a_id, entity_b_id) DO UPDATE SET
        relation_type = EXCLUDED.relation_type,
        direct_score = EXCLUDED.direct_score,
        source_overlap_score = EXCLUDED.source_overlap_score,
        type_affinity_score = EXCLUDED.type_affinity_score,
        combined_score = EXCLUDED.combined_score,
        common_assets = EXCLUDED.common_assets,
        recomputed_at = NOW()
    `;
    const result = await this.deps.db.query(sql);
    const inserted = (result as any).rowCount || 0;

    return {
      processed: inserted,
      inserted,
      durationMs: Date.now() - started,
    };
  }

  /** 读取任务意图书 */
  async getTaskPurpose(taskId: string): Promise<{
    taskId: string; purposeText: string; goalEntities: string[]; updatedAt: string;
  } | null> {
    const result = await this.deps.db.query(
      `SELECT task_id, purpose_text, goal_entities, updated_at FROM task_purpose_docs WHERE task_id = $1`,
      [taskId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      taskId: row.task_id,
      purposeText: row.purpose_text,
      goalEntities: Array.isArray(row.goal_entities) ? row.goal_entities : [],
      updatedAt: row.updated_at,
    };
  }

  // ============================================================
  // Layer 2: 层级加载 (← OpenViking L0/L1/L2)
  // ============================================================

  /** 按层级加载内容 */
  async loadTiered(assetId: string, options?: TieredLoadOptions): Promise<TieredContent> {
    return this.tieredLoader.load(assetId, options);
  }

  /** 批量加载 L0 摘要 */
  async loadL0Batch(assetIds: string[]): Promise<TieredContent[]> {
    return this.tieredLoader.loadBatch(assetIds, 'L0');
  }

  // ============================================================
  // Layer 3: 混合检索 (← RetainDB Vector + BM25 + Reranking)
  // ============================================================

  /** 混合检索 */
  async search(request: HybridSearchRequest): Promise<HybridSearchResult> {
    const result = await this.hybridSearch.search(request);

    if (this.deps.eventBus) {
      await this.deps.eventBus.publish(CONTENT_LIBRARY_EVENTS.SEARCH_COMPLETED, {
        query: request.query,
        resultCount: result.totalCount,
        latencyMs: result.latencyMs,
      });
    }

    return result;
  }

  // ============================================================
  // Layer 1: 知识整合 (← Mem0 + RetainDB)
  // ============================================================

  /** 从内容中提取事实三元组 */
  async extractFacts(request: FactExtractionRequest): Promise<FactExtractionResult> {
    // v7.3: 确保 domain 规范化映射已加载
    await this.factExtractor.loadDomains(this.deps.db);
    // Step 1: LLM 提取事实
    const extraction = await this.factExtractor.extract(request);

    // Step 2: 实体归一化
    for (const entity of extraction.entities) {
      await this.entityResolver.resolveAndRegister(entity);
    }

    // Step 3: Delta 压缩 — 与既有事实比对
    const compressedFacts: typeof extraction.facts = [];
    for (const fact of extraction.facts) {
      if (fact.confidence >= this.options.factConfidenceThreshold) {
        const compressed = await this.deltaCompressor.compress(fact);
        compressedFacts.push(compressed);
      }
    }

    // Step 4: 存储事实
    const storedFacts = await this.storeFacts(compressedFacts);

    if (this.deps.eventBus) {
      await this.deps.eventBus.publish(CONTENT_LIBRARY_EVENTS.FACTS_EXTRACTED, {
        assetId: request.assetId,
        factCount: storedFacts.length,
        entityCount: extraction.entities.length,
      });
    }

    // v7.3: Zep 可选双写 (无 Zep 时静默跳过)
    try {
      const { syncFactsToZep, syncEntitiesToZep } = await import('../../services/zep/index.js');
      await Promise.all([
        syncFactsToZep(compressedFacts),
        syncEntitiesToZep(extraction.entities),
      ]);
    } catch { /* Zep 模块加载失败时忽略 */ }

    return { facts: compressedFacts, entities: extraction.entities };
  }

  /**
   * v7.1: 批量重新提取事实 (手动触发回填)
   *
   * 从 asset_library 读取素材，对每个素材调用两段式 extract()，将结果写入 content_facts。
   * 新事实走 DeltaCompressor，旧事实若被新高置信度事实覆盖则标记 superseded。
   *
   * 查询条件选择 asset (按时间/id)。
   */
  /**
   * v7.1 + v7.2 G1: 批量重新提取事实 (两段式 + 断点续传)
   * - onlyUnprocessed=true 时只处理 last_reextracted_at IS NULL 的素材
   * - 每个 asset 处理完立即写 last_reextracted_at (断点)
   * - 也支持从 rss_items 提取 (source='rss')
   */
  async reextractBatch(options: {
    assetIds?: string[];
    limit?: number;
    since?: string;
    minConfidence?: number;
    dryRun?: boolean;
    onlyUnprocessed?: boolean;
    source?: 'assets' | 'rss';
    /** v7.3 调整1: 利用 Step 2 质量分过滤低质素材 (仅 source='assets') */
    minQualityScore?: number;
  }): Promise<{
    processed: number;
    newFacts: number;
    updatedFacts: number;
    skipped: number;
    errors: number;
    tokenEstimate: number;
    resumable: boolean;
    filteredByQuality: number;
  }> {
    const limit = Math.min(options.limit || 20, 200);
    const minConf = options.minConfidence ?? this.options.factConfidenceThreshold;
    const onlyUnprocessed = options.onlyUnprocessed !== false;
    const source = options.source || 'assets';

    const conds: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (source === 'rss') {
      // 从 rss_items 取内容
      if (options.since) {
        conds.push(`published_at >= $${idx++}`);
        params.push(options.since);
      }
      conds.push(`content IS NOT NULL AND length(trim(content)) > 80`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      params.push(limit);
      const sql = `SELECT id, content, title FROM rss_items ${where} ORDER BY published_at DESC LIMIT $${idx}`;
      var assets = await this.deps.db.query(sql, params);
      // rss items 的 assetId 前缀 rss_
      for (const row of assets.rows) { row._assetId = `rss_${row.id}`; }
    } else {
      // 从 assets / asset_library 取内容
      if (options.assetIds && options.assetIds.length > 0) {
        conds.push(`id = ANY($${idx++}::varchar[])`);
        params.push(options.assetIds);
      }
      if (options.since) {
        conds.push(`created_at >= $${idx++}`);
        params.push(options.since);
      }
      // G1: 断点续传 — 只处理未提取的
      if (onlyUnprocessed) {
        conds.push(`last_reextracted_at IS NULL`);
      }
      // v7.3 调整1: 质量分门槛过滤 (利用 Step 2 的 ai_quality_score)
      if (options.minQualityScore != null && options.minQualityScore > 0) {
        conds.push(`ai_quality_score >= $${idx++}`);
        params.push(options.minQualityScore);
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      params.push(limit);
      // v7.3 调整3: 同时取 ai_theme_id, ai_quality_score 供后续使用
      let sql = `SELECT id, content, ai_theme_id, ai_quality_score FROM assets ${where} ORDER BY created_at DESC LIMIT $${idx}`;
      try {
        var assets = await this.deps.db.query(sql, params);
      } catch {
        sql = `SELECT id, content FROM asset_library ${where} ORDER BY created_at DESC LIMIT $${idx}`;
        var assets = await this.deps.db.query(sql, params);
      }
      for (const row of assets.rows) { row._assetId = row.id; }
    }

    // v7.3: 确保 domain 规范化映射已加载
    await this.factExtractor.loadDomains(this.deps.db);

    let processed = 0;
    let newFacts = 0;
    let updatedFacts = 0;
    let skipped = 0;
    let errors = 0;
    let tokenEstimate = 0;
    let filteredByQuality = 0;

    for (const row of assets.rows) {
      try {
        const content = String(row.content || '').slice(0, 8000);
        if (!content.trim()) {
          skipped++;
          continue;
        }
        tokenEstimate += 5000;

        if (options.dryRun) {
          processed++;
          continue;
        }

        // v7.3 调整3: 传递 themeId 让 fact.context 关联主题分类
        const extraction = await this.factExtractor.extract({
          content,
          assetId: row._assetId || row.id,
          themeId: row.ai_theme_id || undefined,
        });

        for (const entity of extraction.entities) {
          await this.entityResolver.resolveAndRegister(entity);
        }

        const highQuality = extraction.facts.filter(f => f.confidence >= minConf);

        for (const fact of highQuality) {
          // v7.3 调整3: 将 themeId 注入 fact context
          if (row.ai_theme_id && fact.context) {
            fact.context.themeId = row.ai_theme_id;
          }
          const compressed = await this.deltaCompressor.compress(fact);
          if (compressed.supersededBy) {
            updatedFacts++;
          } else {
            newFacts++;
          }
          await this.storeFacts([compressed]);
        }

        // v7.3: Zep 可选双写
        try {
          const { syncFactsToZep } = await import('../../services/zep/index.js');
          await syncFactsToZep(highQuality);
        } catch { /* ignore */ }

        // G1: 断点写入 — 每个 asset 处理完立即标记
        if (source === 'assets' && !options.dryRun) {
          try {
            await this.deps.db.query(
              'UPDATE assets SET last_reextracted_at = NOW() WHERE id = $1',
              [row.id]
            );
          } catch { /* last_reextracted_at 列不存在时忽略 */ }
        }

        processed++;
      } catch (err) {
        console.warn('[reextractBatch] Asset failed:', row._assetId || row.id, err);
        errors++;
      }
    }

    return { processed, newFacts, updatedFacts, skipped, errors, tokenEstimate, resumable: onlyUnprocessed, filteredByQuality };
  }

  /** WHERE 子句构建（事实表）— 供 queryFacts / queryFactsPage 共用 */
  private buildFactsFilter(options: {
    subject?: string;
    predicate?: string;
    domain?: string;
    taxonomy_code?: string;
    currentOnly?: boolean;
  }): { where: string; params: any[]; nextIdx: number } {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.subject) {
      conditions.push(`subject ILIKE $${idx++}`);
      params.push(`%${options.subject}%`);
    }
    if (options.predicate) {
      conditions.push(`predicate ILIKE $${idx++}`);
      params.push(`%${options.predicate}%`);
    }
    if (options.currentOnly !== false) {
      conditions.push('is_current = true');
    }
    if (options.taxonomy_code) {
      const isL1 = /^E\d{2}$/.test(options.taxonomy_code);
      conditions.push(`context->>'taxonomy_code' ${isL1 ? 'LIKE' : '='} $${idx++}`);
      params.push(isL1 ? `${options.taxonomy_code}%` : options.taxonomy_code);
    } else if (options.domain) {
      conditions.push(`context->>'domain' = $${idx++}`);
      params.push(options.domain);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params, nextIdx: idx };
  }

  /** WHERE 子句构建（实体表）— 供 queryEntities / queryEntitiesPage 共用 */
  private buildEntitiesFilter(options: {
    search?: string;
    entityType?: string;
    domainId?: string;
  }): { where: string; params: any[]; nextIdx: number } {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.search) {
      conditions.push(`(canonical_name ILIKE $${idx} OR $${idx} = ANY(aliases))`);
      params.push(`%${options.search}%`);
      idx++;
    }
    if (options.entityType) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(options.entityType);
    }
    if (options.domainId) {
      conditions.push(`taxonomy_domain_id = $${idx++}`);
      params.push(options.domainId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params, nextIdx: idx };
  }

  /** 查询事实 */
  async queryFacts(options: {
    subject?: string;
    predicate?: string;
    entityId?: string;
    domain?: string;
    taxonomy_code?: string;
    currentOnly?: boolean;
    limit?: number;
  }): Promise<ContentFact[]> {
    const { where, params, nextIdx } = this.buildFactsFilter(options);
    const limit = options.limit || this.options.defaultSearchLimit;

    const result = await this.deps.db.query(
      `SELECT * FROM content_facts ${where} ORDER BY created_at DESC LIMIT $${nextIdx}`,
      [...params, limit]
    );

    return result.rows.map(this.mapFact);
  }

  /** 分页查询事实（HTTP GET /facts） */
  async queryFactsPage(options: {
    subject?: string;
    predicate?: string;
    domain?: string;
    taxonomy_code?: string;
    currentOnly?: boolean;
    limit?: number;
    offset?: number;
    page?: number;
  }): Promise<ContentFactsPage> {
    const { where, params, nextIdx } = this.buildFactsFilter(options);
    const limit = Math.min(Math.max(options.limit ?? this.options.defaultSearchLimit, 1), 200);
    let offset = options.offset ?? 0;
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(offset, 0);
    if (options.page != null && options.page > 0 && Number.isFinite(options.page)) {
      offset = (options.page - 1) * limit;
    }

    const countResult = await this.deps.db.query(
      `SELECT COUNT(*)::int AS c FROM content_facts ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.c ?? 0);

    const result = await this.deps.db.query(
      `SELECT * FROM content_facts ${where} ORDER BY created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...params, limit, offset]
    );

    return {
      items: result.rows.map(this.mapFact),
      total,
      limit,
      offset,
    };
  }

  /** 查询实体 */
  async queryEntities(options: {
    search?: string;
    entityType?: string;
    domainId?: string;
    limit?: number;
  }): Promise<ContentEntity[]> {
    const { where, params, nextIdx } = this.buildEntitiesFilter(options);
    const limit = options.limit || this.options.defaultSearchLimit;

    const result = await this.deps.db.query(
      `SELECT * FROM content_entities ${where} ORDER BY updated_at DESC LIMIT $${nextIdx}`,
      [...params, limit]
    );

    return result.rows.map(this.mapEntity);
  }

  /** 分页查询实体（HTTP GET /entities） */
  async queryEntitiesPage(options: {
    search?: string;
    entityType?: string;
    domainId?: string;
    limit?: number;
    offset?: number;
    page?: number;
  }): Promise<ContentEntitiesPage> {
    const { where, params, nextIdx } = this.buildEntitiesFilter(options);
    const limit = Math.min(Math.max(options.limit ?? this.options.defaultSearchLimit, 1), 200);
    let offset = options.offset ?? 0;
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(offset, 0);
    if (options.page != null && options.page > 0 && Number.isFinite(options.page)) {
      offset = (options.page - 1) * limit;
    }

    const countResult = await this.deps.db.query(
      `SELECT COUNT(*)::int AS c FROM content_entities ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.c ?? 0);

    const result = await this.deps.db.query(
      `SELECT * FROM content_entities ${where} ORDER BY updated_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...params, limit, offset]
    );

    return {
      items: result.rows.map(this.mapEntity),
      total,
      limit,
      offset,
    };
  }

  // ============================================================
  // 辅助查询: 下拉选项列表
  // ============================================================

  /** 获取所有 distinct domain 列表 (用于下拉选择)
   *  v7.3: 合并 content_facts 中的 domain + asset_themes 中的分类名称
   */
  async listDomains(): Promise<string[]> {
    const safeQuery = async (sql: string) => {
      try { return (await this.deps.db.query(sql)).rows; } catch { return []; }
    };
    const [factDomains, themes] = await Promise.all([
      safeQuery(`SELECT DISTINCT context->>'domain' AS domain FROM content_facts
       WHERE is_current = true AND context->>'domain' IS NOT NULL AND context->>'domain' != ''`),
      safeQuery('SELECT name FROM asset_themes ORDER BY sort_order'),
    ]);
    const set = new Set<string>();
    for (const r of themes) if (r.name) set.add(r.name);
    for (const r of factDomains) if (r.domain) set.add(r.domain);
    return [...set].sort();
  }

  /** 获取所有 belief subjects 列表 (用于下拉选择) */
  async listBeliefSubjects(): Promise<Array<{ id: string; subject: string; state: string }>> {
    // 优先从 content_beliefs 取，若空则用有事实的实体名作为 subject 列表
    const fromBeliefs = await this.deps.db.query(
      `SELECT id, COALESCE(proposition, '') AS subject, current_stance AS state
       FROM content_beliefs ORDER BY last_updated DESC LIMIT 100`
    );
    if (fromBeliefs.rows.length > 0) {
      return fromBeliefs.rows.map((r: any) => ({ id: r.id, subject: r.subject, state: r.state }));
    }
    // Fallback: 用 content_entities 中有事实的实体名作候选
    const fromEntities = await this.deps.db.query(
      `SELECT ce.id, ce.canonical_name AS subject, 'entity' AS state
       FROM content_entities ce
       WHERE EXISTS (SELECT 1 FROM content_facts cf WHERE cf.subject = ce.canonical_name AND cf.is_current = true)
       ORDER BY ce.canonical_name ASC LIMIT 100`
    );
    return fromEntities.rows.map((r: any) => ({ id: r.id, subject: r.subject, state: r.state }));
  }

  /** 获取实体简要列表 (用于下拉选择, 按事实密度排序) */
  async listEntitiesForDropdown(limit = 50): Promise<Array<{ id: string; name: string; type: string; factCount: number; coreDataCount: number }>> {
    const result = await this.deps.db.query(
      `SELECT
         ce.id, ce.canonical_name, ce.entity_type,
         COUNT(cf.id) AS fact_count,
         COUNT(cf.id) FILTER (
           WHERE
             -- object 是数值 + 单位（如 "40亿人民币"、"200亿"、"30%"）
             (cf.object ~ '\d' AND (cf.object ~ '[亿万元%增减]' OR cf.object ~ '^\d+\.?\d*$'))
             -- 或谓词是典型财务/指标字段
             OR cf.predicate ~ '(融资|估值|营收|净利|市值|总额|增速|占比|规模|体量|份额)'
         ) AS core_data_count
       FROM content_entities ce
       LEFT JOIN content_facts cf ON cf.subject = ce.canonical_name AND cf.is_current = true
       GROUP BY ce.id, ce.canonical_name, ce.entity_type
       ORDER BY COUNT(cf.id) DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.canonical_name,
      type: r.entity_type,
      factCount: Number(r.fact_count),
      coreDataCount: Number(r.core_data_count),
    }));
  }

  // ============================================================
  // 产出物 API (15 类可消费产出物)
  // ============================================================

  /** ① 有价值的议题推荐 */
  /**
   * ① 议题推荐 (v7.2: LLM 增强 — 每条议题附带 reason/title/narrative/angles)
   */
  async getTopicRecommendations(options?: {
    domain?: string;
    taxonomy_code?: string;
    limit?: number;
    /** 从 0 开始的跳过条数 */
    offset?: number;
    /** 1-based 页码；若设置则覆盖 offset */
    page?: number;
    /** 排序方式：score=综合分(默认)，time=最近事实时间 */
    sortBy?: 'score' | 'time';
    /** 排序方向：desc=倒序(默认)，asc=正序 */
    sortOrder?: 'asc' | 'desc';
    enrich?: boolean;   // true = 强制重新生成并保存缓存；false/undefined = 仅读缓存
  }): Promise<TopicRecommendationsPage> {
    const rawLimit = options?.limit ?? 10;
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 200);
    let offset = options?.offset ?? 0;
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(offset, 0);
    if (options?.page != null && options.page > 0 && Number.isFinite(options.page)) {
      offset = (options.page - 1) * limit;
    }
    const forceEnrich = options?.enrich === true;
    // Prefer taxonomy_code (L1 -> LIKE prefix); fall back to legacy domain exact match.
    const tcode = options?.taxonomy_code;
    const useTaxCode = !!tcode;
    const taxIsL1 = useTaxCode && /^E\d{2}$/.test(tcode!);
    const taxValue = useTaxCode ? (taxIsL1 ? `${tcode}%` : tcode!) : null;
    const taxOp = taxIsL1 ? 'LIKE' : '=';
    const hasFilter = useTaxCode || !!options?.domain;
    const domainFilter = hasFilter
      ? (useTaxCode
          ? `AND ce.taxonomy_domain_id ${taxOp} $3`
          : `AND ce.taxonomy_domain_id = $3`)
      : '';
    const filterValue = useTaxCode ? taxValue : options?.domain;
    const listParams: any[] = hasFilter ? [limit, offset, filterValue] : [limit, offset];

    const countSql = `
      SELECT COUNT(*)::int AS total FROM (
        SELECT ce.id
        FROM content_entities ce
        LEFT JOIN content_facts cf ON cf.subject = ce.canonical_name AND cf.is_current = true
        WHERE 1=1 ${hasFilter ? (useTaxCode ? `AND ce.taxonomy_domain_id ${taxOp} $1` : 'AND ce.taxonomy_domain_id = $1') : ''}
        GROUP BY ce.id
        HAVING COUNT(cf.id) > 0
      ) sub`;
    const countParams = hasFilter ? [filterValue] : [];
    let total = 0;
    try {
      const countResult = await this.deps.db.query(countSql, countParams);
      total = Number(countResult.rows[0]?.total ?? 0);
    } catch {
      total = 0;
    }

    const sortOrder = options?.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const topicOrderBy = options?.sortBy === 'time'
      ? `MAX(cf.created_at) ${sortOrder} NULLS LAST, ce.created_at ${sortOrder}`
      : `COUNT(cf.id) * AVG(cf.confidence) ${sortOrder}`;

    const result = await this.deps.db.query(`
      SELECT
        ce.id as entity_id,
        ce.canonical_name as entity_name,
        ce.created_at as entity_created_at,
        ce.updated_at as entity_updated_at,
        ce.community_id,
        ce.community_cohesion,
        COUNT(cf.id) as fact_count,
        MAX(cf.created_at) as latest_fact,
        AVG(cf.confidence) as avg_confidence
      FROM content_entities ce
      LEFT JOIN content_facts cf ON cf.subject = ce.canonical_name AND cf.is_current = true
      WHERE 1=1 ${domainFilter}
      GROUP BY ce.id, ce.canonical_name, ce.community_id, ce.community_cohesion
      HAVING COUNT(cf.id) > 0
      ORDER BY ${topicOrderBy}
      LIMIT $1 OFFSET $2
    `, listParams);

    // 基础结果 (纯指标)
    const base: TopicRecommendation[] = result.rows.map((row: any) => ({
      entityId: row.entity_id,
      entityName: row.entity_name,
      score: Number(row.fact_count) * Number(row.avg_confidence),
      factDensity: Number(row.fact_count),
      timeliness: this.calculateTimeliness(row.latest_fact),
      createdAt: row.entity_created_at || undefined,
      updatedAt: row.latest_fact || row.entity_updated_at || row.entity_created_at || undefined,
      gapScore: 0,
      suggestedAngles: [] as string[],
      reason: '',
      titleSuggestion: '',
      narrative: '',
      evidenceFacts: [] as Array<{ subject: string; predicate: string; object: string; confidence: number }>,
      angleMatrix: [] as Array<{ angle: string; rationale: string }>,
      communityId: row.community_id || undefined,
      communityCohesion: row.community_cohesion ? Number(row.community_cohesion) : undefined,
    }));

    if (base.length === 0) {
      return { items: [], total, limit, offset };
    }

    // 读取缓存
    const entityIds = base.map(b => `'${b.entityId}'`).join(',');
    try {
      const cacheResult = await this.deps.db.query(
        `SELECT entity_id, reason, title_suggestion, narrative, angle_matrix, suggested_angles
         FROM content_topic_enrichments WHERE entity_id IN (${entityIds})`
      );
      for (const row of cacheResult.rows) {
        const item = base.find(b => b.entityId === row.entity_id);
        if (item) {
          item.reason = row.reason || '';
          item.titleSuggestion = row.title_suggestion || '';
          item.narrative = row.narrative || '';
          item.angleMatrix = Array.isArray(row.angle_matrix) ? row.angle_matrix : [];
          item.suggestedAngles = Array.isArray(row.suggested_angles) ? row.suggested_angles : [];
        }
      }
    } catch { /* 缓存表不存在时忽略 */ }

    if (!forceEnrich) return { items: base, total, limit, offset };

    // 强制重新生成：对 top 5 调 LLM，写回缓存
    const enrichLimit = Math.min(limit, 5);
    const topItems = base.slice(0, enrichLimit);

    // 加载证据事实
    for (const item of topItems) {
      try {
        const factsResult = await this.deps.db.query(
          `SELECT subject, predicate, object, confidence FROM content_facts
           WHERE subject = $1 AND is_current = true ORDER BY confidence DESC LIMIT 5`,
          [item.entityName]
        );
        item.evidenceFacts = factsResult.rows.map((f: any) => ({
          subject: f.subject, predicate: f.predicate, object: f.object, confidence: Number(f.confidence),
        }));
      } catch { /* ignore */ }
    }

    try {
      const enricher = new (await import('./reasoning/llmEnricher.js')).LLMEnricher(this.deps.llm);
      const { enriched, error } = await enricher.enrich<TopicRecommendation, any>({
        items: topItems,
        systemPrompt: `你是内容选题编辑。根据候选议题的事实证据，为每个议题产出 JSON 数组。
每个元素: {"entityName":"实体名","reason":"一句话为什么现在值得写","titleSuggestion":"15~25字建议标题","narrative":"80~120字选题会导语","angleMatrix":[{"angle":"角度","rationale":"为什么有料"}]}
严格输出 JSON 数组, 不要 markdown 代码块, 不要多余文字。`,
        buildUserPrompt: (items) => {
          const lines = items.map((t, i) => {
            const evidenceLines = (t.evidenceFacts || []).map(
              (f: any) => `  - ${f.subject} · ${f.predicate} → ${f.object} (${Math.round(f.confidence * 100)}%)`
            ).join('\n');
            return `${i + 1}. ${t.entityName}  密度=${t.factDensity} 时效=${t.timeliness.toFixed(2)} 分数=${t.score.toFixed(2)}\n${evidenceLines || '  (无证据事实)'}`;
          }).join('\n\n');
          return `候选议题:\n\n${lines}\n\n请为每个议题生成 reason/titleSuggestion/narrative/angleMatrix (JSON 数组):`;
        },
        parseResponse: (parsed: any) => {
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.topics)) return parsed.topics;
          return [];
        },
        maxTokens: 3000,
        fallback: [],
      });

      if (!error && enriched.length > 0) {
        for (const e of enriched) {
          const match = topItems.find(t =>
            t.entityName === e.entityName ||
            t.entityName.includes(e.entityName) ||
            e.entityName?.includes(t.entityName)
          );
          if (!match) continue;
          match.reason = String(e.reason || '');
          match.titleSuggestion = String(e.titleSuggestion || '');
          match.narrative = String(e.narrative || '');
          if (Array.isArray(e.angleMatrix)) {
            match.angleMatrix = e.angleMatrix.map((a: any) => ({
              angle: String(a?.angle || ''),
              rationale: String(a?.rationale || ''),
            }));
            match.suggestedAngles = (match.angleMatrix ?? []).map((a: any) => a.angle).filter(Boolean);
          }
          // 写入缓存
          try {
            await this.deps.db.query(
              `INSERT INTO content_topic_enrichments
                 (entity_id, reason, title_suggestion, narrative, angle_matrix, suggested_angles, generated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (entity_id) DO UPDATE SET
                 reason = EXCLUDED.reason,
                 title_suggestion = EXCLUDED.title_suggestion,
                 narrative = EXCLUDED.narrative,
                 angle_matrix = EXCLUDED.angle_matrix,
                 suggested_angles = EXCLUDED.suggested_angles,
                 generated_at = NOW()`,
              [
                match.entityId,
                match.reason,
                match.titleSuggestion,
                match.narrative,
                JSON.stringify(match.angleMatrix),
                JSON.stringify(match.suggestedAngles),
              ]
            );
          } catch (saveErr) {
            console.warn('[getTopicRecommendations] cache save failed:', saveErr);
          }
        }
      }
    } catch (err) {
      console.warn('[getTopicRecommendations] LLM enrich failed:', err);
    }

    return { items: base, total, limit, offset };
  }

  /** ② 趋势信号 */
  async getTrendSignals(entityId: string): Promise<TrendSignal[]> {
    // entityId 可能是 UUID 或实体名，兼容两种查询
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId);
    const result = await this.deps.db.query(`
      SELECT
        cf.subject,
        cf.predicate,
        cf.object,
        cf.context,
        cf.created_at
      FROM content_facts cf
      JOIN content_entities ce ON cf.subject = ce.canonical_name
      WHERE ${isUuid ? 'ce.id = $1' : 'ce.canonical_name = $1'} AND cf.is_current = true
      ORDER BY cf.created_at ASC
    `, [entityId]);

    // 按 predicate 分组
    const grouped = new Map<string, typeof result.rows>();
    for (const row of result.rows) {
      const key = row.predicate;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    const signals: TrendSignal[] = [];
    for (const [metric, rawRows] of grouped) {
      // 去重 + 时间校验
      const cleaned = dedupeDataPoints(rawRows as any);
      // 静态指标 / 单点 / 单一值 直接跳过
      if (!shouldKeepAsTrend(metric, cleaned)) continue;

      const dynamics = computeDynamics(cleaned);
      signals.push({
        entityId,
        entityName: rawRows[0].subject,
        metric,
        direction: dynamics.direction,
        dataPoints: cleaned.map(dp => ({
          time: dp.time,
          value: dp.value,
          source: dp.source,
          citationCount: dp.citationCount,
        })),
        significance: dynamics.significance,
        velocity: dynamics.velocity,
        velocityLabel: dynamics.velocityLabel,
        acceleration: dynamics.acceleration,
        forecastNote: dynamics.forecastNote,
      });
    }

    return signals;
  }

  /** ⑤ 关键事实查询 (高置信度) */
  async getKeyFacts(options: {
    subject?: string;
    domain?: string;
    taxonomy_code?: string;
    limit?: number;
  }): Promise<ContentFact[]> {
    return this.queryFacts({
      ...options,
      currentOnly: true,
    });
  }

  /**
   * ⑥ 实体关系图谱 (v7.1: 4 信号加权评分)
   *
   * 受 nashsu/llm_wiki 启发，用四个信号的加权合成替代原来的简单 COUNT:
   *   score = 3.0 × direct_links       (直接共现事实数)
   *         + 4.0 × source_overlap     (共享 asset 数 — 最强信号)
   *         + 1.0 × type_affinity      (同类型加成)
   * Adamic-Adar 信号留待 Tier 2
   */
  async getEntityGraph(entityId: string): Promise<{
    center: ContentEntity;
    relations: Array<{
      entity: ContentEntity;
      relation: string;
      strength: number;
      breakdown: { direct: number; sourceOverlap: number; typeAffinity: number };
    }>;
  }> {
    const entityResult = await this.deps.db.query(
      'SELECT * FROM content_entities WHERE id = $1', [entityId]
    );
    if (entityResult.rows.length === 0) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const center = this.mapEntity(entityResult.rows[0]);

    // v7.1 加权查询:
    //  - direct_links: 中心实体与邻居在同一 content_fact 里共现的次数
    //  - source_overlap: 中心实体与邻居出现在同一 asset_id 里的 DISTINCT 数
    //  - type_affinity: 同 entity_type 时为 1，否则 0
    const relatedResult = await this.deps.db.query(`
      WITH center_assets AS (
        SELECT DISTINCT asset_id
        FROM content_facts
        WHERE (subject = $1 OR object = $1) AND is_current = true
      ),
      direct_edges AS (
        SELECT
          CASE WHEN subject = $1 THEN object ELSE subject END AS neighbor_name,
          predicate AS relation,
          COUNT(*) AS direct_links
        FROM content_facts
        WHERE (subject = $1 OR object = $1) AND is_current = true
        GROUP BY neighbor_name, predicate
      ),
      neighbor_source_overlap AS (
        SELECT
          CASE WHEN subject = $1 THEN object ELSE subject END AS neighbor_name,
          COUNT(DISTINCT asset_id) FILTER (WHERE asset_id IN (SELECT asset_id FROM center_assets)) AS shared_assets
        FROM content_facts
        WHERE (subject = $1 OR object = $1) AND is_current = true
        GROUP BY neighbor_name
      ),
      agg AS (
        SELECT
          de.neighbor_name,
          MAX(de.relation) AS relation,
          SUM(de.direct_links) AS direct_links,
          COALESCE(MAX(nso.shared_assets), 0) AS source_overlap
        FROM direct_edges de
        LEFT JOIN neighbor_source_overlap nso ON nso.neighbor_name = de.neighbor_name
        GROUP BY de.neighbor_name
      )
      SELECT
        ce.id, ce.canonical_name, ce.aliases, ce.entity_type,
        ce.taxonomy_domain_id, ce.metadata, ce.created_at, ce.updated_at,
        agg.direct_links, agg.source_overlap, agg.relation,
        CASE WHEN ce.entity_type = $2 THEN 1 ELSE 0 END AS type_affinity
      FROM agg
      JOIN content_entities ce ON ce.canonical_name = agg.neighbor_name
      WHERE ce.canonical_name != $1
      ORDER BY
        (3.0 * agg.direct_links + 4.0 * agg.source_overlap +
         1.0 * CASE WHEN ce.entity_type = $2 THEN 1 ELSE 0 END) DESC
      LIMIT 20
    `, [center.canonicalName, center.entityType]);

    return {
      center,
      relations: relatedResult.rows.map(row => {
        const direct = Number(row.direct_links) || 0;
        const sourceOverlap = Number(row.source_overlap) || 0;
        const typeAffinity = Number(row.type_affinity) || 0;
        const strength = 3.0 * direct + 4.0 * sourceOverlap + 1.0 * typeAffinity;
        return {
          entity: this.mapEntity(row),
          relation: row.relation,
          strength: Math.round(strength * 100) / 100,
          breakdown: { direct, sourceOverlap, typeAffinity },
        };
      }),
    };
  }

  /** ⑦ 信息增量报告 */
  async getDeltaReport(since: Date): Promise<DeltaReport> {
    const now = new Date();

    const [newFacts, updatedFacts, refutedFacts] = await Promise.all([
      this.deps.db.query(
        `SELECT * FROM content_facts WHERE created_at >= $1 AND is_current = true ORDER BY created_at DESC`,
        [since]
      ),
      this.deps.db.query(
        `SELECT cf_new.*, cf_old.subject as old_subject, cf_old.object as old_object
         FROM content_facts cf_new
         JOIN content_facts cf_old ON cf_old.superseded_by = cf_new.id
         WHERE cf_new.created_at >= $1`,
        [since]
      ),
      this.deps.db.query(
        `SELECT * FROM content_facts WHERE is_current = false AND superseded_by IS NOT NULL
         AND created_at < $1
         ORDER BY created_at DESC`,
        [since]
      ),
    ]);

    return {
      period: { from: since, to: now },
      newFacts: newFacts.rows.map(this.mapFact),
      updatedFacts: updatedFacts.rows.map(row => ({
        old: { ...this.mapFact(row), subject: row.old_subject, object: row.old_object },
        new: this.mapFact(row),
      })),
      refutedFacts: refutedFacts.rows.map(this.mapFact),
      summary: `新增 ${newFacts.rows.length} 条事实，更新 ${updatedFacts.rows.length} 条，推翻 ${refutedFacts.rows.length} 条`,
    };
  }

  /** ⑧ 事实保鲜度报告 */
  async getStaleFacts(options?: {
    maxAgeDays?: number;
    domain?: string;
    taxonomy_code?: string;
    limit?: number;
  }): Promise<ContentFact[]> {
    const maxAge = options?.maxAgeDays || 90;
    const limit = options?.limit || 50;
    let domainFilter = '';
    const params: any[] = [maxAge, limit];
    if (options?.taxonomy_code) {
      const isL1 = /^E\d{2}$/.test(options.taxonomy_code);
      domainFilter = `AND context->>'taxonomy_code' ${isL1 ? 'LIKE' : '='} $3`;
      params.push(isL1 ? `${options.taxonomy_code}%` : options.taxonomy_code);
    } else if (options?.domain) {
      domainFilter = `AND context->>'domain' = $3`;
      params.push(options.domain);
    }

    const result = await this.deps.db.query(`
      SELECT * FROM content_facts
      WHERE is_current = true
      AND created_at < NOW() - INTERVAL '1 day' * $1
      ${domainFilter}
      ORDER BY created_at ASC
      LIMIT $2
    `, params);

    return result.rows.map(this.mapFact);
  }

  /** ⑨ 高密度知识卡片 */
  async getKnowledgeCard(entityId: string): Promise<KnowledgeCard> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId);
    const entityResult = await this.deps.db.query(
      isUuid ? 'SELECT * FROM content_entities WHERE id = $1'
             : 'SELECT * FROM content_entities WHERE canonical_name = $1',
      [entityId]
    );
    if (entityResult.rows.length === 0) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const entity = this.mapEntity(entityResult.rows[0]);

    const factsResult = await this.deps.db.query(`
      SELECT * FROM content_facts
      WHERE subject = $1 AND is_current = true
      ORDER BY confidence DESC, created_at DESC
      LIMIT 10
    `, [entity.canonicalName]);

    const relatedResult = await this.deps.db.query(`
      SELECT DISTINCT ce.id, ce.canonical_name, cf.predicate
      FROM content_facts cf
      JOIN content_entities ce ON cf.object = ce.canonical_name
      WHERE cf.subject = $1 AND cf.is_current = true AND ce.canonical_name != $1
      LIMIT 5
    `, [entity.canonicalName]);

    const facts = factsResult.rows.map(this.mapFact);
    const maxAge = 90;

    return {
      entityId: entity.id,
      entityName: entity.canonicalName,
      entityType: entity.entityType,
      coreData: facts.slice(0, 5).map(f => ({
        label: f.predicate,
        value: f.object,
        freshness: this.getFactFreshness(f.createdAt, maxAge),
      })),
      latestFacts: facts,
      relatedEntities: relatedResult.rows.map(row => ({
        id: row.id,
        name: row.canonical_name,
        relation: row.predicate,
      })),
      tokenCount: Math.round(JSON.stringify(facts).length / 4),
    };
  }

  /** ⑬ 争议话题 (矛盾检测) */
  async getContradictions(options?: {
    domain?: string;
    severity?: 'low' | 'medium' | 'high';
    limit?: number;
  }): Promise<Contradiction[]> {
    // 简化版：找同一 subject+predicate 但 object 不同的事实对
    const limit = options?.limit || 20;

    const result = await this.deps.db.query(`
      SELECT
        cf1.id as fact_a_id, cf1.subject, cf1.predicate,
        cf1.object as object_a, cf1.context as context_a, cf1.confidence as conf_a, cf1.created_at as created_a,
        cf2.id as fact_b_id, cf2.object as object_b, cf2.context as context_b, cf2.confidence as conf_b, cf2.created_at as created_b
      FROM content_facts cf1
      JOIN content_facts cf2 ON cf1.subject = cf2.subject AND cf1.predicate = cf2.predicate
      WHERE cf1.is_current = true AND cf2.is_current = true
      AND cf1.id < cf2.id
      AND cf1.object != cf2.object
      ORDER BY (cf1.confidence + cf2.confidence) DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      id: `${row.fact_a_id}-${row.fact_b_id}`,
      factA: {
        id: row.fact_a_id, assetId: '', subject: row.subject, predicate: row.predicate,
        object: row.object_a, context: row.context_a || {}, confidence: row.conf_a,
        isCurrent: true, createdAt: row.created_a,
      },
      factB: {
        id: row.fact_b_id, assetId: '', subject: row.subject, predicate: row.predicate,
        object: row.object_b, context: row.context_b || {}, confidence: row.conf_b,
        isCurrent: true, createdAt: row.created_b,
      },
      description: `"${row.subject}"的"${row.predicate}"存在矛盾: "${row.object_a}" vs "${row.object_b}"`,
      severity: (row.conf_a + row.conf_b) > 1.6 ? 'high' : (row.conf_a + row.conf_b) > 1.2 ? 'medium' : 'low',
      detectedAt: new Date(),
    }));
  }

  /** ⑩ 有价值的认知 — 先读缓存，命中直接返回；未命中调用 LLM 并写缓存 */
  async synthesizeInsights(options?: {
    subjects?: string[];
    domain?: string;
    taxonomy_code?: string;
    limit?: number;
    forceRefresh?: boolean;  // true = 跳过缓存，强制重新生成
  }): Promise<{ insights: Array<{ text: string; sources: string[]; confidence: number }>; summary: string; error?: string; factsUsed?: number; fromCache?: boolean }> {
    // 构建 cache_key
    let cacheKey: string;
    if (options?.subjects && options.subjects.length === 1) {
      cacheKey = `entity:${options.subjects[0]}`;
    } else if (!options?.subjects?.length && options?.domain) {
      cacheKey = `domain:${options.domain}`;
    } else if (!options?.subjects?.length && !options?.domain) {
      cacheKey = 'global';
    } else {
      cacheKey = `multi:${(options?.subjects || []).sort().join('+')}`;
    }

    // 读缓存（forceRefresh 时跳过）
    if (!options?.forceRefresh) {
      try {
        const cached = await this.deps.db.query(
          `SELECT insights, summary, facts_used FROM content_synthesis_cache WHERE cache_key = $1`,
          [cacheKey],
        );
        if (cached.rows.length > 0) {
          const row = cached.rows[0];
          const insights = Array.isArray(row.insights) ? row.insights : JSON.parse(row.insights || '[]');
          return { insights, summary: row.summary, factsUsed: row.facts_used, fromCache: true };
        }
      } catch { /* 缓存读取失败不影响主流程 */ }
    }

    // 调用 LLM 生成
    const result = await this.synthesizeInsightsRaw(options);

    // 写缓存（生成成功时）
    if (result.insights.length > 0 && !result.error) {
      try {
        await this.deps.db.query(`
          INSERT INTO content_synthesis_cache
            (cache_key, scope_type, scope_value, insights, summary, facts_used, generated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (cache_key) DO UPDATE SET
            insights = EXCLUDED.insights,
            summary = EXCLUDED.summary,
            facts_used = EXCLUDED.facts_used,
            generated_at = NOW()
        `, [
          cacheKey,
          cacheKey.startsWith('entity:') ? 'entity' : cacheKey.startsWith('domain:') ? 'domain' : 'global',
          options?.subjects?.[0] ?? options?.domain ?? null,
          JSON.stringify(result.insights),
          result.summary || '',
          result.factsUsed || 0,
        ]);
      } catch { /* 缓存写入失败不影响返回 */ }
    }

    return { ...result, fromCache: false };
  }

  /** ⑩ 内部：直接调 LLM，不经过缓存（供 synthesisJob 调用） */
  async synthesizeInsightsRaw(options?: {
    subjects?: string[];
    domain?: string;
    taxonomy_code?: string;
    limit?: number;
  }): Promise<{ insights: Array<{ text: string; sources: string[]; confidence: number }>; summary: string; error?: string; factsUsed?: number }> {
    const limit = options?.limit || 10;

    // B1 fix: 两阶段降级 (> 0.5 → > 0.3)，保证能取到事实
    // B2 fix: context->>'domain' 用 ->> 取文本值
    let factsResult: any = { rows: [] };
    for (const threshold of [0.5, 0.3, 0.0]) {
      // 过滤条件：支持 subjects（IN 列表） + domain（context 字段）
      const conditions: string[] = [`is_current = true`, `confidence > ${threshold}`];
      const params: any[] = [];
      if (options?.subjects && options.subjects.length > 0) {
        params.push(options.subjects);
        conditions.push(`subject = ANY($${params.length})`);
      }
      if (options?.domain) {
        params.push(options.domain);
        conditions.push(`context->>'domain' = $${params.length}`);
      }
      if (options?.taxonomy_code) {
        const isL1 = /^E\d{2}$/.test(options.taxonomy_code);
        params.push(isL1 ? `${options.taxonomy_code}%` : options.taxonomy_code);
        conditions.push(`context->>'taxonomy_code' ${isL1 ? 'LIKE' : '='} $${params.length}`);
      }
      params.push(limit * 5);
      const factsQuery = `
        SELECT DISTINCT subject, predicate, object, confidence, context
        FROM content_facts
        WHERE ${conditions.join(' AND ')}
        ORDER BY confidence DESC
        LIMIT $${params.length}
      `;
      factsResult = await this.deps.db.query(factsQuery, params);
      if (factsResult.rows.length >= 3) break;  // 至少 3 条才有价值
    }

    if (factsResult.rows.length === 0) {
      return {
        insights: [],
        summary: '内容库中暂无事实数据。请先导入素材并执行事实提取。',
        error: 'NO_FACTS',
        factsUsed: 0,
      };
    }

    // B5 fix: 中文 prompt
    const factsText = factsResult.rows.map((f: any) =>
      `- ${f.subject} · ${f.predicate} → ${f.object} (${Math.round(Number(f.confidence) * 100)}%)`
    ).join('\n');

    const systemPrompt = `你是内容认知综合引擎。根据用户提供的结构化事实，综合提炼出 3~5 条有价值的洞察。
每条洞察是一个完整的、可操作的结论性判断 (不是事实的简单重述)。
严格输出 JSON 数组，不要 markdown 代码块，不要多余文字。
格式: [{"text": "洞察内容 (一两句话)", "sources": ["主体·谓词"], "confidence": 0.0-1.0}]`;

    const userPrompt = `以下是从内容库中提取的 ${factsResult.rows.length} 条高置信度事实:\n\n${factsText}\n\n请综合提炼洞察 (JSON 数组):`;

    try {
      // B3 fix: maxTokens 2048
      const response = await this.deps.llm.completeWithSystem(
        systemPrompt,
        userPrompt,
        { temperature: 0.3, maxTokens: 2048, responseFormat: 'json' }
      );

      // B4 fix: 双格式解析 — 先尝试 [...], 再尝试 {insights: [...]}
      const insights: Array<{ text: string; sources: string[]; confidence: number }> = [];
      let parsed: any;
      try {
        // 清理 markdown fence
        let cleaned = response.trim();
        const fence = /```(?:json)?\s*([\s\S]*?)```/i;
        const fm = cleaned.match(fence);
        if (fm) cleaned = fm[1].trim();

        // 尝试 JSON.parse
        parsed = JSON.parse(cleaned);
      } catch {
        // 尝试找到第一个 [ 或 {
        const arrMatch = response.match(/\[[\s\S]*\]/);
        const objMatch = response.match(/\{[\s\S]*\}/);
        if (arrMatch) {
          try { parsed = JSON.parse(arrMatch[0].replace(/,\s*([\]}])/g, '$1')); } catch { /* */ }
        }
        if (!parsed && objMatch) {
          try { parsed = JSON.parse(objMatch[0].replace(/,\s*([\]}])/g, '$1')); } catch { /* */ }
        }
      }

      if (Array.isArray(parsed)) {
        insights.push(...parsed);
      } else if (parsed && Array.isArray(parsed.insights)) {
        insights.push(...parsed.insights);
      }

      // 规范化
      const normalized = insights
        .filter(i => i && typeof i.text === 'string' && i.text.trim())
        .map(i => ({
          text: String(i.text).trim(),
          sources: Array.isArray(i.sources) ? i.sources.map(String) : [],
          confidence: typeof i.confidence === 'number' ? i.confidence : 0.5,
        }))
        .slice(0, limit);

      return {
        insights: normalized,
        summary: `从 ${factsResult.rows.length} 条事实中综合提炼出 ${normalized.length} 条认知`,
        factsUsed: factsResult.rows.length,
      };
    } catch (err) {
      // B6 fix: 错误透传
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[ContentLibrary] Synthesis failed:', errMsg);
      return {
        insights: [],
        summary: `综合提炼失败: ${errMsg}`,
        error: errMsg,
        factsUsed: factsResult.rows.length,
      };
    }
  }

  /** ⑩ 认知综合缓存列表（支持时间排序 + 分页） */
  async querySynthesisCachePage(options?: {
    scopeType?: 'entity' | 'domain' | 'global';
    search?: string;
    limit?: number;
    offset?: number;
    page?: number;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: Array<{
      cacheKey: string;
      scopeType: string;
      scopeValue: string | null;
      summary: string;
      factsUsed: number;
      generatedAt: string;
      insights: Array<{ text: string; sources: string[]; confidence: number }>;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options?.scopeType) {
      conditions.push(`scope_type = $${idx++}`);
      params.push(options.scopeType);
    }
    if (options?.search) {
      conditions.push(`(COALESCE(scope_value, '') ILIKE $${idx} OR COALESCE(summary, '') ILIKE $${idx})`);
      params.push(`%${options.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 200);
    let offset = options?.offset ?? 0;
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(offset, 0);
    if (options?.page != null && options.page > 0 && Number.isFinite(options.page)) {
      offset = (options.page - 1) * limit;
    }

    const countResult = await this.deps.db.query(
      `SELECT COUNT(*)::int AS c FROM content_synthesis_cache ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.c ?? 0);

    const sortOrder = options?.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const rows = await this.deps.db.query(
      `SELECT cache_key, scope_type, scope_value, summary, facts_used, generated_at, insights
       FROM content_synthesis_cache
       ${where}
       ORDER BY generated_at ${sortOrder}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return {
      items: rows.rows.map((row: any) => ({
        // 兼容历史缓存格式：
        // 1) insights 是数组
        // 2) insights 是 JSON 字符串数组
        // 3) insights 是对象 { insights: [...] }
        cacheKey: row.cache_key,
        scopeType: row.scope_type,
        scopeValue: row.scope_value ?? null,
        summary: row.summary || '',
        factsUsed: Number(row.facts_used || 0),
        generatedAt: (() => {
          if (!row.generated_at) return new Date(0).toISOString();
          const parsed = new Date(row.generated_at);
          return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
        })(),
        insights: (() => {
          const normalize = (value: any): Array<{ text: string; sources: string[]; confidence: number }> => {
            if (Array.isArray(value)) {
              return value
                .filter((i: any) => i && typeof i.text === 'string' && i.text.trim())
                .map((i: any) => ({
                  text: String(i.text).trim(),
                  sources: Array.isArray(i.sources) ? i.sources.map(String) : [],
                  confidence: typeof i.confidence === 'number' ? i.confidence : Number(i.confidence || 0),
                }));
            }
            if (value && Array.isArray(value.insights)) return normalize(value.insights);
            return [];
          };

          if (Array.isArray(row.insights)) return normalize(row.insights);
          if (row.insights && typeof row.insights === 'object') return normalize(row.insights);
          if (typeof row.insights === 'string') {
            try {
              const parsed = JSON.parse(row.insights);
              return normalize(parsed);
            } catch {
              return [];
            }
          }
          return [];
        })(),
      })),
      total,
      limit,
      offset,
    };
  }

  /** ⑪ 素材组合推荐
   *  优先级1: content_production_log (历史生产记录)
   *  优先级2: assets 按 ai_theme_id 分组 fallback (无生产记录时)
   */
  async recommendMaterials(options?: {
    taskType?: string;
    domain?: string;
    limit?: number;
  }): Promise<{ recommendations: Array<{ assetIds: string[]; experts: string[]; score: number; rationale: string; theme?: string; tags?: string[] }>; totalMatches: number; source: 'production_log' | 'assets_fallback' }> {
    const limit = options?.limit || 10;

    // ── 优先级1: content_production_log ─────────────────────────
    try {
      const logResult = await this.deps.db.query(
        `SELECT asset_ids, expert_ids, output_quality_score, combination_insight
         FROM content_production_log
         WHERE output_quality_score > 0.7
         ORDER BY output_quality_score DESC LIMIT $1`,
        [limit],
      );
      if (logResult.rows.length > 0) {
        return {
          source: 'production_log',
          totalMatches: logResult.rows.length,
          recommendations: logResult.rows.map((row: any) => ({
            assetIds: Array.isArray(row.asset_ids) ? row.asset_ids : [],
            experts: Array.isArray(row.expert_ids) ? row.expert_ids : [],
            score: Number(row.output_quality_score) / 100,
            rationale: row.combination_insight || '基于历史生产经验推荐',
          })),
        };
      }
    } catch { /* 表不存在，继续 fallback */ }

    // ── 优先级2: assets 按主题分组 fallback ──────────────────────
    const domainJoin = options?.domain
      ? `JOIN content_facts cf2 ON cf2.subject = ANY(
           ARRAY(SELECT title FROM assets WHERE id = a.id LIMIT 1)
         ) AND cf2.context->>'domain' = '${options.domain.replace(/'/g, "''")}'`
      : '';

    // 按 ai_theme_id 分组，每组取质量最高的 5 个 asset
    const groupResult = await this.deps.db.query(`
      WITH ranked AS (
        SELECT id, title, ai_quality_score, ai_tags, ai_theme_id,
               ROW_NUMBER() OVER (PARTITION BY ai_theme_id ORDER BY ai_quality_score DESC) AS rn
        FROM assets
        WHERE ai_quality_score IS NOT NULL
          AND ai_quality_score > 20
          AND (is_deleted = false OR is_deleted IS NULL)
          AND ai_theme_id IS NOT NULL
      ),
      grouped AS (
        SELECT
          ai_theme_id,
          ARRAY_AGG(id ORDER BY ai_quality_score DESC) FILTER (WHERE rn <= 5) AS asset_ids,
          ARRAY_AGG(title ORDER BY ai_quality_score DESC) FILTER (WHERE rn <= 5) AS titles,
          ROUND(AVG(ai_quality_score)::numeric, 1) AS avg_quality,
          COUNT(*) AS asset_count
        FROM ranked
        GROUP BY ai_theme_id
      )
      SELECT * FROM grouped
      ORDER BY avg_quality DESC
      LIMIT $1
    `, [limit]);

    // 取每组前5个 asset 的 tags，拼出推荐理由
    const recommendations = await Promise.all(groupResult.rows.map(async (row: any) => {
      const topIds: string[] = (row.asset_ids || []).slice(0, 5);
      const titles: string[] = (row.titles || []).slice(0, 5);

      // 取 tags
      let tags: string[] = [];
      try {
        const tagsResult = await this.deps.db.query(
          `SELECT ai_tags FROM assets WHERE id = ANY($1) AND ai_tags IS NOT NULL LIMIT 5`,
          [topIds],
        );
        for (const r of tagsResult.rows) {
          const t = typeof r.ai_tags === 'string' ? JSON.parse(r.ai_tags) : r.ai_tags;
          if (Array.isArray(t)) tags.push(...t);
        }
        tags = [...new Set(tags)].slice(0, 8);
      } catch { /* ignore */ }

      const score = Number(row.avg_quality) / 100;
      const rationale = tags.length > 0
        ? `主题「${row.ai_theme_id}」· 涵盖 ${row.asset_count} 篇 · 标签: ${tags.slice(0, 4).join('、')}`
        : `主题「${row.ai_theme_id}」· 涵盖 ${row.asset_count} 篇研报，平均质量分 ${row.avg_quality}`;

      return {
        assetIds: topIds,
        experts: [] as string[],
        score,
        rationale,
        theme: row.ai_theme_id,
        tags,
        titles: titles.slice(0, 3),
      };
    }));

    return {
      source: 'assets_fallback',
      totalMatches: groupResult.rows.length,
      recommendations,
    };
  }

  /** ⑫ 专家共识图 (集成专家库) */
  async getExpertConsensus(options?: {
    topic?: string;
    taxonomy_code?: string;
    domain?: string;
    limit?: number;
  }): Promise<{ consensus: Array<{ position: string; supportingExperts: string[]; confidence: number }>; divergences: Array<{ position1: string; position2: string; experts1: string[]; experts2: string[] }> }> {
    const limit = options?.limit || 20;

    // 首先尝试从 content_facts 中聚合共识
    const consensusParams: any[] = [];
    let domainCond = '';
    if (options?.taxonomy_code) {
      const isL1 = /^E\d{2}$/.test(options.taxonomy_code);
      consensusParams.push(isL1 ? `${options.taxonomy_code}%` : options.taxonomy_code);
      domainCond = `AND context->>'taxonomy_code' ${isL1 ? 'LIKE' : '='} $${consensusParams.length}`;
    } else if (options?.domain) {
      consensusParams.push(options.domain);
      domainCond = `AND context->>'domain' = $${consensusParams.length}`;
    } else if (options?.topic) {
      consensusParams.push(`%${options.topic}%`);
      domainCond = `AND (subject ILIKE $${consensusParams.length} OR object ILIKE $${consensusParams.length})`;
    }
    consensusParams.push(limit);
    const consensusQuery = `
      SELECT subject, predicate, object, COUNT(*) as fact_count, AVG(confidence) as avg_conf,
             ARRAY_AGG(DISTINCT context->>'source') FILTER (WHERE context->>'source' IS NOT NULL) as sources
      FROM content_facts
      WHERE is_current = true ${domainCond}
      GROUP BY subject, predicate, object
      ORDER BY fact_count DESC, avg_conf DESC
      LIMIT $${consensusParams.length}
    `;
    const result = await this.deps.db.query(consensusQuery, consensusParams);

    // 构建共识列表
    const consensus = result.rows.map(row => ({
      position: `${row.subject}: ${row.predicate} → ${row.object}`,
      supportingExperts: row.sources || [], // 实际来源，可能包含专家名称
      confidence: Number(row.avg_conf),
    }));

    // 查找分歧（相同主体和谓词，但对象不同）
    const divParams: any[] = [];
    let divDomainCond = '';
    if (options?.taxonomy_code) {
      const isL1 = /^E\d{2}$/.test(options.taxonomy_code);
      divParams.push(isL1 ? `${options.taxonomy_code}%` : options.taxonomy_code);
      divDomainCond = `AND cf1.context->>'taxonomy_code' ${isL1 ? 'LIKE' : '='} $${divParams.length}`;
    } else if (options?.domain) {
      divParams.push(options.domain);
      divDomainCond = `AND cf1.context->>'domain' = $${divParams.length}`;
    } else if (options?.topic) {
      divParams.push(`%${options.topic}%`);
      divDomainCond = `AND (cf1.subject ILIKE $${divParams.length} OR cf1.object ILIKE $${divParams.length})`;
    }
    divParams.push(limit);
    const divergenceQuery = `
      SELECT
        cf1.subject,
        cf1.predicate,
        cf1.object as object1,
        cf2.object as object2,
        cf1.context->>'source' as source1,
        cf2.context->>'source' as source2,
        (cf1.confidence + cf2.confidence) / 2 as avg_conf
      FROM content_facts cf1
      JOIN content_facts cf2 ON cf1.subject = cf2.subject AND cf1.predicate = cf2.predicate
      WHERE cf1.is_current = true AND cf2.is_current = true
      AND cf1.id < cf2.id
      AND cf1.object != cf2.object
      ${divDomainCond}
      ORDER BY avg_conf DESC
      LIMIT $${divParams.length}
    `;
    const divResult = await this.deps.db.query(divergenceQuery, divParams);

    const divergences = divResult.rows.map(row => ({
      position1: `${row.subject}: ${row.object1}`,
      position2: `${row.subject}: ${row.object2}`,
      experts1: row.source1 ? [row.source1] : [],
      experts2: row.source2 ? [row.source2] : [],
    }));

    return {
      consensus,
      divergences,
    };
  }

  /** ⑭ 观点演化 (BeliefTracker 时间线 + 组合模式) */
  async getBeliefEvolution(options?: {
    beliefId?: string;
    subject?: string;
    limit?: number;
  }): Promise<{
    timeline: Array<{
      date: string;
      state: string;
      sources: Array<{ id: string; label: string }>;
      reason?: string;
      confidence?: number;
      confidenceDelta?: number;
    }>;
    patterns: EvolutionPattern[];
    summary: string;
    currentConfidence?: number;
  }> {
    const searchTerm = options?.beliefId || options?.subject || '';
    const beliefQuery = `
      SELECT id, proposition, current_stance, confidence, last_updated,
             supporting_facts, contradicting_facts, history
      FROM content_beliefs
      WHERE proposition ILIKE $1 OR proposition ILIKE $2
      ORDER BY last_updated DESC
      LIMIT $3
    `;
    const result = await this.deps.db.query(beliefQuery, [
      searchTerm,
      `${searchTerm}%`,
      options?.limit || 20,
    ]);

    // 回退：如果 content_beliefs 没命中，从 content_facts 实时构建时间线
    if (result.rows.length === 0 && searchTerm) {
      const factsResult = await this.deps.db.query(
        `SELECT id, created_at, context->>'source' AS source, confidence, predicate, object
         FROM content_facts
         WHERE subject = $1 AND is_current = true
         ORDER BY created_at ASC LIMIT $2`,
        [searchTerm, options?.limit || 20],
      );
      const timeline = factsResult.rows.map((row: any, idx: number, arr: any[]) => {
        const conf = Number(row.confidence);
        const prevConf = idx > 0 ? Number(arr[idx - 1].confidence) : undefined;
        return {
          date: new Date(row.created_at).toISOString(),
          state: conf >= 0.85 ? 'confirmed' : conf >= 0.5 ? 'evolving' : 'disputed',
          sources: row.source
            ? [{ id: row.id, label: `${row.predicate}=${row.object}` }]
            : [],
          reason: row.source ? `来自 ${row.source}` : undefined,
          confidence: conf,
          confidenceDelta: prevConf === undefined ? undefined : conf - prevConf,
        };
      });
      return {
        timeline,
        patterns: [],
        summary: `从 ${factsResult.rows.length} 条事实推断 "${searchTerm}" 的演化脉络`,
      };
    }

    // 优先使用首条匹配的 belief 的 history 字段（信息最全）
    const primary = result.rows[0];
    const history: any[] = Array.isArray(primary?.history) ? primary.history : [];

    // 汇总所有匹配 belief 的 supporting_facts，去重后解析为可读片段
    const allSupportIds = new Set<string>();
    for (const row of result.rows) {
      if (Array.isArray(row.supporting_facts)) {
        for (const id of row.supporting_facts) allSupportIds.add(id);
      }
    }
    const factLabelById = await this.resolveFactLabels(Array.from(allSupportIds));

    let timeline: Array<{
      date: string;
      state: string;
      sources: Array<{ id: string; label: string }>;
      reason?: string;
      confidence?: number;
      confidenceDelta?: number;
    }>;

    if (history.length > 0) {
      // 走 history 路径 — 每条 history entry 成为一个时间线节点
      const deltas = buildConfidenceDeltas(
        history.map(h => ({
          stance: h.stance,
          confidence: Number(h.confidence),
          reason: h.reason || '',
          timestamp: new Date(h.timestamp),
        })),
      );
      const sortedHistory = [...history].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const supportingLabels = (Array.isArray(primary.supporting_facts) ? primary.supporting_facts : [])
        .map((id: string) => ({ id, label: factLabelById.get(id) || id }))
        .slice(0, 3);
      timeline = sortedHistory.map((h, idx) => ({
        date: new Date(h.timestamp).toISOString(),
        state: h.stance || 'unknown',
        sources: idx === sortedHistory.length - 1 ? supportingLabels : [],
        reason: h.reason || undefined,
        confidence: Number(h.confidence),
        confidenceDelta: idx === 0 ? undefined : deltas[idx],
      }));
    } else {
      // 回退：history 缺失时用 row-per-belief 模型
      timeline = result.rows.map(row => {
        const ids = Array.isArray(row.supporting_facts) ? row.supporting_facts.slice(0, 3) : [];
        return {
          date: new Date(row.last_updated).toISOString(),
          state: row.current_stance || 'unknown',
          sources: ids.map((id: string) => ({ id, label: factLabelById.get(id) || id })),
          confidence: row.confidence !== undefined ? Number(row.confidence) : undefined,
        };
      });
    }

    const patterns = detectEvolutionPatterns({
      history: history.map(h => ({
        stance: h.stance,
        confidence: Number(h.confidence),
        reason: h.reason || '',
        timestamp: new Date(h.timestamp),
      })),
      supportingFactCount: Array.isArray(primary?.supporting_facts) ? primary.supporting_facts.length : 0,
      contradictingFactCount: Array.isArray(primary?.contradicting_facts) ? primary.contradicting_facts.length : 0,
    });

    return {
      timeline,
      patterns,
      currentConfidence: primary?.confidence !== undefined ? Number(primary.confidence) : undefined,
      summary: timeline.length > 0
        ? `"${searchTerm}" 共 ${timeline.length} 次变更 · 识别出 ${patterns.length} 个模式`
        : `知识库中暂无 "${searchTerm}" 的相关记录`,
    };
  }

  /** 把 fact UUID 解析为 "predicate=object" 人读片段 */
  private async resolveFactLabels(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    try {
      const res = await this.deps.db.query(
        `SELECT id, predicate, object FROM content_facts WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      for (const row of res.rows) {
        const label = [row.predicate, row.object].filter(Boolean).join('=');
        out.set(row.id, label.length > 40 ? label.slice(0, 38) + '…' : label);
      }
    } catch (err) {
      // 保底：解析失败就让调用方回退到原 UUID 显示
      console.warn('[resolveFactLabels] failed:', err);
    }
    return out;
  }

  /**
   * ⑮ 跨领域关联 (Cross-domain reasoning)
   * v7.2: 用 Adamic-Adar 替代 COUNT(*)/10
   * AA(u,v) = Σ 1/log(degree(w))，其中 w 是 u 和 v 的共同邻居
   * 冷门共同邻居权重更高 — 共享稀有连接比共享热门连接更有意义
   */
  async discoverCrossDomainInsights(options?: {
    entityId?: string;
    domain?: string;
    limit?: number;
  }): Promise<{ associations: Array<{ entity1: string; entity2: string; relationship: string; strength: number; adamicAdar: number; commonNeighbors: number; domains: string[] }>; count: number }> {
    const params: any[] = [];
    const pairConditions: string[] = [];
    if (options?.entityId) {
      params.push(options.entityId);
      pairConditions.push(`(aa.e1 = $${params.length} OR aa.e2 = $${params.length})`);
    }
    if (options?.domain) {
      params.push(options.domain);
      pairConditions.push(`(ed1.domain = $${params.length} OR ed2.domain = $${params.length})`);
    }
    const pairFilterSql = pairConditions.length > 0 ? `AND ${pairConditions.join(' AND ')}` : '';

    const aaQuery = `
      WITH entity_domains AS (
        -- 从 content_facts 的 context 推断每个实体的主领域
        SELECT
          subject AS entity,
          (SELECT context->>'domain'
           FROM content_facts cf2
           WHERE cf2.subject = cf.subject AND cf2.is_current = true AND cf2.context->>'domain' IS NOT NULL
           GROUP BY context->>'domain' ORDER BY COUNT(*) DESC LIMIT 1) AS domain
        FROM content_facts cf
        WHERE is_current = true
        GROUP BY subject
      ),
      entity_neighbors AS (
        SELECT DISTINCT subject AS entity, object AS neighbor
        FROM content_facts WHERE is_current = true
        UNION
        SELECT DISTINCT object, subject FROM content_facts WHERE is_current = true
      ),
      neighbor_degree AS (
        SELECT neighbor, COUNT(DISTINCT entity) AS degree
        FROM entity_neighbors
        GROUP BY neighbor
      ),
      pair_common_neighbors AS (
        SELECT
          en1.entity AS e1,
          en2.entity AS e2,
          en1.neighbor AS common_neighbor,
          nd.degree
        FROM entity_neighbors en1
        JOIN entity_neighbors en2 ON en1.neighbor = en2.neighbor AND en1.entity < en2.entity
        JOIN neighbor_degree nd ON nd.neighbor = en1.neighbor
        WHERE nd.degree > 1
      ),
      aa_scores AS (
        SELECT
          e1, e2,
          SUM(1.0 / GREATEST(LN(GREATEST(degree, 2)), 0.01)) AS aa_score,
          COUNT(*) AS common_count
        FROM pair_common_neighbors
        GROUP BY e1, e2
      )
      SELECT
        aa.e1 AS entity1, aa.e2 AS entity2,
        ROUND(aa.aa_score::numeric, 3) AS aa_score,
        aa.common_count,
        COALESCE(ed1.domain, '未分类') AS domain1,
        COALESCE(ed2.domain, '未分类') AS domain2
      FROM aa_scores aa
      LEFT JOIN entity_domains ed1 ON ed1.entity = aa.e1
      LEFT JOIN entity_domains ed2 ON ed2.entity = aa.e2
      WHERE (COALESCE(ed1.domain, '') != COALESCE(ed2.domain, '')
         OR (ed1.domain IS NULL AND ed2.domain IS NOT NULL)
         OR (ed1.domain IS NOT NULL AND ed2.domain IS NULL))
        AND LENGTH(aa.e1) > 2 AND LENGTH(aa.e2) > 2
        ${pairFilterSql}
      ORDER BY aa.aa_score DESC
      LIMIT $${params.length + 1}
    `;
    params.push(options?.limit || 20);
    const result = await this.deps.db.query(aaQuery, params);

    const associations = result.rows.map((row: any) => ({
      entity1: row.entity1,
      entity2: row.entity2,
      relationship: `${row.common_count} shared rare neighbors (AA=${row.aa_score})`,
      strength: Math.min(Number(row.aa_score) / 5, 1),  // 归一化到 0-1
      adamicAdar: Number(row.aa_score),
      commonNeighbors: Number(row.common_count),
      domains: [row.domain1, row.domain2].filter(Boolean),
    }));

    return {
      associations,
      count: result.rows.length,
    };
  }

  // ============================================================
  // v7.3: Pipeline 统一统计 (供流水线可视化页面)
  // ============================================================

  async getOverviewStats(): Promise<{
    assets: { total: number; ai_analyzed: number; fact_extracted: number; pending_ai: number; failed_ai: number; rss_imported: number };
    rssItems: number;
    facts: number;
    entities: number;
    contradictions: number;
    beliefs: number;
    synthesisCached: number;
    relations: number;
    communities: number;
  }> {
    const safeCount = async (sql: string): Promise<number> => {
      try {
        const r = await this.deps.db.query(sql);
        return Number(r.rows[0]?.c) || 0;
      } catch { return 0; }
    };

    const [facts, entities, contradictions, beliefs, synthesis, relations, communities, rssItems] =
      await Promise.all([
        safeCount('SELECT COUNT(*)::int AS c FROM content_facts WHERE is_current = true'),
        safeCount('SELECT COUNT(*)::int AS c FROM content_entities'),
        safeCount(`SELECT COUNT(*)::int AS c FROM (
          SELECT subject, predicate FROM content_facts WHERE is_current = true
          GROUP BY subject, predicate HAVING COUNT(*) > 1) sub`),
        safeCount('SELECT COUNT(*)::int AS c FROM content_beliefs'),
        safeCount('SELECT COUNT(*)::int AS c FROM content_synthesis_cache'),
        safeCount('SELECT COUNT(*)::int AS c FROM content_entity_relations'),
        safeCount(`SELECT COUNT(DISTINCT community_id)::int AS c FROM content_entities WHERE community_id IS NOT NULL`),
        safeCount(`SELECT COUNT(*)::int AS c FROM rss_items`),
      ]);

    let assetRow = { total: 0, ai_analyzed: 0, fact_extracted: 0, pending_ai: 0, failed_ai: 0, rss_imported: 0 };
    try {
      const ar = await this.deps.db.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ai_analyzed_at IS NOT NULL)::int AS ai_analyzed,
        COUNT(*) FILTER (WHERE last_reextracted_at IS NOT NULL)::int AS fact_extracted,
        COUNT(*) FILTER (WHERE ai_processing_status = 'pending' OR ai_processing_status IS NULL)::int AS pending_ai,
        COUNT(*) FILTER (WHERE ai_processing_status = 'failed')::int AS failed_ai,
        COUNT(*) FILTER (WHERE id LIKE 'rss-%')::int AS rss_imported
      FROM assets WHERE is_deleted IS NOT TRUE`);
      assetRow = ar.rows[0] || assetRow;
    } catch { /* assets 表不存在时 fallback */ }

    return {
      assets: assetRow,
      rssItems,
      facts, entities, contradictions, beliefs,
      synthesisCached: synthesis, relations, communities,
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async storeFacts(facts: Omit<ContentFact, 'id' | 'createdAt'>[]): Promise<ContentFact[]> {
    const stored: ContentFact[] = [];
    for (const fact of facts) {
      const result = await this.deps.db.query(
        `INSERT INTO content_facts (asset_id, subject, predicate, object, context, confidence, is_current, superseded_by, source_chunk_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [fact.assetId, fact.subject, fact.predicate, fact.object,
         JSON.stringify(fact.context), fact.confidence, fact.isCurrent,
         fact.supersededBy || null, fact.sourceChunkIndex || null]
      );
      stored.push(this.mapFact(result.rows[0]));
    }
    return stored;
  }

  private mapFact(row: any): ContentFact {
    return {
      id: row.id,
      assetId: row.asset_id,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
      context: row.context || {},
      confidence: Number(row.confidence),
      isCurrent: row.is_current,
      supersededBy: row.superseded_by,
      sourceChunkIndex: row.source_chunk_index,
      createdAt: new Date(row.created_at),
    };
  }

  private mapEntity(row: any): ContentEntity {
    return {
      id: row.id,
      canonicalName: row.canonical_name,
      aliases: row.aliases || [],
      entityType: row.entity_type,
      taxonomyDomainId: row.taxonomy_domain_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private calculateTimeliness(date: Date | string): number {
    const d = new Date(date);
    const daysSince = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysSince / 30);
  }

  private detectDirection(dataPoints: any[]): 'rising' | 'falling' | 'stable' | 'volatile' {
    if (dataPoints.length < 2) return 'stable';
    // 简化实现：比较首尾值
    const first = dataPoints[0].object;
    const last = dataPoints[dataPoints.length - 1].object;
    const firstNum = parseFloat(first);
    const lastNum = parseFloat(last);
    if (isNaN(firstNum) || isNaN(lastNum)) return 'stable';
    const change = (lastNum - firstNum) / Math.abs(firstNum || 1);
    if (change > 0.1) return 'rising';
    if (change < -0.1) return 'falling';
    return 'stable';
  }

  private getFactFreshness(createdAt: Date, maxAgeDays: number): 'fresh' | 'aging' | 'stale' {
    const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < maxAgeDays * 0.3) return 'fresh';
    if (daysSince < maxAgeDays * 0.7) return 'aging';
    return 'stale';
  }

  async getKnowledgeGaps(options?: {
    domain?: string;
    taxonomy_code?: string;
    limit?: number;
    sortBy?: 'default' | 'time';
    sortOrder?: 'asc' | 'desc';
  }): Promise<Array<{
    topic: string;
    type: 'blank' | 'differentiation';
    description: string;
    opportunity: string;
    createdAt?: string;
    updatedAt?: string;
  }>> {
    const limit = options?.limit || 20;
    const blankLimit = Math.ceil(limit * 0.6);
    const sparseLimit = Math.ceil(limit * 0.4);

    // 实体无任何事实 (覆盖空白)
    const blankResult = await this.deps.db.query(`
      SELECT
        ce.canonical_name as topic,
        ce.created_at as entity_created_at,
        ce.updated_at as entity_updated_at
      FROM content_entities ce
      WHERE NOT EXISTS (
        SELECT 1 FROM content_facts cf
        WHERE cf.subject = ce.canonical_name AND cf.is_current = true
      )
      ORDER BY ce.created_at DESC
      LIMIT $1
    `, [blankLimit]);

    // 有事实但极度稀疏 (差异化空白: fact_count < 3)
    const sparseResult = await this.deps.db.query(`
      SELECT
        ce.canonical_name as topic,
        ce.created_at as entity_created_at,
        ce.updated_at as entity_updated_at,
        COUNT(cf.id) as fact_count,
        MAX(cf.created_at) as latest_fact_at
      FROM content_entities ce
      JOIN content_facts cf ON cf.subject = ce.canonical_name AND cf.is_current = true
      GROUP BY ce.canonical_name, ce.created_at, ce.updated_at
      HAVING COUNT(cf.id) < 3
      ORDER BY COUNT(cf.id) ASC
      LIMIT $1
    `, [sparseLimit]);

    const itemsWithSortTime = [
      ...blankResult.rows.map((r: any) => ({
        topic: r.topic,
        type: 'blank' as const,
        description: `"${r.topic}"在知识库中尚无任何提炼事实`,
        opportunity: '补充基础事实：定义、核心数据、关键事件',
        createdAt: r.entity_created_at || undefined,
        updatedAt: r.entity_updated_at || r.entity_created_at || undefined,
        sortTime: new Date(r.entity_created_at || 0).getTime(),
      })),
      ...sparseResult.rows.map((r: any) => ({
        topic: r.topic,
        type: 'differentiation' as const,
        description: `"${r.topic}"仅有 ${r.fact_count} 条事实，覆盖浅`,
        opportunity: '深挖差异化角度：竞争对比、时序演变、因果关系',
        createdAt: r.entity_created_at || undefined,
        updatedAt: r.latest_fact_at || r.entity_updated_at || r.entity_created_at || undefined,
        sortTime: new Date(r.latest_fact_at || 0).getTime(),
      })),
    ];

    if (options?.sortBy === 'time') {
      const asc = options?.sortOrder === 'asc';
      itemsWithSortTime.sort((a, b) => (asc ? a.sortTime - b.sortTime : b.sortTime - a.sortTime));
    }

    return itemsWithSortTime.map(({ topic, type, description, opportunity, createdAt, updatedAt }) => ({
      topic,
      type,
      description,
      opportunity,
      createdAt,
      updatedAt,
    }));
  }
}
