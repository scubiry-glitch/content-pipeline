// Situation · ② 外部信号墙
// 来源: 07-archive/会议纪要 (20260501)/situation.html .signal-wall

import { SIGNALS, type SignalCard } from './_situationFixtures';

const TONE_STYLES: Record<SignalCard['tone'], { bg: string; border: string; ink: string }> = {
  pos: { bg: 'rgba(95,163,158,0.08)', border: 'rgba(95,163,158,0.4)', ink: '#A5DDD7' },
  neg: { bg: 'rgba(196,106,80,0.08)', border: 'rgba(196,106,80,0.4)', ink: '#FFB89A' },
  warn: { bg: 'rgba(196,155,77,0.08)', border: 'rgba(196,155,77,0.4)', ink: '#FFE7BA' },
  neutral: { bg: 'rgba(102,121,181,0.05)', border: 'rgba(102,121,181,0.25)', ink: 'rgba(253,243,212,0.65)' },
};

export function SignalWall() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
      }}
    >
      {SIGNALS.map((s, i) => {
        const t = TONE_STYLES[s.tone];
        return (
          <div
            key={i}
            style={{
              padding: '10px 12px',
              background: t.bg,
              border: `1px solid ${t.border}`,
              borderLeft: `3px solid ${t.ink}`,
              borderRadius: '0 3px 3px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: 'rgba(253,243,212,0.55)',
                marginBottom: 4,
              }}
            >
              <span style={{ color: t.ink, fontWeight: 600 }}>{s.source}</span>
              <span>{s.date}</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 12.5,
                color: '#FDF3D4',
                lineHeight: 1.5,
                marginBottom: 4,
              }}
            >
              {s.text}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: 'rgba(253,243,212,0.55)',
              }}
            >
              {s.tag} · <span style={{ color: t.ink }}>→ {s.impact}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
