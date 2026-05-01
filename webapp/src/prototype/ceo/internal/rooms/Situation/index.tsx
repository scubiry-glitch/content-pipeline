// Situation 房间 · 各方 主壳 (navy + amber 主题)
// 来源: 07-archive/会议纪要 (20260501)/situation.html

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StakeholderHeatmap } from './StakeholderHeatmap';
import { SignalWall } from './SignalWall';
import { RubricMatrix } from './RubricMatrix';
import { BLINDSPOTS, HORIZON_TABS } from './_situationFixtures';

interface DashboardData {
  metric: { label: string; value: string; delta: string };
  coverage: { covered: number; total: number; missing: string[] };
  signalCount: number;
}

export function Situation() {
  const navigate = useNavigate();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [horizon, setHorizon] = useState<string>(HORIZON_TABS[0].id);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ceo/situation/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDash(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
              {dash.metric.label} {dash.metric.value}
              {dash.metric.delta && dash.metric.delta !== '齐' && ` · ${dash.metric.delta}`}
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

        <Block num="④ blindspot alarms" title="盲点警报" meta="自动检测">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BLINDSPOTS.map((b, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 12px',
                  background: 'rgba(196,106,80,0.08)',
                  border: '1px solid rgba(196,106,80,0.3)',
                  borderLeft: '3px solid #C46A50',
                  borderRadius: '0 3px 3px 0',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: '#FFB89A',
                    marginBottom: 4,
                    letterSpacing: 0.2,
                  }}
                >
                  {b.kind}
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(253,243,212,0.85)', lineHeight: 1.5 }}>
                  {b.text}
                </div>
              </div>
            ))}
          </div>
        </Block>

        <Block num="⑤ outside observer" title="外脑视角 · 一句话" meta="LLM 三周轮换 (PR12)">
          <Placeholder>
            从外部观察者视角生成的一句话总结，每 3 周由 g4 跨会 LLM 任务自动产出。
            示例："你正在从'好基金'变成'流程严谨的基金' — 可能是好事，但 LP 还没收到信号。"
          </Placeholder>
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
            {(HORIZON_TABS.find((t) => t.id === horizon)?.items ?? []).map((it, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(255,200,87,0.05)',
                  borderLeft: '2px solid rgba(255,200,87,0.4)',
                  fontSize: 12.5,
                  color: 'rgba(253,243,212,0.85)',
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                }}
              >
                {it}
              </div>
            ))}
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
