/**
 * CEO 路由 · auth → wsId 真实链路集成测试
 *
 * 防回归: commit cd2ed066 之前 CEO router 漏挂 authenticate preHandler,
 * 导致 cookie session 不被解析 → request.auth = undefined →
 * currentWorkspaceId 返回 null → wsFilterClause 走 IS NULL 分支看全表.
 *
 * 与 ceo-workspace-guard.test.ts 区别:
 *   - guard test 在 currentWorkspaceId 层 mock, 跳过 auth pipeline.
 *   - 这个 test 在 resolveSession 层 mock, 走完整 cookie → session →
 *     auth → currentWorkspaceId → service SQL 链路.
 *
 * 验证目标:
 *   1) 带 cp_session cookie + 合法 session → SQL 收到 ws.id
 *   2) 带 X-API-Key (admin) → SQL 收到 null (admin 看全部)
 *   3) 无凭证 → 401, SQL 不被调用
 *   4) 带 cookie 但 session 失效 → 401
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const { resolveSessionMock, queryMock } = vi.hoisted(() => ({
  resolveSessionMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../src/services/auth/sessions.js', () => ({
  resolveSession: resolveSessionMock,
  SESSION_COOKIE_NAME: 'cp_session',
}));

vi.mock('../../src/db/connection.js', () => ({
  query: queryMock,
  getClient: vi.fn(),
}));

import { createRouter } from '../../src/modules/ceo/router.js';

const WS_HUIJU = 'b2fa6d52-6072-4560-aed7-3ec3ddb13072';

function fakeSession(workspaceId: string | null) {
  return {
    sessionId: 'sess-test',
    user: {
      id: '0b072be6-c425-4cf9-b7ee-9f638151858f',
      email: 'yb@ke.com',
      name: 'YB',
      isSuperAdmin: false,
      mustChangePassword: false,
    },
    currentWorkspace: workspaceId
      ? { id: workspaceId, slug: 'huiju', name: '惠居上海', role: 'owner' as const }
      : null,
    workspaces: workspaceId
      ? [{ id: workspaceId, slug: 'huiju', name: '惠居上海', role: 'owner' as const }]
      : [],
    expiresAt: new Date(Date.now() + 1_000_000),
  };
}

function fakeEngine() {
  return {
    deps: { db: { query: queryMock } },
    health: () => ({ ok: true, module: 'ceo' as const, db: 'connected' as const, schedulerRunning: false }),
    buildDashboard: async () => ({ rooms: [], note: '' }),
    enqueueRun: async () => ({ ok: true, runId: 'r-1' }),
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(createRouter(fakeEngine()), { prefix: '/api/v1/ceo' });
  await app.ready();
  return app;
}

describe('CEO router · auth → wsId chain', () => {
  beforeEach(() => {
    resolveSessionMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    delete process.env.AUTH_DISABLE_API_KEY;
    process.env.ADMIN_API_KEY = 'test-admin-key';
  });

  it('cookie session → SQL 收到 ws.id', async () => {
    resolveSessionMock.mockResolvedValue(fakeSession(WS_HUIJU));
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ceo/compass/lines',
      cookies: { cp_session: 'fake-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(resolveSessionMock).toHaveBeenCalledWith('fake-token');
    // 任意一次 SQL 调用的 params 里应该出现 wsId
    const allParams = queryMock.mock.calls.flatMap((c) => (c[1] as unknown[]) ?? []);
    expect(allParams).toContain(WS_HUIJU);
    // 不应该出现 null 占位 (那是 admin 路径)
    // 注意: 部分 SQL 也会传 null 作为 scopeId, 所以这里只 assert wsId 出现
  });

  it('X-API-Key (admin) → SQL 收到 null (看全部)', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ceo/compass/lines',
      headers: { 'x-api-key': 'test-admin-key' },
    });

    expect(res.statusCode).toBe(200);
    expect(resolveSessionMock).not.toHaveBeenCalled();
    // admin 路径: wsId === null 透传到 SQL 作为 wsFilterClause 第一个分支匹配
    // 至少有一条 SQL 调用的 params 数组里包含 null
    const hasNullParam = queryMock.mock.calls.some((c) =>
      ((c[1] as unknown[]) ?? []).some((p) => p === null),
    );
    expect(hasNullParam).toBe(true);
  });

  it('无凭证 → 401, SQL 不被调用', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ceo/compass/lines',
    });

    expect(res.statusCode).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('带 cookie 但 session 失效 → 401, SQL 不被调用', async () => {
    resolveSessionMock.mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ceo/compass/lines',
      cookies: { cp_session: 'expired' },
    });

    expect(res.statusCode).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('cookie session 但 user 没有当前 workspace → wsId = NO_WORKSPACE_SENTINEL', async () => {
    resolveSessionMock.mockResolvedValue(fakeSession(null));
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ceo/compass/lines',
      cookies: { cp_session: 'fake-token' },
    });

    expect(res.statusCode).toBe(200);
    // sentinel UUID — 永远不会匹配任何真实 ws, SQL 拿到 0 行
    const SENTINEL = '00000000-0000-0000-0000-000000000000';
    const allParams = queryMock.mock.calls.flatMap((c) => (c[1] as unknown[]) ?? []);
    expect(allParams).toContain(SENTINEL);
  });
});
