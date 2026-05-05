// Boardroom · ⑤ 反对论点演练
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html .reh-row block
// 数据: 默认 fixture; 点击"生成反方演练"触发 g3 LLM 任务，结果落 ceo_rebuttal_rehearsals

import { useEffect, useState } from 'react';
import { REBUTTALS, type RebuttalCard } from './_boardroomFixtures';
import { EnqueueRunButton } from '../../../shared/EnqueueRunButton';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface Props {
  rebuttals?: RebuttalCard[];
}

interface ApiRebuttal {
  id: string;
  attacker: string;
  attack_text: string;
  defense_text: string;
  strength_score: number;
}

export function RebuttalRehearsal({ rebuttals }: Props) {
  const forceMock = useForceMock();
  const [apiData, setApiData] = useState<ApiRebuttal[] | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch('/api/v1/ceo/boardroom/rebuttals')
      .then((r) => r.json())
      .then((d: { items: ApiRebuttal[] }) => {
        if (cancelled) return;
        if (d.items?.length > 0) setApiData(d.items.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [forceMock]);

  // forceMock=true → fixture; 否则只显示 API 数据 (空就空)
  const display = apiData
    ? apiData.map((r) => ({
        attacker: r.attacker,
        attack: r.attack_text,
        defense: r.defense_text,
        strength: Number(r.strength_score),
      }))
    : forceMock
    ? (rebuttals ?? REBUTTALS)
    : [];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'rgba(240,232,214,0.55)',
            letterSpacing: 0.3,
          }}
        >
          {apiData
            ? `LIVE · 共 ${apiData.length} 条`
            : forceMock
            ? 'FIXTURE · 演示数据'
            : '暂无反方演练'}
        </span>
        <EnqueueRunButton
          axis="boardroom-rebuttal"
          label="🎯 生成反方演练"
          productName="反方演练"
          tone="#D4A84B"
          metadata={{ source: 'boardroom-block-5' }}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
        }}
      >
      {display.map((r, i) => (
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
    </div>
  );
}
