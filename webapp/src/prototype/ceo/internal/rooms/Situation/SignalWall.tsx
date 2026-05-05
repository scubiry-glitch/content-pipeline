// Situation · ② 外部信号墙
// 数据源: /api/v1/ceo/situation/signals → items: [{stakeholder_name, signal_text, sentiment, captured_at, kind}]
// fallback: forceMock=true 或 API 空时, 用 _situationFixtures.SIGNALS

import { useEffect, useMemo, useState } from 'react';
import { SIGNALS, type SignalCard } from './_situationFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface ApiSignal {
  id: string;
  stakeholder_id: string | null;
  stakeholder_name: string | null;
  kind: string | null;
  signal_text: string;
  sentiment: string | null;       // positive | negative | neutral | urgent | ...
  captured_at: string;            // ISO
  source_url?: string | null;
}

const TONE_STYLES: Record<SignalCard['tone'], { bg: string; border: string; ink: string }> = {
  pos: { bg: 'rgba(95,163,158,0.08)', border: 'rgba(95,163,158,0.4)', ink: '#A5DDD7' },
  neg: { bg: 'rgba(196,106,80,0.08)', border: 'rgba(196,106,80,0.4)', ink: '#FFB89A' },
  warn: { bg: 'rgba(196,155,77,0.08)', border: 'rgba(196,155,77,0.4)', ink: '#FFE7BA' },
  neutral: { bg: 'rgba(102,121,181,0.05)', border: 'rgba(102,121,181,0.25)', ink: 'rgba(253,243,212,0.65)' },
};

function sentimentToTone(s: string | null): SignalCard['tone'] {
  const v = (s ?? '').toLowerCase();
  if (v.includes('pos') || v === 'positive')    return 'pos';
  if (v.includes('neg') || v === 'negative')    return 'neg';
  if (v.includes('urgent') || v === 'warn' || v === 'warning') return 'warn';
  return 'neutral';
}

function adapt(items: ApiSignal[]): SignalCard[] {
  return items.map((s) => ({
    source: s.stakeholder_name ?? '匿名信号',
    date: s.captured_at?.slice(5, 10) ?? '?',
    text: s.signal_text,
    tag: s.kind ?? '?',
    impact: '',
    tone: sentimentToTone(s.sentiment),
  }));
}

export function SignalWall() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [items, setItems] = useState<ApiSignal[] | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/situation/signals${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setItems((d?.items as ApiSignal[]) ?? []); })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const cards = useMemo(() => {
    if (forceMock || !items) return SIGNALS;
    if (items.length === 0) return SIGNALS;
    return adapt(items);
  }, [forceMock, items]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
      }}
    >
      {cards.map((s, i) => {
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
              {s.tag}{s.impact ? ` · ` : ''}{s.impact && (<span style={{ color: t.ink }}>→ {s.impact}</span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
