// 认证中间件
// 支持两种凭证（共存）：
//   1) Cookie session（cp_session）—— 真实用户登录后写入；
//   2) X-API-Key —— MVP 兼容凭证（兼容期保留，第 3 期移除）。
// 解析成功后注入 request.auth = { user, workspace, workspaces, sessionId, via }。

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  resolveSession,
  SESSION_COOKIE_NAME,
  type ResolvedSession,
} from '../services/auth/sessions.js';

export interface RequestAuth {
  user: ResolvedSession['user'] | { id: 'api-key'; email: 'api-key@local'; name: 'API Key'; isSuperAdmin: true; mustChangePassword: false };
  workspace: ResolvedSession['currentWorkspace'];
  workspaces: ResolvedSession['workspaces'];
  sessionId: string | null;
  via: 'session' | 'api-key';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: RequestAuth;
  }
}

function getAPIKey(): string {
  return process.env.ADMIN_API_KEY || 'dev-api-key-change-in-production';
}

function isApiKeyDisabled(): boolean {
  return process.env.AUTH_DISABLE_API_KEY === 'true';
}

export function setupAuth(_fastify: FastifyInstance) {
  // 注册由 server.ts 完成（@fastify/cookie + 路由）
}

async function tryResolveAuth(request: FastifyRequest): Promise<RequestAuth | null> {
  const cookieToken = request.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken) {
    const session = await resolveSession(cookieToken).catch(() => null);
    if (session) {
      return {
        user: session.user,
        workspace: session.currentWorkspace,
        workspaces: session.workspaces,
        sessionId: session.sessionId,
        via: 'session',
      };
    }
  }

  if (!isApiKeyDisabled()) {
    const apiKey = request.headers['x-api-key'];
    if (apiKey && apiKey === getAPIKey()) {
      return {
        user: {
          id: 'api-key',
          email: 'api-key@local',
          name: 'API Key',
          isSuperAdmin: true,
          mustChangePassword: false,
        },
        workspace: null,
        workspaces: [],
        sessionId: null,
        via: 'api-key',
      };
    }
  }

  return null;
}

function unauthorized(reply: FastifyReply, message = 'Authentication required') {
  reply.status(401);
  return {
    error: 'Unauthorized',
    message,
    code: 'UNAUTHORIZED',
  };
}

/** 强制认证：未通过则 401。 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = await tryResolveAuth(request);
  if (!auth) {
    return unauthorized(reply);
  }
  request.auth = auth;
  // 兼容旧代码：(request as any).user?.id
  (request as any).user = { id: auth.user.id, role: auth.user.isSuperAdmin ? 'super_admin' : 'user' };
}

/** 可选认证：未通过也继续执行；通过则注入 request.auth。 */
export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  const auth = await tryResolveAuth(request);
  if (auth) {
    request.auth = auth;
    (request as any).user = { id: auth.user.id, role: auth.user.isSuperAdmin ? 'super_admin' : 'user' };
  }
}

/** 要求 super_admin。 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (!request.auth?.user.isSuperAdmin) {
    reply.status(403);
    return {
      error: 'Forbidden',
      message: 'super_admin required',
      code: 'FORBIDDEN',
    };
  }
}

/** 要求当前 session 选中了一个 workspace。 */
export async function requireWorkspace(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (!request.auth?.workspace) {
    reply.status(403);
    return {
      error: 'Forbidden',
      message: 'No workspace selected',
      code: 'NO_WORKSPACE',
    };
  }
}
