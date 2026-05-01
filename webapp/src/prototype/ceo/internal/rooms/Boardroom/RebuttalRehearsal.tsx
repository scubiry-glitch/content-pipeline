// Boardroom · ⑤ 反对论点演练
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html .reh-row block
// PR12 接 LLM 后由 g3 任务自动生成填充 ceo_rebuttal_rehearsals

import { REBUTTALS, type RebuttalCard } from './_boardroomFixtures';

interface Props {
  rebuttals?: RebuttalCard[];
}

export function RebuttalRehearsal({ rebuttals = REBUTTALS }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
      }}
    >
      {rebuttals.map((r, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(168,69,30,0.08)',
            border: '1px solid rgba(168,69,30,0.3)',
            borderRadius: 4,
            padding: '14px 16px',
            color: '#F0E8D6',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: '#FFB89A',
              letterSpacing: 0.3,
              marginBottom: 8,
            }}
          >
            → {r.attacker}
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 13,
              lineHeight: 1.55,
              marginBottom: 12,
              color: '#FFCFB7',
            }}
          >
            "{r.attack}"
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'rgba(212,168,75,0.85)',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            ↳ 你的回防
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: 'rgba(240,232,214,0.85)',
              marginBottom: 14,
            }}
          >
            {r.defense}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(240,232,214,0.55)',
            }}
          >
            回防强度
            <div
              style={{
                flex: 1,
                height: 5,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 99,
                overflow: 'hidden',
              }}
            >
              <i
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.round(r.strength * 100)}%`,
                  background: r.strength >= 0.7 ? '#6A9A5C' : r.strength >= 0.55 ? '#D4A84B' : '#B05A4A',
                }}
              />
            </div>
            <span style={{ color: '#F0E8D6', fontWeight: 600 }}>{r.strength.toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
