// CEO 模块 workspace 守卫 (router 层 preHandler)
//
// 两条线:
//   1) URL :id 行级守卫 — 当路径里有 :id 形式的 UUID, 按 URL 倒数第二段
//      (collection) 映射到对应表 (ceo_directors / ceo_strategic_lines / ...),
//      调 assertRowInWorkspace 验证该行属于当前 ws (跨 ws 一律 404).
//      与 mn router.ts:108-153 范式对齐.
//
//   2) scopeId 链式验证 — query.scopeId / query.scopes / body.scopeId /
//      body.scopeIds 出现的每个 UUID 必须属于当前 ws (mn_scopes.workspace_id).
//      这是改动 2 选的"靠 scopeId 链式隔离"路径的入口校验: 一旦 scopeId
//      验证通过, 后续 scope-bound SELECT (无 ws 过滤) 自然只看到本 ws 数据.
//
// api-key 路径 (admin 全局视图) wsId === null, 完全跳过, 不影响 admin 工具.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertRowInWorkspace, currentWorkspaceId } from '../../db/repos/withWorkspace.js';
import { query } from '../../db/connection.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// URL collection 段 → 表名
// 加入新 :id 路由时同步登记; 未登记的 collection 段被 :id 守卫跳过 (不阻塞).
const COLLECTION_TABLE: Record<string, string> = {
  runs: 'mn_runs',
  lines: 'ceo_strategic_lines',
  directors: 'ceo_directors',
  concerns: 'ceo_director_concerns',
  stakeholders: 'ceo_stakeholders',
  sandbox: 'ceo_sandbox_runs',
  people: 'mn_people',
};

function collectScopeIds(value: unknown, out: string[]): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.includes(',')) {
      for (const part of value.split(',')) collectScopeIds(part.trim(), out);
      return;
    }
    if (UUID_RE.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const x of value) collectScopeIds(x, out);
  }
}

export async function ceoWorkspaceGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const wsId = currentWorkspaceId(request);
  if (wsId === null) return; // api-key admin → 跳过

  // ─── 1) URL :id 行级守卫 ────────────────────────────────────
  const params = (request.params as Record<string, string> | undefined) ?? {};
  const fullUrl = (request.url || '').split('?')[0];
  const seg = fullUrl.split('/').filter(Boolean);

  for (const id of Object.values(params)) {
    if (typeof id !== 'string' || !id) continue;
    const idxId = seg.indexOf(id);
    if (idxId <= 0) continue;
    const collection = seg[idxId - 1];
    const table = COLLECTION_TABLE[collection];
    if (!table) continue;
    const mode = request.method === 'GET' ? 'read' : 'write';
    try {
      const ok = await assertRowInWorkspace(table, 'id', id, wsId, mode);
      if (!ok) {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
    } catch {
      // UUID 格式错误 / 表名异常 — 当作不存在
      reply.code(404).send({ error: 'Not Found' });
      return;
    }
  }

  // ─── 2) scopeId / scopes / scopeIds 链式验证 ─────────────────
  const queryObj = (request.query as Record<string, unknown> | undefined) ?? {};
  const bodyObj = (request.body as Record<string, unknown> | undefined) ?? {};
  const scopeIds: string[] = [];
  collectScopeIds(queryObj.scopeId, scopeIds);
  collectScopeIds(queryObj.scopes, scopeIds);
  collectScopeIds(bodyObj.scopeId, scopeIds);
  collectScopeIds(bodyObj.scopeIds, scopeIds);
  if (scopeIds.length === 0) return;

  const uniq = Array.from(new Set(scopeIds));
  let allowed: Set<string>;
  try {
    const r = await query(
      `SELECT id::text AS id FROM mn_scopes
        WHERE id = ANY($1::uuid[])
          AND (workspace_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`,
      [uniq, wsId],
    );
    allowed = new Set((r.rows as Array<{ id: string }>).map((row) => row.id));
  } catch {
    reply.code(404).send({ error: 'Not Found' });
    return;
  }
  for (const sid of uniq) {
    if (!allowed.has(sid)) {
      reply.code(404).send({ error: 'Not Found' });
      return;
    }
  }
}
