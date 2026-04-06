// Layer 1: 实体归一化与注册 (← Mem0 + Hindsight Entity Summaries)
// 实体去重、别名合并、全局注册

import type { DatabaseAdapter, EmbeddingAdapter, ContentEntity } from '../types.js';

export class EntityResolver {
  private db: DatabaseAdapter;
  private embedding: EmbeddingAdapter;

  constructor(db: DatabaseAdapter, embedding: EmbeddingAdapter) {
    this.db = db;
    this.embedding = embedding;
  }

  /** 解析实体并注册到全局注册表，返回已有或新建的实体 */
  async resolveAndRegister(
    entity: Omit<ContentEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentEntity> {
    // Step 1: 尝试精确匹配 (canonical_name 或 aliases)
    const exact = await this.findByNameOrAlias(entity.canonicalName);
    if (exact) {
      // 合并别名
      await this.mergeAliases(exact.id, entity.aliases);
      return exact;
    }

    // Step 2: 尝试模糊匹配别名
    for (const alias of entity.aliases) {
      const found = await this.findByNameOrAlias(alias);
      if (found) {
        await this.mergeAliases(found.id, [entity.canonicalName, ...entity.aliases]);
        return found;
      }
    }

    // Step 3: 注册新实体
    return this.registerNew(entity);
  }

  private async findByNameOrAlias(name: string): Promise<ContentEntity | null> {
    const result = await this.db.query(
      `SELECT * FROM content_entities
       WHERE canonical_name = $1 OR $1 = ANY(aliases)
       LIMIT 1`,
      [name]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
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

  private async mergeAliases(entityId: string, newAliases: string[]): Promise<void> {
    if (newAliases.length === 0) return;

    // 使用 array_cat + array_distinct 合并
    await this.db.query(
      `UPDATE content_entities
       SET aliases = (
         SELECT ARRAY(SELECT DISTINCT unnest(array_cat(aliases, $2::text[])))
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [entityId, newAliases]
    );
  }

  private async registerNew(
    entity: Omit<ContentEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentEntity> {
    // 生成 embedding 用于语义匹配
    let embeddingVector: number[] | null = null;
    try {
      embeddingVector = await this.embedding.embed(entity.canonicalName);
    } catch {
      // embedding 失败不阻塞注册
    }

    const result = await this.db.query(
      `INSERT INTO content_entities (canonical_name, aliases, entity_type, taxonomy_domain_id, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (canonical_name) DO UPDATE SET
         aliases = (SELECT ARRAY(SELECT DISTINCT unnest(array_cat(content_entities.aliases, $2::text[])))),
         updated_at = NOW()
       RETURNING *`,
      [
        entity.canonicalName,
        entity.aliases,
        entity.entityType,
        entity.taxonomyDomainId || null,
        JSON.stringify(entity.metadata),
        embeddingVector ? JSON.stringify(embeddingVector) : null,
      ]
    );

    const row = result.rows[0];
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
}
