// Panorama 全景画板 · stub
// 三视图: 熔炉 / 时间轴 / 冰山
// 完整实现见 PR10

import { useNavigate } from 'react-router-dom';
import { PRISM_ROOMS } from '../../shared/PrismRegistry';

export function Panorama() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        padding: '34px 44px 60px',
        minHeight: '100%',
        color: '#F3ECDD',
        position: 'relative',
      }}
    >
      <button
        onClick={() => navigate('/ceo/internal/ceo')}
        style={{
          background: 'transparent',
          border: 0,
          color: '#D9B88E',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          cursor: 'pointer',
          opacity: 0.7,
          padding: 0,
          marginBottom: 16,
        }}
      >
        ← 棱镜主页
      </button>

      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: '#D9B88E',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.8,
        }}
      >
        Internal · 全景画板
      </div>
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 36,
          fontWeight: 500,
          margin: '4px 0 18px',
          letterSpacing: '-0.015em',
        }}
      >
        Panorama · 三视图
      </h1>

      <div
        style={{
          display: 'inline-block',
          marginBottom: 30,
          padding: '5px 12px',
          background: 'rgba(217,184,142,0.12)',
          border: '1px solid rgba(217,184,142,0.3)',
          borderRadius: 99,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: '#D9B88E',
          letterSpacing: 0.3,
        }}
      >
        建设中 · 完整实现见 PR10
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          maxWidth: 1100,
        }}
      >
        {[
          {
            t: '熔炉 · Furnace',
            sub: '六棱镜切扇区 · CEO 中心视角',
            icon: '🔥',
          },
          {
            t: '时间轴 · Timeline',
            sub: '源 → 加工 → 产出 → 应用 全流程横向流',
            icon: '⌛',
          },
          {
            t: '冰山 · Iceberg',
            sub: '水面之上 (应用) / 水下支撑 (数据+模型)',
            icon: '🧊',
          },
        ].map((v, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(217,184,142,0.05)',
              border: '1px solid rgba(217,184,142,0.18)',
              borderRadius: 6,
              padding: '20px 22px',
              opacity: 0.85,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{v.icon}</div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 18,
                fontWeight: 600,
                color: '#F3ECDD',
              }}
            >
              {v.t}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: 'rgba(232,227,216,0.55)',
              }}
            >
              {v.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'rgba(232,227,216,0.45)',
        }}
      >
        每房间贯穿 4 层: 源 → 步骤组 → 产出 → 应用 ·{' '}
        {PRISM_ROOMS.map((r) => r.icon).join(' ')}
      </div>
    </div>
  );
}

export default Panorama;
