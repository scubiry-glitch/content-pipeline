// 6 房间 stub 页面 - 通用占位
// 用于 PR1 阶段，每个房间显示占位 UI 与"建设中"提示
// PR4-PR9 各自替换为完整房间组件

import { useNavigate, useParams } from 'react-router-dom';
import { findRoomBySlug, PRISM_ROOMS } from '../shared/PrismRegistry';
import { RoomVisual } from '../shared/RoomVisual';

export function RoomStub() {
  const { room: slug } = useParams<{ room: string }>();
  const navigate = useNavigate();
  const room = slug ? findRoomBySlug(slug) : undefined;

  if (!room) {
    return (
      <div
        style={{
          padding: '60px 44px',
          color: '#F3ECDD',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>未知房间: {slug}</h2>
        <p style={{ color: 'rgba(232,227,216,0.55)' }}>
          已知房间: {PRISM_ROOMS.map((r) => r.slug).join(' · ')}
        </p>
        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            marginTop: 20,
            padding: '8px 14px',
            background: 'transparent',
            border: '1px solid rgba(217,184,142,0.3)',
            color: '#D9B88E',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          ← 回 CEO 主页
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100%',
        background: room.bg,
        color: room.ink,
        padding: '34px 44px 60px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <RoomVisual kind={room.id} color={room.tone} size={300} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 900 }}>
        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            background: 'transparent',
            border: 0,
            color: room.tone,
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
            color: room.tone,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {room.icon} {room.label} · {room.room}
        </div>

        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 36,
            fontWeight: 500,
            margin: '6px 0 18px',
            letterSpacing: '-0.015em',
          }}
        >
          "{room.question}"
        </h1>

        <div
          style={{
            display: 'inline-block',
            marginBottom: 30,
            padding: '5px 12px',
            background: `${room.tone}22`,
            border: `1px solid ${room.tone}55`,
            borderRadius: 99,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: room.tone,
            letterSpacing: 0.3,
          }}
        >
          建设中 · Coming soon
        </div>

        <div
          style={{
            background: `${room.tone}10`,
            border: `1px solid ${room.tone}30`,
            borderRadius: 6,
            padding: '20px 24px',
            opacity: 0.85,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: room.tone,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              opacity: 0.85,
              marginBottom: 6,
            }}
          >
            预览指标
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 38,
                fontWeight: 600,
                color: room.tone,
              }}
            >
              {room.metric.value}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              {room.metric.label} · Δ {room.metric.delta}
            </div>
          </div>
          <p
            style={{
              marginTop: 16,
              fontSize: 13,
              lineHeight: 1.6,
              color: room.ink,
              opacity: 0.7,
              fontStyle: 'italic',
            }}
          >
            该房间的完整 6-7 个 block (含{room.visual}视觉) 将在后续 PR 落地。
            数据将来自 mn_* 与 ceo_* 的聚合层。
          </p>
        </div>
      </div>
    </div>
  );
}

export default RoomStub;
