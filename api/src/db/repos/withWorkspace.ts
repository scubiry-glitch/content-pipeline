// Workspace 范围限定工具。
// 路由层负责: 从 request.auth.workspace.id 拿 workspace，传给 service / DB 调用。
// 该模块只提供一组小帮手，避免在每个路由里重复 if (!ws) reply.status(403)...

import type { FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../connection.js';

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
