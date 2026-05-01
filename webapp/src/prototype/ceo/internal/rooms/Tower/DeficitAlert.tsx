// Tower · ⑤ 透支预警 (gauge)
// 来源: 07-archive/会议纪要 (20260501)/tower.html .deficit-wrap

import { DEFICIT } from './_towerFixtures';

export function DeficitAlert() {
  // gauge dasharray: 264 = 2*pi*42 (半圆 132)；使用 pct 计算 dasharray
  const pct = Math.min(150, DEFICIT.pct);
  const dashLen = Math.round(2 * Math.PI * 42 * (pct / 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg viewBox="0 0 100 100" style={{ width: 130, height: 130 }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(180,200,210,0.1)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="#C46A50"
          strokeWidth="8"
          strokeDasharray={`${dashLen} 264`}
          strokeDashoffset="0"
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
        />
        <text
          x="50"
          y="48"
          textAnchor="middle"
          fontFamily="var(--serif)"
          fontStyle="italic"
          fontSize="18"
          fill="#C46A50"
          fontWeight="600"
        >
          {DEFICIT.pct}%
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize="6"
          fill="rgba(232,239,242,0.42)"
          letterSpacing="0.15em"
        >
          透支
        </text>
      </svg>
      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.7, color: 'rgba(232,239,242,0.85)' }}>
        本周总工时 <b style={{ color: '#FFB89A' }}>{DEFICIT.totalH}h</b>，预算 {DEFICIT.budgetH}h。
        <div
          style={{
            marginTop: 8,
            padding: '7px 11px',
            background: 'rgba(196,106,80,0.08)',
            borderLeft: '2px solid #C46A50',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 12,
            color: '#FFCFB7',
          }}
        >
          {DEFICIT.warning}
        </div>
      </div>
    </div>
  );
}
