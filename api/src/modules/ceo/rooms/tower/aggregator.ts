// Tower · 聚合算子
// responsibility_clarity = 1 - 无主承诺数 / 总承诺数
// 无主 = owner_name IS NULL OR owner_name = '' OR owner_name LIKE '挂名%'

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export async function computeResponsibilityClarity(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<number> {
  try {
    const r = await deps.db.query(
      `SELECT
          SUM(CASE WHEN owner_name IS NULL OR owner_name = '' THEN 1 ELSE 0 END)::int AS unowned,
          COUNT(*)::int AS total
         FROM mn_commitments
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND status IN ('open','in_progress','proposed')
          AND ${wsFilterClause(2)}`,
      [scopeId ?? null, workspaceId],
    );
    const total = Number(r.rows[0]?.total ?? 0);
    const unowned = Number(r.rows[0]?.unowned ?? 0);
    if (total === 0) return 1;
    return Number((1 - unowned / total).toFixed(3));
  } catch {
    return 1;
  }
}
