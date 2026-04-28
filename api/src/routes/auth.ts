// /api/auth/* — 登录、登出、me、切换 workspace
// OAuth2 路由占位（第 3 期接入）

import type { FastifyInstance, FastifyReply } from 'fastify';
import { query } from '../db/connection.js';
import { verifyPassword, hashPassword } from '../services/auth/passwords.js';
import {
  createSession,
  revokeSession,
  setSessionWorkspace,
  resolveSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
} from '../services/auth/sessions.js';
import { authenticate } from '../middleware/auth.js';

interface LoginBody {
  email?: string;
  password?: string;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const body = (request.body || {}) as LoginBody;
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!email || !password) {
      reply.status(400);
      return { error: 'Bad Request', message: 'email and password required', code: 'INVALID_INPUT' };
    }

    const userRes = await query<{
      id: string;
      email: string;
      name: string;
      password_hash: string | null;
      status: string;
      is_super_admin: boolean;
      must_change_password: boolean;
    }>(
      `SELECT id, email, name, password_hash, status, is_super_admin, must_change_password
         FROM users WHERE email = $1`,
      [email]
    );
    const user = userRes.rows[0];
    if (!user || user.status !== 'active') {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
    }

    // 拿到该用户加入的 workspaces，挑第一个作为 current
    const wsRes = await query<{ id: string }>(
      `SELECT w.id FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = $1 ORDER BY m.joined_at ASC LIMIT 1`,
      [user.id]
    );
    const firstWs = wsRes.rows[0]?.id || null;

    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || request.ip;
    const ua = request.headers['user-agent'] || '';
    const { token, expiresAt } = await createSession({
      userId: user.id,
      userAgent: ua,
      ip,
      currentWorkspaceId: firstWs,
    });

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    setSessionCookie(reply, token, expiresAt);

    const session = await resolveSession(token);
    return {
      user: session?.user,
      currentWorkspace: session?.currentWorkspace || null,
      workspaces: session?.workspaces || [],
    };
  });

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    if (request.auth?.sessionId) {
      await revokeSession(request.auth.sessionId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: authenticate }, async (request) => {
    return {
      user: request.auth?.user,
      currentWorkspace: request.auth?.workspace,
      workspaces: request.auth?.workspaces,
      via: request.auth?.via,
    };
  });

  // POST /api/auth/switch-workspace { workspaceId }
  fastify.post('/switch-workspace', { preHandler: authenticate }, async (request, reply) => {
    const body = (request.body || {}) as { workspaceId?: string };
    const targetId = body.workspaceId;
    if (!targetId) {
      reply.status(400);
      return { error: 'Bad Request', message: 'workspaceId required', code: 'INVALID_INPUT' };
    }
    const auth = request.auth!;
    if (auth.via !== 'session' || !auth.sessionId) {
      reply.status(403);
      return { error: 'Forbidden', message: 'Only session users can switch workspace', code: 'FORBIDDEN' };
    }
    const inList = auth.workspaces.find((w) => w.id === targetId);
    if (!inList) {
      reply.status(403);
      return { error: 'Forbidden', message: 'Not a member of this workspace', code: 'WORKSPACE_FORBIDDEN' };
    }
    await setSessionWorkspace(auth.sessionId, targetId);
    return { ok: true, currentWorkspace: inList };
  });

  // POST /api/auth/change-password { current, next }
  fastify.post('/change-password', { preHandler: authenticate }, async (request, reply) => {
    const body = (request.body || {}) as { current?: string; next?: string };
    const current = body.current || '';
    const next = body.next || '';
    if (!current || !next) {
      reply.status(400);
      return { error: 'Bad Request', message: 'current and next required', code: 'INVALID_INPUT' };
    }
    if (next.length < 8) {
      reply.status(400);
      return { error: 'Bad Request', message: 'password must be at least 8 chars', code: 'INVALID_INPUT' };
    }
    const auth = request.auth!;
    if (auth.via !== 'session') {
      reply.status(403);
      return { error: 'Forbidden', message: 'API key cannot change password', code: 'FORBIDDEN' };
    }
    const userRes = await query<{ password_hash: string | null }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [auth.user.id]
    );
    const ok = await verifyPassword(current, userRes.rows[0]?.password_hash);
    if (!ok) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Current password incorrect', code: 'INVALID_CREDENTIALS' };
    }
    const hash = await hashPassword(next);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2`,
      [hash, auth.user.id]
    );
    return { ok: true };
  });

  // OAuth2 占位（第 3 期接入 Google/GitHub）
  fastify.get('/oauth/:provider/start', async (_request, reply) => {
    reply.status(501);
    return {
      error: 'Not Implemented',
      message: 'OAuth provider integration is planned for phase 3',
      code: 'NOT_IMPLEMENTED',
    };
  });
  fastify.get('/oauth/:provider/callback', async (_request, reply) => {
    reply.status(501);
    return {
      error: 'Not Implemented',
      message: 'OAuth provider integration is planned for phase 3',
      code: 'NOT_IMPLEMENTED',
    };
  });
}
