// content_entities 通用合并的薄包装：调用 SQL 函数 merge_content_entities，返回审计行。
// 供 P4 自动/人工合并调用；SQL 函数保证事务内重指向引用 + 去重 + 删源。
import type { DatabaseAdapter } from '../types.js';

export interface EntityMergeRow {
  table: string;
  reassigned: number;
  dropped: number;
}

export async function mergeContentEntities(
  deps: { db: DatabaseAdapter },
  targetId: string,
  sourceId: string,
): Promise<EntityMergeRow[]> {
  const res = await deps.db.query(
    `SELECT table_name, rows_reassigned, rows_dropped FROM merge_content_entities($1::uuid, $2::uuid)`,
    [targetId, sourceId],
  );
  return (res.rows ?? []).map((r: any) => ({
    table: String(r.table_name),
    reassigned: Number(r.rows_reassigned),
    dropped: Number(r.rows_dropped),
  }));
}
