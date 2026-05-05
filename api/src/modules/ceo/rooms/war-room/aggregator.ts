// War Room · 聚合算子
// formation_health (Edmondson 心理安全分代理) = build_conflict / total_conflict
// 数据源：mn_silence_signals (state) + mn_judgments (kind)；不可用时返回中性值

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export interface ConflictKinds {
  build: number;
  destructive: number;
  silent: number;
  total: number;
}

export async function classifyConflicts(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<ConflictKinds> {
  // 先尝试 mn_judgments / mn_silence_signals
  let build = 0;
  let destructive = 0;
  let silent = 0;
  try {
    const r = await deps.db.query(
      `SELECT
          SUM(CASE WHEN kind IN ('disagreement','build') THEN 1 ELSE 0 END)::int AS build,
          SUM(CASE WHEN kind IN ('emotional','dismissive','off_topic') THEN 1 ELSE 0 END)::int AS destructive
         FROM mn_judgments
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND created_at > NOW() - INTERVAL '30 days'
          AND ${wsFilterClause(2)}`,
      [scopeId ?? null, workspaceId],
    );
    build = Number(r.rows[0]?.build ?? 0);
    destructive = Number(r.rows[0]?.destructive ?? 0);
  } catch {
    // mn_judgments schema 差异 — 跳过
  }

  try {
    const r = await deps.db.query(
      `SELECT COUNT(*)::int AS n
         FROM mn_silence_signals
        WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
          AND state = 'abnormal_silence'
          AND created_at > NOW() - INTERVAL '30 days'
          AND ${wsFilterClause(2)}`,
      [scopeId ?? null, workspaceId],
    );
    silent = Number(r.rows[0]?.n ?? 0);
  } catch {
    // mn_silence_signals 不存在 — 跳过
  }

  return { build, destructive, silent, total: build + destructive + silent };
}

export async function computeFormationHealth(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<number> {
  const k = await classifyConflicts(deps, workspaceId, scopeId);
  if (k.total === 0) return 0.72; // 默认中性偏健康
  return Number((k.build / k.total).toFixed(3));
}
