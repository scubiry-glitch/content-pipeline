// Workspace 范围限定工具。
// 路由层负责: 从 request.auth.workspace.id 拿 workspace，传给 service / DB 调用。
// 该模块只提供一组小帮手，避免在每个路由里重复 if (!ws) reply.status(403)...

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { query, getClient } from '../connection.js';

/**
 * 从已认证请求里取当前 workspace id。
 * - 普通登录用户必有 workspace（中间件 requireWorkspace 已保证）
 * - super_admin / api-key 没选 workspace 时返回 null（调用方按需决定 fallback）
 */
export function currentWorkspaceId(request: FastifyRequest): string | null {
  return request.auth?.workspace?.id ?? null;
}

/**
 * 强制取 workspace id；没有就 reply 403 并返回 null。
 * 用于必须按 workspace 隔离的写入路径（POST/PUT/DELETE）。
 */
export function requireWorkspaceId(
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const wsId = currentWorkspaceId(request);
  if (!wsId) {
    reply.status(403).send({
      error: 'Forbidden',
      message: 'No workspace selected; switch to a workspace before performing this action',
      code: 'NO_WORKSPACE',
    });
    return null;
  }
  return wsId;
}

/**
 * 校验某行实体属于当前 workspace。
 * 跨 workspace 访问 / 不存在时返回 false（调用方应回 404；不暴露存在性）。
 */
export async function assertRowInWorkspace(
  table: string,
  idColumn: string,
  rowId: string,
  workspaceId: string,
): Promise<boolean> {
  // 只允许已知白名单表，防止 table 名注入
  if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[a-z_][a-z0-9_]*$/i.test(idColumn)) {
    throw new Error(`assertRowInWorkspace: invalid identifier ${table}.${idColumn}`);
  }
  const sql = `SELECT 1 FROM "${table}" WHERE "${idColumn}" = $1 AND workspace_id = $2 LIMIT 1`;
  const r = await query(sql, [rowId, workspaceId]);
  return r.rows.length > 0;
}

/**
 * RLS 兜底事务包装：在 BEGIN/COMMIT 内 SET LOCAL app.workspace_id, 让
 * migrations/039 配置的 RLS policy 自动只放行当前 ws + is_shared ws 的行.
 *
 * 仅当应用切到非 SUPERUSER 角色 (见 docs/rls-setup.md) 时 RLS 才实际生效;
 * 当前 SUPERUSER 路径下 RLS 被 bypass, 此函数行为退化为普通事务.
 *
 * 使用:
 *   await withWorkspaceTx(req.auth.workspace.id, async (client) => {
 *     const r = await client.query('SELECT * FROM tasks');
 *     return r.rows;
 *   });
 *
 * 注意:
 *   - workspaceId 必须是 UUID 格式 (运行时校验); 防止 SET LOCAL 注入
 *   - fn 抛错时自动 ROLLBACK; 所有连接变更随事务清理, 不污染连接池
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withWorkspaceTx<T>(
  workspaceId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(workspaceId)) {
    throw new Error('withWorkspaceTx: workspaceId must be a UUID');
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // SET LOCAL 只能用字面量, 不接 $1 占位符 (PG 限制); UUID 校验过, 拼接安全
    await client.query(`SET LOCAL app.workspace_id = '${workspaceId}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
