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
  async reextractBatch(options: {
    assetIds?: string[];
    limit?: number;
    since?: string;
    minConfidence?: number;
    dryRun?: boolean;
  }): Promise<{
    processed: number;
    newFacts: number;
    updatedFacts: number;
    skipped: number;
    errors: number;
    tokenEstimate: number;
  }> {
    const limit = Math.min(options.limit || 20, 200);
    const minConf = options.minConfidence ?? this.options.factConfidenceThreshold;

    const conds: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.assetIds && options.assetIds.length > 0) {
      conds.push(`id = ANY($${idx++}::varchar[])`);
      params.push(options.assetIds);
    }
    if (options.since) {
      conds.push(`created_at >= $${idx++}`);
      params.push(options.since);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit);
    const sql = `
      SELECT id, content FROM asset_library
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `;

    const assets = await this.deps.db.query(sql, params);

    let processed = 0;
    let newFacts = 0;
    let updatedFacts = 0;
    let skipped = 0;
    let errors = 0;
    let tokenEstimate = 0;

    for (const row of assets.rows) {
      try {
        const content = String(row.content || '').slice(0, 8000);
        if (!content.trim()) {
          skipped++;
          continue;
        }
        // 每个 asset 2 次 LLM 调用 (analyze + extract)，约 4k input + 1k output tokens
        tokenEstimate += 5000;

        if (options.dryRun) {
          processed++;
          continue;
        }

        // 调用 factExtractor 的新两段式提取
        const extraction = await this.factExtractor.extract({
          content,
          assetId: row.id,
        });

        // 实体归一化
        for (const entity of extraction.entities) {
          await this.entityResolver.resolveAndRegister(entity);
        }

        // 过滤低置信度
        const highQuality = extraction.facts.filter(f => f.confidence >= minConf);

        // Delta 压缩
        for (const fact of highQuality) {
          const compressed = await this.deltaCompressor.compress(fact);
          if (compressed.supersededBy) {
            updatedFacts++;
          } else {
            newFacts++;
          }
          await this.storeFacts([compressed]);
        }
        processed++;
      } catch (err) {
        console.warn('[reextractBatch] Asset failed:', row.id, err);
        errors++;
      }
    }

    return { processed, newFacts, updatedFacts, skipped, errors, tokenEstimate };
  }

  /** 查询事实 */
  async queryFacts(options: {
    subject?: string;
    predicate?: string;
    entityId?: string;
    domain?: string;
    currentOnly?: boolean;
    limit?: number;
  }): Promise<ContentFact[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.subject) {
      conditions.push(`subject ILIKE $${paramIndex++}`);
      params.push(`%${options.subject}%`);
    }
    if (options.predicate) {
      conditions.push(`predicate ILIKE $${paramIndex++}`);
      params.push(`%${options.predicate}%`);
    }
    if (options.currentOnly !== false) {
      conditions.push('is_current = true');
    }
    if (options.domain) {
      conditions.push(`context->>'domain' = $${paramIndex++}`);
      params.push(options.domain);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || this.options.defaultSearchLimit;

    const result = await this.deps.db.query(
      `SELECT * FROM content_facts ${where} ORDER BY created_at DESC LIMIT $${paramIndex}`,
      [...params, limit]
    );

    return result.rows.map(this.mapFact);
  }

  /** 查询实体 */
  async queryEntities(options: {
    search?: string;
    entityType?: string;
    domainId?: string;
    limit?: number;
  }): Promise<ContentEntity[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.search) {
      conditions.push(`(canonical_name ILIKE $${paramIndex} OR $${paramIndex} = ANY(aliases))`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }
    if (options.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(options.entityType);
    }
    if (options.domainId) {
      conditions.push(`taxonomy_domain_id = $${paramIndex++}`);
      params.push(options.domainId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || this.options.defaultSearchLimit;

    const result = await this.deps.db.query(
      `SELECT * FROM content_entities ${where} ORDER BY updated_at DESC LIMIT $${paramIndex}`,
      [...params, limit]
    );

    return result.rows.map(this.mapEntity);
  }

  // ============================================================
  // 产出物 API (15 类可消费产出物)
  // ============================================================

  /** ① 有价值的议题推荐 */
  async getTopicRecommendations(options?: {
    domain?: string;
    limit?: number;
  }): Promise<TopicRecommendation[]> {
    const limit = options?.limit || 10;
    const domainFilter = options?.domain ? `AND ce.taxonomy_domain_id = $2` : '';
    const params: any[] = [limit];
    if (options?.domain) params.push(options.domain);

    const result = await this.deps.db.query(`
      SELECT
        ce.id as entity_id,
        ce.canonical_name as entity_name,
        COUNT(cf.id) as fact_count,
        MAX(cf.created_at) as latest_fact,
        AVG(cf.confidence) as avg_confidence
      FROM content_entities ce
      LEFT JOIN content_facts cf ON cf.subject = ce.canonical_name AND cf.is_current = true
      WHERE 1=1 ${domainFilter}
      GROUP BY ce.id, ce.canonical_name
      HAVING COUNT(cf.id) > 0
      ORDER BY COUNT(cf.id) * AVG(cf.confidence) DESC
      LIMIT $1
    `, params);

    return result.rows.map(row => ({
      entityId: row.entity_id,
      entityName: row.entity_name,
      score: row.fact_count * row.avg_confidence,
      factDensity: Number(row.fact_count),
      timeliness: this.calculateTimeliness(row.latest_fact),
      gapScore: 0, // TODO: Phase 3 — 空白度计算
      suggestedAngles: [],
    }));
  }

  /** ② 趋势信号 */
  async getTrendSignals(entityId: string): Promise<TrendSignal[]> {
    const result = await this.deps.db.query(`
      SELECT
        cf.subject,
        cf.predicate,
        cf.object,
        cf.context,
        cf.created_at
      FROM content_facts cf
      JOIN content_entities ce ON cf.subject = ce.canonical_name
      WHERE ce.id = $1 AND cf.is_current = true
      ORDER BY cf.created_at ASC
    `, [entityId]);

    // 按 predicate 分组，检测方向性变化
    const grouped = new Map<string, typeof result.rows>();
    for (const row of result.rows) {
      const key = row.predicate;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    const signals: TrendSignal[] = [];
    for (const [metric, dataPoints] of grouped) {
      if (dataPoints.length < 2) continue;
      signals.push({
        entityId,
        entityName: dataPoints[0].subject,
        metric,
        direction: this.detectDirection(dataPoints),
        dataPoints: dataPoints.map(dp => ({
          time: dp.context?.time || dp.created_at.toISOString(),
          value: dp.object,
          source: dp.context?.source || 'unknown',
        })),
        significance: dataPoints.length / 10,
      });
    }

    return signals;
  }

  /** ⑤ 关键事实查询 (高置信度) */
  async getKeyFacts(options: {
    subject?: string;
    domain?: string;
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
    limit?: number;
  }): Promise<ContentFact[]> {
    const maxAge = options?.maxAgeDays || 90;
    const limit = options?.limit || 50;
    const domainFilter = options?.domain ? `AND context->>'domain' = $3` : '';
    const params: any[] = [maxAge, limit];
    if (options?.domain) params.push(options.domain);

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
    const entityResult = await this.deps.db.query(
      'SELECT * FROM content_entities WHERE id = $1', [entityId]
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

  /** ⑩ 有价值的认知 (LLM 综合提炼) — v7.2 修复 6 bug + 降级策略 */
  async synthesizeInsights(options?: {
    subjects?: string[];
    domain?: string;
    limit?: number;
  }): Promise<{ insights: Array<{ text: string; sources: string[]; confidence: number }>; summary: string; error?: string; factsUsed?: number }> {
    const limit = options?.limit || 10;

    // B1 fix: 两阶段降级 (> 0.5 → > 0.3)，保证能取到事实
    // B2 fix: context->>'domain' 用 ->> 取文本值
    let factsResult: any = { rows: [] };
    for (const threshold of [0.5, 0.3, 0.0]) {
      const domainClause = options?.domain ? `AND context->>'domain' = $1` : '';
      const factsQuery = `
        SELECT DISTINCT subject, predicate, object, confidence, context
        FROM content_facts
        WHERE is_current = true AND confidence > ${threshold}
        ${domainClause}
        ORDER BY confidence DESC
        LIMIT $${options?.domain ? '2' : '1'}
      `;
      const factsParams = options?.domain ? [options.domain, limit * 5] : [limit * 5];
      factsResult = await this.deps.db.query(factsQuery, factsParams);
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

  /** ⑪ 素材组合推荐 (基于生产经验) */
  async recommendMaterials(options?: {
    taskType?: string;
    domain?: string;
    limit?: number;
  }): Promise<{ recommendations: Array<{ assetIds: string[]; experts: string[]; score: number; rationale: string }>; totalMatches: number }> {
    const limit = options?.limit || 10;

    // 查询 content_production_log 中评分最高的组合
    const logsQuery = `
      SELECT asset_ids, expert_ids, quality_score, feedback
      FROM content_production_log
      WHERE quality_score > 0.7
      ${options?.domain ? 'AND metadata->\'domain\' = $1' : ''}
      ORDER BY quality_score DESC
      LIMIT $2
    `;
    const logsParams = options?.domain ? [options.domain, limit * 3] : [limit * 3];
    const logsResult = await this.deps.db.query(logsQuery, logsParams);

    const recommendations = logsResult.rows.slice(0, limit).map(row => ({
      assetIds: Array.isArray(row.asset_ids) ? row.asset_ids : [],
      experts: Array.isArray(row.expert_ids) ? row.expert_ids : [],
      score: Number(row.quality_score),
      rationale: `Based on ${row.feedback || 'production experience'} with quality score ${Number(row.quality_score).toFixed(2)}`,
    }));

    return {
      recommendations,
      totalMatches: logsResult.rows.length,
    };
  }

  /** ⑫ 专家共识图 (集成专家库) */
  async getExpertConsensus(options?: {
    topic?: string;
    domain?: string;
    limit?: number;
  }): Promise<{ consensus: Array<{ position: string; supportingExperts: string[]; confidence: number }>; divergences: Array<{ position1: string; position2: string; experts1: string[]; experts2: string[] }> }> {
    const limit = options?.limit || 20;

    // 首先尝试从 content_facts 中聚合共识
    const consensusQuery = `
      SELECT subject, predicate, object, COUNT(*) as fact_count, AVG(confidence) as avg_conf,
             ARRAY_AGG(DISTINCT context->>'source' FILTER (WHERE context->>'source' IS NOT NULL)) as sources
      FROM content_facts
      WHERE is_current = true
      ${options?.domain ? 'AND context->\'domain\' = $1' : ''}
      GROUP BY subject, predicate, object
      ORDER BY fact_count DESC, avg_conf DESC
      LIMIT $2
    `;
    const params = options?.domain ? [options.domain, limit] : [limit];
    const result = await this.deps.db.query(consensusQuery, params);

    // 构建共识列表
    const consensus = result.rows.map(row => ({
      position: `${row.subject}: ${row.predicate} → ${row.object}`,
      supportingExperts: row.sources || [], // 实际来源，可能包含专家名称
      confidence: Number(row.avg_conf),
    }));

    // 查找分歧（相同主体和谓词，但对象不同）
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
      ${options?.domain ? 'AND cf1.context->\'domain\' = $1' : ''}
      ORDER BY avg_conf DESC
      LIMIT $2
    `;
    const divParams = options?.domain ? [options.domain, limit] : [limit];
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

  /** ⑭ 观点演化 (BeliefTracker 时间线) */
  async getBeliefEvolution(options?: {
    beliefId?: string;
    subject?: string;
    limit?: number;
  }): Promise<{ timeline: Array<{ date: string; state: string; sources: string[] }>; summary: string }> {
    const queryCondition = options?.beliefId
      ? 'id = $1'
      : 'subject = $1';
    const queryParam = options?.beliefId || options?.subject || '';

    const beliefQuery = `
      SELECT id, subject, state, created_at, source_ids, metadata
      FROM content_beliefs
      WHERE ${queryCondition}
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.deps.db.query(beliefQuery, [queryParam, options?.limit || 20]);

    const timeline = result.rows.map(row => ({
      date: new Date(row.created_at).toISOString(),
      state: row.state,
      sources: row.source_ids || [],
    }));

    return {
      timeline,
      summary: `${result.rows.length} state changes tracked for "${options?.subject || options?.beliefId}"`,
    };
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
    const aaQuery = `
      WITH entity_neighbors AS (
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
        ce1.taxonomy_domain_id AS domain1,
        ce2.taxonomy_domain_id AS domain2
      FROM aa_scores aa
      LEFT JOIN content_entities ce1 ON ce1.canonical_name = aa.e1
      LEFT JOIN content_entities ce2 ON ce2.canonical_name = aa.e2
      WHERE ce1.taxonomy_domain_id IS DISTINCT FROM ce2.taxonomy_domain_id
      ORDER BY aa.aa_score DESC
      LIMIT $1
    `;
    const result = await this.deps.db.query(aaQuery, [options?.limit || 20]);

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
}
