// /api/workspaces/* — workspace CRUD + 成员管理
// 任何登录用户均可创建 workspace（自动成为 owner）。
// 成员管理权限：
//   owner: 全权（含转让、删除、改任意角色）
//   admin: 改 ws 元数据、增删 member（不能动 owner/admin）
//   member: 只读

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

type Role = 'owner' | 'admin' | 'member';

async function getMembership(workspaceId: string, userId: string): Promise<Role | null> {
  const res = await query<{ role: Role }>(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  return res.rows[0]?.role || null;
}

function forbid(reply: FastifyReply, message = 'Forbidden', code = 'FORBIDDEN') {
  reply.status(403);
  return { error: 'Forbidden', message, code };
}

function notFound(reply: FastifyReply, message = 'Workspace not found') {
  reply.status(404);
  return { error: 'Not Found', message, code: 'NOT_FOUND' };
}

async function loadMembers(workspaceId: string) {
  const res = await query<{
    user_id: string;
    role: Role;
    joined_at: Date;
    email: string;
    name: string;
    avatar_url: string | null;
    status: string;
  }>(
    `SELECT m.user_id, m.role, m.joined_at, u.email, u.name, u.avatar_url, u.status
       FROM workspace_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at ASC`,
    [workspaceId]
  );
  return res.rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    avatarUrl: r.avatar_url,
    role: r.role,
    status: r.status,
    joinedAt: r.joined_at,
  }));
}

export async function workspaceRoutes(fastify: FastifyInstance) {
  // 所有 workspace 路由都要登录
  fastify.addHook('preHandler', authenticate);

  // GET /api/workspaces — 当前用户加入的所有 workspace
  fastify.get('/', async (request) => {
    const userId = request.auth!.user.id;
    if (userId === 'api-key') {
      // API Key 用户：返回所有 workspace（运维场景）
      const res = await query<{ id: string; name: string; slug: string; owner_id: string; created_at: Date }>(
        `SELECT id, name, slug, owner_id, created_at FROM workspaces ORDER BY created_at ASC`
      );
      return res.rows.map((r) => ({ ...r, role: 'admin' as Role, ownerId: r.owner_id, createdAt: r.created_at }));
    }
    const res = await query<{
      id: string; name: string; slug: string; owner_id: string; role: Role; joined_at: Date; created_at: Date;
    }>(
      `SELECT w.id, w.name, w.slug, w.owner_id, m.role, m.joined_at, w.created_at
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = $1
        ORDER BY m.joined_at ASC`,
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug,
      ownerId: r.owner_id, role: r.role, joinedAt: r.joined_at, createdAt: r.created_at,
    }));
  });

  // POST /api/workspaces — 任何登录用户均可创建
  fastify.post('/', async (request, reply) => {
    const userId = request.auth!.user.id;
    if (userId === 'api-key') return forbid(reply, 'API key cannot create workspace');
    const body = (request.body || {}) as { name?: string; slug?: string };
    const name = (body.name || '').trim();
    let slug = (body.slug || '').trim().toLowerCase();
    if (!name) {
      reply.status(400);
      return { error: 'Bad Request', message: 'name required', code: 'INVALID_INPUT' };
    }
    if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `ws-${Date.now()}`;
    if (!/^[a-z0-9-]+$/.test(slug)) {
      reply.status(400);
      return { error: 'Bad Request', message: 'slug must be lowercase alphanumeric with dashes', code: 'INVALID_INPUT' };
    }

    try {
      const wsRes = await query<{ id: string; name: string; slug: string; created_at: Date }>(
        `INSERT INTO workspaces (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id, name, slug, created_at`,
        [name, slug, userId]
      );
      const ws = wsRes.rows[0];
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [ws.id, userId]
      );
      reply.status(201);
      return { id: ws.id, name: ws.name, slug: ws.slug, ownerId: userId, role: 'owner' as Role, createdAt: ws.created_at };
    } catch (e: any) {
      if (e?.code === '23505') {
        reply.status(409);
        return { error: 'Conflict', message: 'slug already taken', code: 'SLUG_TAKEN' };
      }
      throw e;
    }
  });

  // GET /api/workspaces/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.auth!.user.id;
    const wsRes = await query<{
      id: string; name: string; slug: string; owner_id: string; settings: any; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, name, slug, owner_id, settings, created_at, updated_at FROM workspaces WHERE id = $1`,
      [id]
    );
    const ws = wsRes.rows[0];
    if (!ws) return notFound(reply);
    const role = userId === 'api-key' ? 'admin' : await getMembership(id, userId);
    if (!role) return forbid(reply, 'Not a member', 'WORKSPACE_FORBIDDEN');
    const members = await loadMembers(id);
    return {
      id: ws.id, name: ws.name, slug: ws.slug,
      ownerId: ws.owner_id, settings: ws.settings,
      createdAt: ws.created_at, updatedAt: ws.updated_at,
      role, members,
    };
  });

  // PATCH /api/workspaces/:id — 改名/改 slug/改 settings（owner/admin）
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.auth!.user.id;
    const role = userId === 'api-key' ? 'admin' : await getMembership(id, userId);
    if (!role) return notFound(reply);
    if (role === 'member') return forbid(reply, 'owner/admin required');

    const body = (request.body || {}) as { name?: string; slug?: string; settings?: Record<string, unknown> };
    const updates: string[] = [];
    const params: any[] = [];
    if (body.name !== undefined) { params.push(body.name); updates.push(`name = $${params.length}`); }
    if (body.slug !== undefined) {
      const slug = body.slug.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) {
        reply.status(400);
        return { error: 'Bad Request', message: 'invalid slug', code: 'INVALID_INPUT' };
      }
      params.push(slug); updates.push(`slug = $${params.length}`);
    }
    if (body.settings !== undefined) { params.push(JSON.stringify(body.settings)); updates.push(`settings = $${params.length}::jsonb`); }
    if (updates.length === 0) {
      return { ok: true };
    }
    updates.push(`updated_at = NOW()`);
    params.push(id);
    try {
      await query(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    } catch (e: any) {
      if (e?.code === '23505') {
        reply.status(409);
        return { error: 'Conflict', message: 'slug already taken', code: 'SLUG_TAKEN' };
      }
      throw e;
    }
    return { ok: true };
  });

  // DELETE /api/workspaces/:id — 仅 owner
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.auth!.user.id;
    const role = userId === 'api-key' ? 'owner' : await getMembership(id, userId);
    if (role !== 'owner') return forbid(reply, 'owner only');
    // 防止删除最后一个 workspace（避免用户登录后没 ws 可用）—— 但允许删除别人的 ws，所以只阻止当前用户的最后一个
    // 简化：直接删；如果用户没 ws 了，下次登录会得到空列表。
    await query(`DELETE FROM workspaces WHERE id = $1`, [id]);
    return { ok: true };
  });

  // GET /api/workspaces/:id/members
  fastify.get('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.auth!.user.id;
    const role = userId === 'api-key' ? 'admin' : await getMembership(id, userId);
    if (!role) return forbid(reply, 'Not a member', 'WORKSPACE_FORBIDDEN');
    return loadMembers(id);
  });

  // POST /api/workspaces/:id/members  { email, role }
  fastify.post('/:id/members', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.auth!.user.id;
    const myRole = userId === 'api-key' ? 'owner' : await getMembership(id, userId);
    if (!myRole) return notFound(reply);
    if (myRole === 'member') return forbid(reply, 'owner/admin required');

    const body = (request.body || {}) as { email?: string; role?: Role };
    const email = (body.email || '').trim().toLowerCase();
    const role: Role = (body.role || 'member') as Role;
    if (!email || !['owner', 'admin', 'member'].includes(role)) {
      reply.status(400);
      return { error: 'Bad Request', message: 'email + role(owner|admin|member) required', code: 'INVALID_INPUT' };
    }
    if (myRole === 'admin' && (role === 'owner' || role === 'admin')) {
      return forbid(reply, 'admin cannot grant owner/admin');
    }

    const userRes = await query<{ id: string; name: string; email: string; avatar_url: string | null; status: string }>(
      `SELECT id, name, email, avatar_url, status FROM users WHERE email = $1`,
      [email]
    );
    const targetUser = userRes.rows[0];
    if (!targetUser) {
      reply.status(404);
      return { error: 'Not Found', message: 'user not found', code: 'USER_NOT_FOUND' };
    }
    try {
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
        [id, targetUser.id, role]
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        reply.status(409);
        return { error: 'Conflict', message: 'already a member', code: 'ALREADY_MEMBER' };
      }
      throw e;
    }
    reply.status(201);
    return {
      userId: targetUser.id, email: targetUser.email, name: targetUser.name,
      avatarUrl: targetUser.avatar_url, role, status: targetUser.status,
    };
  });

  // PATCH /api/workspaces/:id/members/:userId  { role } — 仅 owner 可改角色
  fastify.patch('/:id/members/:userId', async (request, reply) => {
    const { id, userId: targetUserId } = request.params as { id: string; userId: string };
    const myId = request.auth!.user.id;
    const myRole = myId === 'api-key' ? 'owner' : await getMembership(id, myId);
    if (myRole !== 'owner') return forbid(reply, 'owner only');
    const body = (request.body || {}) as { role?: Role };
    const role = body.role;
    if (!role || !['owner', 'admin', 'member'].includes(role)) {
      reply.status(400);
      return { error: 'Bad Request', message: 'invalid role', code: 'INVALID_INPUT' };
    }
    if (role === 'owner') {
      // 转让 ownership：把当前 owner 降为 admin，把目标设为 owner，同时改 workspaces.owner_id
      const client = await (await import('../db/connection.js')).getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE workspace_members SET role = 'admin' WHERE workspace_id = $1 AND role = 'owner'`,
          [id]
        );
        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')
             ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`,
          [id, targetUserId]
        );
        await client.query(`UPDATE workspaces SET owner_id = $1, updated_at = NOW() WHERE id = $2`, [targetUserId, id]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return { ok: true };
    }
    const upd = await query(
      `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3 RETURNING user_id`,
      [role, id, targetUserId]
    );
    if (upd.rows.length === 0) {
      reply.status(404);
      return { error: 'Not Found', message: 'member not found', code: 'NOT_FOUND' };
    }
    return { ok: true };
  });

  // DELETE /api/workspaces/:id/members/:userId
  fastify.delete('/:id/members/:userId', async (request, reply) => {
    const { id, userId: targetUserId } = request.params as { id: string; userId: string };
    const myId = request.auth!.user.id;
    const myRole = myId === 'api-key' ? 'owner' : await getMembership(id, myId);
    if (!myRole) return notFound(reply);
    if (myRole === 'member' && myId !== targetUserId) return forbid(reply, 'cannot remove others');

    // 不能移除 owner（除非自己离开但又是 owner，需要先转让）
    const targetRoleRes = await query<{ role: Role }>(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [id, targetUserId]
    );
    const targetRole = targetRoleRes.rows[0]?.role;
    if (!targetRole) {
      reply.status(404);
      return { error: 'Not Found', message: 'member not found', code: 'NOT_FOUND' };
    }
    if (targetRole === 'owner') {
      return forbid(reply, 'cannot remove owner — transfer ownership first');
    }
    if (myRole === 'admin' && targetRole === 'admin' && myId !== targetUserId) {
      return forbid(reply, 'admin cannot remove other admins');
    }
    await query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [id, targetUserId]
    );
    return { ok: true };
  });
}
