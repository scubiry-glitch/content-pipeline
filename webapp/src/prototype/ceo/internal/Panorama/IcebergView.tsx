// Panorama · 冰山视图
// 水面之上 (应用 6 房间) / 水下支撑 (源 + 步骤 + 产出)

import type { PanoramaData } from './_panoramaApi';

interface Props {
  data: PanoramaData;
  revealed: boolean;
}

export function IcebergView({ data, revealed }: Props) {
  return (
    <div
      style={{
        padding: '20px 28px',
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        opacity: revealed ? 1 : 0,
        transition: 'opacity 600ms ease',
      }}
    >
      {/* 水面之上 - 应用层 */}
      <div style={{ position: 'relative', marginBottom: 30 }}>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: '#D9B88E',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            opacity: 0.85,
            marginBottom: 12,
          }}
        >
          ▲ 水面之上 · APPLICATION (CEO 看见的)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 10,
          }}
        >
          {data.prisms.map((p) => (
            <div
              key={p.id}
              style={{
                padding: '14px 14px',
                background: `linear-gradient(180deg, ${p.color}25 0%, ${p.color}08 100%)`,
                border: `1px solid ${p.color}50`,
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 4 }}>{p.icon}</div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: '#F3ECDD',
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {p.room}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: p.color,
                  letterSpacing: 0.2,
                }}
              >
                {p.metric.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 17,
                  color: '#F3ECDD',
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {p.metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 水线 */}
      <div
        style={{
          height: 2,
          background: 'linear-gradient(90deg, transparent 0%, rgba(123,167,196,0.6) 50%, transparent 100%)',
          marginBottom: 8,
        }}
      />
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(123,167,196,0.7)',
          letterSpacing: '0.3em',
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        ── 水线 · WATERLINE ──
      </div>

      {/* 水下支撑 - 产出 / 步骤 / 源 */}
      <div
        style={{
          padding: '20px 16px',
          background: 'linear-gradient(180deg, rgba(123,167,196,0.06) 0%, rgba(15,14,21,0) 100%)',
          borderRadius: 6,
        }}
      >
        <Layer label="▼ 产出层 · OUTPUT (12 项)" items={data.outputs} color="#7BA7C4" />
        <Layer
          label={`▼ 加工层 · STEP GROUPS (${data.stepGroups.length} 组)`}
          items={data.stepGroups.map((g) => `${g.label} (${g.members})`)}
          color="#7FD6A0"
        />
        <Layer
          label={`▼ 源层 · SOURCE (${data.sources.length} 类)`}
          items={data.sources.map((s) => `${s.label} · ${s.sub}`)}
          color="rgba(217,184,142,0.7)"
          deepest
        />
      </div>
    </div>
  );
}

interface LayerProps {
  label: string;
  items: string[];
  color: string;
  deepest?: boolean;
}

function Layer({ label, items, color, deepest }: LayerProps) {
  return (
    <div style={{ marginBottom: 18, opacity: deepest ? 0.65 : 1 }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          color,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          marginBottom: 6,
          opacity: 0.9,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, i) => (
          <span
            key={i}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              background: 'rgba(217,184,142,0.04)',
              border: '1px solid rgba(217,184,142,0.15)',
              borderRadius: 99,
              color: 'rgba(232,227,216,0.85)',
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
            }}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
