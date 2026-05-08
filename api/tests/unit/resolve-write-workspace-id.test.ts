/**
 * resolveWriteWorkspaceId — 写路径 workspaceId 解析助手
 *
 * 防回归: hanxiangqin001@ke.com 案例 — 没加入任何 ws 的 session 用户
 * POST /sources 时, currentWorkspaceId 返回 NO_WORKSPACE_SENTINEL,
 * 旧代码 `?? undefined` 把 sentinel 当真 UUID 喂给 INSERT, PG 撞
 * meeting_note_sources_workspace_id_fkey (23503) → 500.
 *
 * 修复: 该助手在路由边界识别这种情况, 直接 reply 403 NO_WORKSPACE,
 * 不让 sentinel 流到 SQL 层.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { resolveWriteWorkspaceId } from '../../src/db/repos/withWorkspace.js';
import type { AuthContext } from '../../src/middleware/auth.js';

const WS_REAL = 'b2fa6d52-6072-4560-aed7-3ec3ddb13072';

function build() {
  const app = Fastify({ logger: false });
  let captured: { wsId: string | null | undefined; sent: boolean } = {
    wsId: undefined,
    sent: false,
  };
  app.post('/probe', async (request, reply) => {
    const wsId = resolveWriteWorkspaceId(request, reply);
    captured = { wsId, sent: reply.sent };
    if (reply.sent) return;
    return { wsId };
  });
  return { app, get captured() { return captured; } };
}

function authOf(partial: Partial<AuthContext> | null): AuthContext | undefined {
  if (partial === null) return undefined;
  return {
    user: { id: 'u1', email: 'x@y', name: null, isSuperAdmin: false } as any,
    workspace: null,
    workspaces: [],
    sessionId: null,
    via: 'session',
    ...partial,
  } as AuthContext;
}

describe('resolveWriteWorkspaceId', () => {
  it('session 用户已加入 workspace → 返回真 UUID, 不 reply', async () => {
    const t = build();
    t.app.addHook('onRequest', async (req) => {
      (req as any).auth = authOf({
        via: 'session',
        workspace: { id: WS_REAL, slug: 'huiju', name: '惠居', role: 'owner' } as any,
      });
    });
    const res = await t.app.inject({ method: 'POST', url: '/probe' });
    expect(res.statusCode).toBe(200);
    expect(t.captured).toEqual({ wsId: WS_REAL, sent: false });
  });

  it('api-key admin → 返回 null, 不 reply (调用方传 undefined 让 service 走 DEFAULT)', async () => {
    const t = build();
    t.app.addHook('onRequest', async (req) => {
      (req as any).auth = authOf({ via: 'api-key', workspace: null });
    });
    const res = await t.app.inject({ method: 'POST', url: '/probe' });
    expect(res.statusCode).toBe(200);
    expect(t.captured).toEqual({ wsId: null, sent: false });
  });

  it('session 用户没加入任何 workspace → 403 NO_WORKSPACE, 返回 undefined', async () => {
    const t = build();
    t.app.addHook('onRequest', async (req) => {
      (req as any).auth = authOf({ via: 'session', workspace: null });
    });
    const res = await t.app.inject({ method: 'POST', url: '/probe' });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('NO_WORKSPACE');
    expect(body.error).toBe('Forbidden');
    expect(t.captured.sent).toBe(true);
    expect(t.captured.wsId).toBeUndefined();
  });

  it('未认证 → 401 NO_AUTH', async () => {
    const t = build();
    // 不挂 auth, request.auth 留 undefined
    const res = await t.app.inject({ method: 'POST', url: '/probe' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe('NO_AUTH');
  });
});
