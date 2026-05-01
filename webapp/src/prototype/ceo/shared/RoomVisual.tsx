// 6 房间右下角的 SVG 视觉隐喻装饰
// 来源: 07-archive/会议纪要 (20260501)/world-shell.jsx RoomVisual

import type { PrismRoom } from './PrismRegistry';

interface Props {
  kind: PrismRoom['id'];
  color: string;
  size?: number;
}

export function RoomVisual({ kind, color, size = 120 }: Props) {
  const shared: React.CSSProperties = {
    position: 'absolute',
    right: -20,
    bottom: -20,
    width: size,
    height: size,
    opacity: 0.16,
    pointerEvents: 'none',
    zIndex: 1,
  };

  if (kind === 'direction') {
    return (
      <svg style={shared} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="1" />
        <circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="0.6" />
        <path d="M 50 10 L 54 50 L 50 90 L 46 50 Z" fill={color} />
        <path d="M 10 50 L 50 46 L 90 50 L 50 54 Z" fill={color} opacity="0.5" />
      </svg>
    );
  }
  if (kind === 'board') {
    return (
      <svg style={shared} viewBox="0 0 100 100">
        <ellipse cx="50" cy="55" rx="38" ry="22" fill="none" stroke={color} strokeWidth="1.2" />
        {[0, 60, 120, 180, 240, 300].map((a, i) => {
          const x = 50 + Math.cos((a * Math.PI) / 180) * 38;
          const y = 55 + Math.sin((a * Math.PI) / 180) * 22;
          return <rect key={i} x={x - 3} y={y - 6} width="6" height="12" fill={color} rx="1" />;
        })}
      </svg>
    );
  }
  if (kind === 'coord') {
    return (
      <svg style={shared} viewBox="0 0 100 100">
        {[15, 28, 40].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="0.6" />
        ))}
        <line x1="50" y1="50" x2="85" y2="30" stroke={color} strokeWidth="1.5" />
        <circle cx="50" cy="50" r="2" fill={color} />
      </svg>
    );
  }
  if (kind === 'team') {
    return (
      <svg style={shared} viewBox="0 0 100 100">
        {([[50, 20], [25, 55], [75, 55], [38, 80], [62, 80]] as const).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={color} />
        ))}
        <path d="M 50 20 L 25 55 L 38 80 L 62 80 L 75 55 Z" fill="none" stroke={color} strokeWidth="0.8" />
      </svg>
    );
  }
  if (kind === 'ext') {
    return (
      <svg style={shared} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="0.8" />
        {([[30, 35, 8], [65, 40, 12], [40, 65, 10], [70, 70, 6]] as const).map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.3 + i * 0.15} />
        ))}
      </svg>
    );
  }
  if (kind === 'self') {
    return (
      <svg style={shared} viewBox="0 0 100 100">
        <circle cx="72" cy="28" r="14" fill={color} opacity="0.5" />
        <path d="M 5 80 Q 30 65, 50 75 T 95 72 L 95 100 L 5 100 Z" fill={color} opacity="0.3" />
        <path d="M 0 90 Q 25 85, 50 88 T 100 86" fill="none" stroke={color} strokeWidth="0.6" />
      </svg>
    );
  }
  return null;
}
