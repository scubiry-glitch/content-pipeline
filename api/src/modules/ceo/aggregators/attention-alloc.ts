// 派生：从 mn_scope_members + assets 的会议时长 metadata，按周聚合时间分配
//
// 写入 ceo_attention_alloc，source='aggregated'。区分 main / branch / firefighting：
//   - 标题含「续约 / 战略 / 主线 / 主框架」→ main
//   - 含「装修 / 分期 / 项目专题」→ branch
//   - 含「救火 / 排查 / 紧急」→ firefighting
//   - 其他默认 → branch
//
// 不走 LLM；这是派生计算，结果可重复重跑。脚本侧 axis='tower-attention-alloc'。

import type { CeoEngineDeps } from '../types.js';

interface MeetingRow {
  id: string;
  title: string;
  duration_min: number;
  created_at: string;
}

function classify(title: string): 'main' | 'branch' | 'firefighting' {
  if (/续约|战略|主线|主框架|主方案/.test(title)) return 'main';
  if (/救火|排查|紧急|事故/.test(title)) return 'firefighting';
  return 'branch';
}

function weekStartOf(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay() || 7; // Sun=7
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function aggregateAttentionAlloc(
  deps: CeoEngineDeps,
  scopeId: string,
): Promise<{ inserted: number; weeks: number }> {
  // 拉绑定到该 scope 的会议（90 天内）
  const r = await deps.db.query(
    `SELECT a.id::text AS id,
            COALESCE(NULLIF(trim(a.title), ''), '未命名会议') AS title,
            COALESCE(
              CASE WHEN a.metadata->>'duration_min' ~ '^-?\\d+(\\.\\d+)?$'
                   THEN (a.metadata->>'duration_min')::numeric
                   ELSE NULL END,
              60.0  -- 缺值兜底 60 分钟
            )::numeric AS duration_min,
            a.created_at
       FROM mn_scope_members sm
       JOIN assets a ON a.id::text = sm.meeting_id::text
      WHERE sm.scope_id::text = $1::text
        AND a.created_at > NOW() - INTERVAL '120 days'
      ORDER BY a.created_at DESC`,
    [scopeId],
  );

  const rows = r.rows as MeetingRow[];
  if (rows.length === 0) return { inserted: 0, weeks: 0 };

  // 按 (week_start, kind) 累加 hours
  const buckets = new Map<string, Map<string, number>>(); // week → kind → hours
  for (const m of rows) {
    if (!m.created_at) continue;
    const week = weekStartOf(m.created_at);
    const kind = classify(m.title);
    const hours = Number(m.duration_min) / 60;
    if (!buckets.has(week)) buckets.set(week, new Map());
    const k = buckets.get(week)!;
    k.set(kind, (k.get(kind) ?? 0) + hours);
  }

  // 先删除该 scope 下 source='aggregated' 的旧行（避免重复）
  await deps.db.query(
    `DELETE FROM ceo_attention_alloc WHERE scope_id = $1::uuid AND source = 'aggregated'`,
    [scopeId],
  );

  let inserted = 0;
  for (const [week, kinds] of buckets) {
    for (const [kind, hours] of kinds) {
      await deps.db.query(
        `INSERT INTO ceo_attention_alloc (scope_id, week_start, hours, kind, source)
         VALUES ($1::uuid, $2::date, $3, $4, 'aggregated')`,
        [scopeId, week, Number(hours.toFixed(2)), kind],
      );
      inserted++;
    }
  }
  return { inserted, weeks: buckets.size };
}
