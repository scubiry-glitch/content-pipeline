// Tower · ⑥ 个人节奏 · 周一-周日 折线图 + 5 行 stat
// 来源: 07-archive/会议纪要 (20260501)/tower.html .personal-svg + .personal-stats

import { useEffect, useState } from 'react';

interface DayPoint {
  name: string;
  dayIndex: number;
  deepFocus: number;
  fire: number;
  meeting: number;
}

interface Stats {
  deepFocus: { value: number; target: number; delta: string };
  meetings: { value: number; vsLastWeek: number };
  fire: { value: number; delta: string };
  sleep: { value: number; vsTarget: number };
  thinkBlocks: { value: number; target: number };
}

interface Data {
  days: DayPoint[];
  stats: Stats;
}

const COLORS = {
  deep: '#5FA39E',
  fire: '#C46A50',
  meeting: '#C49B4D',
};

export function PersonalRhythm() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ceo/tower/personal-rhythm?userId=system')
      .then((r) => r.json())
      .then((d: Data) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return (
      <div style={{ padding: '20px', fontStyle: 'italic', color: 'rgba(232,239,242,0.5)', fontSize: 12, textAlign: 'center' }}>
        加载个人节奏…
      </div>
    );
  }

  const { days, stats } = data;

  // SVG 坐标
  const W = 360;
  const H = 200;
  const xs = days.map((_, i) => 30 + (i * (W - 60)) / (days.length - 1));
  // y 轴: 倒置, max=8h 映射到顶部 (y=20), 0h 映射到底部 (y=170)
  const yOf = (h: number) => 170 - (Math.min(h, 8) / 8) * 150;

  const deepLine = days.map((d, i) => `${xs[i]},${yOf(d.deepFocus)}`).join(' ');
  const fireLine = days.map((d, i) => `${xs[i]},${yOf(d.fire)}`).join(' ');
  const meetingLine = days.map((d, i) => `${xs[i]},${yOf(d.meeting)}`).join(' ');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 18 }}>
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
          <g stroke="rgba(180,200,210,0.08)" strokeWidth="0.6">
            <line x1="0" y1="50" x2={W} y2="50" />
            <line x1="0" y1="100" x2={W} y2="100" />
            <line x1="0" y1="150" x2={W} y2="150" />
          </g>
          {/* 折线 */}
          <polyline fill="none" stroke={COLORS.deep} strokeWidth="2.2" points={deepLine} />
          <polyline fill="none" stroke={COLORS.fire} strokeWidth="2" points={fireLine} />
          <polyline
            fill="none"
            stroke={COLORS.meeting}
            strokeWidth="1.6"
            strokeDasharray="4 3"
            points={meetingLine}
          />
          {/* 数据点 */}
          {days.map((d, i) => (
            <g key={i}>
              <circle cx={xs[i]} cy={yOf(d.deepFocus)} r={3} fill={COLORS.deep} />
              <circle cx={xs[i]} cy={yOf(d.fire)} r={2.5} fill={COLORS.fire} />
              <circle cx={xs[i]} cy={yOf(d.meeting)} r={2.5} fill={COLORS.meeting} />
            </g>
          ))}
          {/* X 轴标签 */}
          <g
            fontFamily="var(--mono)"
            fontSize="8"
            fill="rgba(232,239,242,0.42)"
            letterSpacing="0.08em"
          >
            {days.map((d, i) => (
              <text key={i} x={xs[i]} y="190" textAnchor="middle">
                {d.name}
              </text>
            ))}
          </g>
        </svg>
        {/* 图例 */}
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 8,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'rgba(232,239,242,0.6)',
          }}
        >
          <span>
            <i style={{ display: 'inline-block', width: 12, height: 2, background: COLORS.deep, marginRight: 4, verticalAlign: 'middle' }} />
            深度专注
          </span>
          <span>
            <i style={{ display: 'inline-block', width: 12, height: 2, background: COLORS.fire, marginRight: 4, verticalAlign: 'middle' }} />
            救火
          </span>
          <span>
            <i style={{ display: 'inline-block', width: 12, height: 0, borderTop: `1.5px dashed ${COLORS.meeting}`, marginRight: 4, verticalAlign: 'middle' }} />
            会议
          </span>
        </div>
      </div>

      {/* 5 行 stat */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatRow
          k="深度专注 / 周"
          v={`${stats.deepFocus.value.toFixed(0)}h`}
          delta={stats.deepFocus.delta}
          warn={stats.deepFocus.value < stats.deepFocus.target}
          sub={`目标 ${stats.deepFocus.target}h`}
        />
        <StatRow
          k="会议时长"
          v={`${stats.meetings.value.toFixed(0)}h`}
          delta={stats.meetings.vsLastWeek >= 0 ? `+${stats.meetings.vsLastWeek}h vs 上周` : `${stats.meetings.vsLastWeek}h vs 上周`}
          alert={stats.meetings.value >= 25}
        />
        <StatRow
          k="救火"
          v={`${stats.fire.value.toFixed(1)}h`}
          delta={stats.fire.delta}
          alert={stats.fire.value >= 5}
        />
        <StatRow
          k="睡眠均值"
          v={`${stats.sleep.value.toFixed(1)}h`}
          delta={`${stats.sleep.vsTarget}h vs 目标`}
          warn={stats.sleep.vsTarget < 0}
        />
        <StatRow
          k="思考块次数"
          v={`${stats.thinkBlocks.value}`}
          delta={`目标 ${stats.thinkBlocks.target}`}
          warn={stats.thinkBlocks.value < stats.thinkBlocks.target}
        />
      </div>
    </div>
  );
}

interface StatRowProps {
  k: string;
  v: string;
  delta: string;
  warn?: boolean;
  alert?: boolean;
  sub?: string;
}

function StatRow({ k, v, delta, warn, alert }: StatRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '6px 10px',
        background: 'rgba(95,163,158,0.04)',
        border: '1px solid rgba(95,163,158,0.12)',
        borderLeft: `2px solid ${alert ? '#C46A50' : warn ? '#C49B4D' : '#5FA39E'}`,
        borderRadius: '0 3px 3px 0',
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(232,239,242,0.55)' }}>
        {k}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 17,
            fontWeight: 600,
            color: alert ? '#FFB89A' : warn ? '#FFD08C' : '#A6E0D8',
          }}
        >
          {v}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: alert ? '#FFB89A' : warn ? 'rgba(232,239,242,0.6)' : 'rgba(232,239,242,0.5)',
          }}
        >
          {delta}
        </span>
      </span>
    </div>
  );
}
