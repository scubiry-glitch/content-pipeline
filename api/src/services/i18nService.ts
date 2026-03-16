// v4.5 国际化 (i18n) 服务
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getRouter } from '../providers/index.js';

// ============ 类型定义 ============
export interface Translation {
  id: string;
  sourceId: string;
  sourceType: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceContent: string;
  translatedContent?: string;
  status: 'pending' | 'translating' | 'reviewing' | 'published' | 'archived';
  translationMethod?: 'manual' | 'machine' | 'hybrid';
  translationProvider?: string;
  metadata?: Record<string, any>;
  viewCount: number;
  engagementCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  createdBy?: string;
  translatorId?: string;
  reviewerId?: string;
}

export interface TranslationJob {
  id: string;
  jobType: 'translate' | 'review' | 'update';
  translationId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  assignedTo?: string;
  assignedAt?: Date;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  dueDate?: Date;
  resultSummary?: string;
  errorMessage?: string;
}

export interface TerminologyEntry {
  id: string;
  term: string;
  language: string;
  definition?: string;
  context?: string;
  translations: Record<string, string>;
  category?: string;
  tags: string[];
  status: 'active' | 'deprecated' | 'pending_review';
  sourceUrl?: string;
  notes?: string;
  createdBy?: string;
}

export interface LanguageSetting {
  id: string;
  languageCode: string;
  languageName: string;
  nativeName: string;
  isEnabled: boolean;
  isDefault: boolean;
  config?: Record<string, any>;
  seoConfig?: Record<string, any>;
  contentCount: number;
}

export interface TranslationMemory {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceType?: string;
  similarityScore?: number;
  usageCount: number;
  lastUsedAt?: Date;
  isApproved: boolean;
}

export interface CreateTranslationData {
  sourceId: string;
  sourceType: string;
  sourceLanguage?: string;
  targetLanguage: string;
  sourceContent: string;
  createdBy?: string;
}

export interface MachineTranslateResult {
  translatedContent: string;
  provider: string;
  confidence?: number;
  usedMemory?: boolean;
}

// ============ 翻译服务 ============
export class TranslationService {
  // 创建翻译任务
  async createTranslation(data: CreateTranslationData): Promise<Translation> {
    const id = uuidv4();

    // 检查是否已存在
    const existing = await query(
      `SELECT id FROM translations
       WHERE source_id = $1 AND source_type = $2 AND target_language = $3`,
      [data.sourceId, data.sourceType, data.targetLanguage]
    );

    if (existing.rows.length > 0) {
      throw new Error('Translation already exists for this source and language');
    }

    const result = await query(
      `INSERT INTO translations (
        id, source_id, source_type, source_language, target_language,
        source_content, status, metadata, view_count, engagement_count,
        created_at, updated_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, 0, 0, NOW(), NOW(), $8)
      RETURNING *`,
      [
        id, data.sourceId, data.sourceType,
        data.sourceLanguage || 'zh-CN', data.targetLanguage,
        data.sourceContent,
        JSON.stringify({ word_count: data.sourceContent.split(/\s+/).length }),
        data.createdBy
      ]
    );

    return this.formatTranslation(result.rows[0]);
  }

  // 获取翻译
  async getTranslationById(id: string): Promise<Translation | null> {
    const result = await query(
      `SELECT * FROM translations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatTranslation(result.rows[0]);
  }

  // 获取源内容的所有翻译
  async getTranslationsBySource(sourceId: string, sourceType: string): Promise<Translation[]> {
    const result = await query(
      `SELECT * FROM translations
       WHERE source_id = $1 AND source_type = $2
       ORDER BY target_language`,
      [sourceId, sourceType]
    );

    return result.rows.map(row => this.formatTranslation(row));
  }

  // 获取指定语言的翻译
  async getTranslationByLanguage(
    sourceId: string,
    sourceType: string,
    targetLanguage: string
  ): Promise<Translation | null> {
    const result = await query(
      `SELECT * FROM translations
       WHERE source_id = $1 AND source_type = $2 AND target_language = $3`,
      [sourceId, sourceType, targetLanguage]
    );

    if (result.rows.length === 0) return null;
    return this.formatTranslation(result.rows[0]);
  }

  // 更新翻译内容
  async updateTranslation(
    id: string,
    updates: Partial<Translation>
  ): Promise<Translation | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.translatedContent !== undefined) {
      fields.push(`translated_content = $${paramIndex++}`);
      params.push(updates.translatedContent);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(updates.status);

      if (updates.status === 'published') {
        fields.push(`published_at = NOW()`);
      }
    }

    if (updates.translatorId !== undefined) {
      fields.push(`translator_id = $${paramIndex++}`);
      params.push(updates.translatorId);
    }

    if (updates.reviewerId !== undefined) {
      fields.push(`reviewer_id = $${paramIndex++}`);
      params.push(updates.reviewerId);
    }

    if (updates.translationMethod !== undefined) {
      fields.push(`translation_method = $${paramIndex++}`);
      params.push(updates.translationMethod);
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE translations SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    return this.formatTranslation(result.rows[0]);
  }

  // 机器翻译
  async machineTranslate(
    content: string,
    sourceLanguage: string,
    targetLanguage: string,
    useMemory: boolean = true
  ): Promise<MachineTranslateResult> {
    // 1. 先查翻译记忆库
    if (useMemory) {
      const memoryResult = await query(
        `SELECT target_text, similarity_score FROM translation_memory
         WHERE source_language = $1 AND target_language = $2
         AND source_text = $3 AND is_approved = true
         LIMIT 1`,
        [sourceLanguage, targetLanguage, content]
      );

      if (memoryResult.rows.length > 0) {
        // 更新使用统计
        await query(
          `UPDATE translation_memory
           SET usage_count = usage_count + 1, last_used_at = NOW()
           WHERE source_text = $1 AND source_language = $2 AND target_language = $3`,
          [content, sourceLanguage, targetLanguage]
        );

        return {
          translatedContent: memoryResult.rows[0].target_text,
          provider: 'memory',
          confidence: memoryResult.rows[0].similarity_score,
          usedMemory: true
        };
      }
    }

    // 2. 调用AI进行翻译
    let translatedContent = '';
    const router = getRouter();

    if (router) {
      try {
        const prompt = `请将以下内容从${sourceLanguage}翻译成${targetLanguage}，保持原文的语气和风格：

${content}

请直接输出翻译结果，不要添加解释。`;

        const response = await router.complete({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 4000
        });

        translatedContent = response.content;
      } catch (error) {
        translatedContent = '[翻译服务暂时不可用]';
      }
    } else {
      translatedContent = '[翻译服务未配置]';
    }

    return {
      translatedContent,
      provider: 'ai',
      usedMemory: false
    };
  }

  // 批量创建翻译任务
  async batchCreateTranslations(
    sourceId: string,
    sourceType: string,
    sourceContent: string,
    targetLanguages: string[],
    createdBy?: string
  ): Promise<Translation[]> {
    const translations: Translation[] = [];

    for (const lang of targetLanguages) {
      try {
        const translation = await this.createTranslation({
          sourceId,
          sourceType,
          targetLanguage: lang,
          sourceContent,
          createdBy
        });
        translations.push(translation);
      } catch (error) {
        // 跳过已存在的
        console.log(`Translation for ${lang} already exists, skipping`);
      }
    }

    return translations;
  }

  // 获取翻译统计
  async getTranslationStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byLanguage: Record<string, number>;
  }> {
    const totalResult = await query(`SELECT COUNT(*) as total FROM translations`);
    const total = parseInt(totalResult.rows[0].total);

    const statusResult = await query(
      `SELECT status, COUNT(*) as count FROM translations GROUP BY status`
    );
    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(row => {
      byStatus[row.status] = parseInt(row.count);
    });

    const langResult = await query(
      `SELECT target_language, COUNT(*) as count FROM translations GROUP BY target_language`
    );
    const byLanguage: Record<string, number> = {};
    langResult.rows.forEach(row => {
      byLanguage[row.target_language] = parseInt(row.count);
    });

    return { total, byStatus, byLanguage };
  }

  private formatTranslation(row: any): Translation {
    return {
      id: row.id,
      sourceId: row.source_id,
      sourceType: row.source_type,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      sourceContent: row.source_content,
      translatedContent: row.translated_content,
      status: row.status,
      translationMethod: row.translation_method,
      translationProvider: row.translation_provider,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      viewCount: row.view_count,
      engagementCount: row.engagement_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      createdBy: row.created_by,
      translatorId: row.translator_id,
      reviewerId: row.reviewer_id
    };
  }
}

// ============ 术语库服务 ============
export class TerminologyService {
  // 获取术语
  async getTerminology(
    term: string,
    language: string,
    category?: string
  ): Promise<TerminologyEntry | null> {
    let sql = `SELECT * FROM terminology_entries WHERE term = $1 AND language = $2`;
    const params: any[] = [term, language];

    if (category) {
      sql += ` AND category = $3`;
      params.push(category);
    }

    sql += ` AND status = 'active'`;

    const result = await query(sql, params);

    if (result.rows.length === 0) return null;
    return this.formatTerminology(result.rows[0]);
  }

  // 搜索术语
  async searchTerminology(
    query: string,
    language?: string,
    category?: string
  ): Promise<TerminologyEntry[]> {
    let sql = `SELECT * FROM terminology_entries
               WHERE (term ILIKE $1 OR definition ILIKE $1)
               AND status = 'active'`;
    const params: any[] = [`%${query}%`];

    if (language) {
      sql += ` AND language = $${params.length + 1}`;
      params.push(language);
    }

    if (category) {
      sql += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    sql += ` ORDER BY term LIMIT 20`;

    const result = await query(sql, params);
    return result.rows.map(row => this.formatTerminology(row));
  }

  // 创建术语
  async createTerminology(data: {
    term: string;
    language: string;
    definition?: string;
    context?: string;
    translations: Record<string, string>;
    category?: string;
    tags?: string[];
    sourceUrl?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<TerminologyEntry> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO terminology_entries (
        id, term, language, definition, context, translations, category,
        tags, source_url, notes, created_by, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', NOW(), NOW())
      ON CONFLICT (term, language, category) DO UPDATE SET
        definition = EXCLUDED.definition,
        translations = EXCLUDED.translations,
        updated_at = NOW()
      RETURNING *`,
      [
        id, data.term, data.language, data.definition, data.context,
        JSON.stringify(data.translations), data.category,
        JSON.stringify(data.tags || []), data.sourceUrl, data.notes, data.createdBy
      ]
    );

    return this.formatTerminology(result.rows[0]);
  }

  // 获取术语的翻译
  async getTermTranslation(
    term: string,
    sourceLanguage: string,
    targetLanguage: string,
    category?: string
  ): Promise<string | null> {
    const entry = await this.getTerminology(term, sourceLanguage, category);

    if (entry && entry.translations[targetLanguage]) {
      return entry.translations[targetLanguage];
    }

    return null;
  }

  // 获取分类下的所有术语
  async getTermsByCategory(category: string, language?: string): Promise<TerminologyEntry[]> {
    let sql = `SELECT * FROM terminology_entries WHERE category = $1 AND status = 'active'`;
    const params: any[] = [category];

    if (language) {
      sql += ` AND language = $2`;
      params.push(language);
    }

    sql += ` ORDER BY term`;

    const result = await query(sql, params);
    return result.rows.map(row => this.formatTerminology(row));
  }

  private formatTerminology(row: any): TerminologyEntry {
    return {
      id: row.id,
      term: row.term,
      language: row.language,
      definition: row.definition,
      context: row.context,
      translations: row.translations ? (typeof row.translations === 'string' ? JSON.parse(row.translations) : row.translations) : {},
      category: row.category,
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
      status: row.status,
      sourceUrl: row.source_url,
      notes: row.notes,
      createdBy: row.created_by
    };
  }
}

// ============ 语言设置服务 ============
export class LanguageSettingService {
  // 获取所有启用的语言
  async getEnabledLanguages(): Promise<LanguageSetting[]> {
    const result = await query(
      `SELECT * FROM language_settings WHERE is_enabled = true ORDER BY is_default DESC, language_name`
    );

    return result.rows.map(row => this.formatLanguageSetting(row));
  }

  // 获取默认语言
  async getDefaultLanguage(): Promise<LanguageSetting | null> {
    const result = await query(
      `SELECT * FROM language_settings WHERE is_default = true LIMIT 1`
    );

    if (result.rows.length === 0) return null;
    return this.formatLanguageSetting(result.rows[0]);
  }

  // 获取语言设置
  async getLanguageByCode(code: string): Promise<LanguageSetting | null> {
    const result = await query(
      `SELECT * FROM language_settings WHERE language_code = $1`,
      [code]
    );

    if (result.rows.length === 0) return null;
    return this.formatLanguageSetting(result.rows[0]);
  }

  // 更新语言设置
  async updateLanguageSetting(
    code: string,
    updates: Partial<LanguageSetting>
  ): Promise<LanguageSetting | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.isEnabled !== undefined) {
      fields.push(`is_enabled = $${paramIndex++}`);
      params.push(updates.isEnabled);
    }

    if (updates.config !== undefined) {
      fields.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.config));
    }

    if (updates.seoConfig !== undefined) {
      fields.push(`seo_config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.seoConfig));
    }

    fields.push(`updated_at = NOW()`);
    params.push(code);

    const result = await query(
      `UPDATE language_settings SET ${fields.join(', ')} WHERE language_code = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    return this.formatLanguageSetting(result.rows[0]);
  }

  private formatLanguageSetting(row: any): LanguageSetting {
    return {
      id: row.id,
      languageCode: row.language_code,
      languageName: row.language_name,
      nativeName: row.native_name,
      isEnabled: row.is_enabled,
      isDefault: row.is_default,
      config: row.config ? (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) : undefined,
      seoConfig: row.seo_config ? (typeof row.seo_config === 'string' ? JSON.parse(row.seo_config) : row.seo_config) : undefined,
      contentCount: row.content_count
    };
  }
}

// ============ 翻译记忆库服务 ============
export class TranslationMemoryService {
  // 添加翻译记忆
  async addMemory(data: {
    sourceText: string;
    targetText: string;
    sourceLanguage: string;
    targetLanguage: string;
    sourceType?: string;
  }): Promise<TranslationMemory> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO translation_memory (
        id, source_text, target_text, source_language, target_language,
        source_type, similarity_score, usage_count, is_approved, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 100.0, 0, true, NOW(), NOW())
      ON CONFLICT (source_language, target_language, source_text) DO UPDATE SET
        target_text = EXCLUDED.target_text,
        updated_at = NOW()
      RETURNING *`,
      [id, data.sourceText, data.targetText, data.sourceLanguage, data.targetLanguage, data.sourceType]
    );

    return this.formatMemory(result.rows[0]);
  }

  // 搜索相似翻译
  async searchMemory(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    minSimilarity: number = 80
  ): Promise<TranslationMemory[]> {
    const result = await query(
      `SELECT *, similarity(source_text, $1) as sim
       FROM translation_memory
       WHERE source_language = $2 AND target_language = $3
       AND is_approved = true
       AND similarity(source_text, $1) >= $4 / 100.0
       ORDER BY sim DESC
       LIMIT 5`,
      [text, sourceLanguage, targetLanguage, minSimilarity]
    );

    return result.rows.map(row => this.formatMemory(row));
  }

  private formatMemory(row: any): TranslationMemory {
    return {
      id: row.id,
      sourceText: row.source_text,
      targetText: row.target_text,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      sourceType: row.source_type,
      similarityScore: row.similarity_score,
      usageCount: row.usage_count,
      lastUsedAt: row.last_used_at,
      isApproved: row.is_approved
    };
  }
}

// ============ 导出服务实例 ============
export const translationService = new TranslationService();
export const terminologyService = new TerminologyService();
export const languageSettingService = new LanguageSettingService();
export const translationMemoryService = new TranslationMemoryService();
