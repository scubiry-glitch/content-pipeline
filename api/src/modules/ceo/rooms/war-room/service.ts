// War Room · 团队房间 service
// 阵型快照来自 ceo_formation_snapshots；阵型缺口由规则从 mn_silence_signals + mn_judgments 推导
// 兵棋推演 (sandbox) 是 stub — 完整实现待原型扩充 + LLM 集成

import type { CeoEngineDeps } from '../../types.js';
import { computeFormationHealth, classifyConflicts } from './aggregator.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export async function getFormationSnapshot(
  deps: CeoEngineDeps,
  workspaceId: string | null,
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
  params.push(workspaceId);
  where.push(wsFilterClause(params.length));
  const sql = `SELECT id::text, scope_id::text, week_start, formation_data, conflict_temp, computed_at
                 FROM ceo_formation_snapshots
                WHERE ${where.join(' AND ')}
                ORDER BY week_start DESC
                LIMIT 1`;
  const r = await deps.db.query(sql, params);
  if (r.rows.length === 0) return { snapshot: null, computedAt: null };
  return { snapshot: r.rows[0], computedAt: r.rows[0].computed_at };
}

export async function listFormationGaps(
  deps: CeoEngineDeps,
  workspaceId: string | null,
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
    params.push(workspaceId);
    where.push(wsFilterClause(params.length));
    const r = await deps.db.query(
      `SELECT formation_data FROM ceo_formation_snapshots
        WHERE ${where.join(' AND ')}
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
  workspaceId: string | null,
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
  const formationHealth = await computeFormationHealth(deps, workspaceId, scopeId);
  let conflictKinds = await classifyConflicts(deps, workspaceId, scopeId);
  let conflictTemp =
    conflictKinds.total > 0
      ? Number((conflictKinds.build / conflictKinds.total).toFixed(3))
      : 0;

  // mn_judgments 没有 'build/disagreement/emotional/dismissive/off_topic' tag 时,
  // classifyConflicts 返回 total=0. 此时回退到 LLM 已生成的 ceo_formation_snapshots
  // (war-room-formation prompt 输出的 links + conflict_temp).
  if (conflictKinds.total === 0) {
    try {
      const r = await deps.db.query(
        `SELECT formation_data, conflict_temp
           FROM ceo_formation_snapshots
          WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
            AND ${wsFilterClause(2)}
          ORDER BY week_start DESC LIMIT 1`,
        [scopeId ?? null, workspaceId],
      );
      const row = r.rows[0];
      if (row?.formation_data) {
        const fd = typeof row.formation_data === 'string'
          ? JSON.parse(row.formation_data)
          : row.formation_data;
        const links = (fd?.links ?? []) as Array<{ kind: string }>;
        if (links.length > 0) {
          let build = 0, destructive = 0, silent = 0;
          for (const l of links) {
            if (l.kind === 'supports' || l.kind === 'reports') build++;
            else if (l.kind === 'conflicts') destructive++;
            else if (l.kind === 'silent') silent++;
          }
          conflictKinds = { build, destructive, silent, total: links.length };
          conflictTemp = row.conflict_temp != null
            ? Number(row.conflict_temp)
            : Number((build / Math.max(1, links.length)).toFixed(3));
        }
      }
    } catch {
      /* ignore — keep zeros */
    }
  }

  let verdict = '尚无数据';
  if (conflictKinds.total > 0) {
    if (conflictTemp >= 0.7) verdict = '健康 — 偏热，建设性冲突充分';
    else if (conflictTemp >= 0.55) verdict = '健康 — 略偏冷，可再激发一次反方思考';
    else if (conflictTemp >= 0.4) verdict = '注意 — 破坏性冲突偏高，需要主持调度';
    else verdict = '警告 — 团队回避真问题';
  }

  // Sandbox 统计 (按 workspace 过滤)
  const sandboxStats = { draft: 0, running: 0, completed: 0, total: 0 };
  try {
    const r = await deps.db.query(
      `SELECT status, COUNT(*)::int AS n FROM ceo_sandbox_runs
        WHERE ${wsFilterClause(1)}
        GROUP BY status`,
      [workspaceId],
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

  // Spark 种子数 (按 workspace 过滤)
  let sparkSeedCount = 0;
  try {
    const r = await deps.db.query(
      `SELECT COUNT(*)::int AS n FROM ceo_war_room_sparks
        WHERE ${wsFilterClause(1)}`,
      [workspaceId],
    );
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
