// Compass · ① 战略星盘 SVG
// 来源: 07-archive/会议纪要 (20260501)/compass.html .astrolabe block
// 渲染主线 (北极)、支线 (东西)、漂移 (南极) 三类项目，中心罗盘 + 摇摆指针

import { COMPASS_NODES, type CompassNode } from './_compassFixtures';

interface Props {
  nodes?: CompassNode[];
}

const COLORS = {
  blue: '#3E6E8C',
  blueSoft: '#7BA7C4',
  gold: '#B89348',
  goldSoft: 'rgba(184,147,72,0.4)',
  crimson: '#B05A4A',
  crimsonSoft: 'rgba(176,90,74,0.25)',
  ink: '#1A2E3D',
};

export function Astrolabe({ nodes = COMPASS_NODES }: Props) {
  return (
    <div
      style={{
        width: '100%',
        height: 520,
        background:
          'radial-gradient(circle at center, #fff 0%, #ECE6DC 80%)',
        border: '1px solid #C8BCA8',
        borderRadius: '50%/4%',
        position: 'relative',
        boxShadow: 'inset 0 0 50px rgba(62,110,140,0.08)',
      }}
    >
      <svg viewBox="0 0 600 500" style={{ width: '100%', height: '100%' }}>
        {/* 同心圆刻度 */}
        <circle cx="300" cy="250" r="60"  fill="none" stroke="rgba(62,110,140,0.25)" strokeDasharray="2 4" />
        <circle cx="300" cy="250" r="140" fill="none" stroke="rgba(62,110,140,0.25)" strokeDasharray="2 4" />
        <circle cx="300" cy="250" r="220" fill="none" stroke="rgba(62,110,140,0.25)" strokeDasharray="2 4" />

        <text x="300" y="36"  textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" letterSpacing="2.5" fill={COLORS.blue}>N · 主线</text>
        <text x="568" y="254" textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" letterSpacing="2.5" fill={COLORS.blue}>E</text>
        <text x="300" y="475" textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" letterSpacing="2.5" fill={COLORS.blue}>S · 漂移</text>
        <text x="32"  y="254" textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" letterSpacing="2.5" fill={COLORS.blue}>W</text>

        {/* 8 条放射线 */}
        <g stroke="rgba(62,110,140,0.1)" strokeWidth="0.8">
          <line x1="300" y1="50"  x2="300" y2="450" />
          <line x1="100" y1="250" x2="500" y2="250" />
          <line x1="158" y1="108" x2="442" y2="392" />
          <line x1="442" y1="108" x2="158" y2="392" />
        </g>

        {/* 项目节点 */}
        {nodes.map((n) => (
          <g key={n.name}>
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r}
              fill={
                n.kind === 'main'
                  ? 'rgba(62,110,140,0.45)'
                  : n.kind === 'branch'
                  ? COLORS.goldSoft
                  : COLORS.crimsonSoft
              }
              stroke={
                n.kind === 'main'
                  ? COLORS.blue
                  : n.kind === 'branch'
                  ? COLORS.gold
                  : COLORS.crimson
              }
              strokeWidth={n.kind === 'drift' ? 1.2 : n.kind === 'branch' ? 1.2 : 1.8}
              strokeDasharray={n.kind === 'drift' ? '3 3' : undefined}
            />
            <text
              x={n.cx}
              y={n.cy + 4}
              textAnchor="middle"
              fontFamily="var(--serif)"
              fontStyle="italic"
              fontSize={n.r >= 18 ? 12 : 11}
              fill={
                n.kind === 'main' ? '#fff' : n.kind === 'branch' ? '#5a4520' : COLORS.crimson
              }
            >
              {n.name}
            </text>
            <text
              x={n.cx}
              y={n.cy + n.r + 12}
              textAnchor="middle"
              fontFamily="var(--mono)"
              fontSize="9"
              fill={
                n.kind === 'main' ? COLORS.blue : n.kind === 'branch' ? COLORS.gold : COLORS.crimson
              }
            >
              {n.kind === 'main' ? '主线' : n.kind === 'branch' ? '支线' : '漂移'} · {n.share}%
            </text>
          </g>
        ))}

        {/* 中心罗盘 + 摇摆指针 */}
        <circle cx="300" cy="250" r="32" fill="#fff" stroke={COLORS.blue} strokeWidth="1.8" />
        <text x="300" y="247" textAnchor="middle" fontFamily="var(--mono)" fontSize="8" letterSpacing="2" fill="rgba(26,46,61,0.4)">
          YOU
        </text>
        <text x="300" y="261" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="11" fill={COLORS.blue}>
          CEO
        </text>
        <line
          x1="300" y1="250" x2="300" y2="170"
          stroke={COLORS.blue} strokeWidth="2.5" strokeLinecap="round"
          style={{
            transformOrigin: '300px 250px',
            animation: 'compass-needle 8s ease-in-out infinite',
          }}
        />
        <circle cx="300" cy="250" r="4" fill={COLORS.blue} />
      </svg>

      <style>{`
        @keyframes compass-needle {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(6deg); }
        }
      `}</style>
    </div>
  );
}
