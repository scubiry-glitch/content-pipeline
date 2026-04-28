// /api/admin/users/* — 平台用户管理
// 仅 super_admin 可调用：创建账号、列表、禁用/启用、重置密码

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/connection.js';
import { hashPassword } from '../../services/auth/passwords.js';
import { requireSuperAdmin } from '../../middleware/auth.js';

export async function adminUserRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireSuperAdmin);

  // GET /api/admin/users
  fastify.get('/', async () => {
    const res = await query<{
      id: string; email: string; name: string; status: string;
      is_super_admin: boolean; must_change_password: boolean;
      last_login_at: Date | null; created_at: Date;
    }>(
      `SELECT id, email, name, status, is_super_admin, must_change_password, last_login_at, created_at
         FROM users ORDER BY created_at ASC`
    );
    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      status: r.status,
      isSuperAdmin: r.is_super_admin,
      mustChangePassword: r.must_change_password,
      lastLoginAt: r.last_login_at,
      createdAt: r.created_at,
    }));
  });

  // POST /api/admin/users  { email, name, password, isSuperAdmin? }
  fastify.post('/', async (request, reply) => {
    const body = (request.body || {}) as {
      email?: string; name?: string; password?: string; isSuperAdmin?: boolean;
    };
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const password = body.password || '';
    if (!email || !name || !password) {
      reply.status(400);
      return { error: 'Bad Request', message: 'email, name, password required', code: 'INVALID_INPUT' };
    }
    if (password.length < 8) {
      reply.status(400);
      return { error: 'Bad Request', message: 'password must be at least 8 chars', code: 'INVALID_INPUT' };
    }
    const passwordHash = await hashPassword(password);
    try {
      const ins = await query<{ id: string; created_at: Date }>(
        `INSERT INTO users (email, name, password_hash, is_super_admin, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id, created_at`,
        [email, name, passwordHash, !!body.isSuperAdmin]
      );
      const userId = ins.rows[0].id;
      await query(
        `INSERT INTO user_identities (user_id, provider, provider_user_id, email_at_provider)
           VALUES ($1, 'password', $1::text, $2)`,
        [userId, email]
      );
      reply.status(201);
      return {
        id: userId,
        email,
        name,
        status: 'active',
        isSuperAdmin: !!body.isSuperAdmin,
        mustChangePassword: true,
        createdAt: ins.rows[0].created_at,
      };
    } catch (e: any) {
      if (e?.code === '23505') {
        reply.status(409);
        return { error: 'Conflict', message: 'email already exists', code: 'EMAIL_TAKEN' };
      }
      throw e;
    }
  });

  // PATCH /api/admin/users/:id  { name?, status?, isSuperAdmin?, password? }
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      name?: string; status?: 'active' | 'disabled';
      isSuperAdmin?: boolean; password?: string;
    };
    const updates: string[] = [];
    const params: any[] = [];
    if (body.name !== undefined) { params.push(body.name); updates.push(`name = $${params.length}`); }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'disabled') {
        reply.status(400);
        return { error: 'Bad Request', message: 'invalid status', code: 'INVALID_INPUT' };
      }
      params.push(body.status); updates.push(`status = $${params.length}`);
    }
    if (body.isSuperAdmin !== undefined) {
      params.push(!!body.isSuperAdmin); updates.push(`is_super_admin = $${params.length}`);
    }
    if (body.password !== undefined) {
      if (body.password.length < 8) {
        reply.status(400);
        return { error: 'Bad Request', message: 'password must be at least 8 chars', code: 'INVALID_INPUT' };
      }
      const hash = await hashPassword(body.password);
      params.push(hash); updates.push(`password_hash = $${params.length}`);
      updates.push(`must_change_password = TRUE`);
    }
    if (updates.length === 0) return { ok: true };
    updates.push(`updated_at = NOW()`);
    params.push(id);
    const res = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (res.rows.length === 0) {
      reply.status(404);
      return { error: 'Not Found', message: 'user not found', code: 'NOT_FOUND' };
    }
    // 禁用用户时吊销其所有 session
    if (body.status === 'disabled') {
      await query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    }
    return { ok: true };
  });
}
