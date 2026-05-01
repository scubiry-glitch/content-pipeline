// Tower · ⑥ 团队节奏 · 7×24 heatmap
// 来源: 07-archive/会议纪要 (20260501)/tower.html .heatmap

import { useEffect, useState } from 'react';

interface HeatmapCell {
  day: number;
  hour: number;
  intensity: number;
}

interface HeatmapResponse {
  weekStart: string;
  cells: HeatmapCell[];
  source?: 'real' | 'fallback' | 'mixed';
  counts?: { meetings: number; commitments: number };
}

interface Props {
  weekStart?: string;
}

const DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21]; // 显示锚点小时

function intensityColor(i: number): string {
  if (i >= 0.85) return 'rgba(196,106,80,0.7)';   // 过载 红
  if (i >= 0.6) return 'rgba(95,163,158,0.85)';   // 高 深绿
  if (i >= 0.3) return 'rgba(95,163,158,0.55)';   // 中
  if (i >= 0.1) return 'rgba(95,163,158,0.25)';   // 低
  return 'rgba(95,163,158,0.05)';                  // 闲
}

export function TeamHeatmap({ weekStart }: Props) {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [source, setSource] = useState<HeatmapResponse['source']>('fallback');
  const [counts, setCounts] = useState<HeatmapResponse['counts']>({ meetings: 0, commitments: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = weekStart ? `?weekStart=${weekStart}` : '';
    fetch(`/api/v1/ceo/tower/heatmap${q}`)
      .then((r) => r.json())
      .then((d: HeatmapResponse) => {
        if (cancelled) return;
        setCells(d.cells ?? []);
        setSource(d.source ?? 'fallback');
        setCounts(d.counts ?? { meetings: 0, commitments: 0 });
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const sourceLabel: Record<NonNullable<HeatmapResponse['source']>, { label: string; tone: string }> = {
    real: { label: '真数据', tone: '#5FA39E' },
    mixed: { label: '混合', tone: '#C49B4D' },
    fallback: { label: '兜底', tone: 'rgba(232,239,242,0.5)' },
  };

  // grid by [day][hour]
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) grid[c.day][c.hour] = c.intensity;

  if (loading) {
    return (
      <div style={{ padding: '20px', fontStyle: 'italic', color: 'rgba(232,239,242,0.5)', fontSize: 12, textAlign: 'center' }}>
        加载团队 heatmap…
      </div>
    );
  }

  return (
    <div>
      {/* 数据源徽标 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 8,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(232,239,242,0.55)',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            background: `${(sourceLabel[source ?? 'fallback']).tone}20`,
            color: sourceLabel[source ?? 'fallback'].tone,
            border: `1px solid ${sourceLabel[source ?? 'fallback'].tone}55`,
            borderRadius: 99,
            letterSpacing: 0.2,
          }}
        >
          {sourceLabel[source ?? 'fallback'].label}
        </span>
        {(counts?.meetings ?? 0) > 0 && <span>· 会议 {counts?.meetings}</span>}
        {(counts?.commitments ?? 0) > 0 && <span>· 承诺截止 {counts?.commitments}</span>}
      </div>

      {/* 顶部小时轴 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px repeat(24, 1fr)',
          gap: 1,
          marginBottom: 4,
        }}
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span
            key={h}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              color: 'rgba(232,239,242,0.4)',
              textAlign: 'center',
              letterSpacing: 0.2,
            }}
          >
            {HOURS.includes(h) ? h : ''}
          </span>
        ))}
      </div>

      {/* 7 行 x 24 格 */}
      {Array.from({ length: 7 }, (_, day) => (
        <div
          key={day}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px repeat(24, 1fr)',
            gap: 1,
            marginBottom: 1,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: day < 5 ? '#5FA39E' : 'rgba(232,239,242,0.4)',
              textAlign: 'right',
              paddingRight: 6,
              alignSelf: 'center',
            }}
          >
            周{DAYS[day]}
          </span>
          {Array.from({ length: 24 }, (_, hour) => {
            const intensity = grid[day][hour];
            return (
              <div
                key={hour}
                onMouseEnter={() => setHoveredCell({ day, hour, intensity })}
                onMouseLeave={() => setHoveredCell(null)}
                style={{
                  height: 16,
                  background: intensityColor(intensity),
                  borderRadius: 2,
                  cursor: 'crosshair',
                  transition: 'all 150ms ease',
                  outline:
                    hoveredCell?.day === day && hoveredCell?.hour === hour
                      ? '1px solid #5FA39E'
                      : 'none',
                }}
              />
            );
          })}
        </div>
      ))}

      {/* 图例 */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 12,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(232,239,242,0.6)',
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <i style={{ width: 14, height: 8, background: intensityColor(0.2), borderRadius: 2 }} /> 低
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <i style={{ width: 14, height: 8, background: intensityColor(0.5), borderRadius: 2 }} /> 中
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <i style={{ width: 14, height: 8, background: intensityColor(0.7), borderRadius: 2 }} /> 高
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <i style={{ width: 14, height: 8, background: intensityColor(0.9), borderRadius: 2 }} /> 过载
        </span>
        {hoveredCell && (
          <span style={{ marginLeft: 'auto', color: '#5FA39E', fontWeight: 600 }}>
            周{DAYS[hoveredCell.day]} {String(hoveredCell.hour).padStart(2, '0')}:00 ·{' '}
            {(hoveredCell.intensity * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
