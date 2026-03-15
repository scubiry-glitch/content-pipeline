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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, NOW())`,
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

  async search(options: { query?: string; tags?: string[]; limit: number }) {
    const { query: searchQuery, tags, limit } = options;

    // 如果有搜索词，使用向量相似度搜索
    if (searchQuery) {
      const queryEmbedding = await generateEmbedding(searchQuery);
      return this.vectorSearch(queryEmbedding, tags, limit);
    }

    // 否则使用普通标签搜索
    let sql = `
      SELECT id, title, content_type, content, tags, auto_tags, source, quality_score, created_at
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
        id, title, content_type, content, tags, auto_tags, source, quality_score, created_at,
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
