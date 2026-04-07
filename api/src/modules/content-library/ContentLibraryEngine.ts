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

export class ContentLibraryEngine {
  private deps: ContentLibraryDeps;
  private options: Required<ContentLibraryOptions>;
  private tieredLoader: TieredLoader;
  private hybridSearch: HybridSearch;
  private factExtractor: FactExtractor;
  private entityResolver: EntityResolver;
  private deltaCompressor: DeltaCompressor;

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

  /** ⑥ 实体关系图谱 */
  async getEntityGraph(entityId: string): Promise<{
    center: ContentEntity;
    relations: Array<{ entity: ContentEntity; relation: string; strength: number }>;
  }> {
    const entityResult = await this.deps.db.query(
      'SELECT * FROM content_entities WHERE id = $1', [entityId]
    );
    if (entityResult.rows.length === 0) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    const center = this.mapEntity(entityResult.rows[0]);

    // 找到通过事实关联的实体
    const relatedResult = await this.deps.db.query(`
      SELECT DISTINCT
        ce.id, ce.canonical_name, ce.aliases, ce.entity_type,
        ce.taxonomy_domain_id, ce.metadata, ce.created_at, ce.updated_at,
        COUNT(cf.id) as shared_facts,
        cf.predicate as relation
      FROM content_facts cf
      JOIN content_entities ce ON (
        cf.subject = ce.canonical_name OR cf.object = ce.canonical_name
      )
      WHERE cf.subject = $1 OR cf.object = $1
      AND ce.canonical_name != $1
      AND cf.is_current = true
      GROUP BY ce.id, ce.canonical_name, ce.aliases, ce.entity_type,
               ce.taxonomy_domain_id, ce.metadata, ce.created_at, ce.updated_at, cf.predicate
      ORDER BY COUNT(cf.id) DESC
      LIMIT 20
    `, [center.canonicalName]);

    return {
      center,
      relations: relatedResult.rows.map(row => ({
        entity: this.mapEntity(row),
        relation: row.relation,
        strength: Number(row.shared_facts),
      })),
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

  /** ⑩ 有价值的认知 (LLM 综合提炼) */
  async synthesizeInsights(options?: {
    subjects?: string[];
    domain?: string;
    limit?: number;
  }): Promise<{ insights: Array<{ text: string; sources: string[]; confidence: number }>; summary: string }> {
    const limit = options?.limit || 10;

    // 获取高置信度事实
    const factsQuery = `
      SELECT DISTINCT subject, predicate, object, confidence, context
      FROM content_facts
      WHERE is_current = true AND confidence > 0.7
      ${options?.domain ? 'AND context->\'domain\' = $1' : ''}
      ORDER BY confidence DESC
      LIMIT $2
    `;
    const factsParams = options?.domain ? [options.domain, limit * 5] : [limit * 5];
    const factsResult = await this.deps.db.query(factsQuery, factsParams);

    if (factsResult.rows.length === 0) {
      return { insights: [], summary: 'No high-confidence facts available for synthesis' };
    }

    // 构建提示词
    const factsText = factsResult.rows.map(f => `${f.subject} - ${f.predicate}: ${f.object}`).join('\n');
    const prompt = `Based on these facts, synthesize 3-5 valuable insights that would be useful for content creators:

${factsText}

Format: each insight as a JSON object with:
- text: the insight (concise, actionable)
- sources: array of subject-predicate pairs this comes from
- confidence: 0-1 score`;

    try {
      const response = await this.deps.llm.generate({
        prompt,
        maxTokens: 500,
      });

      // 简化解析（实际应该更健壮）
      const insights = [];
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        insights.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      }

      return {
        insights: insights.slice(0, limit),
        summary: `Synthesized ${insights.length} insights from ${factsResult.rows.length} facts`,
      };
    } catch (err) {
      console.error('[ContentLibrary] Synthesis failed:', err);
      return { insights: [], summary: 'Synthesis failed' };
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
    // 简化版本：需要集成专家库的实现
    const consensusQuery = `
      SELECT subject, predicate, object, COUNT(*) as fact_count, AVG(confidence) as avg_conf
      FROM content_facts
      WHERE is_current = true
      ${options?.domain ? 'AND context->\'domain\' = $1' : ''}
      GROUP BY subject, predicate, object
      ORDER BY fact_count DESC
      LIMIT $2
    `;
    const params = options?.domain ? [options.domain, options?.limit || 20] : [options?.limit || 20];
    const result = await this.deps.db.query(consensusQuery, params);

    const consensus = result.rows.map(row => ({
      position: `${row.subject} - ${row.predicate}: ${row.object}`,
      supportingExperts: [], // TODO: 从专家库动态获取
      confidence: Number(row.avg_conf),
    }));

    return {
      consensus,
      divergences: [],
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

  /** ⑮ 跨领域关联 (Cross-domain reasoning) */
  async discoverCrossDomainInsights(options?: {
    entityId?: string;
    domain?: string;
    limit?: number;
  }): Promise<{ associations: Array<{ entity1: string; entity2: string; relationship: string; strength: number; domains: string[] }>; count: number }> {
    // 查询实体的跨域关联（通过共同出现的事实）
    const associationQuery = `
      SELECT DISTINCT
        cf1.subject as entity1,
        cf2.subject as entity2,
        cf1.context->>'domain' as domain1,
        cf2.context->>'domain' as domain2,
        COUNT(*) as co_occurrence
      FROM content_facts cf1
      JOIN content_facts cf2 ON cf1.predicate = cf2.predicate AND cf1.object = cf2.object
      WHERE cf1.is_current = true AND cf2.is_current = true
      AND cf1.subject < cf2.subject
      AND cf1.context->>'domain' != cf2.context->>'domain'
      GROUP BY cf1.subject, cf2.subject, domain1, domain2
      ORDER BY co_occurrence DESC
      LIMIT $1
    `;
    const result = await this.deps.db.query(associationQuery, [options?.limit || 20]);

    const associations = result.rows.map(row => ({
      entity1: row.entity1,
      entity2: row.entity2,
      relationship: `co-occur in ${row.co_occurrence} facts`,
      strength: Math.min(row.co_occurrence / 10, 1),
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
