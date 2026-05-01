// Tower · ④ 节奏脉搏 (8 周双折线)
// 来源: 07-archive/会议纪要 (20260501)/tower.html .pulse-svg

import { PULSE_WEEKS } from './_towerFixtures';

export function RhythmPulse() {
  const xs = [20, 65, 110, 155, 200, 245, 290, 335];
  const main = PULSE_WEEKS.main.map((y, i) => `${xs[i]},${y}`).join(' ');
  const firefighting = PULSE_WEEKS.firefighting.map((y, i) => `${xs[i]},${y}`).join(' ');

  return (
    <div>
      <svg viewBox="0 0 360 140" style={{ width: '100%', height: 140 }} preserveAspectRatio="none">
        <g stroke="rgba(180,200,210,0.08)" strokeWidth="0.6">
          <line x1="0" y1="35" x2="360" y2="35" />
          <line x1="0" y1="70" x2="360" y2="70" />
          <line x1="0" y1="105" x2="360" y2="105" />
        </g>
        <polyline fill="none" stroke="#5FA39E" strokeWidth="2" points={main} />
        <polyline
          fill="none"
          stroke="#C46A50"
          strokeWidth="2"
          strokeDasharray="4 3"
          points={firefighting}
        />
        <line
          x1="0"
          y1={PULSE_WEEKS.plan}
          x2="360"
          y2={PULSE_WEEKS.plan}
          stroke="rgba(196,155,77,0.5)"
          strokeWidth="0.8"
          strokeDasharray="2 3"
        />
        <text x="6" y={PULSE_WEEKS.plan - 2} fontFamily="var(--mono)" fontSize="7" fill="rgba(196,155,77,0.7)">
          PLAN 20h
        </text>
        <g fill="#5FA39E">
          <circle cx={xs[xs.length - 1]} cy={PULSE_WEEKS.main[7]} r="3.5" />
        </g>
        <g fill="#C46A50">
          <circle cx={xs[xs.length - 1]} cy={PULSE_WEEKS.firefighting[7]} r="3.5" />
        </g>
        <g fontFamily="var(--mono)" fontSize="7" fill="rgba(232,239,242,0.42)" letterSpacing="0.08em">
          <text x="20" y="135" textAnchor="middle">W-7</text>
          <text x="155" y="135" textAnchor="middle">W-3</text>
          <text x="335" y="135" textAnchor="middle">本周</text>
        </g>
      </svg>

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
          <i style={{ display: 'inline-block', width: 12, height: 2, background: '#5FA39E', marginRight: 4, verticalAlign: 'middle' }} />
          战略主线
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 12, height: 2, background: '#C46A50', marginRight: 4, verticalAlign: 'middle' }} />
          救火
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 12, height: 0, borderTop: '1px dashed #C49B4D', marginRight: 4, verticalAlign: 'middle' }} />
          计划线
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(196,106,80,0.08)',
          borderLeft: '2px solid #C46A50',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 12.5,
          color: '#FFCFB7',
        }}
      >
        战略主线本周飙升,但救火也在升 — 总工时 +12h,精力账户在透支。
      </div>
    </div>
  );
}
