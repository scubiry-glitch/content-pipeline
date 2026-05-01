// Compass · ③ 漂移雷达
// 来源: 07-archive/会议纪要 (20260501)/compass.html .drift-list block

import { DRIFT_CARDS, type DriftCard } from './_compassFixtures';

interface Props {
  cards?: DriftCard[];
}

export function DriftRadar({ cards = DRIFT_CARDS }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cards.map((c, i) => (
        <div
          key={i}
          style={{
            padding: '11px 13px',
            background: c.warn ? 'rgba(184,147,72,0.05)' : 'rgba(176,90,74,0.05)',
            border: '1px solid #D8CFBF',
            borderLeft: `3px solid ${c.warn ? '#B89348' : '#B05A4A'}`,
            borderRadius: '0 3px 3px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 5,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 13.5,
                color: '#1A2E3D',
              }}
            >
              {c.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: c.warn ? '#B89348' : '#B05A4A',
                fontWeight: 600,
              }}
            >
              {c.delta}
            </span>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'rgba(26,46,61,0.62)',
              lineHeight: 1.55,
            }}
          >
            {c.text}
          </div>
        </div>
      ))}
    </div>
  );
}
