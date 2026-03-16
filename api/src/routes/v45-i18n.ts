// v4.5 国际化 (i18n) 路由
import { FastifyInstance } from 'fastify';
import {
  translationService,
  terminologyService,
  languageSettingService,
  translationMemoryService
} from '../services/i18nService.js';
import { authenticate } from '../middleware/auth.js';

export async function v45I18nRoutes(fastify: FastifyInstance) {
  // ============ 翻译管理 ============

  // 创建翻译
  fastify.post('/translations', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.sourceId || !data.sourceType || !data.targetLanguage || !data.sourceContent) {
      reply.status(400);
      return { error: 'Missing required fields: sourceId, sourceType, targetLanguage, sourceContent' };
    }

    try {
      const translation = await translationService.createTranslation({
        sourceId: data.sourceId,
        sourceType: data.sourceType,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        sourceContent: data.sourceContent,
        createdBy: data.createdBy
      });

      reply.status(201);
      return translation;
    } catch (error: any) {
      reply.status(400);
      return { error: error.message };
    }
  });

  // 批量创建翻译
  fastify.post('/translations/batch', { preHandler: authenticate }, async (request, reply) => {
    const { sourceId, sourceType, sourceContent, targetLanguages, createdBy } = request.body as any;

    if (!sourceId || !sourceType || !sourceContent || !targetLanguages) {
      reply.status(400);
      return { error: 'Missing required fields' };
    }

    const translations = await translationService.batchCreateTranslations(
      sourceId,
      sourceType,
      sourceContent,
      targetLanguages,
      createdBy
    );

    reply.status(201);
    return { items: translations };
  });

  // 获取源内容的所有翻译
  fastify.get('/translations', { preHandler: authenticate }, async (request) => {
    const { sourceId, sourceType } = request.query as { sourceId: string; sourceType: string };

    if (!sourceId || !sourceType) {
      return { error: 'Missing required query parameters: sourceId, sourceType' };
    }

    const translations = await translationService.getTranslationsBySource(sourceId, sourceType);
    return { items: translations };
  });

  // 获取特定语言的翻译
  fastify.get('/translations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const translation = await translationService.getTranslationById(id);

    if (!translation) {
      reply.status(404);
      return { error: 'Translation not found' };
    }

    return translation;
  });

  // 更新翻译
  fastify.patch('/translations/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as any;

    const translation = await translationService.updateTranslation(id, updates);

    if (!translation) {
      reply.status(404);
      return { error: 'Translation not found' };
    }

    return translation;
  });

  // 机器翻译
  fastify.post('/translations/machine', { preHandler: authenticate }, async (request, reply) => {
    const { content, sourceLanguage, targetLanguage, useMemory } = request.body as any;

    if (!content || !targetLanguage) {
      reply.status(400);
      return { error: 'Missing required fields: content, targetLanguage' };
    }

    const result = await translationService.machineTranslate(
      content,
      sourceLanguage || 'zh-CN',
      targetLanguage,
      useMemory !== false
    );

    reply.status(201);
    return result;
  });

  // 获取翻译统计
  fastify.get('/translations/stats', { preHandler: authenticate }, async () => {
    const stats = await translationService.getTranslationStats();
    return stats;
  });

  // ============ 术语库 ============

  // 创建术语
  fastify.post('/terminology', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.term || !data.language || !data.translations) {
      reply.status(400);
      return { error: 'Missing required fields: term, language, translations' };
    }

    const entry = await terminologyService.createTerminology({
      term: data.term,
      language: data.language,
      definition: data.definition,
      context: data.context,
      translations: data.translations,
      category: data.category,
      tags: data.tags,
      sourceUrl: data.sourceUrl,
      notes: data.notes,
      createdBy: data.createdBy
    });

    reply.status(201);
    return entry;
  });

  // 搜索术语
  fastify.get('/terminology/search', { preHandler: authenticate }, async (request) => {
    const { q, language, category } = request.query as {
      q: string;
      language?: string;
      category?: string;
    };

    if (!q) {
      return { error: 'Missing required query parameter: q' };
    }

    const results = await terminologyService.searchTerminology(q, language, category);
    return { items: results };
  });

  // 获取术语
  fastify.get('/terminology/:term', { preHandler: authenticate }, async (request, reply) => {
    const { term } = request.params as { term: string };
    const { language, category } = request.query as { language: string; category?: string };

    if (!language) {
      reply.status(400);
      return { error: 'Missing required query parameter: language' };
    }

    const entry = await terminologyService.getTerminology(term, language, category);

    if (!entry) {
      reply.status(404);
      return { error: 'Term not found' };
    }

    return entry;
  });

  // 获取分类下的术语
  fastify.get('/terminology/category/:category', { preHandler: authenticate }, async (request) => {
    const { category } = request.params as { category: string };
    const { language } = request.query as { language?: string };

    const terms = await terminologyService.getTermsByCategory(category, language);
    return { items: terms };
  });

  // 获取术语翻译
  fastify.get('/terminology/:term/translate', { preHandler: authenticate }, async (request, reply) => {
    const { term } = request.params as { term: string };
    const { sourceLanguage, targetLanguage, category } = request.query as {
      sourceLanguage: string;
      targetLanguage: string;
      category?: string;
    };

    if (!sourceLanguage || !targetLanguage) {
      reply.status(400);
      return { error: 'Missing required query parameters: sourceLanguage, targetLanguage' };
    }

    const translation = await terminologyService.getTermTranslation(
      term,
      sourceLanguage,
      targetLanguage,
      category
    );

    if (!translation) {
      reply.status(404);
      return { error: 'Translation not found' };
    }

    return { term, translation };
  });

  // ============ 语言设置 ============

  // 获取所有启用的语言
  fastify.get('/languages', async () => {
    const languages = await languageSettingService.getEnabledLanguages();
    return { items: languages };
  });

  // 获取默认语言
  fastify.get('/languages/default', async () => {
    const language = await languageSettingService.getDefaultLanguage();

    if (!language) {
      return { error: 'No default language configured' };
    }

    return language;
  });

  // 获取特定语言
  fastify.get('/languages/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const language = await languageSettingService.getLanguageByCode(code);

    if (!language) {
      reply.status(404);
      return { error: 'Language not found' };
    }

    return language;
  });

  // 更新语言设置
  fastify.patch('/languages/:code', { preHandler: authenticate }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const updates = request.body as any;

    const language = await languageSettingService.updateLanguageSetting(code, updates);

    if (!language) {
      reply.status(404);
      return { error: 'Language not found' };
    }

    return language;
  });

  // ============ 翻译记忆库 ============

  // 添加翻译记忆
  fastify.post('/memory', { preHandler: authenticate }, async (request, reply) => {
    const data = request.body as any;

    if (!data.sourceText || !data.targetText || !data.sourceLanguage || !data.targetLanguage) {
      reply.status(400);
      return { error: 'Missing required fields' };
    }

    const memory = await translationMemoryService.addMemory({
      sourceText: data.sourceText,
      targetText: data.targetText,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage,
      sourceType: data.sourceType
    });

    reply.status(201);
    return memory;
  });

  // 搜索翻译记忆
  fastify.get('/memory/search', { preHandler: authenticate }, async (request) => {
    const { text, sourceLanguage, targetLanguage, minSimilarity } = request.query as {
      text: string;
      sourceLanguage: string;
      targetLanguage: string;
      minSimilarity?: string;
    };

    if (!text || !sourceLanguage || !targetLanguage) {
      return { error: 'Missing required query parameters' };
    }

    const results = await translationMemoryService.searchMemory(
      text,
      sourceLanguage,
      targetLanguage,
      minSimilarity ? parseInt(minSimilarity) : 80
    );

    return { items: results };
  });
}
