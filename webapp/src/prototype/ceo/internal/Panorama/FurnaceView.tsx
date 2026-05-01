// Panorama · 熔炉视图 (六棱镜切扇区 · CEO 中心)
// 圆环切 6 等份扇区，4 同心圆环 = 源/步骤/产出/应用
// 来源: 07-archive/会议纪要 (20260501)/panorama.jsx FurnaceView

import { useNavigate } from 'react-router-dom';
import type { PanoramaData, PanoramaPrism } from './_panoramaApi';

const RING_RADII = [60, 110, 165, 220];   // 中心向外: 中心 / 步骤 / 产出 / 应用
const RING_LABELS = ['核心', '加工', '产出', '应用'];

interface Props {
  data: PanoramaData;
  revealed: boolean;
}

export function FurnaceView({ data, revealed }: Props) {
  const navigate = useNavigate();
  const W = 800;
  const H = 600;
  const cx = W / 2;
  const cy = H / 2;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: revealed ? 1 : 0,
        transition: 'opacity 600ms ease',
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '95%', maxWidth: 900, height: '100%' }}>
        {/* 同心圆 */}
        {RING_RADII.map((r, i) => (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={i === 0 ? '#D9B88E' : 'rgba(217,184,142,0.2)'}
              strokeWidth={i === 0 ? 1.5 : 0.6}
              strokeDasharray={i === 0 ? undefined : '2 4'}
            />
            <text
              x={cx}
              y={cy - r - 6}
              textAnchor="middle"
              fontFamily="var(--mono)"
              fontSize={9.5}
              fill="rgba(232,227,216,0.4)"
              letterSpacing="0.2em"
            >
              {RING_LABELS[i]}
            </text>
          </g>
        ))}

        {/* 6 扇区 */}
        {data.prisms.map((p, i) => {
          const a0 = -90 + i * 60;
          const a1 = a0 + 60;
          return (
            <PrismSector
              key={p.id}
              prism={p}
              cx={cx}
              cy={cy}
              startAngle={a0}
              endAngle={a1}
              onClick={() => navigate(`/ceo/internal/ceo/${p.room.toLowerCase().replace(' ', '-')}`)}
            />
          );
        })}

        {/* 中心 = CEO */}
        <circle cx={cx} cy={cy} r={50} fill="rgba(217,184,142,0.12)" stroke="#D9B88E" strokeWidth="2" />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize="9"
          fill="rgba(217,184,142,0.7)"
          letterSpacing="0.3em"
        >
          CEO
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontFamily="var(--serif)"
          fontStyle="italic"
          fontSize="14"
          fill="#F3ECDD"
        >
          中心
        </text>
      </svg>
    </div>
  );
}

interface SectorProps {
  prism: PanoramaPrism;
  cx: number;
  cy: number;
  startAngle: number;
  endAngle: number;
  onClick: () => void;
}

function PrismSector({ prism, cx, cy, startAngle, endAngle, onClick }: SectorProps) {
  const midAngle = (startAngle + endAngle) / 2;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const point = (r: number, a: number) => ({
    x: cx + r * Math.cos(rad(a)),
    y: cy + r * Math.sin(rad(a)),
  });

  // 扇区边界（最外环 220）
  const outer = RING_RADII[3];
  const inner = RING_RADII[0];
  const outerStart = point(outer, startAngle);
  const outerEnd = point(outer, endAngle);
  const innerStart = point(inner, endAngle);
  const innerEnd = point(inner, startAngle);
  const sectorPath = [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${inner} ${inner} 0 0 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');

  // 4 层文字位置
  const labelSource = point((RING_RADII[2] + RING_RADII[3]) / 2 + 8, midAngle);
  const labelStep = point((RING_RADII[1] + RING_RADII[2]) / 2 + 5, midAngle);
  const labelOutput = point((RING_RADII[0] + RING_RADII[1]) / 2 + 5, midAngle);
  const iconPos = point(outer + 18, midAngle);

  // 指标标签 — 最外环之外
  const metricPos = point(outer + 50, midAngle);

  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      <path d={sectorPath} fill={`${prism.color}10`} stroke={`${prism.color}55`} strokeWidth="0.8" />
      {/* 外圈图标 */}
      <text
        x={iconPos.x}
        y={iconPos.y + 5}
        textAnchor="middle"
        fontSize="18"
        style={{ pointerEvents: 'none' }}
      >
        {prism.icon}
      </text>
      <text
        x={metricPos.x}
        y={metricPos.y + 2}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="9"
        fill={prism.color}
      >
        {prism.metric.label}
      </text>
      <text
        x={metricPos.x}
        y={metricPos.y + 16}
        textAnchor="middle"
        fontFamily="var(--serif)"
        fontStyle="italic"
        fontSize="14"
        fill="#F3ECDD"
        fontWeight={600}
      >
        {prism.metric.value}
      </text>
      {/* 4 层文字 */}
      <text
        x={labelSource.x}
        y={labelSource.y}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="8.5"
        fill={prism.color}
        opacity="0.95"
        style={{ pointerEvents: 'none' }}
      >
        {prism.sector.app}
      </text>
      <text
        x={labelStep.x}
        y={labelStep.y}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="8.5"
        fill="rgba(232,227,216,0.7)"
        style={{ pointerEvents: 'none' }}
      >
        {prism.sector.output}
      </text>
      <text
        x={labelOutput.x}
        y={labelOutput.y}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="8"
        fill="rgba(232,227,216,0.5)"
        style={{ pointerEvents: 'none' }}
      >
        {prism.sector.step}
      </text>
    </g>
  );
}
