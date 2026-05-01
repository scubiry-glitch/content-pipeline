// Tower · ⑥ 周节律档案
// 数据源:
//   - ceo_attention_alloc 12 周 (main / branch / firefighting)
//   - ceo_time_roi 12 周 (deep_focus / target_focus → weekly_roi)
// 按月切片：每月聚合 4 周 → 主线时长 / 救火比例 / 透支天数

import { useEffect, useState } from 'react';

interface PulseWeek {
  weekStart: string;
  mainHours: number;
  firefightingHours: number;
}

interface TimeRoiRow {
  user_id: string;
  week_start: string;
  total_hours: number;
  deep_focus_hours: number;
  meeting_hours: number;
  target_focus_hours: number;
  weekly_roi: number | null;
}

interface MonthSlice {
  monthLabel: string;
  weekCount: number;
  totalMainHours: number;
  totalFirefightingHours: number;
  firefightingPct: number;     // 0..1
  deficitWeeks: number;         // 总工时 > 50h 的周数
  avgWeeklyRoi: number;
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function aggregateByMonth(pulse: PulseWeek[], roi: TimeRoiRow[]): MonthSlice[] {
  const buckets = new Map<string, MonthSlice>();
  // 索引 roi by week_start
  const roiByWeek = new Map<string, TimeRoiRow>();
  for (const r of roi) roiByWeek.set(r.week_start, r);

  for (const w of pulse) {
    const key = monthLabel(new Date(w.weekStart));
    const cur =
      buckets.get(key) ??
      ({
        monthLabel: key,
        weekCount: 0,
        totalMainHours: 0,
        totalFirefightingHours: 0,
        firefightingPct: 0,
        deficitWeeks: 0,
        avgWeeklyRoi: 0,
      } as MonthSlice);
    cur.weekCount += 1;
    cur.totalMainHours += w.mainHours;
    cur.totalFirefightingHours += w.firefightingHours;
    const r = roiByWeek.get(w.weekStart);
    if (r) {
      const total = Number(r.total_hours);
      if (total > 50) cur.deficitWeeks += 1;
      cur.avgWeeklyRoi += Number(r.weekly_roi ?? 0);
    }
    buckets.set(key, cur);
  }

  return Array.from(buckets.values())
    .map((b) => ({
      ...b,
      firefightingPct:
        b.totalMainHours + b.totalFirefightingHours > 0
          ? b.totalFirefightingHours / (b.totalMainHours + b.totalFirefightingHours)
          : 0,
      avgWeeklyRoi: b.weekCount > 0 ? Number((b.avgWeeklyRoi / b.weekCount).toFixed(3)) : 0,
    }))
    .sort((a, b) => (a.monthLabel < b.monthLabel ? -1 : 1));
}

export function RhythmsArchive() {
  const [slices, setSlices] = useState<MonthSlice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pulseRes, roiHistory] = await Promise.all([
          fetch('/api/v1/ceo/tower/pulse?weeks=12').then((r) => r.json()),
          fetchRoiHistory(12),
        ]);
        if (cancelled) return;
        const pulse: PulseWeek[] = pulseRes.weeks ?? [];
        const merged = aggregateByMonth(pulse, roiHistory);
        setSlices(merged);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div style={{ fontSize: 13, color: 'rgba(232,239,242,0.5)', fontStyle: 'italic' }}>加载…</div>;
  }
  if (slices.length === 0) {
    return (
      <div
        style={{
          padding: '20px 18px',
          background: 'rgba(95,163,158,0.05)',
          border: '1px dashed rgba(95,163,158,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'rgba(232,239,242,0.6)',
          lineHeight: 1.7,
        }}
      >
        无历史节律数据。Seed 后 (cd api && npm run ceo:seed-demo) 应有 12 周回填。
      </div>
    );
  }

  // 整体均值 (作为参考线)
  const totalMain = slices.reduce((a, b) => a + b.totalMainHours, 0);
  const totalFire = slices.reduce((a, b) => a + b.totalFirefightingHours, 0);
  const overallFirePct = totalMain + totalFire > 0 ? totalFire / (totalMain + totalFire) : 0;
  const totalDeficit = slices.reduce((a, b) => a + b.deficitWeeks, 0);
  const avgRoi =
    slices.length > 0
      ? slices.reduce((a, b) => a + b.avgWeeklyRoi, 0) / slices.length
      : 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 14,
          padding: '12px 14px',
          background: 'rgba(95,163,158,0.05)',
          border: '1px solid rgba(95,163,158,0.18)',
          borderRadius: 6,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'rgba(232,239,242,0.85)',
          flexWrap: 'wrap',
        }}
      >
        <Stat label="主线时长" value={`${totalMain.toFixed(0)}h`} tone="#5FA39E" />
        <Stat label="救火比例" value={`${(overallFirePct * 100).toFixed(0)}%`} tone={overallFirePct >= 0.25 ? '#C46A50' : '#5FA39E'} />
        <Stat label="透支周数" value={`${totalDeficit}/${slices.reduce((a, b) => a + b.weekCount, 0)}`} tone={totalDeficit >= 6 ? '#C46A50' : '#C49B4D'} />
        <Stat label="平均 ROI" value={avgRoi.toFixed(2)} tone={avgRoi >= 0.7 ? '#5FA39E' : avgRoi >= 0.5 ? '#C49B4D' : '#C46A50'} />
        <span style={{ marginLeft: 'auto', color: 'rgba(232,239,242,0.5)', alignSelf: 'center' }}>
          滚动 12 周 · {slices.length} 个月切片
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {slices.map((s) => {
          const fireWarn = s.firefightingPct >= 0.25;
          const roiWarn = s.avgWeeklyRoi < 0.55;
          const deficitWarn = s.deficitWeeks >= 2;
          return (
            <div
              key={s.monthLabel}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 90px 90px 90px 1fr',
                gap: 12,
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.15)',
                border: '1px solid rgba(95,163,158,0.12)',
                borderLeft: `3px solid ${
                  fireWarn || roiWarn || deficitWarn ? '#C46A50' : '#5FA39E'
                }`,
                borderRadius: '0 3px 3px 0',
                fontSize: 11.5,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: '#5FA39E',
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              >
                {s.monthLabel}
              </span>
              <span style={{ color: '#E8EFF2' }}>
                <b>{s.totalMainHours.toFixed(0)}h</b>
                <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 9.5 }}>主线</span>
              </span>
              <span style={{ color: fireWarn ? '#FFB89A' : 'rgba(232,239,242,0.85)' }}>
                <b>{(s.firefightingPct * 100).toFixed(0)}%</b>
                <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 9.5 }}>救火</span>
              </span>
              <span style={{ color: deficitWarn ? '#FFB89A' : 'rgba(232,239,242,0.85)' }}>
                <b>{s.deficitWeeks}</b>
                <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 9.5 }}>透支周</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: roiWarn ? '#FFB89A' : '#5FA39E',
                    fontWeight: 600,
                    width: 50,
                  }}
                >
                  ROI {s.avgWeeklyRoi.toFixed(2)}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, s.avgWeeklyRoi * 100)}%`,
                      background: roiWarn ? '#C46A50' : '#5FA39E',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, color: 'rgba(232,239,242,0.5)', letterSpacing: 0.3 }}>{label}</span>
      <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, fontWeight: 600, color: tone }}>
        {value}
      </span>
    </span>
  );
}

async function fetchRoiHistory(weeks: number): Promise<TimeRoiRow[]> {
  // 当前后端只暴露 /api/v1/ceo/balcony/roi (单周)；批量历史用 SQL 直查不便，
  // 这里先并行取过去 N 周的 weekStart 查询 — 12 次小请求，本地 DB 毫秒级。
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);

  const requests: Array<Promise<TimeRoiRow | null>> = [];
  for (let i = 0; i < weeks; i++) {
    const w = new Date(monday);
    w.setDate(monday.getDate() - i * 7);
    const weekStart = w.toISOString().slice(0, 10);
    requests.push(
      fetch(`/api/v1/ceo/balcony/roi?userId=system&weekStart=${weekStart}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  const results = await Promise.all(requests);
  return results.filter((r): r is TimeRoiRow => !!r && typeof r.week_start === 'string');
}
