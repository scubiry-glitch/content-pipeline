// 翻译服务 - Translation Service
// ML-002 ~ ML-004: 自动翻译与质量评分

import { query } from '../db/connection.js';

export interface TranslationResult {
  original: string;
  translated: string;
  sourceLanguage: string;
  targetLanguage: string;
  qualityScore: number;
  confidence: 'high' | 'medium' | 'low';
  fromCache: boolean;
}

export interface TranslationCache {
  hash: string;
  original: string;
  translated: string;
  sourceLanguage: string;
  targetLanguage: string;
  qualityScore: number;
  createdAt: Date;
}

// 翻译缓存哈希生成
function generateHash(text: string, sourceLang: string, targetLang: string): string {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(`${text}:${sourceLang}:${targetLang}`).digest('hex');
}

/**
 * 翻译文本（带缓存）
 */
export async function translate(
  text: string,
  sourceLanguage: string = 'en',
  targetLanguage: string = 'zh'
): Promise<TranslationResult> {
  if (!text || text.trim().length === 0) {
    return {
      original: text,
      translated: '',
      sourceLanguage,
      targetLanguage,
      qualityScore: 0,
      confidence: 'low',
      fromCache: false,
    };
  }

  // 1. 检查缓存
  const hash = generateHash(text, sourceLanguage, targetLanguage);
  const cached = await getCachedTranslation(hash);

  if (cached) {
    return {
      original: text,
      translated: cached.translated,
      sourceLanguage,
      targetLanguage,
      qualityScore: cached.qualityScore,
      confidence: cached.qualityScore > 0.8 ? 'high' : cached.qualityScore > 0.6 ? 'medium' : 'low',
      fromCache: true,
    };
  }

  // 2. 调用翻译服务（简化实现，实际应调用 Google Translate/DeepL）
  const translated = await performTranslation(text, sourceLanguage, targetLanguage);

  // 3. 质量评分
  const qualityScore = calculateTranslationQuality(text, translated, sourceLanguage, targetLanguage);

  // 4. 保存到缓存
  await cacheTranslation({
    hash,
    original: text,
    translated,
    sourceLanguage,
    targetLanguage,
    qualityScore,
    createdAt: new Date(),
  });

  return {
    original: text,
    translated,
    sourceLanguage,
    targetLanguage,
    qualityScore,
    confidence: qualityScore > 0.8 ? 'high' : qualityScore > 0.6 ? 'medium' : 'low',
    fromCache: false,
  };
}

/**
 * 批量翻译
 */
export async function batchTranslate(
  items: { id: string; text: string }[],
  sourceLanguage: string = 'en',
  targetLanguage: string = 'zh'
): Promise<Map<string, TranslationResult>> {
  const results = new Map<string, TranslationResult>();

  for (const item of items) {
    try {
      const result = await translate(item.text, sourceLanguage, targetLanguage);
      results.set(item.id, result);
    } catch (error) {
      console.error(`[Translation] Failed to translate ${item.id}:`, error);
      results.set(item.id, {
        original: item.text,
        translated: item.text,
        sourceLanguage,
        targetLanguage,
        qualityScore: 0,
        confidence: 'low',
        fromCache: false,
      });
    }
  }

  return results;
}

/**
 * 执行翻译（简化实现）
 */
async function performTranslation(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  // 实际实现应该调用翻译 API
  // 这里使用简单的规则作为占位符

  if (targetLanguage === 'zh' && sourceLanguage === 'en') {
    // 英译中：返回原文 + [译] 标记
    return `[译] ${text}`;
  }

  if (targetLanguage === 'en' && sourceLanguage === 'zh') {
    // 中译英
    return `[EN] ${text}`;
  }

  return text;
}

/**
 * 计算翻译质量分数
 */
function calculateTranslationQuality(
  original: string,
  translated: string,
  sourceLanguage: string,
  targetLanguage: string
): number {
  let score = 0.5; // 基础分

  // 1. 长度合理性检查
  const lengthRatio = translated.length / original.length;
  if (sourceLanguage === 'en' && targetLanguage === 'zh') {
    // 英文转中文通常长度比为 1:1.5 ~ 1:2
    if (lengthRatio >= 0.8 && lengthRatio <= 3) {
      score += 0.2;
    }
  } else if (sourceLanguage === 'zh' && targetLanguage === 'en') {
    // 中文转英文通常长度比为 1.5:1 ~ 2:1
    if (lengthRatio >= 0.3 && lengthRatio <= 1.2) {
      score += 0.2;
    }
  }

  // 2. 完整性检查
  if (!translated.includes('[译]') && !translated.includes('[EN]')) {
    score += 0.15;
  }

  // 3. 标点符号合理性
  const hasChinesePunctuation = /[。，！？：；""''（）【】]/.test(translated);
  const hasEnglishPunctuation = /[.,!?;:"'()\[\]]/.test(translated);

  if (targetLanguage === 'zh' && hasChinesePunctuation) {
    score += 0.1;
  } else if (targetLanguage === 'en' && hasEnglishPunctuation) {
    score += 0.1;
  }

  // 4. 专业术语检查（简化版）
  const techTerms = ['AI', 'API', 'SDK', 'SaaS', 'PaaS', 'IaaS', 'GPU', 'CPU'];
  const hasUntranslatedTechTerms = techTerms.some(term =>
    original.includes(term) && translated.includes(term)
  );
  if (hasUntranslatedTechTerms) {
    score += 0.05; // 保留专业术语加分
  }

  return Math.min(score, 1.0);
}

/**
 * 获取缓存的翻译
 */
async function getCachedTranslation(hash: string): Promise<TranslationCache | null> {
  const result = await query(
    `SELECT * FROM translation_cache WHERE hash = $1`,
    [hash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    hash: row.hash,
    original: row.original,
    translated: row.translated,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    qualityScore: parseFloat(row.quality_score),
    createdAt: row.created_at,
  };
}

/**
 * 缓存翻译结果
 */
async function cacheTranslation(cache: TranslationCache): Promise<void> {
  await query(
    `INSERT INTO translation_cache (
      hash, original, translated, source_language, target_language,
      quality_score, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (hash) DO UPDATE SET
      translated = $3,
      quality_score = $6,
      created_at = NOW()`,
    [
      cache.hash,
      cache.original,
      cache.translated,
      cache.sourceLanguage,
      cache.targetLanguage,
      cache.qualityScore,
    ]
  );
}

/**
 * 翻译 RSS 条目
 */
export async function translateRSSItem(
  itemId: string,
  targetLanguage: string = 'zh'
): Promise<{
  title: TranslationResult;
  summary: TranslationResult;
} | null> {
  const result = await query(
    `SELECT title, summary, language FROM rss_items WHERE id = $1`,
    [itemId]
  );

  if (result.rows.length === 0) return null;

  const item = result.rows[0];

  // 如果已经是目标语言，不翻译
  if (item.language === targetLanguage) {
    return {
      title: {
        original: item.title,
        translated: item.title,
        sourceLanguage: item.language,
        targetLanguage,
        qualityScore: 1,
        confidence: 'high',
        fromCache: true,
      },
      summary: {
        original: item.summary,
        translated: item.summary,
        sourceLanguage: item.language,
        targetLanguage,
        qualityScore: 1,
        confidence: 'high',
        fromCache: true,
      },
    };
  }

  const [titleTrans, summaryTrans] = await Promise.all([
    translate(item.title, item.language, targetLanguage),
    item.summary ? translate(item.summary, item.language, targetLanguage) : null,
  ]);

  // 保存翻译结果到 rss_items
  await query(
    `UPDATE rss_items SET
      translated_title = $1,
      translated_summary = $2,
      translation_quality = $3,
      translated_at = NOW()
    WHERE id = $4`,
    [
      titleTrans.translated,
      summaryTrans?.translated || null,
      (titleTrans.qualityScore + (summaryTrans?.qualityScore || 0)) / 2,
      itemId,
    ]
  );

  return {
    title: titleTrans,
    summary: summaryTrans || {
      original: '',
      translated: '',
      sourceLanguage: item.language,
      targetLanguage,
      qualityScore: 0,
      confidence: 'low',
      fromCache: false,
    },
  };
}

/**
 * 清理过期缓存
 */
export async function cleanupTranslationCache(days: number = 30): Promise<number> {
  const result = await query(
    `DELETE FROM translation_cache WHERE created_at < NOW() - INTERVAL '${days} days'`,
    []
  );

  return result.rowCount || 0;
}
