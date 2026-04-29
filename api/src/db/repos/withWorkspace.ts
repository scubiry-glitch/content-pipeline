// Workspace 范围限定工具。
// 路由层负责: 从 request.auth.workspace.id 拿 workspace，传给 service / DB 调用。
// 该模块只提供一组小帮手，避免在每个路由里重复 if (!ws) reply.status(403)...

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { query, getClient } from '../connection.js';

/**
 * 一个永远不会匹配任何真实 workspace 的 UUID. 用于 session 用户没加入任何 ws 时
 * (比如 admin 刚创建的新账号) — SQL `WHERE workspace_id = $1` 拿到 0 行,
 * 防止他们因为 currentWorkspaceId() === null 而绕过过滤看到全库数据.
 */
export const NO_WORKSPACE_SENTINEL = '00000000-0000-0000-0000-000000000000';

/**
 * 从已认证请求里取当前 workspace id, 三种返回:
 *   - api-key 凭证 (admin 全局视图)              → null   (调用方"if (wsId) filter" 跳过过滤)
 *   - session 用户已选 workspace                 → 实际 UUID
 *   - session 用户**没加入任何 ws** / 没选 ws    → NO_WORKSPACE_SENTINEL
 *     (impossible UUID, SQL 过滤为空, 不会泄漏 admin 数据)
 *
 * 注意: 之前版本对 api-key 与 session-no-ws 都返回 null, 导致新建用户看到全库. 已修.
 */
export function currentWorkspaceId(request: FastifyRequest): string | null {
  const auth = request.auth;
  if (!auth) return null;
  if (auth.via === 'api-key') return null;
  return auth.workspace?.id ?? NO_WORKSPACE_SENTINEL;
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
 *
 * mode='read'  : 允许 is_shared=true 的工作区行 (对齐 035 / 039 设计 — 历史 default 数据全员可读)
 * mode='write' : 严格匹配当前 workspace (跨 ws 写入仍返回 false, 防越权改/删)
 *
 * 默认 'write' 是安全选择 — 误用比 'read' 更难造成越权.
 */
export async function assertRowInWorkspace(
  table: string,
  idColumn: string,
  rowId: string,
  workspaceId: string,
  mode: 'read' | 'write' = 'write',
): Promise<boolean> {
  // 只允许已知白名单表，防止 table 名注入
  if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[a-z_][a-z0-9_]*$/i.test(idColumn)) {
    throw new Error(`assertRowInWorkspace: invalid identifier ${table}.${idColumn}`);
  }
  const wsClause = mode === 'read'
    ? `(workspace_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`
    : `workspace_id = $2`;
  const sql = `SELECT 1 FROM "${table}" WHERE "${idColumn}" = $1 AND ${wsClause} LIMIT 1`;
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
