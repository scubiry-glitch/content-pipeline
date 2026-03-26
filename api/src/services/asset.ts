// 素材库服务
// 支持: 上传、语义搜索、标签管理

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { generate, generateEmbedding } from './llm.js';

export interface UploadAssetInput {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  title: string;
  source?: string;
  tags: string[];
}

export interface UpdateAssetInput {
  title?: string;
  source?: string;
  tags?: string[];
  content?: string;
  theme_id?: string | null;
}

export interface CreateThemeInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
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

    await query(
      `INSERT INTO assets (
        id, title, content, content_type, filename,
        source, tags, auto_tags, quality_score, embedding,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, NOW(), NOW())`,
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
        `[${embedding.join(',')}]`
      ]
    );

    return {
      id: assetId,
      title: input.title,
      content_type: this.getContentType(input.mimetype),
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

    await query(
      `INSERT INTO asset_themes (id, name, description, color, icon, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        themeId,
        input.name,
        input.description || null,
        input.color || '#6366f1',
        input.icon || '📁',
        sortOrder
      ]
    );

    return {
      id: themeId,
      name: input.name,
      description: input.description,
      color: input.color || '#6366f1',
      icon: input.icon || '📁',
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
      sort_order: row.sort_order,
      is_pinned: row.is_pinned,
      pinned_at: row.pinned_at
    };
  }

  // Get assets by theme
  async getAssetsByTheme(themeId: string | null, options: { limit: number; offset: number }) {
    const { limit, offset } = options;

    let sql = `
      SELECT id, title, content_type, content, tags, auto_tags, source,
             quality_score, is_pinned, pinned_at, theme_id, created_at, updated_at
      FROM assets
      WHERE 1=1
    `;
    const params: any[] = [];

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
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    };
  }

  async search(options: { query?: string; tags?: string[]; limit: number }) {
    const { query: searchQuery, tags, limit } = options;

    // 如果有搜索词，使用向量相似度搜索
    if (searchQuery) {
      const queryEmbedding = await generateEmbedding(searchQuery);
      return this.vectorSearch(queryEmbedding, tags, limit);
    }

    // 否则使用普通标签搜索
    let sql = `
      SELECT id, title, content_type, content, tags, auto_tags, source, quality_score, 
             ai_quality_score, ai_processing_status, ai_analyzed_at, theme_id, is_pinned, created_at
      FROM assets
      WHERE 1=1
    `;
    const params: any[] = [];

    if (tags && tags.length > 0) {
      const tagPlaceholders = tags.map((_, i) => `$${params.length + i + 1}`).join(',');
      sql += ` AND tags ?| ARRAY[${tagPlaceholders}]`;
      params.push(...tags);
    }

    sql += ` ORDER BY quality_score DESC, created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

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
    limit: number = 10
  ) {
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    let sql = `
      SELECT
        id, title, content_type, content, tags, auto_tags, source, quality_score, 
        ai_quality_score, ai_processing_status, ai_analyzed_at, theme_id, is_pinned, created_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM assets
      WHERE embedding IS NOT NULL
    `;
    const params: any[] = [vectorStr];

    if (tags && tags.length > 0) {
      const tagPlaceholders = tags.map((_, i) => `$${i + 2}`).join(',');
      sql += ` AND tags ?| ARRAY[${tagPlaceholders}]`;
      params.push(...tags);
    }

    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(limit);

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
    const result = await query('SELECT * FROM assets WHERE id = $1', [assetId]);

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
      ai_quality_score: row.ai_quality_score,
      ai_processing_status: row.ai_processing_status,
      ai_analyzed_at: row.ai_analyzed_at,
      created_at: row.created_at
    };
  }

  async delete(assetId: string) {
    await query('DELETE FROM assets WHERE id = $1', [assetId]);
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
