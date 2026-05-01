// Compass · ② 时间分配饼
// 来源: 07-archive/会议纪要 (20260501)/compass.html .pie-row block

import { TIME_PIE } from './_compassFixtures';

interface Props {
  total?: number;
  main?: number;
  branch?: number;
  firefighting?: number;
  warning?: string;
}

export function TimePie({
  total = TIME_PIE.total,
  main = TIME_PIE.main,
  branch = TIME_PIE.branch,
  firefighting = TIME_PIE.firefighting,
  warning = TIME_PIE.warning,
}: Props) {
  // 简化的饼图：3 段 (main / branch / firefighting)
  // 起始角 0° (12 点钟方向)
  const segs = [
    { pct: main, fill: 'rgba(62,110,140,0.6)', label: '主线' },
    { pct: branch, fill: 'rgba(184,147,72,0.55)', label: '支线' },
    { pct: firefighting, fill: 'rgba(176,90,74,0.55)', label: '救火' },
  ];

  let cumulative = 0;
  const paths = segs.map((s) => {
    const startAngle = cumulative * 3.6 - 90; // 度，从 12 点钟开始
    cumulative += s.pct;
    const endAngle = cumulative * 3.6 - 90;
    const r = 42;
    const cx = 50;
    const cy = 50;
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
    const largeArc = s.pct > 50 ? 1 : 0;
    return {
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      fill: s.fill,
      label: s.label,
    };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 18, alignItems: 'center' }}>
      <svg viewBox="0 0 100 100" style={{ width: 160, height: 160 }}>
        <circle cx="50" cy="50" r="42" fill="#fff" stroke="#D8CFBF" strokeWidth="1" />
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} />
        ))}
        <circle cx="50" cy="50" r="22" fill="#FAF7F0" />
        <text x="50" y="48" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="10" fill="#1A2E3D">
          {total}h
        </text>
        <text x="50" y="60" textAnchor="middle" fontFamily="var(--mono)" fontSize="5" fill="rgba(26,46,61,0.4)" letterSpacing="1">
          本周
        </text>
      </svg>
      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'rgba(26,46,61,0.62)' }}>
        <b style={{ color: '#1A2E3D', fontWeight: 600 }}>主线 {main}%</b>(Halycon + Beacon)
        <br />
        <b style={{ color: '#1A2E3D', fontWeight: 600 }}>支线 {branch}%</b>(Stellar 尽调)
        <br />
        <b style={{ color: '#B05A4A', fontWeight: 600 }}>救火 {firefighting}%</b>(Crucible / Pyre)
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(176,90,74,0.08)',
            borderLeft: '2px solid #B05A4A',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 13,
            color: '#1A2E3D',
          }}
        >
          {warning}
        </div>
      </div>
    </div>
  );
}
