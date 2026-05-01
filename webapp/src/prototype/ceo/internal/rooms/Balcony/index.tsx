// Balcony 房间 · 个人 主壳
// hero (云月远山动画) + 3 reflection cards + 抽屉 (六棱镜+时间ROI+节奏+沉默+回声+承诺)
// 来源: 07-archive/会议纪要 (20260501)/balcony.html

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  REFLECTIONS,
  PRISM_POINTS,
  BALCONY_RHYTHM,
  SILENCE_CARDS,
  ECHOS,
  SELF_PROMISES,
  TIME_ROI,
} from './_balconyFixtures';

interface DashboardData {
  metric: { label: string; value: string; delta: string };
  weeklyRoi: number;
  weakest: { prism: string; score: number };
  strongest: { prism: string; score: number };
}

export function Balcony() {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dash, setDash] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ceo/balcony/dashboard')
      .then((r) => r.json())
      .then((d) => !cancelled && setDash(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0F0E15 0%, #1A1822 50%, #0F0E15 100%)',
        color: '#E8DCC4',
        position: 'relative',
        fontFamily: 'var(--sans)',
        overflow: drawerOpen ? 'hidden' : 'auto',
      }}
    >
      {/* 月光晕 */}
      <div
        style={{
          position: 'fixed',
          top: 60,
          right: 80,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(217,184,142,0.3) 0%, transparent 70%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }}
      />
      {/* 远山 */}
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        style={{
          position: 'fixed',
          bottom: drawerOpen ? 280 : 0,
          left: 0,
          right: 0,
          height: 200,
          opacity: 0.25,
          pointerEvents: 'none',
          transition: 'bottom 400ms ease',
        }}
      >
        <path d="M 0 180 Q 200 100 400 140 T 800 110 T 1200 130 L 1200 200 L 0 200 Z" fill="#D9B88E" />
        <path d="M 0 200 Q 300 150 600 180 T 1200 170 L 1200 200 L 0 200 Z" fill="#9A856B" />
      </svg>

      <button
        onClick={() => navigate('/ceo/internal/ceo')}
        style={{
          position: 'absolute',
          top: 24,
          left: 36,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          color: 'rgba(232,220,196,0.65)',
          textTransform: 'uppercase',
          padding: '6px 14px',
          border: '1px solid rgba(217,184,142,0.3)',
          borderRadius: 3,
          background: 'rgba(217,184,142,0.05)',
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        ← 回到 CEO 主页
      </button>

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '80px 36px 200px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.3em',
            color: '#D9B88E',
            textTransform: 'uppercase',
            opacity: 0.7,
          }}
        >
          周日 · {new Date().toISOString().slice(0, 10)} · 21:47
        </div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 38,
            margin: '14px 0 14px',
            color: '#E8DCC4',
            letterSpacing: '-0.015em',
          }}
        >
          这一周,你 <em style={{ color: '#D9B88E' }}>走到了</em> 哪里?
        </h1>
        <p
          style={{
            color: 'rgba(232,220,196,0.55)',
            fontSize: 14,
            lineHeight: 1.7,
            fontStyle: 'italic',
            marginBottom: 40,
          }}
        >
          从 12 场会议里抽出的三个问题
          <br />
          不必回答,只需坐下来和它们共处片刻
        </p>

        {dash && (
          <div
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              background: 'rgba(217,184,142,0.1)',
              border: '1px solid rgba(217,184,142,0.3)',
              borderRadius: 99,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: '#D9B88E',
              marginBottom: 32,
            }}
          >
            {dash.metric.label} {dash.metric.value} · 最弱 {dash.weakest.prism} · 最强 {dash.strongest.prism}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'left' }}>
          {REFLECTIONS.map((r, i) => (
            <div
              key={i}
              style={{
                padding: '20px 24px',
                background: 'rgba(217,184,142,0.04)',
                border: '1px solid rgba(217,184,142,0.18)',
                borderLeft: '2px solid #D9B88E',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: '#D9B88E',
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  opacity: 0.8,
                  marginBottom: 6,
                }}
              >
                {r.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 18,
                  color: '#E8DCC4',
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
                dangerouslySetInnerHTML={{
                  __html: r.question.replace(/<em>(.+?)<\/em>/g, '<em style="color:#D9B88E;font-style:italic;">$1</em>'),
                }}
              />
              <div
                style={{
                  fontSize: 13,
                  color: 'rgba(232,220,196,0.7)',
                  lineHeight: 1.7,
                }}
              >
                {r.prompt}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center', gap: 12 }}>
          <button
            style={{
              padding: '10px 22px',
              border: '1px solid #D9B88E',
              background: 'rgba(217,184,142,0.06)',
              color: '#D9B88E',
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 13,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            记下一段
          </button>
          <button
            style={{
              padding: '10px 22px',
              border: '1px solid rgba(232,220,196,0.3)',
              background: 'transparent',
              color: 'rgba(232,220,196,0.6)',
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 13,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            先跳过
          </button>
        </div>
      </main>

      {/* 抽屉触发 */}
      <button
        onClick={() => setDrawerOpen(!drawerOpen)}
        style={{
          position: 'fixed',
          bottom: drawerOpen ? 'calc(100% - 70px)' : 0,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 28px',
          background: '#0F0E15',
          color: '#D9B88E',
          border: '1px solid rgba(217,184,142,0.3)',
          borderBottom: drawerOpen ? '1px solid rgba(217,184,142,0.3)' : 'none',
          borderRadius: '6px 6px 0 0',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.15em',
          cursor: 'pointer',
          zIndex: 99,
          transition: 'bottom 400ms ease',
        }}
      >
        数据底 · 这一周的痕迹 {drawerOpen ? '▼' : '▲'}
      </button>

      {/* 抽屉 */}
      {drawerOpen && (
        <aside
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '70vh',
            background: '#0A0912',
            borderTop: '1px solid rgba(217,184,142,0.3)',
            padding: '24px 36px 36px',
            overflowY: 'auto',
            zIndex: 98,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 14,
              color: 'rgba(232,220,196,0.6)',
              textAlign: 'center',
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            月亮是 <em style={{ color: '#D9B88E' }}>正面</em>,数据是 <em style={{ color: '#D9B88E' }}>背面</em>。
            <br />
            这周你走过的脚印,留在六处。
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              maxWidth: 1200,
              margin: '0 auto',
            }}
          >
            <DBlock num="① prism" title="六棱镜指标">
              <PrismRadar />
            </DBlock>
            <DBlock num="② time roi" title="时间 ROI">
              <RoiGauge />
            </DBlock>
            <DBlock num="③ balcony rhythm" title="阳台时光节奏">
              <BalconyRhythm />
            </DBlock>
            <DBlock num="④ silence ratio" title="沉默 vs 发言">
              <SilenceRow />
            </DBlock>
            <DBlock num="⑤ echo" title="决策回声轨迹">
              <EchoList />
            </DBlock>
            <DBlock num="⑥ self promises" title="自我承诺 vs 兑现">
              <SelfPromiseList />
            </DBlock>
          </div>
        </aside>
      )}
    </div>
  );
}

function DBlock({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(217,184,142,0.04)',
        border: '1px solid rgba(217,184,142,0.18)',
        borderRadius: 4,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          paddingBottom: 8,
          borderBottom: '1px solid rgba(217,184,142,0.15)',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: '#D9B88E',
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          {num}
        </span>
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 14,
            color: '#E8DCC4',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function PrismRadar() {
  const polyPoints = PRISM_POINTS.map((p) => `${p.cx},${p.cy}`).join(' ');
  const weakest = [...PRISM_POINTS].sort((a, b) => a.score - b.score)[0];
  const strongest = [...PRISM_POINTS].sort((a, b) => b.score - a.score)[0];
  return (
    <div>
      <svg viewBox="0 0 240 200" style={{ width: '100%', height: 180 }}>
        <g transform="translate(120 100)">
          <circle r="80" fill="none" stroke="rgba(232,220,196,0.1)" strokeWidth="0.6" />
          <circle r="55" fill="none" stroke="rgba(232,220,196,0.08)" strokeWidth="0.6" />
          <circle r="30" fill="none" stroke="rgba(232,220,196,0.06)" strokeWidth="0.6" />
          <g stroke="rgba(232,220,196,0.12)" strokeWidth="0.6">
            <line x1="0" y1="-80" x2="0" y2="80" />
            <line x1="-69" y1="-40" x2="69" y2="40" />
            <line x1="-69" y1="40" x2="69" y2="-40" />
          </g>
          <polygon points={polyPoints} fill="rgba(217,184,142,0.2)" stroke="#D9B88E" strokeWidth="1.4" />
          <g fill="#D9B88E">
            {PRISM_POINTS.map((p) => (
              <circle key={p.prism} cx={p.cx} cy={p.cy} r="3" />
            ))}
          </g>
          <g fontFamily="var(--mono)" fontSize="8.5" fill="rgba(232,220,196,0.55)" letterSpacing="0.1em">
            {PRISM_POINTS.map((p) => (
              <text key={p.prism} x={p.labelX} y={p.labelY} textAnchor={p.labelAnchor}>
                {p.label}
              </text>
            ))}
          </g>
        </g>
      </svg>
      <div
        style={{
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: 'rgba(232,220,196,0.65)',
          marginTop: 4,
        }}
      >
        最弱:<b style={{ color: '#FFB89A' }}>{weakest.label}</b> ({weakest.score.toFixed(2)}) · 最强:
        <b style={{ color: '#A6CC9A' }}> {strongest.label}</b> ({strongest.score.toFixed(2)})
      </div>
    </div>
  );
}

function RoiGauge() {
  const dashLen = Math.round(2 * Math.PI * 40 * TIME_ROI.roi);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg viewBox="0 0 100 100" style={{ width: 100, height: 100, flexShrink: 0 }}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(232,220,196,0.1)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#D9B88E"
          strokeWidth="7"
          strokeDasharray={`${dashLen} 251`}
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
        />
        <text
          x="50"
          y="48"
          textAnchor="middle"
          fontFamily="var(--serif)"
          fontStyle="italic"
          fontSize="17"
          fill="#E8DCC4"
          fontWeight="600"
        >
          {TIME_ROI.roi.toFixed(2)}
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize="6"
          fill="rgba(232,220,196,0.5)"
          letterSpacing="0.15em"
        >
          ROI
        </text>
      </svg>
      <div style={{ fontSize: 11.5, lineHeight: 1.7, color: 'rgba(232,220,196,0.85)' }}>
        高 ROI 时段 <b>{TIME_ROI.highRoi}h</b>
        <br />
        会议消耗 <span style={{ color: '#FFB89A' }}>{TIME_ROI.meetingH}h</span>
        <br />
        深度专注 <b>{TIME_ROI.deepH}h</b>{' '}
        <span style={{ color: '#FFB89A' }}>↓ 目标 {TIME_ROI.targetDeep}h</span>
      </div>
    </div>
  );
}

function BalconyRhythm() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {BALCONY_RHYTHM.map((b, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${b.h}%`,
              background: b.miss
                ? 'rgba(196,106,80,0.3)'
                : (b as any).now
                ? '#D9B88E'
                : 'rgba(217,184,142,0.5)',
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--mono)',
          fontSize: 9,
          color: 'rgba(232,220,196,0.5)',
          marginTop: 6,
          letterSpacing: 0.2,
        }}
      >
        <span>12 周前</span>
        <span>本周</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(232,220,196,0.65)', marginTop: 6 }}>
        连续 <b style={{ color: '#A6CC9A' }}>2 周</b>赴约 · 但近 12 周漏掉 <b style={{ color: '#FFB89A' }}>4 次</b>
      </div>
    </div>
  );
}

function SilenceRow() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {SILENCE_CARDS.map((s, i) => (
        <div
          key={i}
          style={{
            padding: '7px 10px',
            background: s.long ? 'rgba(196,106,80,0.08)' : 'rgba(217,184,142,0.04)',
            border: `1px solid ${s.long ? 'rgba(196,106,80,0.4)' : 'rgba(217,184,142,0.18)'}`,
            borderRadius: 3,
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#E8DCC4', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>{s.name}</span>
            <span style={{ color: s.long ? '#FFB89A' : '#D9B88E', fontFamily: 'var(--mono)', fontSize: 10 }}>
              {s.meta}
            </span>
          </div>
          <div style={{ color: 'rgba(232,220,196,0.65)', fontSize: 10.5 }}>{s.text}</div>
        </div>
      ))}
    </div>
  );
}

function EchoList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {ECHOS.map((e, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 10,
            padding: '5px 0',
            fontSize: 11,
            color: 'rgba(232,220,196,0.85)',
            borderBottom: i < ECHOS.length - 1 ? '1px dotted rgba(217,184,142,0.15)' : 'none',
          }}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(232,220,196,0.5)', flexShrink: 0 }}>
            {e.when}
          </span>
          <div style={{ flex: 1 }}>
            {e.text} ·{' '}
            <span style={{ color: e.pos ? '#A6CC9A' : '#FFB89A', fontWeight: 600 }}>
              {e.pos ?? e.neg}
            </span>
            {e.detail && (
              <span style={{ color: 'rgba(232,220,196,0.5)', marginLeft: 4 }}>· {e.detail}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelfPromiseList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {SELF_PROMISES.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: `1.5px solid ${p.kept ? '#A6CC9A' : 'rgba(196,106,80,0.5)'}`,
              color: p.kept ? '#A6CC9A' : 'rgba(196,106,80,0.7)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {p.kept ? '✓' : '○'}
          </span>
          <div>
            <div
              style={{
                color: '#E8DCC4',
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                opacity: p.kept ? 1 : 0.7,
              }}
            >
              {p.text}
            </div>
            <div style={{ fontSize: 9.5, color: 'rgba(232,220,196,0.5)', marginTop: 1 }}>{p.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Balcony;
