// Boardroom · ① 董事关切雷达
// 5 维雷达 SVG (退出路径 / 基金节奏 / 人才流失 / 合规风险 / LP 关系)
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html .radar block

import { useEffect, useMemo, useState } from 'react';
import { DIRECTOR_CARDS, type DirectorCard } from './_boardroomFixtures';
import { useForceMock } from '../../../../meeting/_mockToggle';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';

interface ApiConcern {
  id: string;
  director_id: string;
  director_name: string | null;
  director_role: string | null;
  topic: string;
  status: string;
  raised_count: number;
  raised_at: string | null;
}

interface Props {
  cards?: DirectorCard[];
}

/** 把 N 条 concerns 按 director 聚合, 取每位 director 最热那条作为代表 */
function adaptToCards(items: ApiConcern[]): DirectorCard[] {
  const byDir = new Map<string, ApiConcern[]>();
  for (const c of items) {
    const arr = byDir.get(c.director_id) ?? [];
    arr.push(c);
    byDir.set(c.director_id, arr);
  }
  const cards: DirectorCard[] = [];
  for (const arr of byDir.values()) {
    arr.sort((a, b) => (b.raised_count ?? 0) - (a.raised_count ?? 0));
    const top = arr[0];
    if (!top) continue;
    const totalRaised = arr.reduce((sum, c) => sum + (c.raised_count ?? 1), 0);
    const isPending = arr.some((c) => c.status === 'pending');
    const isResolved = arr.every((c) => c.status === 'resolved');
    cards.push({
      name: top.director_name ?? '?',
      role: top.director_role ?? '',
      count: `${totalRaised} 次${isPending ? ' · 未回应' : isResolved ? ' · 已闭环' : ''}`,
      text: top.topic,
      warn: isPending && totalRaised >= 2,
      calm: isResolved,
    });
  }
  cards.sort((a, b) => (b.warn ? 1 : 0) - (a.warn ? 1 : 0));
  return cards.slice(0, 6);
}

export function ConcernsRadar({ cards: propCards }: Props) {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [items, setItems] = useState<ApiConcern[] | null>(null);

  useEffect(() => {
    if (forceMock) return;
    if (propCards && propCards.length > 0) return;   // 父组件已传, 不再 fetch
    let cancelled = false;
    fetch(`/api/v1/ceo/boardroom/concerns${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setItems((d?.items as ApiConcern[]) ?? []); })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock, propCards]);

  const cards = useMemo<DirectorCard[]>(() => {
    if (propCards && propCards.length > 0) return propCards;
    if (forceMock) return DIRECTOR_CARDS;
    if (!items) return DIRECTOR_CARDS; // 加载中, 临时显示 fixture 占位
    if (items.length === 0) return [];
    return adaptToCards(items);
  }, [propCards, forceMock, items]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
      <div style={{ width: 320, height: 280 }}>
        <svg viewBox="0 0 320 280" style={{ width: '100%', height: '100%' }}>
          <g transform="translate(160 140)">
            <circle r="100" fill="none" stroke="rgba(212,168,75,0.15)" strokeWidth="0.8" />
            <circle r="70" fill="none" stroke="rgba(212,168,75,0.12)" strokeWidth="0.8" />
            <circle r="40" fill="none" stroke="rgba(212,168,75,0.1)" strokeWidth="0.8" />
            <g stroke="rgba(212,168,75,0.18)" strokeWidth="0.8">
              <line x1="0" y1="0" x2="0" y2="-100" />
              <line x1="0" y1="0" x2="95" y2="-31" />
              <line x1="0" y1="0" x2="59" y2="81" />
              <line x1="0" y1="0" x2="-59" y2="81" />
              <line x1="0" y1="0" x2="-95" y2="-31" />
            </g>
            <polygon
              points="0,-90 76,-25 35,48 -47,65 -85,-28"
              fill="rgba(212,168,75,0.18)"
              stroke="#D4A84B"
              strokeWidth="1.5"
            />
            <g fill="#D4A84B">
              <circle cx="0" cy="-90" r="3.5" />
              <circle cx="76" cy="-25" r="3.5" />
              <circle cx="35" cy="48" r="3.5" />
              <circle cx="-47" cy="65" r="3.5" />
              <circle cx="-85" cy="-28" r="3.5" />
            </g>
            <polygon
              points="0,-65 60,-20 30,42 -38,52 -65,-22"
              fill="none"
              stroke="rgba(140,130,117,0.6)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <g
              fontFamily="var(--mono)"
              fontSize="9"
              fill="rgba(240,232,214,0.7)"
              letterSpacing="0.1em"
            >
              <text x="0" y="-110" textAnchor="middle">退出路径</text>
              <text x="105" y="-30" textAnchor="start">基金节奏</text>
              <text x="42" y="68" textAnchor="start">人才流失</text>
              <text x="-50" y="82" textAnchor="end">合规风险</text>
              <text x="-105" y="-30" textAnchor="end">LP 关系</text>
            </g>
            <circle r="2" fill="#D4A84B" />
          </g>
          <g
            fontFamily="var(--mono)"
            fontSize="8"
            fill="rgba(240,232,214,0.42)"
            letterSpacing="0.1em"
          >
            <line x1="20" y1="265" x2="40" y2="265" stroke="#D4A84B" strokeWidth="1.5" />
            <text x="46" y="268">本季</text>
            <line
              x1="100" y1="265" x2="120" y2="265"
              stroke="rgba(140,130,117,0.6)" strokeWidth="1" strokeDasharray="3 3"
            />
            <text x="126" y="268">上季</text>
          </g>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.map((d, i) => (
          <div
            key={i}
            style={{
              padding: '10px 12px',
              background: d.warn
                ? 'rgba(212,168,75,0.08)'
                : d.calm
                ? 'rgba(140,130,117,0.05)'
                : 'rgba(0,0,0,0.15)',
              border: d.warn ? '1px solid rgba(212,168,75,0.4)' : '1px solid rgba(140,130,117,0.2)',
              borderLeft: d.warn ? '3px solid #D4A84B' : '3px solid rgba(140,130,117,0.4)',
              borderRadius: '0 3px 3px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 4,
              }}
            >
              <span style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: '#F0E8D6' }}>
                <b>{d.name}</b>
                <span style={{ opacity: 0.6, marginLeft: 6 }}>· {d.role}</span>
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: d.warn ? '#D4A84B' : 'rgba(240,232,214,0.55)',
                }}
              >
                {d.count}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(240,232,214,0.75)',
                lineHeight: 1.55,
                fontStyle: 'italic',
              }}
            >
              {d.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
