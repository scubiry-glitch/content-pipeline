// Balcony · 聚合算子
// weekly_roi = deep_focus_hours / target_focus_hours
// prism scores: 取最新 ceo_prisms 行；空则用兜底值

import type { CeoEngineDeps, PrismKind } from '../../types.js';

const FALLBACK_PRISMS: Record<PrismKind, number> = {
  direction: 0.72,
  board: 0.58,
  coord: 0.78,
  team: 0.78,
  ext: 0.6,
  self: 0.41,
};

export async function computeWeeklyRoi(
  deps: CeoEngineDeps,
  userId?: string,
): Promise<number> {
  const r = await deps.db.query(
    `SELECT deep_focus_hours, target_focus_hours, weekly_roi
       FROM ceo_time_roi
      WHERE ($1::text IS NULL OR user_id = $1)
      ORDER BY week_start DESC
      LIMIT 1`,
    [userId ?? null],
  );
  if (r.rows.length === 0) return 0.6; // 默认温和值
  const row = r.rows[0];
  if (row.weekly_roi != null) return Number(row.weekly_roi);
  const deep = Number(row.deep_focus_hours ?? 0);
  const target = Number(row.target_focus_hours ?? 0);
  if (target === 0) return 0;
  return Number((deep / target).toFixed(3));
}

export async function computePrismScores(
  deps: CeoEngineDeps,
): Promise<Record<PrismKind, number>> {
  const r = await deps.db.query(
    `SELECT alignment, board_score, coord, team, ext, self
       FROM ceo_prisms
      ORDER BY computed_at DESC
      LIMIT 1`,
  );
  if (r.rows.length === 0) return { ...FALLBACK_PRISMS };
  const row = r.rows[0];
  return {
    direction: Number(row.alignment ?? FALLBACK_PRISMS.direction),
    board: Number(row.board_score ?? FALLBACK_PRISMS.board),
    coord: Number(row.coord ?? FALLBACK_PRISMS.coord),
    team: Number(row.team ?? FALLBACK_PRISMS.team),
    ext: Number(row.ext ?? FALLBACK_PRISMS.ext),
    self: Number(row.self ?? FALLBACK_PRISMS.self),
  };
}
