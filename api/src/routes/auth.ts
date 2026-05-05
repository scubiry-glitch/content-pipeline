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
  refreshSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  SESSION_TTL_DAYS_SHORT,
} from '../services/auth/sessions.js';
import { authenticate } from '../middleware/auth.js';
import {
  writeAuditEvent,
  checkEmailLock,
  escalateLockIfNeeded,
} from '../services/auth/audit.js';
import {
  getGoogleOAuthConfig,
  buildAuthorizeUrl,
  generatePkce,
  exchangeCodeForToken,
  fetchUserInfo,
} from '../services/auth/oauthGoogle.js';

interface LoginBody {
  email?: string;
  password?: string;
  rememberMe?: boolean;
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  opts?: { persistent?: boolean }
) {
  // persistent=false → 浏览器关闭即失效（不写 expires/maxAge），但后端 session 仍按 expiresAt 失效
  const persistent = opts?.persistent !== false;
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(persistent
      ? {
          expires: expiresAt,
          maxAge: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        }
      : {}),
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

    // 锁定检查: 15min 内 5 次失败 → 锁 30min
    const lock = await checkEmailLock(email);
    if (lock.locked) {
      reply.status(423);
      reply.header('Retry-After', String(lock.retryAfterSeconds ?? 1800));
      return {
        error: 'Locked',
        message: `Too many failed attempts; account temporarily locked. Retry in ${lock.retryAfterSeconds}s.`,
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: lock.retryAfterSeconds,
      };
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
      await writeAuditEvent({
        event: 'login.failure',
        email,
        request,
        metadata: { reason: !user ? 'no_such_user' : 'user_disabled' },
      });
      const escalation = await escalateLockIfNeeded(email, request);
      reply.status(escalation.lockJustTriggered ? 423 : 401);
      if (escalation.lockJustTriggered) {
        reply.header('Retry-After', String(escalation.retryAfterSeconds));
      }
      return {
        error: escalation.lockJustTriggered ? 'Locked' : 'Unauthorized',
        message: 'Invalid credentials',
        code: escalation.lockJustTriggered ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        ...(escalation.lockJustTriggered ? { retryAfterSeconds: escalation.retryAfterSeconds } : {}),
      };
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await writeAuditEvent({
        event: 'login.failure',
        email,
        userId: user.id,
        request,
        metadata: { reason: 'wrong_password' },
      });
      const escalation = await escalateLockIfNeeded(email, request);
      reply.status(escalation.lockJustTriggered ? 423 : 401);
      if (escalation.lockJustTriggered) {
        reply.header('Retry-After', String(escalation.retryAfterSeconds));
      }
      return {
        error: escalation.lockJustTriggered ? 'Locked' : 'Unauthorized',
        message: 'Invalid credentials',
        code: escalation.lockJustTriggered ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        ...(escalation.lockJustTriggered ? { retryAfterSeconds: escalation.retryAfterSeconds } : {}),
      };
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
    // rememberMe undefined / true → 30d 持久 cookie；false → 1d session cookie
    const remember = body.rememberMe !== false;
    const { token, expiresAt } = await createSession({
      userId: user.id,
      userAgent: ua,
      ip,
      currentWorkspaceId: firstWs,
      ttlDays: remember ? SESSION_TTL_DAYS : SESSION_TTL_DAYS_SHORT,
    });

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    setSessionCookie(reply, token, expiresAt, { persistent: remember });

    await writeAuditEvent({
      event: 'login.success',
      email: user.email,
      userId: user.id,
      request,
    });

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
    await writeAuditEvent({
      event: 'logout',
      userId: request.auth?.user?.id ?? null,
      email: request.auth?.user?.email ?? null,
      request,
    });
    return { ok: true };
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: authenticate }, async (request) => {
    return {
      user: request.auth?.user,
      currentWorkspace: request.auth?.workspace,
      workspaces: request.auth?.workspaces,
      via: request.auth?.via,
      sessionExpiresAt: request.auth?.expiresAt ?? null,
    };
  });

  // POST /api/auth/refresh — 续期 session
  // smart refresh: 剩余 > 7d 不写 DB, 只返回当前 expiresAt + refreshed=false;
  // 剩余 ≤ 7d 才推后到 now + 30d, 返回 refreshed=true.
  // 前端可以高频调 (visibility / focus / 1h timer) 不会造成 DB 热点.
  fastify.post('/refresh', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    if (auth.via !== 'session' || !auth.sessionId) {
      reply.status(403);
      return { error: 'Forbidden', message: 'Only session users can refresh', code: 'FORBIDDEN' };
    }
    const r = await refreshSession(auth.sessionId);
    if (!r) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Session expired or revoked', code: 'SESSION_EXPIRED' };
    }
    // 仅在真正推后 expires_at 时重设 cookie maxAge (防止覆盖更长有效期的 cookie)
    if (r.refreshed) {
      setSessionCookie(reply, request.cookies?.[SESSION_COOKIE_NAME] || '', r.expiresAt);
    }
    return { ok: true, expiresAt: r.expiresAt, refreshed: r.refreshed };
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
    await writeAuditEvent({
      event: 'password.change',
      userId: auth.user.id,
      email: auth.user.email,
      request,
    });
    return { ok: true };
  });

  // OAuth2 Google · 当前实现; 其它 provider 仍 501
  // GET /api/auth/oauth/google/start
  // GET /api/auth/oauth/google/callback?code&state

  // OAuth status 查询: 前端 Login 页判断要不要展示 Google 按钮
  fastify.get('/oauth/status', async () => {
    const google = getGoogleOAuthConfig();
    return { google: google ? { enabled: true } : { enabled: false } };
  });

  fastify.get('/oauth/:provider/start', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== 'google') {
      reply.status(404);
      return { error: 'Not Found', message: `provider ${provider} not supported`, code: 'PROVIDER_NOT_SUPPORTED' };
    }
    const cfg = getGoogleOAuthConfig();
    if (!cfg) {
      reply.status(501);
      return {
        error: 'Not Implemented',
        message: 'Google OAuth not configured (set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / OAUTH_CALLBACK_BASE)',
        code: 'OAUTH_NOT_CONFIGURED',
      };
    }
    const { state, verifier, challenge } = generatePkce();
    // 短期 signed cookie 储 state + verifier (5 min); SameSite=Lax 才能跨 Google 跳转回来时还在
    reply.setCookie('oauth_google', JSON.stringify({ state, verifier }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
      signed: true,
    });
    reply.redirect(buildAuthorizeUrl(cfg, state, challenge));
  });

  fastify.get('/oauth/:provider/callback', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== 'google') {
      reply.status(404);
      return { error: 'Not Found', code: 'PROVIDER_NOT_SUPPORTED' };
    }
    const cfg = getGoogleOAuthConfig();
    if (!cfg) {
      reply.status(501);
      return { error: 'Not Implemented', code: 'OAUTH_NOT_CONFIGURED' };
    }
    const q = (request.query || {}) as { code?: string; state?: string; error?: string };
    if (q.error) {
      reply.status(400);
      return { error: 'Bad Request', message: `Google: ${q.error}`, code: 'OAUTH_USER_DENIED' };
    }
    if (!q.code || !q.state) {
      reply.status(400);
      return { error: 'Bad Request', message: 'code and state required', code: 'INVALID_INPUT' };
    }

    // 取并校验 cookie 里的 state + verifier
    const cookieRaw = (request.cookies as Record<string, string | undefined>).oauth_google;
    let stored: { state?: string; verifier?: string } | null = null;
    if (cookieRaw) {
      const unsigned = reply.unsignCookie(cookieRaw);
      if (unsigned.valid && unsigned.value) {
        try { stored = JSON.parse(unsigned.value); } catch { /* invalid */ }
      }
    }
    reply.clearCookie('oauth_google', { path: '/' });
    if (!stored?.state || !stored?.verifier || stored.state !== q.state) {
      reply.status(400);
      return { error: 'Bad Request', message: 'invalid OAuth state', code: 'OAUTH_STATE_MISMATCH' };
    }

    let info;
    try {
      const tokens = await exchangeCodeForToken(cfg, q.code, stored.verifier);
      info = await fetchUserInfo(tokens.access_token);
    } catch (err) {
      reply.status(502);
      return { error: 'Bad Gateway', message: (err as Error).message, code: 'OAUTH_EXCHANGE_FAILED' };
    }

    if (!info.email_verified) {
      reply.status(403);
      return { error: 'Forbidden', message: 'Google email not verified', code: 'EMAIL_UNVERIFIED' };
    }

    // find-or-create user_identities + users
    // 1. 先看 (provider='google', sub) 是否已绑定
    let userId: string | null = null;
    const idRes = await query<{ user_id: string }>(
      `SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_user_id = $1`,
      [info.sub],
    );
    if (idRes.rows.length > 0) {
      userId = idRes.rows[0].user_id;
    } else {
      // 2. 没绑定 — 看是否有同 email 的本地账号
      const userRes = await query<{ id: string; status: string }>(
        `SELECT id, status FROM users WHERE email = $1`,
        [info.email],
      );
      if (userRes.rows.length > 0) {
        if (userRes.rows[0].status !== 'active') {
          reply.status(403);
          return { error: 'Forbidden', message: 'Account is disabled', code: 'USER_DISABLED' };
        }
        userId = userRes.rows[0].id;
      } else {
        // 3. 全新用户 — 创建 (无密码 hash, 不需要 must_change_password)
        const ins = await query<{ id: string }>(
          `INSERT INTO users (email, name, password_hash, must_change_password, avatar_url)
           VALUES ($1, $2, NULL, FALSE, $3)
           RETURNING id`,
          [info.email, info.name || info.email, info.picture ?? null],
        );
        userId = ins.rows[0].id;
      }
      // 绑定 identity
      await query(
        `INSERT INTO user_identities (user_id, provider, provider_user_id, email_at_provider, metadata)
         VALUES ($1, 'google', $2, $3, $4::jsonb)
         ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [
          userId,
          info.sub,
          info.email,
          JSON.stringify({ name: info.name, picture: info.picture ?? null }),
        ],
      );
    }

    if (!userId) {
      reply.status(500);
      return { error: 'Internal Error', code: 'OAUTH_NO_USER' };
    }

    // 拿 first ws + 创建 session
    const wsRes = await query<{ id: string }>(
      `SELECT w.id FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = $1 ORDER BY m.joined_at ASC LIMIT 1`,
      [userId],
    );
    const firstWs = wsRes.rows[0]?.id || null;
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || request.ip;
    const ua = request.headers['user-agent'] || '';
    const { token, expiresAt } = await createSession({
      userId,
      userAgent: ua,
      ip,
      currentWorkspaceId: firstWs,
    });
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
    setSessionCookie(reply, token, expiresAt);
    await writeAuditEvent({
      event: 'login.success',
      userId,
      email: info.email,
      request,
      metadata: { provider: 'google' },
    });

    // 跳前端
    reply.redirect(cfg.frontendRedirect);
  });
}
