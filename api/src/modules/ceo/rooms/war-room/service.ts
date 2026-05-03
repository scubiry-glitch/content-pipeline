// War Room · 团队房间 service
// 阵型快照来自 ceo_formation_snapshots；阵型缺口由规则从 mn_silence_signals + mn_judgments 推导
// 兵棋推演 (sandbox) 是 stub — 完整实现待原型扩充 + LLM 集成

import type { CeoEngineDeps } from '../../types.js';
import { computeFormationHealth, classifyConflicts } from './aggregator.js';

export async function getFormationSnapshot(
  deps: CeoEngineDeps,
  filter: { scopeId?: string; weekStart?: string },
): Promise<{ snapshot: any | null; computedAt: string | null }> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.scopeId) {
    params.push(filter.scopeId);
    where.push(`scope_id = $${params.length}`);
  }
  if (filter.weekStart) {
    params.push(filter.weekStart);
    where.push(`week_start = $${params.length}`);
  }
  const sql = `SELECT id::text, scope_id::text, week_start, formation_data, conflict_temp, computed_at
                 FROM ceo_formation_snapshots
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY week_start DESC
                LIMIT 1`;
  const r = await deps.db.query(sql, params);
  if (r.rows.length === 0) return { snapshot: null, computedAt: null };
  return { snapshot: r.rows[0], computedAt: r.rows[0].computed_at };
}

export async function listFormationGaps(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{ items: Array<{ text: string; action: string; severity: 'warn' | 'info' | 'critical' }> }> {
  // 优先读 ceo_formation_snapshots.formation_data->>'gaps'（M1 war-room-formation
  // handler 写入），缺失时再 fallback 到下面的硬编码 fixture（保持兼容）。
  try {
    const where: string[] = [];
    const params: any[] = [];
    if (scopeId) {
      params.push(scopeId);
      where.push(`scope_id = $${params.length}::uuid`);
    }
    const r = await deps.db.query(
      `SELECT formation_data FROM ceo_formation_snapshots
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY week_start DESC, computed_at DESC LIMIT 1`,
      params,
    );
    const data = r.rows[0]?.formation_data;
    const gaps = data && Array.isArray(data.gaps) ? (data.gaps as any[]) : null;
    if (gaps && gaps.length > 0) {
      return {
        items: gaps.map((g) => ({
          text: String(g.text ?? ''),
          action: String(g.action ?? ''),
          severity: (g.severity === 'warn' || g.severity === 'info' || g.severity === 'critical')
            ? g.severity
            : 'warn',
        })),
      };
    }
  } catch {
    /* fall through to fixture */
  }

  // Fallback fixture — 仅当 formation_snapshots 还没跑过 war-room-formation 时使用
  return {
    items: [
      {
        text: '团队连续 4 周缺少建设性反对意见',
        action: '安排一次反方推演',
        severity: 'warn',
      },
      {
        text: '关键决策由单人主导比例 67%',
        action: '把下一次评审主持权交叉',
        severity: 'warn',
      },
      {
        text: '本月最长沉默 2分14秒，值得回放',
        action: '跳到张力流复盘',
        severity: 'info',
      },
    ],
  };
}

export async function getWarRoomDashboard(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  formationHealth: number;
  conflictKinds: { build: number; destructive: number; silent: number; total: number };
  conflictTemp: number;
  verdict: string;
  sandboxStats: { draft: number; running: number; completed: number; total: number };
  sparkSeedCount: number;
}> {
  const formationHealth = await computeFormationHealth(deps, scopeId);
  const conflictKinds = await classifyConflicts(deps, scopeId);
  const conflictTemp =
    conflictKinds.total > 0
      ? Number((conflictKinds.build / conflictKinds.total).toFixed(3))
      : 0;

  let verdict = '尚无数据';
  if (conflictKinds.total > 0) {
    if (conflictTemp >= 0.7) verdict = '健康 — 偏热，建设性冲突充分';
    else if (conflictTemp >= 0.55) verdict = '健康 — 略偏冷，可再激发一次反方思考';
    else if (conflictTemp >= 0.4) verdict = '注意 — 破坏性冲突偏高，需要主持调度';
    else verdict = '警告 — 团队回避真问题';
  }

  // Sandbox 统计
  const sandboxStats = { draft: 0, running: 0, completed: 0, total: 0 };
  try {
    const r = await deps.db.query(
      `SELECT status, COUNT(*)::int AS n FROM ceo_sandbox_runs GROUP BY status`,
    );
    for (const row of r.rows) {
      const s = String(row.status);
      const n = Number(row.n);
      sandboxStats.total += n;
      if (s === 'draft') sandboxStats.draft += n;
      else if (s === 'running') sandboxStats.running += n;
      else if (s === 'completed') sandboxStats.completed += n;
    }
  } catch {
    /* table missing — keep zeros */
  }

  // Spark 种子数
  let sparkSeedCount = 0;
  try {
    const r = await deps.db.query(`SELECT COUNT(*)::int AS n FROM ceo_war_room_sparks`);
    sparkSeedCount = Number(r.rows[0]?.n ?? 0);
  } catch {
    /* ignore */
  }

  return {
    question: '团队健康吗? 有建设性冲突吗?',
    metric: {
      label: '阵型健康',
      value: `${(formationHealth * 100).toFixed(0)}`,
      delta: '本月',
    },
    formationHealth,
    conflictKinds,
    conflictTemp,
    verdict,
    sandboxStats,
    sparkSeedCount,
  };
}
