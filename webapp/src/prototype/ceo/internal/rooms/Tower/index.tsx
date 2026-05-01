// Tower 房间 · 协调 主壳
// 6 个 block (深绿色主题)
// 来源: 07-archive/会议纪要 (20260501)/tower.html

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommitmentKanban } from './CommitmentKanban';
import { RhythmPulse } from './RhythmPulse';
import { DeficitAlert } from './DeficitAlert';
import { RhythmsTabs } from './RhythmsTabs';
import { BLOCKERS, POST_MEETING } from './_towerFixtures';
import { useGlobalScope, GlobalScopeFilter } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';

interface DashboardData {
  metric: { label: string; value: string; delta: string };
  responsibilityClarity: number;
  topBlockers: Array<{ name: string; days: number; text: string; warn: boolean }>;
}

export function Tower() {
  const navigate = useNavigate();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/ceo/tower/dashboard${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDash(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#0A1410',
        color: '#E8EFF2',
        position: 'relative',
        fontFamily: 'var(--sans)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 36px',
          borderBottom: '1px solid rgba(95,163,158,0.2)',
          background: 'rgba(10,20,16,0.85)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '1.5px solid #5FA39E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: 'rgba(95,163,158,0.06)',
              boxShadow: '0 0 18px rgba(95,163,158,0.2) inset',
            }}
          >
            🎯
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: 22,
                margin: 0,
                color: '#E8EFF2',
              }}
            >
              Tower
            </h1>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: '#5FA39E',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              internal · 协调 · 塔
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 14.5,
            color: 'rgba(232,239,242,0.7)',
            padding: '0 30px',
          }}
        >
          "谁欠谁什么? 卡在哪?"
          {dash && (
            <span
              style={{
                marginLeft: 12,
                fontFamily: 'var(--mono)',
                fontStyle: 'normal',
                fontSize: 11,
                padding: '3px 9px',
                background: 'rgba(95,163,158,0.18)',
                borderRadius: 99,
                color: '#5FA39E',
              }}
            >
              {dash.metric?.label ?? ''} {dash.metric?.value ?? ''}
            </span>
          )}
        </div>

        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(232,239,242,0.7)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid rgba(95,163,158,0.4)',
            borderRadius: 3,
            background: 'rgba(95,163,158,0.05)',
            cursor: 'pointer',
          }}
        >
          ← 回到 CEO 主页
        </button>
      </header>

      <GlobalScopeFilter />

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 20,
          padding: '24px 36px 50px',
          maxWidth: 1480,
          margin: '0 auto',
        }}
      >
        <Block num="① commitment kanban" title="承诺看板 · 谁欠谁什么" meta="从会议自动抽取 · 21 项" spanFull>
          <CommitmentKanban />
        </Block>

        <Block num="② blocker radar" title="卡点雷达 · 超期/无人接" meta={`${(dash?.topBlockers.length ?? BLOCKERS.length)} 个红点`}>
          <BlockerList items={dash?.topBlockers ?? BLOCKERS.map((b) => ({ name: b.name, days: parseInt(b.days), text: b.text, warn: !!b.warn }))} />
        </Block>

        <Block num="③ post-meeting card" title="会后 10 分钟卡 · 上次未关闭项" meta={POST_MEETING.title}>
          <PostMeetingCard />
        </Block>

        <Block num="④ rhythm pulse" title="节奏脉搏 · 这周对吗" meta="滚动 8 周">
          <RhythmPulse />
        </Block>

        <Block num="⑤ deficit alert" title="透支预警 · 个人精力预算" meta="本周 · 实测">
          <DeficitAlert />
        </Block>

        <Block num="⑥ rhythms" title="节奏视图" meta="团队 / 个人 双 tab" spanFull>
          <RhythmsTabs />
        </Block>
      </main>
    </div>
  );
}

function BlockerList({ items }: { items: Array<{ name: string; days: number; text: string; warn: boolean }> }) {
  if (items.length === 0) {
    return (
      <Placeholder>
        当前无超期卡点。承诺均在掌控中。
      </Placeholder>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((b, i) => (
        <div
          key={i}
          style={{
            padding: '10px 12px',
            background: b.warn ? 'rgba(196,155,77,0.08)' : 'rgba(196,106,80,0.08)',
            border: `1px solid ${b.warn ? 'rgba(196,155,77,0.4)' : 'rgba(196,106,80,0.4)'}`,
            borderLeft: `3px solid ${b.warn ? '#C49B4D' : '#C46A50'}`,
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
            <span style={{ fontFamily: 'var(--serif)', fontSize: 13, color: '#E8EFF2', fontStyle: 'italic' }}>
              {b.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: b.warn ? '#FFD9A0' : '#FFB89A',
                fontWeight: 600,
              }}
            >
              {b.days} 天
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(232,239,242,0.7)', lineHeight: 1.55 }}>{b.text}</div>
        </div>
      ))}
    </div>
  );
}

function PostMeetingCard() {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(232,239,242,0.5)',
          padding: '6px 0',
          borderBottom: '1px solid rgba(95,163,158,0.18)',
          marginBottom: 10,
        }}
      >
        <span>
          <b style={{ color: '#5FA39E' }}>{POST_MEETING.title}</b> · {POST_MEETING.date} · {POST_MEETING.duration}
        </span>
        <span>{POST_MEETING.meta}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {POST_MEETING.items.map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '6px 0',
              fontSize: 12.5,
              color: 'rgba(232,239,242,0.85)',
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                marginTop: 3,
                borderRadius: 3,
                border: it.due ? '1.5px solid #C49B4D' : '1.5px solid rgba(95,163,158,0.4)',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, lineHeight: 1.5 }}>
              {it.text}
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: it.due ? '#C49B4D' : 'rgba(232,239,242,0.5)',
                  marginTop: 2,
                  letterSpacing: 0.2,
                }}
              >
                {it.who}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BlockProps {
  num: string;
  title: string;
  meta?: string;
  spanFull?: boolean;
  children: React.ReactNode;
}

function Block({ num, title, meta, spanFull, children }: BlockProps) {
  return (
    <section
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(95,163,158,0.18)',
        borderRadius: 4,
        padding: '22px 24px',
        gridColumn: spanFull ? '1 / -1' : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: '1px solid rgba(95,163,158,0.18)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#5FA39E',
            textTransform: 'uppercase',
          }}
        >
          {num}
        </span>
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 18,
            fontWeight: 600,
            color: '#E8EFF2',
            flex: 1,
          }}
        >
          {title}
        </span>
        {meta && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(232,239,242,0.4)',
              letterSpacing: '0.1em',
            }}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '20px 18px',
        background: 'rgba(95,163,158,0.05)',
        border: '1px dashed rgba(95,163,158,0.3)',
        borderRadius: 4,
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 13,
        color: 'rgba(232,239,242,0.6)',
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

export default Tower;
