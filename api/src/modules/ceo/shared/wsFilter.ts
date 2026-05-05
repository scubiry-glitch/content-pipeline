// CEO 模块 SQL workspace 过滤片段 — service 层显式过滤兜底.
//
// 背景:
//   migrations/039 + 043 给 21 张 ceo_* 表挂了 RLS ws_isolation policy, 但 policy
//   是"GUC 没设就放行"语义 (current_setting('app.workspace_id', TRUE) IS NULL).
//   CEO 模块所有 query 走 deps.db (普通 Pool), 没在 withWorkspaceTx 里 SET LOCAL,
//   所以 RLS 实际不生效 → service 层 SELECT 必须显式带 ws 过滤,这是 defense-in-depth.
//
// 语义 (与 035/039 对齐):
//   - workspaceId = null  → api-key admin / 跨 ws 视图,看全部
//   - workspaceId = uuid  → 看本 ws + 任意 is_shared 的 ws (default ws 永久 shared)
//
// 用法:
//   const wsClause = wsFilterClause(3);  // params[2] = workspaceId
//   const sql = `SELECT ... FROM ceo_strategic_lines WHERE ${wsClause} AND ...`;
//   await deps.db.query(sql, [..., ..., workspaceId]);
//
// columnRef 默认 'workspace_id'; 多表 JOIN 时传 'l.workspace_id' 显式指定哪张表.

export function wsFilterClause(paramIndex: number, columnRef = 'workspace_id'): string {
  if (!Number.isInteger(paramIndex) || paramIndex < 1) {
    throw new Error(`wsFilterClause: paramIndex must be positive integer, got ${paramIndex}`);
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(columnRef)) {
    throw new Error(`wsFilterClause: invalid columnRef ${columnRef}`);
  }
  const p = `$${paramIndex}::uuid`;
  return `(${p} IS NULL OR ${columnRef} = ${p} OR ${columnRef} IN (SELECT id FROM workspaces WHERE is_shared))`;
}
