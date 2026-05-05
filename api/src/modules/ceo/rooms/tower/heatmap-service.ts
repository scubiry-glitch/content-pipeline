// Tower · 团队节奏 7×24 heatmap
// 数据源: assets (会议) 时间分布 + ceo_attention_alloc 加权
// fallback: 工作日 9-12 / 14-18 高活跃度的合成图（演示用）

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export interface HeatmapCell {
  day: number;     // 0..6 (周一=0)
  hour: number;    // 0..23
  intensity: number; // 0..1
}

const FALLBACK_PATTERN = (day: number, hour: number): number => {
  // 工作日 (0..4) vs 周末 (5..6)
  const isWeekday = day < 5;
  if (!isWeekday) {
    // 周末整体偏低，仅 10-13 / 16-18 略热 (CEO 偶尔加班)
    if (hour >= 10 && hour <= 13) return 0.25;
    if (hour >= 16 && hour <= 18) return 0.35;
    return 0.05;
  }
  // 工作日：上午 9-12 高，下午 14-18 高，晚上偶有过载
  if (hour >= 9 && hour <= 11) return 0.85;
  if (hour === 12) return 0.45;
  if (hour >= 14 && hour <= 17) return 0.85;
  if (hour === 18) return 0.55;
  if (hour >= 19 && hour <= 21) return day === 2 || day === 4 ? 0.95 : 0.5; // 周三周五偶尔过载
  if (hour >= 7 && hour <= 8) return 0.4;
  if (hour >= 22 && hour <= 23) return 0.15;
  return 0.05;
};

export async function getTeamHeatmap(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  filter: { scopeIds?: string[]; weekStart?: string },
): Promise<{ weekStart: string; cells: HeatmapCell[]; source: 'real' | 'fallback' | 'mixed'; counts: { meetings: number; commitments: number } }> {
  const cells: HeatmapCell[] = [];
  // 三类信号加权：会议 (assets meeting_minutes) × 1.0, 承诺截止 (mn_commitments due_at) × 0.6, runs 起跑 × 0.3
  const grid: Record<string, number> = {};
  let meetingsCount = 0;
  let commitmentsCount = 0;

  const accumulate = (rows: Array<{ day: number; hour: number; n: number }>, weight: number) => {
    for (const row of rows) {
      const key = `${row.day}-${row.hour}`;
      grid[key] = (grid[key] ?? 0) + Number(row.n) * weight;
    }
  };

  // 1. 会议时间分布 (主信号)
  try {
    const params: any[] = [];
    let scopeClause = '';
    if (filter.scopeIds && filter.scopeIds.length > 0) {
      params.push(filter.scopeIds);
      scopeClause = `AND id IN (
        SELECT DISTINCT meeting_id FROM mn_scope_memberships
         WHERE scope_id = ANY($${params.length}::uuid[])
      )`;
    }
    params.push(workspaceId);
    const wsClause = `AND ${wsFilterClause(params.length)}`;
    const r = await deps.db.query(
      `SELECT
          (EXTRACT(DOW FROM created_at)::int + 6) % 7 AS day,
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int AS n
         FROM assets
        WHERE type = 'meeting_minutes'
          AND created_at > NOW() - INTERVAL '8 weeks'
          ${scopeClause}
          ${wsClause}
        GROUP BY day, hour`,
      params,
    );
    accumulate(r.rows, 1.0);
    meetingsCount = r.rows.reduce((s, row) => s + Number(row.n), 0);
  } catch {
    /* schema 缺失则跳过此源 */
  }

  // 2. 承诺截止 due_at 分布 (次信号 — 反映团队"被推动"的时点)
  try {
    const params: any[] = [];
    let scopeClause = '';
    if (filter.scopeIds && filter.scopeIds.length > 0) {
      params.push(filter.scopeIds);
      scopeClause = `AND scope_id = ANY($${params.length}::uuid[])`;
    }
    params.push(workspaceId);
    const wsClause = `AND ${wsFilterClause(params.length)}`;
    const r = await deps.db.query(
      `SELECT
          (EXTRACT(DOW FROM due_at)::int + 6) % 7 AS day,
          EXTRACT(HOUR FROM due_at)::int AS hour,
          COUNT(*)::int AS n
         FROM mn_commitments
        WHERE due_at IS NOT NULL
          AND due_at > NOW() - INTERVAL '8 weeks'
          ${scopeClause}
          ${wsClause}
        GROUP BY day, hour`,
      params,
    );
    accumulate(r.rows, 0.6);
    commitmentsCount = r.rows.reduce((s, row) => s + Number(row.n), 0);
  } catch {
    /* schema 缺失则跳过此源 */
  }

  // 3. CEO runs 起跑 (轻信号 — 反映 CEO 处理任务的节奏)
  try {
    const r = await deps.db.query(
      `SELECT
          (EXTRACT(DOW FROM created_at)::int + 6) % 7 AS day,
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int AS n
         FROM mn_runs
        WHERE module = 'ceo'
          AND created_at > NOW() - INTERVAL '8 weeks'
          AND ${wsFilterClause(1)}
        GROUP BY day, hour`,
      [workspaceId],
    );
    accumulate(r.rows, 0.3);
  } catch {
    /* ignore */
  }

  // 归一化 + 输出
  const totalSignals = meetingsCount + commitmentsCount;
  const useReal = totalSignals >= 5;  // 阈值: 5 个信号以上才算"真数据"
  let source: 'real' | 'fallback' | 'mixed' = 'fallback';

  if (useReal) {
    const max = Math.max(0, ...Object.values(grid));
    if (max > 0) {
      source = totalSignals >= 30 ? 'real' : 'mixed';
      // mixed 模式: 真数据 + fallback pattern 各占一半
      const realBlend = source === 'real' ? 1.0 : 0.5;
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const realIntensity = (grid[`${day}-${hour}`] ?? 0) / max;
          const fallbackIntensity = FALLBACK_PATTERN(day, hour);
          const blended = realBlend * realIntensity + (1 - realBlend) * fallbackIntensity;
          cells.push({ day, hour, intensity: Number(blended.toFixed(3)) });
        }
      }
    }
  }

  if (cells.length === 0) {
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        cells.push({ day, hour, intensity: FALLBACK_PATTERN(day, hour) });
      }
    }
  }

  return {
    weekStart: filter.weekStart ?? new Date().toISOString().slice(0, 10),
    cells,
    source,
    counts: { meetings: meetingsCount, commitments: commitmentsCount },
  };
}

export interface PersonalRhythmDay {
  name: string;
  dayIndex: number;
  deepFocus: number;     // 小时
  fire: number;          // 救火小时
  meeting: number;       // 会议小时
}

export interface PersonalRhythm {
  weekStart: string;
  days: PersonalRhythmDay[];
  stats: {
    deepFocus: { value: number; target: number; delta: string };
    meetings: { value: number; vsLastWeek: number };
    fire: { value: number; delta: string };
    sleep: { value: number; vsTarget: number };
    thinkBlocks: { value: number; target: number };
  };
}

const FALLBACK_DAYS: PersonalRhythmDay[] = [
  { name: '周一', dayIndex: 0, deepFocus: 1.5, fire: 0.5, meeting: 4.5 },
  { name: '周二', dayIndex: 1, deepFocus: 2.0, fire: 0.8, meeting: 5.5 },
  { name: '周三', dayIndex: 2, deepFocus: 1.8, fire: 1.2, meeting: 6.0 },
  { name: '周四', dayIndex: 3, deepFocus: 2.2, fire: 1.5, meeting: 5.0 },
  { name: '周五', dayIndex: 4, deepFocus: 1.5, fire: 2.0, meeting: 4.5 },
  { name: '周六', dayIndex: 5, deepFocus: 1.5, fire: 1.5, meeting: 2.0 },
  { name: '周日', dayIndex: 6, deepFocus: 0.5, fire: 2.0, meeting: 1.5 },
];

export async function getPersonalRhythm(
  deps: CeoEngineDeps,
  filter: { userId?: string; weekStart?: string; workspaceId?: string | null },
): Promise<PersonalRhythm> {
  const userId = filter.userId ?? 'system';
  const weekStart = filter.weekStart ?? thisMonday();
  const wsId = filter.workspaceId ?? null;

  // 拉本周 ceo_time_roi
  let roiRow: any = null;
  try {
    const r = await deps.db.query(
      `SELECT total_hours, deep_focus_hours, meeting_hours, target_focus_hours, weekly_roi
         FROM ceo_time_roi
        WHERE user_id = $1 AND week_start = $2
          AND ($3::uuid IS NULL OR workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
        LIMIT 1`,
      [userId, weekStart, wsId],
    );
    roiRow = r.rows[0] ?? null;
  } catch {
    /* ignore */
  }

  // 拉上周 ROI 用于 vs 对比
  let lastWeekRoi: any = null;
  try {
    const r = await deps.db.query(
      `SELECT total_hours, deep_focus_hours, meeting_hours
         FROM ceo_time_roi
        WHERE user_id = $1 AND week_start < $2
          AND ($3::uuid IS NULL OR workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
        ORDER BY week_start DESC
        LIMIT 1`,
      [userId, weekStart, wsId],
    );
    lastWeekRoi = r.rows[0] ?? null;
  } catch {
    /* ignore */
  }

  const deep = Number(roiRow?.deep_focus_hours ?? 11);
  const meeting = Number(roiRow?.meeting_hours ?? 29);
  const totalHours = Number(roiRow?.total_hours ?? 56);
  const target = Number(roiRow?.target_focus_hours ?? 18);
  const fire = Math.max(0, totalHours - deep - meeting);

  // 按比例分摊到 7 天 (周一-周五 占 75%，周末 占 25%)
  const days = FALLBACK_DAYS.map((d, i) => {
    const isWeekend = i >= 5;
    const factor = isWeekend ? 0.125 : 0.15; // 5d × 0.15 + 2d × 0.125 = 1.0
    return {
      name: d.name,
      dayIndex: i,
      deepFocus: Number((deep * factor).toFixed(2)),
      fire: Number((fire * factor).toFixed(2)),
      meeting: Number((meeting * factor).toFixed(2)),
    };
  });

  const meetingDelta = lastWeekRoi
    ? Number((meeting - Number(lastWeekRoi.meeting_hours)).toFixed(1))
    : 0;
  const deepDelta = lastWeekRoi
    ? Number((deep - Number(lastWeekRoi.deep_focus_hours)).toFixed(1))
    : 0;

  return {
    weekStart,
    days,
    stats: {
      deepFocus: {
        value: deep,
        target,
        delta: deep < target ? `差 ${(target - deep).toFixed(1)}h` : `超 ${(deep - target).toFixed(1)}h`,
      },
      meetings: {
        value: meeting,
        vsLastWeek: meetingDelta,
      },
      fire: {
        value: fire,
        delta: fire >= 5 ? '过高' : fire >= 2.5 ? '正常' : '低',
      },
      sleep: {
        // 没有 sleep 字段，保持 fixture
        value: 5.8,
        vsTarget: -1.2,
      },
      thinkBlocks: {
        value: 3,
        target: 5,
      },
    },
  };
}

function thisMonday(): string {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const d = new Date(now);
  d.setDate(now.getDate() - dow);
  return d.toISOString().slice(0, 10);
}
