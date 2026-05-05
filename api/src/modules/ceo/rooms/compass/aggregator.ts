// Compass · 聚合算子
// alignment_score = 0.6 × 主线时间占比 + 0.4 × (1 - drift_count / total_decisions)

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export async function computeAlignmentScore(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<number> {
  // 1. 主线时间占比 = main_hours / total_hours (本周)
  const att = await deps.db.query(
    `SELECT kind, COALESCE(SUM(hours), 0)::numeric AS h
       FROM ceo_attention_alloc
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND week_start = (DATE_TRUNC('week', NOW())::date)
        AND ${wsFilterClause(2)}
      GROUP BY kind`,
    [scopeId ?? null, workspaceId],
  );
  let mainH = 0;
  let totalH = 0;
  for (const r of att.rows) {
    const h = Number(r.h);
    totalH += h;
    if (r.kind === 'main') mainH = h;
  }
  const mainShare = totalH > 0 ? mainH / totalH : 0;

  // 2. drift 比例 — 用 ceo_strategic_lines 的 drift 数 / 总数 简化代理
  // 真正接 mn_decisions 的 superseded 比例待 PR12 接生成中心后接入
  const lc = await deps.db.query(
    `SELECT
        SUM(CASE WHEN kind = 'drift' THEN 1 ELSE 0 END)::int AS drift_n,
        COUNT(*)::int AS total_n
       FROM ceo_strategic_lines
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND status = 'active'
        AND ${wsFilterClause(2)}`,
    [scopeId ?? null, workspaceId],
  );
  const driftN = Number(lc.rows[0]?.drift_n ?? 0);
  const totalN = Number(lc.rows[0]?.total_n ?? 0);
  const nonDrift = totalN > 0 ? 1 - driftN / totalN : 1;

  // 加权综合
  const score = 0.6 * mainShare + 0.4 * nonDrift;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}
