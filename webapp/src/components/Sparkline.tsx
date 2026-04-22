// Sparkline — 轻量 SVG 迷你折线图（无依赖）
// 用于趋势信号页展示数值序列

import { useMemo, useState } from 'react';

export interface SparklinePoint {
  time: string;
  value: string;
  source?: string;
  citationCount?: number;
}

interface Props {
  points: SparklinePoint[];
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  width?: number;
  height?: number;
}

function parseNumeric(raw: string): number | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  const pct = s.match(/^([-+]?\d+(?:\.\d+)?)\s*%$/);
  if (pct) return parseFloat(pct[1]) / 100;
  const cn = s.match(/^[￥¥]?\s*([-+]?\d+(?:\.\d+)?)\s*(万|亿|千|百)?/);
  if (cn) {
    const base = parseFloat(cn[1]);
    const unit = cn[2] === '万' ? 1e4 : cn[2] === '亿' ? 1e8 : cn[2] === '千' ? 1e3 : cn[2] === '百' ? 1e2 : 1;
    if (!isNaN(base)) return base * unit;
  }
  const n = parseFloat(s.replace(/[,\s￥¥$]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const COLOR = {
  rising:   { stroke: '#16a34a', fillStart: 'rgba(22,163,74,0.25)',  fillEnd: 'rgba(22,163,74,0)' },
  falling:  { stroke: '#dc2626', fillStart: 'rgba(220,38,38,0.25)',   fillEnd: 'rgba(220,38,38,0)' },
  volatile: { stroke: '#d97706', fillStart: 'rgba(217,119,6,0.25)',   fillEnd: 'rgba(217,119,6,0)' },
  stable:   { stroke: '#64748b', fillStart: 'rgba(100,116,139,0.18)', fillEnd: 'rgba(100,116,139,0)' },
};

export function Sparkline({ points, direction, width = 480, height = 64 }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const numeric = useMemo(() => points.map(p => parseNumeric(p.value)), [points]);
  const hasNumeric = numeric.some(n => typeof n === 'number');

  if (points.length === 0) return null;

  const pad = { top: 8, right: 16, bottom: 8, left: 16 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const palette = COLOR[direction];

  // 计算 X 位置（按时间顺序等间距展开；真实时间差做辅助提示）
  const xs = points.map((_, i) =>
    pad.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1)),
  );

  let ys: number[];
  if (hasNumeric) {
    const valid = numeric.filter(n => typeof n === 'number') as number[];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    ys = numeric.map((n, i) => {
      if (typeof n !== 'number') {
        // 无数值回退到相邻可用值的平均
        const prev = numeric.slice(0, i).reverse().find(v => typeof v === 'number') as number | undefined;
        const next = numeric.slice(i + 1).find(v => typeof v === 'number') as number | undefined;
        const avg = prev ?? next ?? (min + max) / 2;
        return pad.top + innerH - ((avg - min) / range) * innerH;
      }
      return pad.top + innerH - ((n - min) / range) * innerH;
    });
  } else {
    // 非数值：全走中线
    ys = points.map(() => pad.top + innerH / 2);
  }

  const linePath = points.map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${(pad.top + innerH).toFixed(1)} L${xs[0].toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;

  const gradId = `spark-grad-${direction}`;

  return (
    <div className="relative" style={{ width }}>
      <svg width={width} height={height} className="block">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.fillStart} />
            <stop offset="100%" stopColor={palette.fillEnd} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={palette.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((_, i) => (
          <circle
            key={i}
            cx={xs[i]}
            cy={ys[i]}
            r={hoverIdx === i ? 5 : 3}
            fill={palette.stroke}
            stroke="white"
            strokeWidth="1.5"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: 'pointer' }}
          />
        ))}
        {/* 起点/终点值标注 */}
        <text x={xs[0]} y={Math.max(pad.top, ys[0] - 6)} fontSize="10" fill="#475569" textAnchor="start">
          {points[0].value}
        </text>
        <text
          x={xs[xs.length - 1]}
          y={Math.max(pad.top, ys[ys.length - 1] - 6)}
          fontSize="10"
          fill="#475569"
          textAnchor="end"
        >
          {points[points.length - 1].value}
        </text>
      </svg>
      {hoverIdx !== null && (
        <div
          className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg z-10"
          style={{
            left: Math.min(Math.max(xs[hoverIdx] - 60, 0), width - 120),
            top: Math.max(ys[hoverIdx] - 48, 0),
            minWidth: 120,
          }}
        >
          <div>{new Date(points[hoverIdx].time).toLocaleDateString('zh-CN')}</div>
          <div className="font-semibold">{points[hoverIdx].value}</div>
          {points[hoverIdx].source && (
            <div className="text-gray-300 truncate max-w-[160px]">来源: {points[hoverIdx].source}</div>
          )}
          {points[hoverIdx].citationCount && points[hoverIdx].citationCount! > 1 && (
            <div className="text-gray-400">被 {points[hoverIdx].citationCount} 篇引用</div>
          )}
        </div>
      )}
    </div>
  );
}
