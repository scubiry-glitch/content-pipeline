// Panorama 全景画板 · 三视图主壳
// 来源: 07-archive/会议纪要 (20260501)/panorama.jsx

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPanoramaData, PANORAMA_FALLBACK, type PanoramaData } from './_panoramaApi';
import { FurnaceView } from './FurnaceView';
import { TimelineView } from './TimelineView';
import { IcebergView } from './IcebergView';

type ViewId = 'furnace' | 'timeline' | 'iceberg';

const VIEWS: Array<{ id: ViewId; label: string; sub: string }> = [
  { id: 'furnace', label: '熔炉', sub: '六棱镜切扇区 · CEO 中心' },
  { id: 'timeline', label: '时间轴', sub: '源 → 加工 → 产出 → 应用' },
  { id: 'iceberg', label: '冰山', sub: '水面之上 · 水下支撑' },
];

export function Panorama() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewId>('furnace');
  const [revealed, setRevealed] = useState(false);
  const [data, setData] = useState<PanoramaData>(PANORAMA_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetchPanoramaData().then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 80);
    return () => clearTimeout(t);
  }, [view]);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: '#0F0E15',
        color: '#E8E3D8',
        fontFamily: 'var(--sans)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <StarDust />

      <header
        style={{
          padding: '16px 28px 12px',
          borderBottom: '1px solid rgba(217,184,142,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          zIndex: 2,
          position: 'relative',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: '#D9B88E',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              opacity: 0.75,
            }}
          >
            System · 全景画板
          </div>
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 22,
              fontWeight: 500,
              margin: '2px 0 0',
              color: '#F3ECDD',
              letterSpacing: '-0.01em',
            }}
          >
            从一场会议,到一生积累
          </h1>
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'rgba(217,184,142,0.08)',
            border: '1px solid rgba(217,184,142,0.2)',
            borderRadius: 8,
            padding: 4,
          }}
        >
          {VIEWS.map((v) => {
            const active = v.id === view;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                style={{
                  padding: '7px 13px',
                  border: 0,
                  borderRadius: 5,
                  cursor: 'pointer',
                  background: active ? '#D9B88E' : 'transparent',
                  color: active ? '#0F0E15' : '#D9B88E',
                  fontFamily: 'var(--serif)',
                  fontStyle: active ? 'normal' : 'italic',
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  lineHeight: 1.15,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <span>{v.label}</span>
                <span
                  style={{
                    fontSize: 9,
                    opacity: 0.65,
                    fontFamily: 'var(--mono)',
                    fontStyle: 'normal',
                    letterSpacing: 0.3,
                  }}
                >
                  {v.sub}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            marginLeft: 12,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(232,227,216,0.65)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid rgba(217,184,142,0.3)',
            borderRadius: 3,
            background: 'rgba(217,184,142,0.05)',
            cursor: 'pointer',
          }}
        >
          ← 棱镜主页
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', zIndex: 1 }}>
        {view === 'furnace' && <FurnaceView data={data} revealed={revealed} />}
        {view === 'timeline' && <TimelineView data={data} revealed={revealed} />}
        {view === 'iceberg' && <IcebergView data={data} revealed={revealed} />}
      </div>

      <footer
        style={{
          padding: '8px 28px',
          borderTop: '1px solid rgba(217,184,142,0.12)',
          display: 'flex',
          gap: 18,
          fontSize: 10,
          color: 'rgba(232,227,216,0.5)',
          fontFamily: 'var(--mono)',
          letterSpacing: 0.3,
        }}
      >
        {data.prisms.map((p) => (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: p.color }} />
            {p.label}
          </span>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          {data.meta.sourceCount} 源 · {data.meta.stepGroupCount} 组步骤 · {data.meta.outputCount} 产出 · {data.meta.prismCount} 棱镜
        </div>
      </footer>
    </div>
  );
}

function StarDust() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {[...Array(40)].map((_, i) => {
        const left = (i * 47) % 100;
        const top = (i * 31) % 100;
        const size = 1 + ((i * 13) % 3) * 0.5;
        const opacity = 0.2 + ((i * 7) % 5) * 0.1;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              borderRadius: 99,
              background: '#F3ECDD',
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}

export default Panorama;
