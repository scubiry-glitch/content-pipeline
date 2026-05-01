// Project Atlas 子房间 · 项目阿特拉斯
// 来源: 07-archive/会议纪要 (20260501)/project-atlas.html
// PR12 follow-up 实装：starmap (复用 ceo_strategic_lines) + danger board

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjectAtlas, ATLAS_FALLBACK, type AtlasData, type AtlasStar } from './_atlasApi';

const HEALTH_FILL: Record<AtlasStar['health'], string> = {
  healthy: 'rgba(79,179,169,0.35)',
  warn:    'rgba(232,165,71,0.3)',
  danger:  'rgba(216,90,90,0.3)',
  silent:  'rgba(150,150,150,0.2)',
};
const HEALTH_STROKE: Record<AtlasStar['health'], string> = {
  healthy: '#4FB3A9',
  warn:    '#E8A547',
  danger:  '#D85A5A',
  silent:  'rgba(180,180,180,0.4)',
};

export function ProjectAtlas() {
  const navigate = useNavigate();
  const [data, setData] = useState<AtlasData>(ATLAS_FALLBACK);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState<AtlasStar | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProjectAtlas().then((d) => {
      if (!cancelled) {
        setData(d);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0E1A1A',
        color: '#E8EEF2',
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
          borderBottom: '1px solid rgba(79,179,169,0.18)',
          background: 'rgba(14,26,26,0.85)',
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
              border: '1.5px solid #4FB3A9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: 'rgba(79,179,169,0.06)',
              boxShadow: '0 0 18px rgba(79,179,169,0.18) inset',
            }}
          >
            🌌
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: 22,
                margin: 0,
              }}
            >
              Project Atlas
            </h1>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: '#4FB3A9',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              internal · 项目 · 阿特拉斯
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
            color: 'rgba(232,238,242,0.7)',
          }}
        >
          "项目都还活着吗 ? 哪个最危险 ?"
          {loaded && (
            <span
              style={{
                marginLeft: 12,
                fontFamily: 'var(--mono)',
                fontStyle: 'normal',
                fontSize: 11,
                padding: '3px 9px',
                background: 'rgba(79,179,169,0.15)',
                borderRadius: 99,
                color: '#4FB3A9',
              }}
            >
              {data.meta.total} 项目 · 健康 {data.meta.healthy} · 危险 {data.meta.danger}
            </span>
          )}
        </div>

        <button
          onClick={() => navigate('/ceo/internal/ceo/compass')}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(232,238,242,0.7)',
            textTransform: 'uppercase',
            padding: '7px 14px',
            border: '1px solid rgba(79,179,169,0.4)',
            borderRadius: 3,
            background: 'rgba(79,179,169,0.05)',
            cursor: 'pointer',
          }}
        >
          ← 回 Compass
        </button>
      </header>

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 20,
          padding: '24px 36px 50px',
          maxWidth: 1480,
          margin: '0 auto',
        }}
      >
        <Block num="① starmap" title="项目星图" meta="大小=投入 · 颜色=健康 · 距中心=战略相关性" tall>
          <Starmap stars={data.stars} hovered={hovered} setHovered={setHovered} />
          <Legend legend={data.legend} />
          {hovered && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                background: `${HEALTH_FILL[hovered.health]}`,
                border: `1px solid ${HEALTH_STROKE[hovered.health]}55`,
                borderLeft: `3px solid ${HEALTH_STROKE[hovered.health]}`,
                borderRadius: '0 4px 4px 0',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#E8EEF2',
                }}
              >
                {hovered.name}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10.5,
                  color: HEALTH_STROKE[hovered.health],
                  letterSpacing: 0.2,
                  marginTop: 2,
                }}
              >
                {hovered.kind} · alignment {hovered.alignmentScore?.toFixed(2) ?? '—'} · risk {hovered.risk.toFixed(2)}
              </div>
            </div>
          )}
        </Block>

        <Block num="② danger board" title="濒危看板" meta="按危险度排序">
          <DangerBoard cards={data.dangerBoard} />
        </Block>

        <Block num="③ milestone river" title="里程碑长河" meta="点击节点 → 跳到该会议纪要" spanFull>
          <MilestoneRiver stars={data.stars} />
        </Block>

        <Block num="④ decision echo" title="决策回声" meta="链接 ceo_strategic_echos">
          <Placeholder>
            决策回声列表 — 列出最近 5 条 ceo_strategic_echos 行（hypothesis ↔ fact ↔ fate）。
            数据已 seed (5 条)，待接 /api/v1/ceo/compass/echos UI 后渲染。
          </Placeholder>
        </Block>

        <Block num="⑤ tensions" title="张力网格" meta="项目间分歧与对垒">
          <Placeholder>
            待接 mn_judgments + ceo_director_concerns 跨项目张力图。
          </Placeholder>
        </Block>

        <Block num="⑥ verdict" title="救活 vs 安乐死" meta="高风险项目处置建议" spanFull>
          <Verdict cards={data.dangerBoard} />
        </Block>
      </main>
    </div>
  );
}

function Starmap({
  stars,
  hovered,
  setHovered,
}: {
  stars: AtlasStar[];
  hovered: AtlasStar | null;
  setHovered: (s: AtlasStar | null) => void;
}) {
  return (
    <div
      style={{
        background:
          'radial-gradient(circle at center, rgba(79,179,169,0.06) 0%, transparent 70%), #0A1414',
        border: '1px solid rgba(79,179,169,0.15)',
        borderRadius: 6,
        padding: 14,
      }}
    >
      <svg viewBox="0 0 600 500" style={{ width: '100%', height: 480 }}>
        {/* 同心圆 */}
        <circle cx="300" cy="250" r="50"  fill="none" stroke="rgba(79,179,169,0.2)"  strokeDasharray="2 4" />
        <circle cx="300" cy="250" r="130" fill="none" stroke="rgba(79,179,169,0.12)" strokeDasharray="2 6" />
        <circle cx="300" cy="250" r="220" fill="none" stroke="rgba(79,179,169,0.08)" strokeDasharray="2 8" />
        <text
          x="300"
          y="254"
          textAnchor="middle"
          fill="rgba(232,165,71,0.5)"
          fontFamily="var(--mono)"
          fontSize="8.5"
          letterSpacing="2"
        >
          CORE STRATEGY
        </text>

        {/* 项目星 */}
        {stars.map((s) => {
          const isHover = hovered?.id === s.id;
          return (
            <g
              key={s.id}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={s.cx}
                cy={s.cy}
                r={s.r + (isHover ? 4 : 0)}
                fill={HEALTH_FILL[s.health]}
                stroke={HEALTH_STROKE[s.health]}
                strokeWidth={s.kind === 'drift' ? 1.2 : 2}
                strokeDasharray={s.health === 'silent' ? '1 3' : s.kind === 'drift' ? '3 2' : undefined}
              />
              <circle cx={s.cx} cy={s.cy} r={4} fill={HEALTH_STROKE[s.health]} />
              <text
                x={s.cx}
                y={s.cy + s.r + 18}
                textAnchor="middle"
                fill={s.health === 'silent' ? 'rgba(232,238,242,0.5)' : '#E8EEF2'}
                fontFamily="var(--serif)"
                fontStyle="italic"
                fontSize={s.r >= 20 ? 13 : 11.5}
              >
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ legend }: { legend: Array<{ label: string; color: string }> }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        marginTop: 12,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'rgba(232,238,242,0.7)',
        flexWrap: 'wrap',
      }}
    >
      {legend.map((l, i) => (
        <span key={i}>
          <i
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 99,
              background: l.color,
              marginRight: 5,
              verticalAlign: 'middle',
            }}
          />
          {l.label}
        </span>
      ))}
    </div>
  );
}

function DangerBoard({ cards }: { cards: AtlasData['dangerBoard'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cards.map((c, i) => {
        const tone =
          c.riskScore >= 0.7
            ? { bg: 'rgba(216,90,90,0.08)', border: 'rgba(216,90,90,0.5)', ink: '#F5A6A6' }
            : c.riskScore >= 0.4
            ? { bg: 'rgba(232,165,71,0.08)', border: 'rgba(232,165,71,0.4)', ink: '#FFD08C' }
            : { bg: 'rgba(79,179,169,0.06)', border: 'rgba(79,179,169,0.3)', ink: '#A0E0D6' };
        return (
          <div
            key={i}
            style={{
              padding: '10px 13px',
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              borderLeft: `3px solid ${tone.ink}`,
              borderRadius: '0 4px 4px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#E8EEF2',
                }}
              >
                {c.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: tone.ink,
                  fontWeight: 600,
                }}
              >
                RISK {c.riskScore.toFixed(2)} {c.trend === 'up' ? '↑' : c.trend === 'down' ? '↓' : '→'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {c.signals.map((sig, j) => (
                <span
                  key={j}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9.5,
                    padding: '2px 7px',
                    background: sig.severity === 'crit' ? 'rgba(216,90,90,0.18)' : sig.severity === 'warn' ? 'rgba(232,165,71,0.15)' : 'rgba(79,179,169,0.12)',
                    color: sig.severity === 'crit' ? '#F5A6A6' : sig.severity === 'warn' ? '#FFD08C' : '#A0E0D6',
                    border: `1px solid ${sig.severity === 'crit' ? 'rgba(216,90,90,0.4)' : sig.severity === 'warn' ? 'rgba(232,165,71,0.4)' : 'rgba(79,179,169,0.3)'}`,
                    borderRadius: 99,
                    letterSpacing: 0.2,
                  }}
                >
                  {sig.tag}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(232,238,242,0.7)', lineHeight: 1.5 }}>{c.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function MilestoneRiver({ stars }: { stars: AtlasStar[] }) {
  // 简化版：每个 star 一行，时间轴 8 月 (Jan-Aug) 上画一条带 + 4-6 个 mark
  // 真实里程碑数据待 mn_decisions + mn_meetings 接入
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  // 只展示主线 + 支线项目 (drift 太多杂)
  const rows = stars.filter((s) => s.kind !== 'drift').slice(0, 4);
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr',
          gap: 8,
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          color: 'rgba(232,238,242,0.4)',
          marginBottom: 4,
          letterSpacing: 0.2,
        }}
      >
        <div />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', textAlign: 'center' }}>
          {months.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      </div>
      {rows.map((s) => (
        <div
          key={s.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr',
            gap: 8,
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: '1px solid rgba(79,179,169,0.08)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 12.5,
              color: '#E8EEF2',
              textAlign: 'right',
              paddingRight: 8,
            }}
          >
            {s.name}
          </span>
          <div
            style={{
              position: 'relative',
              height: 24,
              background: 'rgba(79,179,169,0.04)',
              borderRadius: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '5%',
                width: '80%',
                top: 8,
                bottom: 8,
                background: HEALTH_FILL[s.health],
                borderRadius: 99,
              }}
            />
            {[12, 28, 42, 60, 75].map((pct, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: i === 1 || i === 3 ? HEALTH_STROKE[s.health] : '#0A1414',
                  border: `1.5px solid ${HEALTH_STROKE[s.health]}`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <div
        style={{
          marginTop: 10,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(232,238,242,0.45)',
          letterSpacing: 0.2,
        }}
      >
        ● 里程碑 · ◯ 会议节点 · 详细数据待接 mn_decisions / mn_meetings
      </div>
    </div>
  );
}

function Verdict({ cards }: { cards: AtlasData['dangerBoard'] }) {
  const top = cards.filter((c) => c.riskScore >= 0.5).slice(0, 3);
  if (top.length === 0) {
    return <Placeholder>当前无高风险项目，暂无处置建议</Placeholder>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {top.map((c) => {
        const verdict =
          c.riskScore >= 0.75
            ? { label: '安乐死 · Sunset', color: '#D85A5A', text: '止损发布会前关停 / 重组 — 别让它继续吸注意力' }
            : c.riskScore >= 0.6
            ? { label: '止损 · Halt', color: '#E8A547', text: '冻结新增承诺，3 周内做"救活 vs 关停"二选一' }
            : { label: '观察 · Watch', color: '#4FB3A9', text: '保持当前频率，月底重评' };
        return (
          <div
            key={c.name}
            style={{
              padding: '14px 16px',
              background: `${verdict.color}15`,
              border: `1px solid ${verdict.color}55`,
              borderLeft: `3px solid ${verdict.color}`,
              borderRadius: '0 4px 4px 0',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: verdict.color,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {verdict.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 16,
                fontWeight: 600,
                color: '#E8EEF2',
                marginBottom: 6,
              }}
            >
              {c.name} · risk {c.riskScore.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,238,242,0.75)', lineHeight: 1.6 }}>{verdict.text}</div>
          </div>
        );
      })}
    </div>
  );
}

interface BlockProps {
  num: string;
  title: string;
  meta?: string;
  tall?: boolean;
  spanFull?: boolean;
  children: React.ReactNode;
}

function Block({ num, title, meta, tall, spanFull, children }: BlockProps) {
  return (
    <section
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(79,179,169,0.18)',
        borderRadius: 4,
        padding: '20px 22px',
        gridRow: tall ? 'span 2' : undefined,
        gridColumn: spanFull ? '1 / -1' : undefined,
        minHeight: tall ? 580 : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: '1px solid rgba(79,179,169,0.18)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#4FB3A9',
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
            color: '#E8EEF2',
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
              color: 'rgba(232,238,242,0.4)',
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
        background: 'rgba(79,179,169,0.04)',
        border: '1px dashed rgba(79,179,169,0.3)',
        borderRadius: 4,
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 12.5,
        color: 'rgba(232,238,242,0.6)',
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

export default ProjectAtlas;
