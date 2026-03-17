// v4.2 Stage 3 文稿生成增强服务
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

// ============ 标注类型定义 ============
export interface Annotation {
  id: string;
  draftId: string;
  versionId?: string;
  type: 'error' | 'logic' | 'optimize' | 'add' | 'delete';
  startOffset: number;
  endOffset: number;
  selectedText: string;
  comment?: string;
  suggestion?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdBy: 'user' | 'ai' | 'blueteam';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAnnotationData {
  draftId: string;
  versionId?: string;
  type: 'error' | 'logic' | 'optimize' | 'add' | 'delete';
  startOffset: number;
  endOffset: number;
  selectedText: string;
  comment?: string;
  suggestion?: string;
  createdBy: 'user' | 'ai' | 'blueteam';
}

// ============ 版本类型定义 ============
export interface DraftVersion {
  id: string;
  draftId: string;
  name?: string;
  content: string;
  versionNumber: number;
  createdBy: string;
  autoSave: boolean;
  createdAt: Date;
}

export interface CreateVersionData {
  draftId: string;
  name?: string;
  content: string;
  createdBy: string;
  autoSave?: boolean;
}

// ============ 对话会话类型定义 ============
export interface ChatSession {
  id: string;
  draftId: string;
  versionId?: string;
  messages: ChatMessage[];
  contextRange?: { start: number; end: number };
  createdAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface CreateChatSessionData {
  draftId: string;
  versionId?: string;
  contextRange?: { start: number; end: number };
}

// ============ 修改日志类型定义 ============
export interface ChangeLog {
  id: string;
  draftId: string;
  versionFrom?: string;
  versionTo?: string;
  changeType: 'annotation' | 'chat' | 'manual';
  changeSummary: string;
  changesDetail?: any;
  changedBy: string;
  createdAt: Date;
}

export interface CreateChangeLogData {
  draftId: string;
  versionFrom?: string;
  versionTo?: string;
  changeType: 'annotation' | 'chat' | 'manual';
  changeSummary: string;
  changesDetail?: any;
  changedBy: string;
}

// ============ 标注服务 ============
export class AnnotationService {
  // 创建标注
  async createAnnotation(data: CreateAnnotationData): Promise<Annotation> {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO draft_annotations (
        id, draft_id, version_id, type, start_offset, end_offset,
        selected_text, comment, suggestion, status, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        id, data.draftId, data.versionId, data.type,
        data.startOffset, data.endOffset, data.selectedText,
        data.comment, data.suggestion, 'pending', data.createdBy
      ]
    );

    return this.formatAnnotation(result.rows[0]);
  }

  // 获取文稿的所有标注
  async getAnnotationsByDraft(draftId: string, versionId?: string): Promise<Annotation[]> {
    let sql = `SELECT * FROM draft_annotations WHERE draft_id = $1`;
    const params: any[] = [draftId];

    if (versionId) {
      sql += ` AND (version_id = $2 OR version_id IS NULL)`;
      params.push(versionId);
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);
    return result.rows.map(row => this.formatAnnotation(row));
  }

  // 获取标注详情
  async getAnnotationById(id: string): Promise<Annotation | null> {
    const result = await query(
      `SELECT * FROM draft_annotations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatAnnotation(result.rows[0]);
  }

  // 更新标注状态
  async updateAnnotationStatus(
    id: string,
    status: 'pending' | 'accepted' | 'rejected',
    updates?: { comment?: string; suggestion?: string }
  ): Promise<Annotation | null> {
    let sql = `UPDATE draft_annotations SET status = $1, updated_at = NOW()`;
    const params: any[] = [status];
    let paramIndex = 2;

    if (updates?.comment) {
      sql += `, comment = $${paramIndex}`;
      params.push(updates.comment);
      paramIndex++;
    }

    if (updates?.suggestion) {
      sql += `, suggestion = $${paramIndex}`;
      params.push(updates.suggestion);
      paramIndex++;
    }

    sql += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await query(sql, params);
    if (result.rows.length === 0) return null;
    return this.formatAnnotation(result.rows[0]);
  }

  // 删除标注
  async deleteAnnotation(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM draft_annotations WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  // 统计标注
  async getAnnotationStats(draftId: string): Promise<{
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    byType: Record<string, number>;
  }> {
    const result = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        type
      FROM draft_annotations
      WHERE draft_id = $1
      GROUP BY type`,
      [draftId]
    );

    const byType: Record<string, number> = {};
    let total = 0;
    let pending = 0;
    let accepted = 0;
    let rejected = 0;

    for (const row of result.rows) {
      byType[row.type] = parseInt(row.count || '0');
    }

    const summaryResult = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
      FROM draft_annotations
      WHERE draft_id = $1`,
      [draftId]
    );

    if (summaryResult.rows.length > 0) {
      total = parseInt(summaryResult.rows[0].total);
      pending = parseInt(summaryResult.rows[0].pending);
      accepted = parseInt(summaryResult.rows[0].accepted);
      rejected = parseInt(summaryResult.rows[0].rejected);
    }

    return { total, pending, accepted, rejected, byType };
  }

  private formatAnnotation(row: any): Annotation {
    return {
      id: row.id,
      draftId: row.draft_id,
      versionId: row.version_id,
      type: row.type,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      selectedText: row.selected_text,
      comment: row.comment,
      suggestion: row.suggestion,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

// ============ 版本服务 ============
export class VersionService {
  // 创建版本
  async createVersion(data: CreateVersionData): Promise<DraftVersion> {
    const id = uuidv4();

    // 获取当前最大版本号
    const versionResult = await query(
      `SELECT COALESCE(MAX(version_number), 0) as max_version
       FROM draft_versions WHERE draft_id = $1`,
      [data.draftId]
    );
    const versionNumber = parseInt(versionResult.rows[0].max_version) + 1;

    const result = await query(
      `INSERT INTO draft_versions (
        id, draft_id, name, content, version_number, created_by, auto_save, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [
        id, data.draftId, data.name || `版本 ${versionNumber}`,
        data.content, versionNumber, data.createdBy, data.autoSave || false
      ]
    );

    return this.formatVersion(result.rows[0]);
  }

  // 获取文稿的所有版本
  async getVersionsByDraft(draftId: string): Promise<DraftVersion[]> {
    const result = await query(
      `SELECT * FROM draft_versions
       WHERE draft_id = $1
       ORDER BY version_number DESC`,
      [draftId]
    );
    return result.rows.map(row => this.formatVersion(row));
  }

  // 获取版本详情
  async getVersionById(id: string): Promise<DraftVersion | null> {
    const result = await query(
      `SELECT * FROM draft_versions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatVersion(result.rows[0]);
  }

  // 获取特定版本号
  async getVersionByNumber(draftId: string, versionNumber: number): Promise<DraftVersion | null> {
    const result = await query(
      `SELECT * FROM draft_versions
       WHERE draft_id = $1 AND version_number = $2`,
      [draftId, versionNumber]
    );

    if (result.rows.length === 0) return null;
    return this.formatVersion(result.rows[0]);
  }

  // 删除版本
  async deleteVersion(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM draft_versions WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  // 比较两个版本
  async compareVersions(versionId1: string, versionId2: string): Promise<{
    version1: DraftVersion;
    version2: DraftVersion;
    diff: { added: number; removed: number; unchanged: number };
  } | null> {
    const v1 = await this.getVersionById(versionId1);
    const v2 = await this.getVersionById(versionId2);

    if (!v1 || !v2) return null;

    // 简单的行级比较
    const lines1 = v1.content.split('\n');
    const lines2 = v2.content.split('\n');

    const set1 = new Set(lines1);
    const set2 = new Set(lines2);

    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const line of lines2) {
      if (set1.has(line)) {
        unchanged++;
      } else {
        added++;
      }
    }

    for (const line of lines1) {
      if (!set2.has(line)) {
        removed++;
      }
    }

    return {
      version1: v1,
      version2: v2,
      diff: { added, removed, unchanged }
    };
  }

  // 自动保存
  async autoSave(draftId: string, content: string, createdBy: string): Promise<DraftVersion> {
    // 检查最近的自动保存版本
    const recentResult = await query(
      `SELECT id, created_at FROM draft_versions
       WHERE draft_id = $1 AND auto_save = true
       ORDER BY created_at DESC LIMIT 1`,
      [draftId]
    );

    // 如果5分钟内有自动保存，更新它
    if (recentResult.rows.length > 0) {
      const lastAutoSave = new Date(recentResult.rows[0].created_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      if (lastAutoSave > fiveMinutesAgo) {
        await query(
          `UPDATE draft_versions
           SET content = $1, created_at = NOW()
           WHERE id = $2`,
          [content, recentResult.rows[0].id]
        );
        return this.getVersionById(recentResult.rows[0].id) as Promise<DraftVersion>;
      }
    }

    // 创建新的自动保存版本
    return this.createVersion({
      draftId,
      content,
      createdBy,
      autoSave: true
    });
  }

  private formatVersion(row: any): DraftVersion {
    return {
      id: row.id,
      draftId: row.draft_id,
      name: row.name,
      content: row.content,
      versionNumber: row.version_number,
      createdBy: row.created_by,
      autoSave: row.auto_save,
      createdAt: row.created_at
    };
  }
}

// ============ 对话会话服务 ============
export class ChatSessionService {
  // 创建会话
  async createSession(data: CreateChatSessionData): Promise<ChatSession> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO draft_chat_sessions (
        id, draft_id, version_id, messages, context_range, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`,
      [
        id, data.draftId, data.versionId,
        JSON.stringify([]),
        data.contextRange ? JSON.stringify(data.contextRange) : null
      ]
    );

    return this.formatSession(result.rows[0]);
  }

  // 获取会话
  async getSessionById(id: string): Promise<ChatSession | null> {
    const result = await query(
      `SELECT * FROM draft_chat_sessions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatSession(result.rows[0]);
  }

  // 获取文稿的所有会话
  async getSessionsByDraft(draftId: string): Promise<ChatSession[]> {
    const result = await query(
      `SELECT * FROM draft_chat_sessions
       WHERE draft_id = $1
       ORDER BY created_at DESC`,
      [draftId]
    );
    return result.rows.map(row => this.formatSession(row));
  }

  // 添加消息
  async addMessage(
    sessionId: string,
    message: Omit<ChatMessage, 'timestamp'>
  ): Promise<ChatSession | null> {
    const session = await this.getSessionById(sessionId);
    if (!session) return null;

    const newMessage: ChatMessage = {
      ...message,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...session.messages, newMessage];

    const result = await query(
      `UPDATE draft_chat_sessions
       SET messages = $1
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(updatedMessages), sessionId]
    );

    if (result.rows.length === 0) return null;
    return this.formatSession(result.rows[0]);
  }

  // 删除会话
  async deleteSession(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM draft_chat_sessions WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  private formatSession(row: any): ChatSession {
    return {
      id: row.id,
      draftId: row.draft_id,
      versionId: row.version_id,
      messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
      contextRange: row.context_range ? (
        typeof row.context_range === 'string'
          ? JSON.parse(row.context_range)
          : row.context_range
      ) : undefined,
      createdAt: row.created_at
    };
  }
}

// ============ 修改追踪服务 ============
export class ChangeTrackingService {
  // 记录修改
  async logChange(data: CreateChangeLogData): Promise<ChangeLog> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO draft_change_logs (
        id, draft_id, version_from, version_to,
        change_type, change_summary, changes_detail, changed_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        id, data.draftId, data.versionFrom, data.versionTo,
        data.changeType, data.changeSummary,
        data.changesDetail ? JSON.stringify(data.changesDetail) : null,
        data.changedBy
      ]
    );

    return this.formatChangeLog(result.rows[0]);
  }

  // 获取修改历史
  async getChangeLogs(draftId: string, limit: number = 50): Promise<ChangeLog[]> {
    const result = await query(
      `SELECT * FROM draft_change_logs
       WHERE draft_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [draftId, limit]
    );
    return result.rows.map(row => this.formatChangeLog(row));
  }

  // 获取修改详情
  async getChangeLogById(id: string): Promise<ChangeLog | null> {
    const result = await query(
      `SELECT * FROM draft_change_logs WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatChangeLog(result.rows[0]);
  }

  private formatChangeLog(row: any): ChangeLog {
    return {
      id: row.id,
      draftId: row.draft_id,
      versionFrom: row.version_from,
      versionTo: row.version_to,
      changeType: row.change_type,
      changeSummary: row.change_summary,
      changesDetail: row.changes_detail ? (
        typeof row.changes_detail === 'string'
          ? JSON.parse(row.changes_detail)
          : row.changes_detail
      ) : undefined,
      changedBy: row.changed_by,
      createdAt: row.created_at
    };
  }
}

// ============ 导出服务实例 ============
export const annotationService = new AnnotationService();
export const versionService = new VersionService();
export const chatSessionService = new ChatSessionService();
export const changeTrackingService = new ChangeTrackingService();
