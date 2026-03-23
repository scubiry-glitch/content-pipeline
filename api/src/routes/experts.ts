// 专家库路由 - Expert Library v2.0
// 四位专家评审体系 API

import { FastifyInstance } from 'fastify';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

export async function expertRoutes(fastify: FastifyInstance) {
  // 获取专家列表
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { status = 'active', domain, angle } = request.query as any;

    let sql = `
      SELECT id, name, title, company, angle, domain, bio, status,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM experts
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (domain) {
      sql += ` AND domain ILIKE $${params.length + 1}`;
      params.push(`%${domain}%`);
    }

    // 支持按 angle 筛选，如 'reader' 筛选读者画像
    if (angle) {
      sql += ` AND angle = $${params.length + 1}`;
      params.push(angle);
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);

    return {
      items: result.rows,
      total: result.rowCount,
    };
  });

  // 获取单个专家
  fastify.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const result = await query(
      `SELECT id, name, title, company, angle, domain, bio, status,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM experts WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Expert not found' };
    }

    return result.rows[0];
  });

  // 创建专家
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const { name, title, company, angle = 'challenger', domain, bio } = request.body as any;

    if (!name) {
      reply.status(400);
      return { error: 'Name is required' };
    }

    const result = await query(
      `INSERT INTO experts (name, title, company, angle, domain, bio, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
       RETURNING id, name, title, company, angle, domain, bio, status,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [name, title, company, angle, domain, bio]
    );

    reply.status(201);
    return result.rows[0];
  });

  // 更新专家
  fastify.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;
    const { name, title, company, angle, domain, bio, status } = request.body as any;

    const result = await query(
      `UPDATE experts
       SET name = COALESCE($1, name),
           title = COALESCE($2, title),
           company = COALESCE($3, company),
           angle = COALESCE($4, angle),
           domain = COALESCE($5, domain),
           bio = COALESCE($6, bio),
           status = COALESCE($7, status),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, name, title, company, angle, domain, bio, status,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [name, title, company, angle, domain, bio, status, id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Expert not found' };
    }

    return result.rows[0];
  });

  // 删除专家
  fastify.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as any;

    const result = await query(
      `DELETE FROM experts WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Expert not found' };
    }

    reply.status(204);
    return;
  });
}
