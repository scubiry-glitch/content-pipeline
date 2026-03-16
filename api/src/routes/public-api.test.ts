// Public API 测试 - v3.0 内容质量输入体系开放接口测试

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { publicAPIRoutes } from './public-api.js';

describe('Public API v3.0', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify();
    await fastify.register(publicAPIRoutes, { prefix: '/api/v3' });
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('健康检查', () => {
    it('应该返回服务状态', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('3.0.0');
      expect(body.services).toBeDefined();
    });
  });

  describe('RSS 接口', () => {
    it('应该获取 RSS 源列表', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/rss/sources',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBeDefined();
      expect(Array.isArray(body.sources)).toBe(true);
    });

    it('应该获取 RSS 统计', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/rss/stats',
      });

      expect(response.statusCode).toBe(200);
    });

    it('应该获取 RSS 条目列表', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/rss/items?limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toBeDefined();
      expect(body.pagination).toBeDefined();
    });

    it('应该支持 RSS 搜索', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/rss/search?q=AI',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  describe('热点话题接口', () => {
    it('应该获取热点话题列表', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/hot-topics?limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.topics).toBeDefined();
      expect(body.meta).toBeDefined();
    });
  });

  describe('质量评估接口', () => {
    it('应该支持质量评分查询', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/quality/score?url=https://example.com',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.url).toBeDefined();
    });
  });

  describe('情感分析接口 (v3.2)', () => {
    it('应该获取市场情绪指数 MSI', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/sentiment/msi',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.value).toBeDefined();
      expect(body.level).toBeDefined();
      expect(body.distribution).toBeDefined();
    });

    it('应该支持文本情感分析', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v3/sentiment/analyze',
        payload: { text: '公司业绩大幅增长，前景光明' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.polarity).toBeDefined();
      expect(body.intensity).toBeDefined();
    });

    it('应该识别正面情感', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v3/sentiment/analyze',
        payload: { text: '重大突破，创历史新高' },
      });

      const body = JSON.parse(response.body);
      expect(body.polarity).toBe('positive');
    });

    it('应该识别负面情感', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v3/sentiment/analyze',
        payload: { text: '亏损严重，市场崩盘' },
      });

      const body = JSON.parse(response.body);
      expect(body.polarity).toBe('negative');
    });
  });

  describe('智能推荐接口 (v3.1)', () => {
    it('应该获取推荐内容', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/recommendations?limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.recommendations).toBeDefined();
      expect(body.meta).toBeDefined();
    });
  });

  describe('API 规范', () => {
    it('所有公开接口应该返回 JSON', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v3/health',
      });

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('应该支持 CORS', async () => {
      const response = await fastify.inject({
        method: 'OPTIONS',
        url: '/api/v3/health',
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
