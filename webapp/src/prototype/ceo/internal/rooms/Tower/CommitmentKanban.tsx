// Tower · ① 承诺看板 (4 列 kanban)
// 来源: 07-archive/会议纪要 (20260501)/tower.html .kanban-grid

import { KANBAN } from './_towerFixtures';

export function CommitmentKanban() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
      }}
    >
      {KANBAN.map((col) => (
        <div
          key={col.name}
          style={{
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(95,163,158,0.18)',
            borderTop: `2px solid ${col.tone}`,
            borderRadius: 4,
            padding: '12px 12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 8,
              borderBottom: `1px solid ${col.tone}30`,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: col.tone,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              {col.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: col.tone,
                fontWeight: 600,
              }}
            >
              {col.count}
            </span>
          </div>
          {col.cards.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                background: c.late
                  ? 'rgba(196,106,80,0.1)'
                  : c.warn
                  ? 'rgba(196,155,77,0.1)'
                  : c.done
                  ? 'rgba(95,163,158,0.06)'
                  : 'rgba(0,0,0,0.15)',
                border: `1px solid ${c.late ? 'rgba(196,106,80,0.4)' : c.warn ? 'rgba(196,155,77,0.4)' : 'rgba(95,163,158,0.18)'}`,
                borderRadius: 3,
                fontSize: 11.5,
                color: '#E8EFF2',
                opacity: c.done ? 0.65 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: 'rgba(232,239,242,0.55)',
                }}
              >
                <span>{c.from}</span>
                <span>{c.date}</span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 12.5,
                  marginBottom: 4,
                  lineHeight: 1.4,
                }}
              >
                {c.text}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: c.late ? '#FFB89A' : 'rgba(232,239,242,0.5)',
                  fontWeight: c.late ? 600 : 400,
                }}
              >
                {c.due}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
