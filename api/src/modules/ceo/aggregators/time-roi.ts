// 派生：从会议总时长 + 假设的 target_focus，估算每周 ROI
//
// weekly_roi = deep_focus_hours / target_focus_hours
//   meeting_hours = 该周会议时长之和
//   total_hours = 5 工作日 × 8 = 40 (假设)
//   admin_hours = total - meeting - deep_focus（CEO 没真实日程数据，给个粗算）
//   deep_focus_hours = max(0, total - meeting - 5h admin)
//   target_focus_hours = 25 (默认)
//
// 写入 ceo_time_roi，metadata.source='aggregated'。
// 脚本侧 axis='balcony-time-roi'。

import type { CeoEngineDeps } from '../types.js';

interface WeekStat {
  week_start: string;
  meeting_hours: number;
}

function weekStartOf(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

const TARGET_FOCUS_HOURS = 25;
const TOTAL_WEEK_HOURS = 40;
const ADMIN_HOURS = 5;

export async function aggregateTimeRoi(
  deps: CeoEngineDeps,
  userId: string = 'system',
  workspaceId?: string | null,
): Promise<{ inserted: number; weeks: string[] }> {
  // 调用方未给 workspaceId 时, 兜底取 default workspace —— 该 aggregator 跑在
  // 后台脚本里 (ceo-generate-real-content), 没有 request 上下文.
  let wsId = workspaceId ?? null;
  if (!wsId) {
    const ws = await deps.db.query(`SELECT id FROM workspaces WHERE slug = 'default' LIMIT 1`);
    wsId = ws.rows[0]?.id ?? null;
  }
  // 拉近 12 周所有会议（不限 scope —— time_roi 是用户级而非 scope 级）
  const r = await deps.db.query(
    `SELECT a.created_at,
            COALESCE(
              CASE WHEN a.metadata->>'duration_min' ~ '^-?\\d+(\\.\\d+)?$'
                   THEN (a.metadata->>'duration_min')::numeric
                   ELSE NULL END,
              60.0
            )::numeric AS duration_min
       FROM assets a
      WHERE a.type = 'meeting_minutes'
        AND a.created_at > NOW() - INTERVAL '90 days'
      ORDER BY a.created_at DESC`,
  );

  const buckets = new Map<string, number>(); // week_start → meeting_hours
  for (const row of (r.rows as { created_at: string; duration_min: string | number }[])) {
    if (!row.created_at) continue;
    const week = weekStartOf(row.created_at);
    const hours = Number(row.duration_min) / 60;
    buckets.set(week, (buckets.get(week) ?? 0) + hours);
  }

  // 先删除本 user source='aggregated' 的旧行
  await deps.db.query(
    `DELETE FROM ceo_time_roi WHERE user_id = $1 AND metadata->>'source' = 'aggregated'`,
    [userId],
  );

  let inserted = 0;
  const weeks: string[] = [];
  for (const [week, meetingHours] of buckets) {
    const total = TOTAL_WEEK_HOURS;
    const meeting = Math.min(meetingHours, total - ADMIN_HOURS);
    const deepFocus = Math.max(0, total - meeting - ADMIN_HOURS);
    const weeklyRoi = Number((deepFocus / TARGET_FOCUS_HOURS).toFixed(3));
    await deps.db.query(
      `INSERT INTO ceo_time_roi
         (user_id, week_start, total_hours, deep_focus_hours, meeting_hours, target_focus_hours, weekly_roi, metadata, workspace_id)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (user_id, week_start) DO UPDATE
         SET total_hours = EXCLUDED.total_hours,
             deep_focus_hours = EXCLUDED.deep_focus_hours,
             meeting_hours = EXCLUDED.meeting_hours,
             weekly_roi = EXCLUDED.weekly_roi,
             metadata = EXCLUDED.metadata,
             computed_at = NOW()`,
      [
        userId,
        week,
        total,
        Number(deepFocus.toFixed(2)),
        Number(meeting.toFixed(2)),
        TARGET_FOCUS_HOURS,
        weeklyRoi,
        JSON.stringify({ source: 'aggregated', admin_hours: ADMIN_HOURS, computed_from: 'meeting_durations' }),
        wsId,
      ],
    );
    weeks.push(week);
    inserted++;
  }
  return { inserted, weeks };
}
