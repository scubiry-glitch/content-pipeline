/**
 * createPersonalWorkspace — 用户创建链路里同事务建 1:1 personal ws
 *
 * 防回归: hanxiangqin001@ke.com 案例 — admin 建用户后, 用户没有任何 ws,
 * 任何写路径喂 sentinel 给 INSERT 触发 FK 23503 → 500. 这里在用户创建链路
 * 同事务把 ws 准备好, 链路上不存在没 ws 的用户.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { createPersonalWorkspace } from '../../src/services/auth/personalWorkspace.js';

const USER_ID = '9d5df48a-aa3d-4d40-985d-22ac9deaf1f1';
const NEW_WS_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeClient() {
  const queryMock = vi.fn();
  const client = { query: queryMock } as unknown as PoolClient;
  return { client, queryMock };
}

describe('createPersonalWorkspace', () => {
  it('正常路径: 用 email local-part 当 name, INSERT ws + INSERT membership', async () => {
    const { client, queryMock } = makeClient();
    queryMock.mockResolvedValueOnce({ rows: [{ id: NEW_WS_ID }] }); // ws
    queryMock.mockResolvedValueOnce({ rows: [] }); // membership

    const wsId = await createPersonalWorkspace(USER_ID, 'hanxiangqin001@ke.com', client);

    expect(wsId).toBe(NEW_WS_ID);
    expect(queryMock).toHaveBeenCalledTimes(2);

    // 第 1 call: INSERT workspaces
    const wsCall = queryMock.mock.calls[0];
    expect(wsCall[0]).toMatch(/INSERT INTO workspaces/);
    expect(wsCall[1]).toEqual([
      'hanxiangqin001 的个人工作区',
      'u-9d5df48a',
      USER_ID,
    ]);

    // 第 2 call: INSERT workspace_members owner ('owner' 在 SQL literal 里)
    const memCall = queryMock.mock.calls[1];
    expect(memCall[0]).toMatch(/INSERT INTO workspace_members/);
    expect(memCall[0]).toMatch(/'owner'/);
    expect(memCall[1]).toEqual([NEW_WS_ID, USER_ID]);
  });

  it('slug 撞 23505 → fallback 用 user_id 全 32 hex', async () => {
    const { client, queryMock } = makeClient();
    const collision: any = new Error('duplicate key'); collision.code = '23505';
    queryMock.mockRejectedValueOnce(collision); // 第一次 ws INSERT 撞 slug
    queryMock.mockResolvedValueOnce({ rows: [{ id: NEW_WS_ID }] }); // 第二次成功
    queryMock.mockResolvedValueOnce({ rows: [] }); // membership

    const wsId = await createPersonalWorkspace(USER_ID, 'a@b.com', client);

    expect(wsId).toBe(NEW_WS_ID);
    expect(queryMock).toHaveBeenCalledTimes(3);
    const fallbackCall = queryMock.mock.calls[1];
    expect(fallbackCall[1][1]).toBe(`u-9d5df48a-${USER_ID.replace(/-/g, '')}`);
  });

  it('非 23505 错误直接抛, 不走 fallback', async () => {
    const { client, queryMock } = makeClient();
    const fatal: any = new Error('connection lost'); fatal.code = '08006';
    queryMock.mockRejectedValueOnce(fatal);

    await expect(
      createPersonalWorkspace(USER_ID, 'x@y', client),
    ).rejects.toThrow('connection lost');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('email 缺省 → fallback name "个人工作区 的个人工作区"', async () => {
    const { client, queryMock } = makeClient();
    queryMock.mockResolvedValueOnce({ rows: [{ id: NEW_WS_ID }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    await createPersonalWorkspace(USER_ID, null, client);
    expect(queryMock.mock.calls[0][1][0]).toBe('个人工作区 的个人工作区');
  });

  it('options.name 优先于 email', async () => {
    const { client, queryMock } = makeClient();
    queryMock.mockResolvedValueOnce({ rows: [{ id: NEW_WS_ID }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    await createPersonalWorkspace(USER_ID, 'x@y.com', client, { name: '韩向勤' });
    expect(queryMock.mock.calls[0][1][0]).toBe('韩向勤 的个人工作区');
  });
});
