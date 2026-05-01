// Situation · ① 利益相关方热力图
// 来源: 07-archive/会议纪要 (20260501)/situation.html .heatmap

import { HEATMAP_NODES, STAKEHOLDERS } from './_situationFixtures';

export function StakeholderHeatmap() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
      <div style={{ width: 320, height: 300 }}>
        <svg viewBox="0 0 320 300" style={{ width: '100%', height: '100%' }}>
          <g transform="translate(160 150)">
            <circle r="125" fill="none" stroke="rgba(178,195,220,0.1)" strokeWidth="0.8" />
            <circle r="90" fill="none" stroke="rgba(178,195,220,0.1)" strokeWidth="0.8" />
            <circle r="55" fill="none" stroke="rgba(178,195,220,0.1)" strokeWidth="0.8" />
            <text
              x="0" y="-128" textAnchor="middle"
              fontFamily="var(--mono)" fontSize="8" fill="rgba(230,236,245,0.42)" letterSpacing="0.15em"
            >
              远
            </text>
            <text
              x="0" y="-58" textAnchor="middle"
              fontFamily="var(--mono)" fontSize="8" fill="rgba(230,236,245,0.42)" letterSpacing="0.15em"
            >
              近
            </text>
            {/* 中心 = CEO */}
            <circle r="14" fill="rgba(102,121,181,0.2)" stroke="#6679B5" strokeWidth="1.5" />
            <text
              x="0" y="3" textAnchor="middle"
              fontFamily="var(--serif)" fontStyle="italic" fontSize="11" fill="#8B9BC8"
            >
              你
            </text>
            {/* 利益方节点 */}
            {HEATMAP_NODES.map((n) => (
              <g key={n.id}>
                <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} stroke={n.stroke} strokeWidth="1.5" />
                <text
                  x={n.cx} y={n.cy + 3} textAnchor="middle"
                  fontFamily="var(--serif)" fontStyle="italic" fontSize={n.r >= 18 ? 11 : 9.5} fill="#fff"
                >
                  {n.name}
                </text>
                <text
                  x={n.cx} y={n.cy + n.r + 12} textAnchor="middle"
                  fontFamily="var(--mono)" fontSize="8" fill={n.arrowColor}
                >
                  {n.arrow}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STAKEHOLDERS.map((s, i) => (
          <div
            key={i}
            style={{
              padding: '8px 12px',
              background: s.hot
                ? 'rgba(196,106,80,0.1)'
                : s.warm
                ? 'rgba(196,155,77,0.08)'
                : s.calm
                ? 'rgba(95,163,158,0.06)'
                : 'rgba(102,121,181,0.05)',
              border: `1px solid ${s.hot ? 'rgba(196,106,80,0.4)' : s.warm ? 'rgba(196,155,77,0.3)' : 'rgba(102,121,181,0.2)'}`,
              borderLeft: `3px solid ${s.hot ? '#C46A50' : s.warm ? '#C49B4D' : s.calm ? '#5FA39E' : '#6679B5'}`,
              borderRadius: '0 3px 3px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 3,
              }}
            >
              <span style={{ fontFamily: 'var(--serif)', fontSize: 12.5, color: '#FDF3D4' }}>
                <b>{s.name}</b>
                <span style={{ opacity: 0.65, marginLeft: 4 }}>· {s.scope}</span>
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: s.hot ? '#FFB89A' : s.warm ? '#FFE7BA' : 'rgba(253,243,212,0.6)',
                }}
              >
                {s.temp}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(253,243,212,0.7)', lineHeight: 1.45 }}>
              {s.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
