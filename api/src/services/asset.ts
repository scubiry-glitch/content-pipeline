// 素材库服务
// 支持: 上传、语义搜索、标签管理

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { query } from '../db/connection.js';
import { generate, generateEmbedding } from './llm.js';

export interface UploadAssetInput {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  title: string;
  source?: string;
  tags: string[];
  domain?: string;
  taxonomy_code?: string;
  asset_type?: string;
  theme_id?: string;
  workspaceId?: string;
}

export interface UpdateAssetInput {
  title?: string;
  source?: string;
  tags?: string[];
  content?: string;
  theme_id?: string | null;
  domain?: string | null;
  taxonomy_code?: string | null;
  asset_type?: string;
}

export interface CreateThemeInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  domain?: string;
  taxonomy_code?: string;
}

interface VisibilityOptions {
  includeDeleted?: boolean;
  includeHidden?: boolean;
}

interface AssetDeduplicateOptions {
  mode: 'dry-run' | 'apply';
  limit?: number;
  includeHidden?: boolean;
}

interface DedupAction {
  asset_id: string;
  title: string;
  duplicate_key: string;
  canonical_asset_id: string;
  in_wiki: boolean;
  action: 'deleted' | 'hidden' | 'would_delete' | 'would_hide';
  reason: string;
}

export class AssetService {
  async upload(input: UploadAssetInput) {
    const assetId = `asset_${uuidv4().slice(0, 8)}`;

    // 提取文本内容
    const content = await this.extractContent(input.buffer, input.mimetype);

    // 生成向量嵌入
    const embedding = await generateEmbedding(content.substring(0, 8000));

    // 自动生成标签
    const autoTags = await this.generateTags(content, input.tags);

    // 计算质量评分
    const qualityScore = this.calculateQualityScore(content, input.source);

    // workspace_id 显式传入；不传时由表的 DEFAULT (default workspace) 兜底
    if (input.workspaceId) {
      await query(
        `INSERT INTO assets (
          id, title, content, content_type, filename,
          source, tags, auto_tags, quality_score, embedding,
          type, domain, taxonomy_code, theme_id, workspace_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14, $15, NOW(), NOW())`,
        [
          assetId,
          input.title,
          content,
          this.getContentType(input.mimetype),
          input.filename,
          input.source || null,
          JSON.stringify(input.tags),
          JSON.stringify(autoTags),
          qualityScore,
          `[${embedding.join(',')}]`,
          input.asset_type || 'file',
          input.domain || null,
          input.taxonomy_code || null,
          input.theme_id || null,
          input.workspaceId,
        ]
      );
    } else {
      await query(
        `INSERT INTO assets (
          id, title, content, content_type, filename,
          source, tags, auto_tags, quality_score, embedding,
          type, domain, taxonomy_code, theme_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14, NOW(), NOW())`,
        [
          assetId,
          input.title,
          content,
          this.getContentType(input.mimetype),
          input.filename,
          input.source || null,
          JSON.stringify(input.tags),
          JSON.stringify(autoTags),
          qualityScore,
          `[${embedding.join(',')}]`,
          input.asset_type || 'file',
          input.domain || null,
          input.taxonomy_code || null,
          input.theme_id || null,
        ]
      );
    }

    return {
      id: assetId,
      title: input.title,
      content_type: this.getContentType(input.mimetype),
      asset_type: input.asset_type || 'file',
      domain: input.domain || null,
      taxonomy_code: input.taxonomy_code || null,
      theme_id: input.theme_id || null,
      tags: input.tags,
      auto_tags: autoTags,
      quality_score: qualityScore,
      created_at: new Date().toISOString()
    };
  }

  // Update asset
  async update(assetId: string, input: UpdateAssetInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(input.title);
    }
    if (input.source !== undefined) {
      updates.push(`source = $${paramIndex++}`);
      params.push(input.source);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      params.push(JSON.stringify(input.tags));
    }
    if (input.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(input.content);
    }
    if (input.theme_id !== undefined) {
      updates.push(`theme_id = $${paramIndex++}`);
      params.push(input.theme_id);
    }
    if (input.domain !== undefined) {
      updates.push(`domain = $${paramIndex++}`);
      params.push(input.domain);
    }
    if (input.taxonomy_code !== undefined) {
      updates.push(`taxonomy_code = $${paramIndex++}`);
      params.push(input.taxonomy_code);
    }
    if (input.asset_type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(input.asset_type);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);

    params.push(assetId);

    const result = await query(
      `UPDATE assets SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      content_type: row.content_type,
      tags: row.tags,
      auto_tags: row.auto_tags,
      source: row.source,
      theme_id: row.theme_id,
      quality_score: row.quality_score,
      updated_at: row.updated_at
    };
  }

  // Toggle pin status
  async togglePin(assetId: string, pinned: boolean) {
    const result = await query(
      `UPDATE assets
       SET is_pinned = $1,
           pinned_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [pinned, assetId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      is_pinned: row.is_pinned,
      pinned_at: row.pinned_at,
      updated_at: row.updated_at
    };
  }

  // Create theme
  async createTheme(input: CreateThemeInput) {
    const themeId = `theme_${uuidv4().slice(0, 8)}`;

    // Get max sort order
    const maxOrderResult = await query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM asset_themes`
    );
    const sortOrder = maxOrderResult.rows[0].next_order;

    const domain = input.domain || input.name;
    const taxonomyCode = input.taxonomy_code || null;

    await query(
      `INSERT INTO asset_themes (id, name, description, color, icon, domain, taxonomy_code, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        themeId,
        input.name,
        input.description || null,
        input.color || '#6366f1',
        input.icon || '📁',
        domain,
        taxonomyCode,
        sortOrder
      ]
    );

    return {
      id: themeId,
      name: input.name,
      description: input.description,
      color: input.color || '#6366f1',
      icon: input.icon || '📁',
      domain,
      taxonomy_code: taxonomyCode,
      sort_order: sortOrder
    };
  }

  // Get all themes
  async getThemes() {
    const result = await query(
      `SELECT * FROM asset_themes
       ORDER BY is_pinned DESC, pinned_at DESC, sort_order ASC, created_at DESC`
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon,
      domain: row.domain || row.name,
      taxonomy_code: row.taxonomy_code || null,
      sort_order: row.sort_order,
      is_pinned: row.is_pinned,
      pinned_at: row.pinned_at
    }));
  }

  // Update theme
  async updateTheme(themeId: string, input: Partial<CreateThemeInput>) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(input.description);
    }
    if (input.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      params.push(input.color);
    }
    if (input.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      params.push(input.icon);
    }
    if (input.domain !== undefined) {
      updates.push(`domain = $${paramIndex++}`);
      params.push(input.domain);
    }
    if (input.taxonomy_code !== undefined) {
      updates.push(`taxonomy_code = $${paramIndex++}`);
      params.push(input.taxonomy_code);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(themeId);

    await query(
      `UPDATE asset_themes SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    return this.getThemeById(themeId);
  }

  // Toggle theme pin
  async toggleThemePin(themeId: string, pinned: boolean) {
    await query(
      `UPDATE asset_themes
       SET is_pinned = $1,
           pinned_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2`,
      [pinned, themeId]
    );
    return this.getThemeById(themeId);
  }

  // Delete theme
  async deleteTheme(themeId: string) {
    // Remove theme_id from assets
    await query(
      `UPDATE assets SET theme_id = NULL, updated_at = NOW() WHERE theme_id = $1`,
      [themeId]
    );

    await query(`DELETE FROM asset_themes WHERE id = $1`, [themeId]);
  }

  // Get theme by id
  async getThemeById(themeId: string) {
    const result = await query(
      `SELECT * FROM asset_themes WHERE id = $1`,
      [themeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon,
      domain: row.domain || row.name,
      taxonomy_code: row.taxonomy_code || null,
      sort_order: row.sort_order,
      is_pinned: row.is_pinned,
      pinned_at: row.pinned_at
    };
  }

  // Get assets by theme
  async getAssetsByTheme(themeId: string | null, options: { limit: number; offset: number }, visibility: VisibilityOptions = {}) {
    const { limit, offset } = options;

    let sql = `
      SELECT id, title, content_type, content, tags, auto_tags, source,
             quality_score, is_pinned, pinned_at, theme_id, domain, type,
             created_at, updated_at
      FROM assets
      WHERE 1=1
    `;
    const params: any[] = [];
    const { where, params: visibilityParams } = this.buildVisibilityWhere(visibility);
    sql += where;
    params.push(...visibilityParams);

    if (themeId) {
      sql += ` AND theme_id = $${params.length + 1}`;
      params.push(themeId);
    } else {
      sql += ` AND theme_id IS NULL`;
    }

    sql += ` ORDER BY is_pinned DESC, pinned_at DESC, created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) FROM assets WHERE 1=1`;
    const countParams: any[] = [];
    const visibilityCount = this.buildVisibilityWhere(visibility);
    countSql += visibilityCount.where;
    countParams.push(...visibilityCount.params);
    if (themeId) {
      countSql += ` AND theme_id = $${countParams.length + 1}`;
      countParams.push(themeId);
    } else {
      countSql += ` AND theme_id IS NULL`;
    }
    const countResult = await query(countSql, countParams);

    return {
      total: parseInt(countResult.rows[0].count),
      items: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        content_type: row.content_type,
        content_preview: row.content?.substring(0, 300) + '...',
        tags: row.tags,
        auto_tags: row.auto_tags,
        source: row.source,
        quality_score: row.quality_score,
        is_pinned: row.is_pinned,
        pinned_at: row.pinned_at,
        theme_id: row.theme_id,
        domain: row.domain,
        asset_type: row.type,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    };
  }

  async search(options: { query?: string; tags?: string[]; limit: number; offset?: number; domain?: string; taxonomy_code?: string; asset_type?: string; workspaceId?: string }) {
    const { query: searchQuery, tags, limit, offset = 0, domain, taxonomy_code, asset_type, workspaceId } = options;
    const visibility: VisibilityOptions = {
      includeDeleted: false,
      includeHidden: false
    };

    // 如果有搜索词，使用向量相似度搜索
    if (searchQuery) {
      const queryEmbedding = await generateEmbedding(searchQuery);
      return this.vectorSearch(queryEmbedding, tags, limit, offset, { domain, taxonomy_code, asset_type }, visibility, workspaceId);
    }

    // 否则使用普通标签搜索
    let sql = `
      SELECT id, title, content_type, content, tags, auto_tags, source, quality_score,
             ai_quality_score, ai_processing_status, ai_analyzed_at, theme_id, domain, taxonomy_code, type,
             is_pinned, created_at
      FROM assets
      WHERE 1=1
    `;
    let countSql = `
      SELECT COUNT(*)::int as total
      FROM assets
      WHERE 1=1
    `;
    const params: any[] = [];
    const visibilityWhere = this.buildVisibilityWhere(visibility);
    sql += visibilityWhere.where;
    countSql += visibilityWhere.where;
    params.push(...visibilityWhere.params);

    // Workspace 隔离 (read 模式: 包含 is_shared workspace 行)
    // 登录用户必传; api-key 路径 workspaceId=undefined 跳过 (admin 全局视图)
    if (workspaceId) {
      params.push(workspaceId);
      const cond = ` AND (workspace_id = $${params.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`;
      sql += cond;
      countSql += cond;
    }

    if (tags && tags.length > 0) {
      const tagPlaceholders = tags.map((_, i) => `$${params.length + i + 1}`).join(',');
      sql += ` AND tags ?| ARRAY[${tagPlaceholders}]`;
      countSql += ` AND tags ?| ARRAY[${tagPlaceholders}]`;
      params.push(...tags);
    }

    if (taxonomy_code) {
      // Level-1 (e.g. E07) -> prefix match so sub-codes are included.
      const isL1 = /^E\d{2}$/.test(taxonomy_code);
      params.push(isL1 ? `${taxonomy_code}%` : taxonomy_code);
      sql += ` AND taxonomy_code ${isL1 ? 'LIKE' : '='} $${params.length}`;
      countSql += ` AND taxonomy_code ${isL1 ? 'LIKE' : '='} $${params.length}`;
    } else if (domain) {
      params.push(domain);
      sql += ` AND domain = $${params.length}`;
      countSql += ` AND domain = $${params.length}`;
    }

    if (asset_type) {
      params.push(asset_type);
      sql += ` AND type = $${params.length}`;
      countSql += ` AND type = $${params.length}`;
    }

    sql += ` ORDER BY quality_score DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2))
    ]);
    const total = countResult.rows[0]?.total ?? 0;

    return {
      total,
      items: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        content_type: row.content_type,
        content_preview: row.content?.substring(0, 300) + '...',
        tags: row.tags,
        source: row.source,
        quality_score: row.quality_score,
        theme_id: row.theme_id,
        domain: row.domain,
        taxonomy_code: row.taxonomy_code,
        asset_type: row.type,
        is_pinned: row.is_pinned,
        ai_quality_score: row.ai_quality_score,
        ai_processing_status: row.ai_processing_status,
        ai_analyzed_at: row.ai_analyzed_at,
        created_at: row.created_at
      }))
    };
  }

  // 向量语义搜索（使用 pgvector）
  private async vectorSearch(
    queryEmbedding: number[],
    tags?: string[],
    limit: number = 10,
    offset: number = 0,
    extra: { domain?: string; taxonomy_code?: string; asset_type?: string } = {},
    visibility: VisibilityOptions = {},
    workspaceId?: string,
  ) {
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    let sql = `
      SELECT
        id, title, content_type, content, tags, auto_tags, source, quality_score,
        ai_quality_score, ai_processing_status, ai_analyzed_at, theme_id, domain, taxonomy_code, type,
        is_pinned, created_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM assets
      WHERE embedding IS NOT NULL
    `;
    const params: any[] = [vectorStr];
    const visibilityWhere = this.buildVisibilityWhere(visibility);
    sql += visibilityWhere.where;
    params.push(...visibilityWhere.params);

    // Workspace 隔离 (read 模式: 包含 is_shared workspace 行)
    if (workspaceId) {
      params.push(workspaceId);
      sql += ` AND (workspace_id = $${params.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`;
    }

    if (tags && tags.length > 0) {
      const tagPlaceholders = tags.map((_, i) => `$${params.length + i + 1}`).join(',');
      sql += ` AND tags ?| ARRAY[${tagPlaceholders}]`;
      params.push(...tags);
    }

    if (extra.taxonomy_code) {
      const isL1 = /^E\d{2}$/.test(extra.taxonomy_code);
      params.push(isL1 ? `${extra.taxonomy_code}%` : extra.taxonomy_code);
      sql += ` AND taxonomy_code ${isL1 ? 'LIKE' : '='} $${params.length}`;
    } else if (extra.domain) {
      params.push(extra.domain);
      sql += ` AND domain = $${params.length}`;
    }

    if (extra.asset_type) {
      params.push(extra.asset_type);
      sql += ` AND type = $${params.length}`;
    }

    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return {
      total: result.rows.length,
      items: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        content_type: row.content_type,
        content_preview: row.content?.substring(0, 300) + '...',
        tags: row.tags,
        source: row.source,
        quality_score: row.quality_score,
        theme_id: row.theme_id,
        domain: row.domain,
        taxonomy_code: row.taxonomy_code,
        asset_type: row.type,
        is_pinned: row.is_pinned,
        ai_quality_score: row.ai_quality_score,
        ai_processing_status: row.ai_processing_status,
        ai_analyzed_at: row.ai_analyzed_at,
        similarity: parseFloat(row.similarity || 0),
        created_at: row.created_at
      }))
    };
  }

  async getById(assetId: string) {
    const result = await query(
      'SELECT * FROM assets WHERE id = $1 AND is_deleted = FALSE',
      [assetId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      content_type: row.content_type,
      content: row.content,
      content_preview: row.content?.substring(0, 500) + '...',
      tags: row.tags,
      auto_tags: row.auto_tags,
      source: row.source,
      quality_score: row.quality_score,
      theme_id: row.theme_id,
      is_pinned: row.is_pinned,
      is_hidden: row.is_hidden,
      hidden_at: row.hidden_at,
      hidden_reason: row.hidden_reason,
      ai_quality_score: row.ai_quality_score,
      ai_processing_status: row.ai_processing_status,
      ai_analyzed_at: row.ai_analyzed_at,
      created_at: row.created_at
    };
  }

  async delete(assetId: string) {
    await query('DELETE FROM assets WHERE id = $1', [assetId]);
  }

  async deduplicateAssets(options: AssetDeduplicateOptions) {
    const { mode, limit = 2000, includeHidden = false } = options;
    const candidates = await query(
      `SELECT id, title, content, created_at, COALESCE(citation_count, 0) AS citation_count
       FROM assets
       WHERE is_deleted = FALSE
         AND ($1::boolean OR is_hidden = FALSE)
       ORDER BY created_at ASC
       LIMIT $2`,
      [includeHidden, limit]
    );

    const grouped = new Map<string, Array<{ id: string; title: string; content: string; created_at: string; citation_count: number }>>();
    for (const row of candidates.rows) {
      const duplicateKey = this.buildDuplicateKey(row.title, row.content);
      if (!duplicateKey) continue;
      const list = grouped.get(duplicateKey) || [];
      list.push(row);
      grouped.set(duplicateKey, list);
    }

    const duplicateGroups = [...grouped.entries()].filter(([, rows]) => rows.length > 1);
    const duplicateIds = duplicateGroups.flatMap(([, rows]) => rows.map(r => r.id));
    const inWikiSet = await this.getAssetsInWikiSet(duplicateIds);

    const actions: DedupAction[] = [];
    for (const [duplicateKey, rows] of duplicateGroups) {
      const sorted = [...rows].sort((a, b) => {
        if ((b.citation_count || 0) !== (a.citation_count || 0)) {
          return (b.citation_count || 0) - (a.citation_count || 0);
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      const canonical = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const row = sorted[i];
        const inWiki = inWikiSet.has(row.id);
        actions.push({
          asset_id: row.id,
          title: row.title,
          duplicate_key: duplicateKey,
          canonical_asset_id: canonical.id,
          in_wiki: inWiki,
          action: mode === 'apply' ? (inWiki ? 'hidden' : 'deleted') : (inWiki ? 'would_hide' : 'would_delete'),
          reason: inWiki ? 'entered_wiki_protected' : 'duplicate_not_in_wiki'
        });
      }
    }

    if (mode === 'apply' && actions.length > 0) {
      for (const item of actions) {
        if (item.in_wiki) {
          await query(
            `UPDATE assets
             SET is_hidden = TRUE,
                 hidden_at = NOW(),
                 hidden_reason = 'dedup_wiki_protected',
                 updated_at = NOW()
             WHERE id = $1`,
            [item.asset_id]
          );
        } else {
          await query(`DELETE FROM assets WHERE id = $1`, [item.asset_id]);
        }
      }
    }

    return {
      mode,
      scanned: candidates.rows.length,
      duplicate_groups: duplicateGroups.length,
      canonical_kept: duplicateGroups.length,
      to_hide: actions.filter(a => a.in_wiki).length,
      to_delete: actions.filter(a => !a.in_wiki).length,
      processed: actions.length,
      actions
    };
  }

  private buildVisibilityWhere(options: VisibilityOptions): { where: string; params: any[] } {
    let where = '';
    const params: any[] = [];
    if (!options.includeDeleted) {
      where += ` AND is_deleted = FALSE`;
    }
    if (!options.includeHidden) {
      where += ` AND COALESCE(is_hidden, FALSE) = FALSE`;
    }
    return { where, params };
  }

  private normalizeText(input: string): string {
    return input
      .toLowerCase()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  private buildDuplicateKey(title?: string | null, content?: string | null): string | null {
    const normalizedTitle = this.normalizeText(title || '');
    const normalizedContent = this.normalizeText(content || '');
    if (!normalizedTitle && !normalizedContent) {
      return null;
    }
    return createHash('sha256')
      .update(`${normalizedTitle}\n${normalizedContent}`, 'utf8')
      .digest('hex');
  }

  private async getAssetsInWikiSet(assetIds: string[]): Promise<Set<string>> {
    if (assetIds.length === 0) return new Set<string>();
    const result = await query(
      `SELECT DISTINCT asset_id
       FROM content_facts
       WHERE is_current = TRUE
         AND asset_id = ANY($1::varchar[])`,
      [assetIds]
    );
    return new Set<string>(result.rows.map(r => String(r.asset_id)));
  }

  // 辅助方法
  private async extractContent(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype === 'text/plain' || mimetype === 'text/markdown') {
      return buffer.toString('utf-8');
    }

    if (mimetype === 'application/pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(buffer);
        return result.text;
      } catch (error) {
        console.error('[Asset] PDF parsing failed:', error);
        return '[PDF parsing failed]';
      }
    }

    return `[Binary content: ${mimetype}]`;
  }

  private async generateTags(content: string, userTags: string[]): Promise<string[]> {
    if (userTags.length > 0) return userTags;

    const prompt = `请为以下内容提取3-5个关键词标签（JSON数组格式）：

${content.substring(0, 2000)}

输出格式：["标签1", "标签2", "标签3"]`;

    try {
      const result = await generate(prompt, 'tagging', { temperature: 0.3, maxTokens: 200 });
      const jsonMatch = result.content.match(/\[["\w\s,]+\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[Asset] Tag generation failed:', error);
    }

    return ['未分类'];
  }

  private calculateQualityScore(content: string, source?: string): number {
    let score = 0.5;

    // 内容长度
    if (content.length > 5000) score += 0.1;
    if (content.length > 10000) score += 0.1;

    // 来源权威性
    const authoritativeSources = ['政府', '国务院', '证监会', '央行', '统计局'];
    if (source && authoritativeSources.some(s => source.includes(s))) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private getContentType(mimetype: string): string {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'text/markdown': 'md'
    };
    return map[mimetype] || 'unknown';
  }
}
