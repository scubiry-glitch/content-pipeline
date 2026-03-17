/**
 * v4.5 国际化 (i18n) - 测试用例
 * 总计: 32个测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  translationService,
  terminologyService,
  languageSettingService,
  translationMemoryService
} from '../api/src/services/i18nService';

describe('v4.5 国际化 (i18n) 测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. 翻译管理 (10个)', () => {
    it('TC-I18N-001: 应能创建翻译任务', async () => {
      const result = await translationService.createTranslation({
        sourceId: 'draft-1',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '这是中文内容',
        sourceLanguage: 'zh-CN',
        createdBy: 'user-1'
      });

      expect(result).toBeDefined();
      expect(result.sourceId).toBe('draft-1');
      expect(result.targetLanguage).toBe('en');
      expect(result.status).toBe('pending');
    });

    it('TC-I18N-002: 重复创建应报错', async () => {
      await translationService.createTranslation({
        sourceId: 'draft-1',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '内容'
      });

      await expect(translationService.createTranslation({
        sourceId: 'draft-1',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '内容'
      })).rejects.toThrow('already exists');
    });

    it('TC-I18N-003: 应能获取翻译详情', async () => {
      const translation = await translationService.createTranslation({
        sourceId: 'draft-2',
        sourceType: 'draft',
        targetLanguage: 'ja',
        sourceContent: '内容'
      });

      const fetched = await translationService.getTranslationById(translation.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(translation.id);
    });

    it('TC-I18N-004: 应能获取源内容的所有翻译', async () => {
      await translationService.createTranslation({
        sourceId: 'draft-3',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '内容'
      });

      await translationService.createTranslation({
        sourceId: 'draft-3',
        sourceType: 'draft',
        targetLanguage: 'ja',
        sourceContent: '内容'
      });

      const translations = await translationService.getTranslationsBySource('draft-3', 'draft');
      expect(Array.isArray(translations)).toBe(true);
      expect(translations.length).toBeGreaterThanOrEqual(2);
    });

    it('TC-I18N-005: 应能更新翻译内容', async () => {
      const translation = await translationService.createTranslation({
        sourceId: 'draft-4',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '内容'
      });

      const updated = await translationService.updateTranslation(translation.id, {
        translatedContent: 'This is translated content',
        status: 'published',
        translatorId: 'translator-1'
      });

      expect(updated?.translatedContent).toBe('This is translated content');
      expect(updated?.status).toBe('published');
    });

    it('TC-I18N-006: 发布时应记录发布时间', async () => {
      const translation = await translationService.createTranslation({
        sourceId: 'draft-5',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '内容'
      });

      const updated = await translationService.updateTranslation(translation.id, {
        status: 'published'
      });

      expect(updated?.publishedAt).toBeDefined();
    });

    it('TC-I18N-007: 应能获取指定语言的翻译', async () => {
      await translationService.createTranslation({
        sourceId: 'draft-6',
        sourceType: 'draft',
        targetLanguage: 'en',
        sourceContent: '内容'
      });

      const translation = await translationService.getTranslationByLanguage('draft-6', 'draft', 'en');
      expect(translation).toBeDefined();
      expect(translation?.targetLanguage).toBe('en');
    });

    it('TC-I18N-008: 应支持机器翻译', async () => {
      const result = await translationService.machineTranslate(
        '这是一段测试内容',
        'zh-CN',
        'en'
      );

      expect(result).toBeDefined();
      expect(result.translatedContent).toBeDefined();
      expect(result.provider).toBeDefined();
    });

    it('TC-I18N-009: 应能批量创建翻译', async () => {
      const translations = await translationService.batchCreateTranslations(
        'draft-7',
        'draft',
        '内容',
        ['en', 'ja', 'ko']
      );

      expect(Array.isArray(translations)).toBe(true);
      expect(translations.length).toBe(3);
    });

    it('TC-I18N-010: 应能获取翻译统计', async () => {
      const stats = await translationService.getTranslationStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byLanguage');
    });
  });

  describe('2. 术语库 (8个)', () => {
    it('TC-TERM-001: 应能创建术语', async () => {
      const result = await terminologyService.createTerminology({
        term: '内容流水线',
        language: 'zh-CN',
        definition: '标准化的内容生产流程',
        translations: { 'en': 'Content Pipeline', 'ja': 'コンテンツパイプライン' },
        category: 'product',
        tags: ['core']
      });

      expect(result).toBeDefined();
      expect(result.term).toBe('内容流水线');
      expect(result.translations['en']).toBe('Content Pipeline');
    });

    it('TC-TERM-002: 应能搜索术语', async () => {
      await terminologyService.createTerminology({
        term: '智能审核',
        language: 'zh-CN',
        translations: { 'en': 'AI Review' },
        category: 'feature'
      });

      const results = await terminologyService.searchTerminology('智能');
      expect(Array.isArray(results)).toBe(true);
    });

    it('TC-TERM-003: 应能获取术语详情', async () => {
      await terminologyService.createTerminology({
        term: '热点追踪',
        language: 'zh-CN',
        translations: { 'en': 'Hot Topic Tracking' },
        category: 'feature'
      });

      const entry = await terminologyService.getTerminology('热点追踪', 'zh-CN');
      expect(entry).toBeDefined();
    });

    it('TC-TERM-004: 应能获取术语翻译', async () => {
      await terminologyService.createTerminology({
        term: '内容质量',
        language: 'zh-CN',
        translations: { 'en': 'Content Quality', 'ja': 'コンテンツ品質' },
        category: 'product'
      });

      const translation = await terminologyService.getTermTranslation('内容质量', 'zh-CN', 'en');
      expect(translation).toBe('Content Quality');
    });

    it('TC-TERM-005: 不存在的术语应返回null', async () => {
      const result = await terminologyService.getTerminology('不存在的术语', 'zh-CN');
      expect(result).toBeNull();
    });

    it('TC-TERM-006: 应能按分类获取术语', async () => {
      await terminologyService.createTerminology({
        term: '术语1',
        language: 'zh-CN',
        translations: { 'en': 'Term 1' },
        category: 'test-category'
      });

      const terms = await terminologyService.getTermsByCategory('test-category', 'zh-CN');
      expect(Array.isArray(terms)).toBe(true);
    });

    it('TC-TERM-007: 术语应支持多语言翻译', async () => {
      const result = await terminologyService.createTerminology({
        term: '多语言测试',
        language: 'zh-CN',
        translations: {
          'en': 'Multilingual Test',
          'ja': '多言語テスト',
          'ko': '다국어 테스트'
        },
        category: 'test'
      });

      expect(Object.keys(result.translations).length).toBe(3);
    });

    it('TC-TERM-008: 搜索应支持语言筛选', async () => {
      const results = await terminologyService.searchTerminology('测试', 'zh-CN');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('3. 语言设置 (8个)', () => {
    it('TC-LANG-001: 应能获取所有启用的语言', async () => {
      const languages = await languageSettingService.getEnabledLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });

    it('TC-LANG-002: 应能获取默认语言', async () => {
      const language = await languageSettingService.getDefaultLanguage();
      expect(language).toBeDefined();
      expect(language?.isDefault).toBe(true);
    });

    it('TC-LANG-003: 应能通过代码获取语言', async () => {
      const language = await languageSettingService.getLanguageByCode('en');
      expect(language).toBeDefined();
      expect(language?.languageCode).toBe('en');
    });

    it('TC-LANG-004: 语言应包含基本信息', async () => {
      const language = await languageSettingService.getLanguageByCode('zh-CN');
      expect(language).toHaveProperty('languageCode');
      expect(language).toHaveProperty('languageName');
      expect(language).toHaveProperty('nativeName');
      expect(language).toHaveProperty('isEnabled');
    });

    it('TC-LANG-005: 语言应有SEO配置', async () => {
      const language = await languageSettingService.getLanguageByCode('en');
      expect(language?.seoConfig).toBeDefined();
    });

    it('TC-LANG-006: 不存在的语言应返回null', async () => {
      const language = await languageSettingService.getLanguageByCode('xx');
      expect(language).toBeNull();
    });

    it('TC-LANG-007: 应支持多语言', async () => {
      const languages = await languageSettingService.getEnabledLanguages();
      const codes = languages.map(l => l.languageCode);

      expect(codes).toContain('zh-CN');
      expect(codes).toContain('en');
    });

    it('TC-LANG-008: 语言应有内容计数', async () => {
      const language = await languageSettingService.getLanguageByCode('en');
      expect(language?.contentCount).toBeDefined();
    });
  });

  describe('4. 翻译记忆库 (6个)', () => {
    it('TC-MEM-001: 应能添加翻译记忆', async () => {
      const result = await translationMemoryService.addMemory({
        sourceText: '你好',
        targetText: 'Hello',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en'
      });

      expect(result).toBeDefined();
      expect(result.sourceText).toBe('你好');
      expect(result.targetText).toBe('Hello');
    });

    it('TC-MEM-002: 应能搜索相似翻译', async () => {
      await translationMemoryService.addMemory({
        sourceText: '欢迎来到内容流水线',
        targetText: 'Welcome to Content Pipeline',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en'
      });

      const results = await translationMemoryService.searchMemory(
        '欢迎来到内容流水线',
        'zh-CN',
        'en',
        90
      );

      expect(Array.isArray(results)).toBe(true);
    });

    it('TC-MEM-003: 翻译记忆应记录使用次数', async () => {
      const result = await translationMemoryService.addMemory({
        sourceText: '测试文本',
        targetText: 'Test text',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en'
      });

      expect(result.usageCount).toBe(0);
    });

    it('TC-MEM-004: 翻译记忆应有审批状态', async () => {
      const result = await translationMemoryService.addMemory({
        sourceText: '批准的内容',
        targetText: 'Approved content',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en'
      });

      expect(result.isApproved).toBe(true);
    });

    it('TC-MEM-005: 应支持源类型标记', async () => {
      const result = await translationMemoryService.addMemory({
        sourceText: '带类型的内容',
        targetText: 'Content with type',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en',
        sourceType: 'article'
      });

      expect(result.sourceType).toBe('article');
    });

    it('TC-MEM-006: 记忆应支持相似度评分', async () => {
      const result = await translationMemoryService.addMemory({
        sourceText: '评分测试',
        targetText: 'Score test',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en'
      });

      expect(result.similarityScore).toBeDefined();
    });
  });
});
