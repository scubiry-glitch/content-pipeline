// v3.4 研报服务 - ReportService
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface QualityScore {
  overall: number;
  authority: number;
  completeness: number;
  logic: number;
  freshness: number;
  citations: number;
}

export interface Report {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  publishDate: Date;
  pageCount: number;
  abstract?: string;
  keyPoints: string[];
  tags: string[];
  qualityScore: QualityScore;
  fileUrl: string;
  status: 'pending' | 'parsing' | 'parsed' | 'error';
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReportDTO {
  title: string;
  authors?: string[];
  institution?: string;
  publishDate?: Date;
  pageCount?: number;
  fileUrl: string;
}

export interface ReportFilters {
  institution?: string;
  minQuality?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export class ReportService {
  // 创建研报记录
  async createReport(data: CreateReportDTO): Promise<Report> {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO reports (
        id, title, authors, institution, publish_date, page_count, file_url, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *`,
      [
        id,
        data.title,
        JSON.stringify(data.authors || []),
        data.institution || null,
        data.publishDate || null,
        data.pageCount || null,
        data.fileUrl,
        'pending'
      ]
    );

    return this.formatReport(result.rows[0]);
  }

  // 获取研报列表
  async getReports(filters: ReportFilters = {}): Promise<{ items: Report[]; total: number }> {
    const { institution, minQuality, search, page = 1, limit = 20 } = filters;

    let sql = `SELECT * FROM reports WHERE 1=1`;
    let countSql = `SELECT COUNT(*) FROM reports WHERE 1=1`;
    const params: any[] = [];

    if (institution) {
      params.push(institution);
      sql += ` AND institution = $${params.length}`;
      countSql += ` AND institution = $${params.length}`;
    }

    if (minQuality) {
      params.push(minQuality);
      sql += ` AND quality_score_overall >= $${params.length}`;
      countSql += ` AND quality_score_overall >= $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (title ILIKE $${params.length} OR tags::text ILIKE $${params.length})`;
      countSql += ` AND (title ILIKE $${params.length} OR tags::text ILIKE $${params.length})`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, (page - 1) * limit);

    const [itemsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, -2))
    ]);

    return {
      items: itemsResult.rows.map(row => this.formatReport(row)),
      total: parseInt(countResult.rows[0].count)
    };
  }

  // 获取研报详情
  async getReport(id: string): Promise<Report | null> {
    const result = await query(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (result.rows.length === 0) return null;
    return this.formatReport(result.rows[0]);
  }

  // 更新研报
  async updateReport(id: string, data: Partial<Report>): Promise<Report | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title) {
      updates.push(`title = $${values.length + 1}`);
      values.push(data.title);
    }
    if (data.tags) {
      updates.push(`tags = $${values.length + 1}`);
      values.push(JSON.stringify(data.tags));
    }
    if (data.abstract) {
      updates.push(`abstract = $${values.length + 1}`);
      values.push(data.abstract);
    }
    if (data.keyPoints) {
      updates.push(`key_points = $${values.length + 1}`);
      values.push(JSON.stringify(data.keyPoints));
    }

    if (updates.length === 0) return this.getReport(id);

    values.push(id);
    const sql = `UPDATE reports SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return null;
    return this.formatReport(result.rows[0]);
  }

  // 删除研报
  async deleteReport(id: string): Promise<boolean> {
    const result = await query(`DELETE FROM reports WHERE id = $1 RETURNING id`, [id]);
    return result.rows.length > 0;
  }

  // 更新解析结果
  async updateParseResult(id: string, parseData: {
    title?: string;
    authors?: string[];
    institution?: string;
    publishDate?: Date;
    pageCount?: number;
    abstract?: string;
    keyPoints?: string[];
    tags?: string[];
    qualityScore?: QualityScore;
    parsedContent?: string;
    sections?: any[];
    status: 'pending' | 'parsing' | 'parsed' | 'error';
  }): Promise<Report | null> {
    const result = await query(
      `UPDATE reports SET
        title = COALESCE($2, title),
        authors = COALESCE($3, authors),
        institution = COALESCE($4, institution),
        publish_date = COALESCE($5, publish_date),
        page_count = COALESCE($6, page_count),
        abstract = COALESCE($7, abstract),
        key_points = COALESCE($8, key_points),
        tags = COALESCE($9, tags),
        quality_score_overall = COALESCE($10, quality_score_overall),
        quality_score_authority = COALESCE($11, quality_score_authority),
        quality_score_completeness = COALESCE($12, quality_score_completeness),
        quality_score_logic = COALESCE($13, quality_score_logic),
        quality_score_freshness = COALESCE($14, quality_score_freshness),
        quality_score_citations = COALESCE($15, quality_score_citations),
        parsed_content = COALESCE($16, parsed_content),
        sections = COALESCE($17, sections),
        status = $18,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [
        id,
        parseData.title,
        JSON.stringify(parseData.authors),
        parseData.institution,
        parseData.publishDate,
        parseData.pageCount,
        parseData.abstract,
        JSON.stringify(parseData.keyPoints),
        JSON.stringify(parseData.tags),
        parseData.qualityScore?.overall,
        parseData.qualityScore?.authority,
        parseData.qualityScore?.completeness,
        parseData.qualityScore?.logic,
        parseData.qualityScore?.freshness,
        parseData.qualityScore?.citations,
        parseData.parsedContent,
        JSON.stringify(parseData.sections),
        parseData.status
      ]
    );

    if (result.rows.length === 0) return null;
    return this.formatReport(result.rows[0]);
  }

  // 增加引用计数
  async incrementUsage(id: string): Promise<void> {
    await query(
      `UPDATE reports SET usage_count = usage_count + 1 WHERE id = $1`,
      [id]
    );
  }

  // 获取关联内容
  async getRelatedContent(reportId: string): Promise<{
    hotTopics: any[];
    assets: any[];
    relatedReports: any[];
  }> {
    const [hotTopicsResult, assetsResult, relatedReportsResult] = await Promise.all([
      // 关联热点
      query(
        `SELECT ht.*, r.match_score
         FROM hot_topics ht
         JOIN report_hot_topic_relations r ON ht.id = r.hot_topic_id
         WHERE r.report_id = $1
         ORDER BY r.match_score DESC`,
        [reportId]
      ),
      // 关联素材
      query(
        `SELECT * FROM assets WHERE source_id = $1 ORDER BY quality_score DESC`,
        [reportId]
      ),
      // 相关研报（简单实现：同机构的其他研报）
      query(
        `SELECT * FROM reports
         WHERE institution = (SELECT institution FROM reports WHERE id = $1)
         AND id != $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [reportId]
      )
    ]);

    return {
      hotTopics: hotTopicsResult.rows,
      assets: assetsResult.rows,
      relatedReports: relatedReportsResult.rows.map(row => this.formatReport(row))
    };
  }

  // 格式化研报数据
  private formatReport(row: any): Report {
    return {
      id: row.id,
      title: row.title,
      authors: typeof row.authors === 'string' ? JSON.parse(row.authors) : row.authors || [],
      institution: row.institution,
      publishDate: row.publish_date,
      pageCount: row.page_count,
      abstract: row.abstract,
      keyPoints: typeof row.key_points === 'string' ? JSON.parse(row.key_points) : row.key_points || [],
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
      qualityScore: {
        overall: row.quality_score_overall || 0,
        authority: row.quality_score_authority || 0,
        completeness: row.quality_score_completeness || 0,
        logic: row.quality_score_logic || 0,
        freshness: row.quality_score_freshness || 0,
        citations: row.quality_score_citations || 0
      },
      fileUrl: row.file_url,
      status: row.status,
      usageCount: row.usage_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const reportService = new ReportService();
