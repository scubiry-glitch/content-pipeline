// 研报路由 - ReportMatcher v3.3
// 研报自动关联系统 API

import { FastifyInstance } from 'fastify';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

export async function reportRoutes(fastify: FastifyInstance) {
  // 获取研报列表
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { limit = '20', status } = request.query as any;

    let sql = `
      SELECT id, title, authors, institution, publish_date as "publishDate",
             page_count as "pageCount", key_points as "keyPoints", tags,
             quality_score as "qualityScore", status, created_at as "createdAt",
             updated_at as "updatedAt"
      FROM reports
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);

    return {
      items: result.rows.map(row => ({
        ...row,
        authors: typeof row.authors === 'string' ? JSON.parse(row.authors) : row.authors,
        keyPoints: typeof row.keyPoints === 'string' ? JSON.parse(row.keyPoints) : row.keyPoints,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      })),
      total: result.rowCount,
    };
  });

  // 获取单篇研报
  fastify.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const result = await query(
      `SELECT * FROM reports WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    const report = result.rows[0];
    return {
      ...report,
      authors: typeof report.authors === 'string' ? JSON.parse(report.authors) : report.authors,
      keyPoints: typeof report.key_points === 'string' ? JSON.parse(report.key_points) : report.key_points,
      tags: typeof report.tags === 'string' ? JSON.parse(report.tags) : report.tags,
    };
  });

  // 上传研报
  fastify.post('/upload', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.status(400);
      return { error: 'No file uploaded' };
    }

    const { v4: uuidv4 } = await import('uuid');
    const reportId = uuidv4();

    // 保存文件并创建记录
    await query(
      `INSERT INTO reports (id, title, status, file_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [reportId, data.filename, 'pending', `/uploads/${reportId}`]
    );

    return {
      id: reportId,
      status: 'pending',
      message: 'Report uploaded successfully, waiting for parsing',
    };
  });

  // 解析研报
  fastify.post('/:id/parse', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const reportResult = await query(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (reportResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    // 模拟解析过程
    await query(
      `UPDATE reports SET
        title = COALESCE(title, '解析后的研报标题'),
        authors = COALESCE(authors, '["张三", "李四"]'),
        institution = COALESCE(institution, '中信证券'),
        publish_date = COALESCE(publish_date, NOW()),
        page_count = COALESCE(page_count, 45),
        key_points = COALESCE(key_points, '["销量增长30%", "政策支持明确", "产业链完善"]'),
        tags = COALESCE(tags, '["新能源", "汽车", "研报"]'),
        quality_score = COALESCE(quality_score, 85),
        status = 'parsed',
        updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    return {
      title: '新能源汽车行业深度研究',
      authors: ['张三', '李四'],
      institution: '中信证券',
      publishDate: new Date().toISOString(),
      pageCount: 45,
      sections: [
        { title: '投资要点', level: 1, content: '看好新能源赛道' },
        { title: '行业分析', level: 1, content: '市场空间广阔' },
        { title: '公司研究', level: 1, content: '龙头企业分析' },
      ],
      keyPoints: ['销量增长30%', '政策支持明确', '产业链完善'],
      tags: ['新能源', '汽车', '研报'],
    };
  });

  // 获取研报关联
  fastify.get('/:id/matches', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const reportResult = await query(`SELECT id FROM reports WHERE id = $1`, [id]);
    if (reportResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    // 模拟关联结果
    return {
      items: [
        {
          id: 'match-1',
          reportId: id,
          matchType: 'rss',
          matchId: 'rss-001',
          matchScore: 85,
          matchReason: '关键词匹配: 新能源, 汽车, 销量',
          matchedItem: {
            title: '新能源汽车销量创新高',
            source: '36氪',
            publishedAt: new Date().toISOString(),
          },
        },
        {
          id: 'match-2',
          reportId: id,
          matchType: 'topic',
          matchId: 'topic-001',
          matchScore: 78,
          matchReason: '热点话题关联: 新能源政策',
          matchedItem: {
            title: '新能源补贴政策解读',
            source: '热点追踪',
            publishedAt: new Date().toISOString(),
          },
        },
        {
          id: 'match-3',
          reportId: id,
          matchType: 'asset',
          matchId: 'asset-001',
          matchScore: 72,
          matchReason: '行业标签匹配: 新能源汽车',
          matchedItem: {
            title: '锂电产业链研究',
            source: '素材库',
            publishedAt: new Date().toISOString(),
          },
        },
      ],
    };
  });

  // 获取研报质量评分
  fastify.get('/:id/quality', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const result = await query(
      `SELECT quality_score, institution FROM reports WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    return {
      overall: result.rows[0].quality_score || 85,
      dimensions: {
        authority: result.rows[0].institution ? 90 : 60,
        completeness: 80,
        logic: 85,
        freshness: 85,
      },
    };
  });

  // 搜索研报
  fastify.get('/search', { preHandler: authenticate }, async (request) => {
    const { q, limit = '10' } = request.query as any;

    if (!q) {
      return { items: [] };
    }

    const result = await query(
      `SELECT id, title, authors, institution, tags, quality_score
       FROM reports
       WHERE title ILIKE $1 OR content ILIKE $1 OR tags::text ILIKE $1
       LIMIT $2`,
      [`%${q}%`, parseInt(limit)]
    );

    return {
      items: result.rows.map(row => ({
        ...row,
        authors: typeof row.authors === 'string' ? JSON.parse(row.authors) : row.authors,
      })),
    };
  });

  // 删除研报
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const result = await query(`DELETE FROM reports WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    return { success: true };
  });
}
