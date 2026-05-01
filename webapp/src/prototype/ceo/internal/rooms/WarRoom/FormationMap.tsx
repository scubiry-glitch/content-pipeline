// War Room · ① 阵型图 (battle table)
// 来源: 07-archive/会议纪要 (20260501)/war-room.html .battle-table

import { NODES, LINES, type FormationLine } from './_warRoomFixtures';

const NODE_FILL: Record<string, string> = {
  self: '#1A0E0E',
  ally: '#2A1818',
  advisor: '#2A1818',
  edge: '#1A0E0E',
};

const NODE_STROKE: Record<string, { color: string; width: number; dash?: string }> = {
  self: { color: '#D64545', width: 2 },
  ally: { color: '#C8A15C', width: 1.5 },
  advisor: { color: 'rgba(245,217,217,0.4)', width: 1.2, dash: '3 3' },
  edge: { color: 'rgba(160,150,140,0.4)', width: 1, dash: '1 3' },
};

const LINE_STYLE: Record<FormationLine['kind'], { color: string; width: number; dash?: string; opacity?: number }> = {
  support: { color: '#C8A15C', width: 1.5 },
  advisor: { color: 'rgba(245,217,217,0.4)', width: 1.2, dash: '4 4' },
  tension: { color: '#D64545', width: 1, dash: '6 3', opacity: 0.5 },
  silent: { color: 'rgba(160,150,140,0.25)', width: 1, dash: '1 4' },
};

export function FormationMap() {
  return (
    <div>
      <div
        style={{
          background:
            'radial-gradient(circle at center, rgba(214,69,69,0.08) 0%, transparent 70%), #0F0707',
          border: '1px solid rgba(214,69,69,0.18)',
          borderRadius: 4,
          padding: 12,
        }}
      >
        <svg viewBox="0 0 600 500" style={{ width: '100%', height: 480 }}>
          {/* 同心圆 */}
          <circle cx="300" cy="250" r="40" fill="none" stroke="rgba(214,69,69,0.18)" strokeDasharray="2 4" />
          <circle cx="300" cy="250" r="120" fill="none" stroke="rgba(214,69,69,0.12)" strokeDasharray="2 6" />
          <circle cx="300" cy="250" r="200" fill="none" stroke="rgba(214,69,69,0.08)" strokeDasharray="2 8" />

          {/* 连线 */}
          {LINES.map((l, i) => {
            const a = NODES.find((n) => n.id === l.from)!;
            const b = NODES.find((n) => n.id === l.to)!;
            const s = LINE_STYLE[l.kind];
            return (
              <line
                key={i}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                opacity={s.opacity}
              />
            );
          })}

          {/* 节点 */}
          {NODES.map((n) => {
            const stroke = NODE_STROKE[n.variant];
            return (
              <g key={n.id} style={{ cursor: 'default' }}>
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={n.r}
                  fill={NODE_FILL[n.variant]}
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeDasharray={stroke.dash}
                />
                <text
                  x={n.cx}
                  y={n.cy + 5}
                  textAnchor="middle"
                  fontFamily="var(--serif)"
                  fontStyle="italic"
                  fontSize={n.r >= 24 ? 13 : 11}
                  fill={n.variant === 'edge' ? 'rgba(245,217,217,0.6)' : '#F5D9D9'}
                >
                  {n.name}
                </text>
                <text
                  x={n.cx}
                  y={n.variant === 'self' ? n.cy + 45 : n.variant === 'ally' || n.variant === 'edge' ? n.cy - n.r - 8 : n.cy - n.r - 5}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize="9.5"
                  fill="rgba(245,217,217,0.7)"
                >
                  {n.role}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          marginTop: 12,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(245,217,217,0.7)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 2, background: '#C8A15C', marginRight: 6, verticalAlign: 'middle' }} />
          共识/支持
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 0, borderTop: '1.5px dashed rgba(245,217,217,0.6)', marginRight: 6, verticalAlign: 'middle' }} />
          智囊/弱联结
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 0, borderTop: '1.5px dashed #D64545', marginRight: 6, verticalAlign: 'middle' }} />
          张力/冲突
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 1, background: 'rgba(160,150,140,0.5)', marginRight: 6, verticalAlign: 'middle' }} />
          沉默/边缘
        </span>
      </div>
    </div>
  );
}
