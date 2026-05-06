// Situation 房间 · 各方 主壳 (navy + amber 主题)
// 来源: 07-archive/会议纪要 (20260501)/situation.html

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StakeholderHeatmap } from './StakeholderHeatmap';
import { SignalWall } from './SignalWall';
import { RubricMatrix } from './RubricMatrix';
import { BLINDSPOTS, HORIZON_TABS } from './_situationFixtures';
import { useGlobalScope, GlobalScopeFilter } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface DashboardData {
  metric: { label: string; value: string; delta: string };
  coverage: { covered: number; total: number; missing: string[] };
  signalCount: number;
}

// API /situation/blindspots 返回 {items: [{name, narrative, severity, suggested_action, ...}]}
// fixture BLINDSPOTS 是 {kind, text}. 适配字段.
interface BlindspotApi { name?: string; kind?: string; narrative?: string; text?: string; severity?: string; suggested_action?: string }
interface HorizonEvent { date: string; kind: string; title: string }
interface ObserverApi { id: string; observer: string; role: string; quote: string; tone?: string; captured_at?: string }

const HORIZON_TAB_TO_RANGE: Record<string, 'near' | 'mid' | 'far'> = {
  now: 'near',
  q3: 'mid',
  long: 'far',
};

export function Situation() {
  const navigate = useNavigate();
  const forceMock = useForceMock();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [blindspots, setBlindspots] = useState<BlindspotApi[] | null>(null);
  const [observers, setObservers] = useState<ObserverApi[] | null>(null);
  const [horizonEvents, setHorizonEvents] = useState<HorizonEvent[] | null>(null);
  const [horizon, setHorizon] = useState<string>(HORIZON_TABS[0].id);
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    const q = buildScopeQuery(scopeIds);
    Promise.all([
      fetch(`/api/v1/ceo/situation/dashboard${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/v1/ceo/situation/blindspots${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/v1/ceo/situation/observers${q}`).then((r) => r.json()).catch(() => null),
    ]).then(([d, b, o]) => {
      if (cancelled) return;
      if (d) setDash(d);
      if (b?.items) setBlindspots(b.items as BlindspotApi[]);
      if (o?.items) setObservers(o.items as ObserverApi[]);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  // 切换 horizon tab 时重新拉对应 range 的事件
  useEffect(() => {
    if (forceMock) return;
    const range = HORIZON_TAB_TO_RANGE[horizon] ?? 'near';
    let cancelled = false;
    const sep = scopeIds.length === 0 ? '?' : '&';
    fetch(`/api/v1/ceo/situation/horizon${buildScopeQuery(scopeIds)}${sep}range=${range}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setHorizonEvents((d?.events as HorizonEvent[]) ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock, horizon]);

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#0E1428',
        color: '#FDF3D4',
        fontFamily: 'var(--sans)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 36px',
          borderBottom: '1px solid rgba(255,200,87,0.18)',
          background: 'rgba(14,20,40,0.85)',
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
              border: '1.5px solid #FFC857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: 'rgba(255,200,87,0.05)',
              boxShadow: '0 0 18px rgba(255,200,87,0.2) inset',
            }}
          >
            🌐
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: 22,
                margin: 0,
                color: '#FDF3D4',
              }}
            >
              Situation
            </h1>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: '#FFC857',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              internal · 各方 · 时局图
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
            color: 'rgba(253,243,212,0.7)',
            padding: '0 30px',
          }}
        >
          "外部世界怎么看我?"
          {dash && (
            <span
              style={{
                marginLeft: 12,
                fontFamily: 'var(--mono)',
                fontStyle: 'normal',
                fontSize: 11,
                padding: '3px 9px',
                background: 'rgba(255,200,87,0.15)',
                borderRadius: 99,
                color: '#FFC857',
              }}
            >
              {dash.metric?.label ?? ''} {dash.metric?.value ?? ''}
              {dash.metric?.delta && dash.metric.delta !== '齐' && ` · ${dash.metric.delta}`}
            </span>
          )}
        </div>

        <button
          onClick={() => navigate('/ceo/internal/ceo')}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(253,243,212,0.7)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid rgba(255,200,87,0.4)',
            borderRadius: 3,
            background: 'rgba(255,200,87,0.05)',
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
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          padding: '24px 36px 50px',
          maxWidth: 1480,
          margin: '0 auto',
        }}
      >
        <Block num="① stakeholder heat" title="利益相关方热力图 · 谁在升温" meta="滚动 30 天 · 6 类" spanFull>
          <StakeholderHeatmap />
        </Block>

        <Block num="② signal wall" title="外部信号墙" meta={`7 天 · ${dash?.signalCount ?? 8} 条`}>
          <SignalWall />
        </Block>

        <Block num="③ rubric matrix" title="Rubric 矩阵 · 各方对你的评分" meta="5 维 × 6 类利益方">
          <RubricMatrix />
        </Block>

        <Block num="④ blindspot alarms" title="盲点警报" meta={`自动检测 · ${forceMock ? BLINDSPOTS.length : (blindspots?.length ?? 0)} 条`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(forceMock ? BLINDSPOTS : (blindspots ?? [])).map((b: any, i) => {
              // API 字段 {name, narrative, severity, suggested_action}; fixture {kind, text}
              const head = String(b.kind ?? b.name ?? '');
              const body = String(b.text ?? b.narrative ?? '');
              const action = String(b.suggested_action ?? '');
              return (
                <div key={i} style={{ padding: '10px 12px', background: 'rgba(196,106,80,0.08)', border: '1px solid rgba(196,106,80,0.3)', borderLeft: '3px solid #C46A50', borderRadius: '0 3px 3px 0' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#FFB89A', marginBottom: 4, letterSpacing: 0.2 }}>
                    ⚠️ {head}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(253,243,212,0.85)', lineHeight: 1.5 }}>
                    {body}
                  </div>
                  {action && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,184,154,0.7)', marginTop: 6, fontStyle: 'italic' }}>
                      → {action}
                    </div>
                  )}
                </div>
              );
            })}
            {!forceMock && (!blindspots || blindspots.length === 0) && (
              <div style={{ padding: '12px', fontSize: 12, color: 'rgba(253,243,212,0.45)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
                暂无触发盲点 — coverage 完整、单点依赖低、判断量充足。
              </div>
            )}
          </div>
        </Block>

        <Block num="⑤ outside observer" title="外脑视角 · 一句话" meta={`${forceMock ? '示例' : `${observers?.length ?? 0} 条`}`}>
          {forceMock ? (
            <Placeholder>
              从外部观察者视角生成的一句话总结，每 3 周由 g4 跨会 LLM 任务自动产出。
              示例："你正在从'好基金'变成'流程严谨的基金' — 可能是好事，但 LP 还没收到信号。"
            </Placeholder>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(observers ?? []).map((o) => (
                <div key={o.id} style={{ padding: '10px 12px', background: 'rgba(102,121,181,0.05)', border: '1px solid rgba(102,121,181,0.25)', borderLeft: '3px solid rgba(102,121,181,0.6)', borderRadius: '0 3px 3px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#8B9BC8', fontWeight: 600 }}>
                      {o.observer} · {o.role}
                    </span>
                    {o.captured_at && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(253,243,212,0.4)' }}>
                        {String(o.captured_at).slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'rgba(253,243,212,0.85)', lineHeight: 1.5 }}>
                    "{o.quote}"
                  </div>
                </div>
              ))}
              {(!observers || observers.length === 0) && (
                <div style={{ padding: '12px', fontSize: 12, color: 'rgba(253,243,212,0.45)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
                  暂无外脑视角 — 等待 raised_count ≥2 的董事关切积累。
                </div>
              )}
            </div>
          )}
        </Block>

        <Block num="⑥ horizon" title="视野时序" meta="本周 / Q3 / 长尾" spanFull>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {HORIZON_TABS.map((t) => {
              const active = horizon === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setHorizon(t.id)}
                  style={{
                    padding: '6px 14px',
                    border: `1px solid ${active ? '#FFC857' : 'rgba(255,200,87,0.2)'}`,
                    background: active ? 'rgba(255,200,87,0.12)' : 'transparent',
                    color: active ? '#FFC857' : 'rgba(253,243,212,0.6)',
                    fontFamily: 'var(--serif)',
                    fontStyle: active ? 'normal' : 'italic',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(() => {
              if (forceMock) {
                const items = HORIZON_TABS.find((t) => t.id === horizon)?.items ?? [];
                return items.map((it, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,200,87,0.05)', borderLeft: '2px solid rgba(255,200,87,0.4)', fontSize: 12.5, color: 'rgba(253,243,212,0.85)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
                    {it}
                  </div>
                ));
              }
              if (!horizonEvents || horizonEvents.length === 0) {
                return (
                  <div style={{ padding: '12px', fontSize: 12, color: 'rgba(253,243,212,0.5)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
                    暂无 {horizon === 'now' ? '本周' : horizon === 'q3' ? '近 30 天' : '90 天内'} 事件
                  </div>
                );
              }
              return horizonEvents.map((e, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,200,87,0.05)', borderLeft: '2px solid rgba(255,200,87,0.4)', fontSize: 12.5, color: 'rgba(253,243,212,0.85)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,200,87,0.7)', marginRight: 8 }}>
                    {(e.date ?? '').slice(0, 10)} · {e.kind}
                  </span>
                  {e.title}
                </div>
              ));
            })()}
          </div>
        </Block>
      </main>
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
        border: '1px solid rgba(255,200,87,0.18)',
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
          borderBottom: '1px solid rgba(255,200,87,0.18)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#FFC857',
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
            color: '#FDF3D4',
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
              color: 'rgba(253,243,212,0.4)',
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
        background: 'rgba(255,200,87,0.05)',
        border: '1px dashed rgba(255,200,87,0.3)',
        borderRadius: 4,
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 13,
        color: 'rgba(253,243,212,0.6)',
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

export default Situation;
