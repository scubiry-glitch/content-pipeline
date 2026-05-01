// Internal · CEO 主页 — 六棱镜六房间入口
// 来源: 07-archive/会议纪要 (20260501)/world-shell.jsx CEOHomePane

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRISM_ROOMS, type PrismRoom } from '../shared/PrismRegistry';
import { RoomVisual } from '../shared/RoomVisual';

export function CEOHomePane() {
  const [hovered, setHovered] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <div style={{ padding: '34px 44px 60px', minHeight: '100%', position: 'relative' }}>
      {/* 月光 */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 50,
          width: 80,
          height: 80,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(217,184,142,0.25), transparent 70%)',
          filter: 'blur(4px)',
          pointerEvents: 'none',
        }}
      />
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
        Internal · CEO 主页
      </div>
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 38,
          fontWeight: 500,
          margin: '4px 0 6px',
          letterSpacing: '-0.015em',
          color: '#F3ECDD',
        }}
      >
        欢迎回来,这是你本周的棱镜。
      </h1>
      <p
        style={{
          color: 'rgba(232,227,216,0.55)',
          fontSize: 14,
          maxWidth: 640,
          lineHeight: 1.6,
          marginBottom: 30,
          fontStyle: 'italic',
        }}
      >
        六个房间,六种问题。选择今天你想用哪种方式看世界。
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 18,
          maxWidth: 1200,
        }}
      >
        {PRISM_ROOMS.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            hovered={hovered === room.id}
            onHover={() => setHovered(room.id)}
            onLeave={() => setHovered(null)}
            onEnter={() => navigate(`/ceo/internal/ceo/${room.slug}`)}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 30,
          padding: '20px 24px',
          background: 'rgba(217,184,142,0.05)',
          border: '1px solid rgba(217,184,142,0.15)',
          borderRadius: 8,
          maxWidth: 1200,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: '#D9B88E',
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                opacity: 0.8,
              }}
            >
              棱镜权重 · Prism Weights
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 16,
                color: '#F3ECDD',
                marginTop: 3,
              }}
            >
              你希望自己花多少时间在每个棱镜上?
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(232,227,216,0.5)',
              fontFamily: 'var(--mono)',
            }}
          >
            本周实际 vs 你设定的权重
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {PRISM_ROOMS.map((r, i) => {
            const actual = [22, 18, 15, 20, 10, 15][i];
            const target = [20, 15, 20, 20, 10, 15][i];
            return (
              <div key={r.id} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: r.tone,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {r.icon} {r.label}
                </div>
                <div
                  style={{
                    position: 'relative',
                    height: 5,
                    background: 'rgba(217,184,142,0.1)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${actual}%`,
                      background: r.tone,
                      opacity: 0.8,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `${target}%`,
                      top: -2,
                      bottom: -2,
                      width: 2,
                      background: '#F3ECDD',
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9.5,
                    color: 'rgba(232,227,216,0.55)',
                    marginTop: 3,
                  }}
                >
                  {actual}% · 标 {target}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panorama 入口 */}
      <button
        onClick={() => navigate('/ceo/internal/ceo/panorama')}
        style={{
          marginTop: 18,
          padding: '12px 18px',
          background: 'rgba(217,184,142,0.08)',
          border: '1px solid rgba(217,184,142,0.25)',
          borderRadius: 6,
          color: '#D9B88E',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        🌐 全景画板 · Panorama → 三视图（熔炉 / 时间轴 / 冰山）
      </button>
    </div>
  );
}

interface CardProps {
  room: PrismRoom;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onEnter: () => void;
}

function RoomCard({ room, hovered, onHover, onLeave, onEnter }: CardProps) {
  return (
    <div
      onClick={onEnter}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEnter()}
      style={{
        position: 'relative',
        minHeight: 180,
        background: room.bg,
        color: room.ink,
        border: `1px solid ${room.tone}40`,
        borderRadius: 8,
        padding: '20px 22px',
        cursor: 'pointer',
        overflow: 'hidden',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered
          ? `0 12px 28px -8px ${room.tone}66`
          : `0 4px 12px -4px rgba(0,0,0,0.3)`,
        transition: 'all 300ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <RoomVisual kind={room.id} color={room.tone} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>{room.icon}</span>
          <div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {room.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: room.tone,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {room.room}
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 13.5,
            lineHeight: 1.55,
            color: room.ink,
            opacity: 0.88,
            marginTop: 12,
            marginBottom: 16,
            borderLeft: `2px solid ${room.tone}`,
            paddingLeft: 10,
          }}
        >
          "{room.question}"
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            paddingTop: 10,
            borderTop: `1px solid ${room.tone}30`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                letterSpacing: 0.4,
                color: room.ink,
                opacity: 0.55,
                textTransform: 'uppercase',
              }}
            >
              {room.metric.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                fontWeight: 600,
                color: room.tone,
                marginTop: 2,
              }}
            >
              {room.metric.value}
            </div>
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: room.ink,
              opacity: 0.55,
              padding: '3px 8px',
              borderRadius: 3,
              background: `${room.tone}22`,
            }}
          >
            Δ {room.metric.delta}
          </div>
        </div>

        {hovered && (
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 11,
              color: room.tone,
              opacity: 0.9,
            }}
          >
            进入 {room.visual} →
          </div>
        )}
      </div>
    </div>
  );
}

export default CEOHomePane;
