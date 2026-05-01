// Brain · 通用摘要房间 (Content Library / Expert Library / Assets / Hot Topics 共用)
// 不重复复杂功能，只做摘要 + 深链跳现有页

import { useNavigate } from 'react-router-dom';

export interface SummaryCardConfig {
  title: string;
  subtitle: string;
  bullets: string[];
  link: { label: string; to: string };
  color: string;
}

interface Props {
  intro: string;
  cards: SummaryCardConfig[];
}

export function SummaryRoom({ intro, cards }: Props) {
  const navigate = useNavigate();
  return (
    <div>
      <p
        style={{
          fontSize: 13,
          color: 'rgba(232,227,216,0.7)',
          lineHeight: 1.7,
          fontStyle: 'italic',
          fontFamily: 'var(--serif)',
          marginBottom: 18,
          maxWidth: 820,
        }}
      >
        {intro}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              padding: '18px 20px',
              background: 'rgba(217,184,142,0.04)',
              border: '1px solid rgba(217,184,142,0.18)',
              borderLeft: `3px solid ${c.color}`,
              borderRadius: '0 6px 6px 0',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: c.color,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              {c.subtitle}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 17,
                fontWeight: 600,
                color: '#F3ECDD',
                margin: '4px 0 12px',
              }}
            >
              {c.title}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'rgba(232,227,216,0.7)', lineHeight: 1.7 }}>
              {c.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
            <button
              onClick={() => navigate(c.link.to)}
              style={{
                marginTop: 12,
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 12,
                color: c.color,
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              {c.link.label} →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SummaryRoom;
