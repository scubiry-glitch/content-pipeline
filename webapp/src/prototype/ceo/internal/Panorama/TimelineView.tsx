// Panorama · 时间轴视图
// 4 行 × 6 列 (棱镜) 的横向流：源 → 步骤组 → 产出 → 应用

import type { PanoramaData } from './_panoramaApi';

interface Props {
  data: PanoramaData;
  revealed: boolean;
}

export function TimelineView({ data, revealed }: Props) {
  const layers = [
    { id: 'source', label: '源 · Source', items: data.sources.map((s) => s.label) },
    {
      id: 'step',
      label: `加工 · Step (5 组)`,
      items: data.stepGroups.map((g) => `${g.id} ${g.label}${g.runCount > 0 ? ` · ${g.runCount}` : ''}`),
    },
    { id: 'output', label: `产出 · Output (${data.outputs.length})`, items: data.outputs },
    { id: 'app', label: `应用 · App (6 房间)`, items: data.prisms.map((p) => `${p.icon} ${p.room}`) },
  ];

  return (
    <div
      style={{
        padding: '24px 28px',
        height: '100%',
        overflow: 'auto',
        opacity: revealed ? 1 : 0,
        transition: 'opacity 600ms ease',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {layers.map((layer, i) => (
          <div key={layer.id} style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                marginBottom: 6,
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: '#D9B88E',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  opacity: 0.85,
                }}
              >
                {layer.label}
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(217,184,142,0.15)' }} />
              {i < layers.length - 1 && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: '#D9B88E',
                    opacity: 0.6,
                  }}
                >
                  ↓
                </span>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.max(layer.items.length, 4)}, 1fr)`,
                gap: 10,
              }}
            >
              {layer.items.map((it, j) => {
                // 给应用层用棱镜颜色染色
                const prismColor =
                  layer.id === 'app' ? data.prisms[j]?.color : '#D9B88E';
                return (
                  <div
                    key={`${layer.id}-${j}`}
                    style={{
                      padding: '10px 12px',
                      background:
                        layer.id === 'app'
                          ? `${prismColor}10`
                          : 'rgba(217,184,142,0.04)',
                      border: `1px solid ${
                        layer.id === 'app' ? `${prismColor}40` : 'rgba(217,184,142,0.18)'
                      }`,
                      borderRadius: 4,
                      fontSize: 11.5,
                      color: '#E8E3D8',
                      fontFamily: 'var(--serif)',
                      fontStyle: 'italic',
                      lineHeight: 1.4,
                    }}
                  >
                    {it}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
