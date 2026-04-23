// v3.4 素材服务 - AssetService
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export type AssetType =
  | 'file' | 'report' | 'quote' | 'data' | 'rss_item'
  | 'chart' | 'insight'
  | 'meeting_minutes' | 'briefing' | 'interview' | 'transcript';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  file: '文件',
  report: '研报',
  quote: '引用',
  data: '数据',
  rss_item: 'RSS',
  chart: '图表',
  insight: '洞察',
  meeting_minutes: '会议纪要',
  briefing: '述职材料',
  interview: '访谈实录',
  transcript: '音视频转录',
};

export interface Asset {
  id: string;
  type: AssetType;
  title: string;
  content: string;
  source: string;
  sourceId?: string;
  tags: string[];
  qualityScore: number;
  usageCount: number;
  domain?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAssetDTO {
  type: AssetType;
  title: string;
  content: string;
  source?: string;
  sourceId?: string;
  tags?: string[];
  qualityScore?: number;
  domain?: string;
  metadata?: Record<string, any>;
}

export interface AssetFilters {
  type?: AssetType;
  sourceId?: string;
  domain?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// v7.6 会议纪要采集渠道 (migration 028) ---------------------------------------
export type MeetingNoteSourceKind =
  | 'lark' | 'zoom' | 'teams' | 'upload' | 'folder' | 'manual';

export type MeetingNoteImportStatus =
  | 'pending' | 'running' | 'succeeded' | 'failed' | 'partial';

export interface MeetingNoteSource {
  id: string;
  name: string;
  kind: MeetingNoteSourceKind;
  config: Record<string, any>;
  isActive: boolean;
  scheduleCron?: string | null;
  lastImportedAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingNoteImport {
  id: string;
  sourceId: string;
  status: MeetingNoteImportStatus;
  startedAt: Date;
  finishedAt?: Date | null;
  itemsDiscovered: number;
  itemsImported: number;
  duplicates: number;
  errors: number;
  errorMessage?: string | null;
  assetIds: string[];
  triggeredBy: string;
}

/** 上游 adapter 抓到的草稿，在 ingestDraft 里转成 Asset。 */
export interface ImportedMeetingNoteDraft {
  externalId: string;          // sha256(file_bytes) for uploads; provider id for lark/zoom
  title: string;
  content: string;
  occurredAt?: Date;           // 会议发生时间（非导入时间）
  participants?: string[];
  domain?: string;             // D01-D15 taxonomy slug
  metadata?: Record<string, any>;
}

export class AssetService {
  // 创建素材
  async createAsset(data: CreateAssetDTO): Promise<Asset> {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO assets (id, type, title, content, source, source_id, tags, quality_score, domain, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        id,
        data.type,
        data.title,
        data.content,
        data.source || null,
        data.sourceId || null,
        JSON.stringify(data.tags || []),
        data.qualityScore || 0,
        data.domain || null,
        JSON.stringify(data.metadata || {})
      ]
    );

    return this.formatAsset(result.rows[0]);
  }

  // 从研报提取素材
  async extractFromReport(reportId: string, selections: {
    type: AssetType;
    content: string;
    title?: string;
    page?: number;
  }[]): Promise<Asset[]> {
    // 获取研报信息
    const reportResult = await query(
      `SELECT title, institution FROM reports WHERE id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error('Report not found');
    }

    const report = reportResult.rows[0];
    const assets: Asset[] = [];

    for (const selection of selections) {
      const asset = await this.createAsset({
        type: selection.type,
        title: selection.title || `${report.title} - ${this.getTypeLabel(selection.type)}`,
        content: selection.content,
        source: report.institution,
        sourceId: reportId,
        tags: [selection.type],
        qualityScore: 80, // 默认质量分
        metadata: { page: selection.page }
      });
      assets.push(asset);
    }

    return assets;
  }

  // 获取素材列表
  async getAssets(filters: AssetFilters = {}): Promise<{ items: Asset[]; total: number }> {
    const { type, sourceId, domain, search, page = 1, limit = 20 } = filters;

    let sql = `SELECT * FROM assets WHERE 1=1`;
    let countSql = `SELECT COUNT(*) FROM assets WHERE 1=1`;
    const params: any[] = [];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
      countSql += ` AND type = $${params.length}`;
    }

    if (sourceId) {
      params.push(sourceId);
      sql += ` AND source_id = $${params.length}`;
      countSql += ` AND source_id = $${params.length}`;
    }

    if (domain) {
      params.push(domain);
      sql += ` AND domain = $${params.length}`;
      countSql += ` AND domain = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (title ILIKE $${params.length} OR content ILIKE $${params.length})`;
      countSql += ` AND (title ILIKE $${params.length} OR content ILIKE $${params.length})`;
    }

    sql += ` ORDER BY usage_count DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, (page - 1) * limit);

    const [itemsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, -2))
    ]);

    return {
      items: itemsResult.rows.map(row => this.formatAsset(row)),
      total: parseInt(countResult.rows[0].count)
    };
  }

  // 获取素材详情
  async getAsset(id: string): Promise<Asset | null> {
    const result = await query(`SELECT * FROM assets WHERE id = $1`, [id]);
    if (result.rows.length === 0) return null;
    return this.formatAsset(result.rows[0]);
  }

  // 更新素材
  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title) {
      updates.push(`title = $${values.length + 1}`);
      values.push(data.title);
    }
    if (data.content) {
      updates.push(`content = $${values.length + 1}`);
      values.push(data.content);
    }
    if (data.tags) {
      updates.push(`tags = $${values.length + 1}`);
      values.push(JSON.stringify(data.tags));
    }

    if (updates.length === 0) return this.getAsset(id);

    values.push(id);
    const sql = `UPDATE assets SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return null;
    return this.formatAsset(result.rows[0]);
  }

  // 删除素材
  async deleteAsset(id: string): Promise<boolean> {
    const result = await query(`DELETE FROM assets WHERE id = $1 RETURNING id`, [id]);
    return result.rows.length > 0;
  }

  // 一键引用素材
  async quickQuote(id: string): Promise<{ asset: Asset; quote: string }> {
    const asset = await this.getAsset(id);
    if (!asset) throw new Error('Asset not found');

    // 增加引用计数
    await this.incrementUsage(id);

    // 生成引用格式
    const quote = this.generateQuote(asset);

    return { asset, quote };
  }

  // 增加引用计数
  async incrementUsage(id: string): Promise<void> {
    await query(
      `UPDATE assets SET usage_count = usage_count + 1 WHERE id = $1`,
      [id]
    );
  }

  // 生成引用格式
  private generateQuote(asset: Asset): string {
    const sourceRef = asset.source ? `（来源：${asset.source}）` : '';

    switch (asset.type) {
      case 'quote':
        return `> "${asset.content}"${sourceRef}`;
      case 'data':
        return `${asset.title}：${asset.content}${sourceRef}`;
      case 'insight':
        return `💡 ${asset.content}${sourceRef}`;
      case 'chart':
        return `📊 ${asset.title}${sourceRef}\n[图表]`;
      case 'meeting_minutes':
        return `📝 ${asset.title}\n${asset.content}${sourceRef}`;
      case 'briefing':
        return `📋 ${asset.title}\n${asset.content}${sourceRef}`;
      case 'interview':
        return `🎤 ${asset.title}\n${asset.content}${sourceRef}`;
      case 'transcript':
        return `🎧 ${asset.title}\n${asset.content}${sourceRef}`;
      default:
        return `${asset.content}${sourceRef}`;
    }
  }

  // 获取类型标签
  private getTypeLabel(type: AssetType): string {
    return ASSET_TYPE_LABELS[type] || type;
  }

  // 格式化素材数据
  private formatAsset(row: any): Asset {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      content: row.content,
      source: row.source,
      sourceId: row.source_id,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
      qualityScore: row.quality_score || 0,
      usageCount: row.usage_count || 0,
      domain: row.domain || undefined,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const assetService = new AssetService();
