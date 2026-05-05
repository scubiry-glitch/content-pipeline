/**
 * ceoWorkspaceGuard — router-level preHandler 跨 workspace 隔离守卫
 *
 * 行为契约 (锁住 commit 7ca4f313 + 6823a696 已落地的语义):
 *   1) api-key admin (wsId=null) 完全跳过守卫
 *   2) URL 里的 :id 段 + collection 段命中 COLLECTION_TABLE → 调
 *      assertRowInWorkspace 验证, 跨 ws 一律 404 'Not Found' (不暴露存在性)
 *   3) GET 用 mode='read' (允许 is_shared workspace), 其它方法 mode='write'
 *   4) collection 不在 COLLECTION_TABLE → :id 守卫跳过
 *   5) query.scopeId / query.scopes / body.scopeId / body.scopeIds 出现的
 *      每个 UUID 必须属于当前 ws 的 mn_scopes (或 is_shared); 任一 fail 返回 404
 *   6) 逗号分隔字符串与数组都正确拆解
 *   7) 非 UUID 段 → assertRowInWorkspace 报错 → 404 (不放行)
 *
 * 这份测试是改动 P2 (cross-ws 集成测试) — 防止以后改 router 手滑回归.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { currentWorkspaceIdMock, assertRowInWorkspaceMock, queryMock } = vi.hoisted(() => ({
  currentWorkspaceIdMock: vi.fn(),
  assertRowInWorkspaceMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../src/db/repos/withWorkspace.js', () => ({
  currentWorkspaceId: currentWorkspaceIdMock,
  assertRowInWorkspace: assertRowInWorkspaceMock,
  requireWorkspaceId: vi.fn(),
  withWorkspaceTx: vi.fn(),
  NO_WORKSPACE_SENTINEL: '00000000-0000-0000-0000-000000000000',
}));

vi.mock('../../src/db/connection.js', () => ({
  query: queryMock,
}));

import { ceoWorkspaceGuard } from '../../src/modules/ceo/workspaceGuard.js';

const WS_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UUID_DIRECTOR = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const UUID_LINE = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
const UUID_STAKE = 'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3';
const SCOPE_X = 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4';
const SCOPE_Y = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f5f5';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', ceoWorkspaceGuard);
  app.get('/ceo/directors/:id', async () => ({ ok: true }));
  app.get('/ceo/lines/:id', async () => ({ ok: true }));
  app.patch('/ceo/stakeholders/:id', async () => ({ ok: true }));
  // collection 不在 COLLECTION_TABLE 里, 守卫应跳过
  app.get('/ceo/balcony/dashboard', async () => ({ ok: true }));
  app.get('/ceo/foo/:id', async () => ({ ok: true }));
  // 用于 scopeId 验证 (无 :id 段)
  app.get('/ceo/list', async () => ({ ok: true }));
  app.post('/ceo/action', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('ceoWorkspaceGuard', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    currentWorkspaceIdMock.mockReset();
    assertRowInWorkspaceMock.mockReset();
    queryMock.mockReset();
    app = await buildApp();
  });

  // ─── 1) admin bypass ────────────────────────────────────────────
  describe('admin (api-key, wsId=null) bypass', () => {
    it('跳过 :id 守卫', async () => {
      currentWorkspaceIdMock.mockReturnValue(null);
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/directors/${UUID_DIRECTOR}`,
      });
      expect(res.statusCode).toBe(200);
      expect(assertRowInWorkspaceMock).not.toHaveBeenCalled();
    });

    it('跳过 scopeId 验证', async () => {
      currentWorkspaceIdMock.mockReturnValue(null);
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/list?scopeId=${SCOPE_X}`,
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  // ─── 2) URL :id 行级守卫 ────────────────────────────────────────
  describe('URL :id 行级守卫', () => {
    it('同 ws GET → 200, mode=read', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockResolvedValue(true);
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/directors/${UUID_DIRECTOR}`,
      });
      expect(res.statusCode).toBe(200);
      expect(assertRowInWorkspaceMock).toHaveBeenCalledWith(
        'ceo_directors',
        'id',
        UUID_DIRECTOR,
        WS_A,
        'read',
      );
    });

    it('跨 ws GET → 404 Not Found (不暴露存在性)', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockResolvedValue(false);
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/directors/${UUID_DIRECTOR}`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Not Found' });
    });

    it('跨 ws PATCH (write 模式) → 404, mode=write', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockResolvedValue(false);
      const res = await app.inject({
        method: 'PATCH',
        url: `/ceo/stakeholders/${UUID_STAKE}`,
      });
      expect(res.statusCode).toBe(404);
      expect(assertRowInWorkspaceMock).toHaveBeenCalledWith(
        'ceo_stakeholders',
        'id',
        UUID_STAKE,
        WS_A,
        'write',
      );
    });

    it('mapping: lines collection → ceo_strategic_lines', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockResolvedValue(true);
      await app.inject({
        method: 'GET',
        url: `/ceo/lines/${UUID_LINE}`,
      });
      expect(assertRowInWorkspaceMock).toHaveBeenCalledWith(
        'ceo_strategic_lines',
        'id',
        UUID_LINE,
        WS_A,
        'read',
      );
    });

    it('未登记的 collection (foo) → 守卫跳过', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/foo/${UUID_DIRECTOR}`,
      });
      expect(res.statusCode).toBe(200);
      expect(assertRowInWorkspaceMock).not.toHaveBeenCalled();
    });

    it('无 :id 路由 → :id 守卫跳过, 不调 assertRowInWorkspace', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      const res = await app.inject({
        method: 'GET',
        url: '/ceo/balcony/dashboard',
      });
      expect(res.statusCode).toBe(200);
      expect(assertRowInWorkspaceMock).not.toHaveBeenCalled();
    });

    it('非 UUID :id (assertRowInWorkspace 抛错) → 404', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockRejectedValue(new Error('invalid uuid'));
      const res = await app.inject({
        method: 'GET',
        url: '/ceo/directors/not-a-uuid',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Not Found' });
    });
  });

  // ─── 3) scopeId 链式验证 ────────────────────────────────────────
  describe('scopeId 链式验证', () => {
    it('query.scopeId 同 ws → 200', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      queryMock.mockResolvedValue({ rows: [{ id: SCOPE_X }] });
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/list?scopeId=${SCOPE_X}`,
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const sqlArgs = queryMock.mock.calls[0];
      expect(sqlArgs[0]).toContain('mn_scopes');
      expect(sqlArgs[0]).toContain('is_shared');
      expect(sqlArgs[1]).toEqual([[SCOPE_X], WS_A]);
    });

    it('query.scopeId 跨 ws (DB 返回空) → 404', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      queryMock.mockResolvedValue({ rows: [] });
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/list?scopeId=${SCOPE_X}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('多个 scopeId, 一个跨 ws → 404', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      queryMock.mockResolvedValue({ rows: [{ id: SCOPE_X }] }); // SCOPE_Y 缺
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/list?scopeId=${SCOPE_X},${SCOPE_Y}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('全部 scopeId 同 ws → 200', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      queryMock.mockResolvedValue({ rows: [{ id: SCOPE_X }, { id: SCOPE_Y }] });
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/list?scopeId=${SCOPE_X},${SCOPE_Y}`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('body.scopeIds 数组跨 ws → 404', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      queryMock.mockResolvedValue({ rows: [] });
      const res = await app.inject({
        method: 'POST',
        url: '/ceo/action',
        payload: { scopeIds: [SCOPE_X, SCOPE_Y] },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DB 异常 (pg 抛错) → 404 (而不是 500, 防侧信道)', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      queryMock.mockRejectedValue(new Error('pg connection lost'));
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/list?scopeId=${SCOPE_X}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('无 scopeId 无 :id → 直接 200, 不调 query', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      const res = await app.inject({
        method: 'GET',
        url: '/ceo/list',
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).not.toHaveBeenCalled();
      expect(assertRowInWorkspaceMock).not.toHaveBeenCalled();
    });

    it('query.scopeId 含非 UUID 字符串 → 守卫忽略, 不阻塞', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      const res = await app.inject({
        method: 'GET',
        url: '/ceo/list?scopeId=not-a-uuid',
      });
      // collectScopeIds 只收 UUID 格式; 'not-a-uuid' 被 drop, scopeIds 长度 0
      expect(res.statusCode).toBe(200);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  // ─── 4) 组合场景 ────────────────────────────────────────────────
  describe('组合场景', () => {
    it(':id 通过 + scopeId 跨 ws → 仍 404 (scopeId 阶段拦截)', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockResolvedValue(true);
      queryMock.mockResolvedValue({ rows: [] });
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/directors/${UUID_DIRECTOR}?scopeId=${SCOPE_X}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it(':id 跨 ws → 立即 404, 不再检查 scopeId', async () => {
      currentWorkspaceIdMock.mockReturnValue(WS_A);
      assertRowInWorkspaceMock.mockResolvedValue(false);
      const res = await app.inject({
        method: 'GET',
        url: `/ceo/directors/${UUID_DIRECTOR}?scopeId=${SCOPE_X}`,
      });
      expect(res.statusCode).toBe(404);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });
});
