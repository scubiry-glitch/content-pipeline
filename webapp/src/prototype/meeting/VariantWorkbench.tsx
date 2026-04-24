// VariantWorkbench — B 视图 · 三栏工作台
// 原型来源：/tmp/mn-proto/variant-b.jsx VariantWorkbench

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { MEETING, EXPERTS, ANALYSIS, P } from './_fixtures';
import { Icon, Avatar, Chip, MonoMeta, SectionLabel, MockBadge } from './_atoms';

// ── Mock transcript (right pane) ──
const TRANSCRIPT = [
  { who: 'p2', time: '00:38:12', text: '我坚持的是：推理层在特定 workload 下有价格歧视空间，毛利结构比训练层更耐得住周期。', highlight: true,  tag: ['V1', 'T1'] },
  { who: 'p3', time: '00:39:40', text: '规模你守不住。训练层一旦摊到 10^27 flops，单位成本会碾过毛利曲线。',                  highlight: true,  tag: ['T1'] },
  { who: 'p2', time: '00:41:08', text: '那你给我一个 3 年期的反例。',                                                        highlight: true,  tag: ['T1'] },
  { who: 'p1', time: '00:54:22', text: '上限可以谈，但 8000 万那种单笔，我们要准备好跟 LP 沟通预案。',                        highlight: false, tag: ['D1'] },
  { who: 'p5', time: '00:55:03', text: '我只提醒，决策还是你们。',                                                            highlight: false, tag: ['D1'] },
  { who: 'p6', time: '01:12:30', text: '过去 6 个月我们这边提供了 18 个 warm intro，有 4 个进到 term sheet。',               highlight: false, tag: ['N2', 'V2'] },
  { who: 'p4', time: '01:25:58', text: '同类样本历史中位数 38%，我倾向于拆 cohort 再看。',                                    highlight: false, tag: ['V1'] },
];

// ── TopBtn ──
function TopBtn({ icon, children }: { icon: 'search' | 'upload'; children: string }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--line)',
      background: 'var(--paper)', color: 'var(--ink-2)', fontSize: 12, borderRadius: 5, cursor: 'pointer',
      fontFamily: 'var(--sans)',
    }}>
      <Icon name={icon} size={12} /> {children}
    </button>
  );
}

// ── Stance card (for WBTension) ──
function Stance({ p, stance, text, tone }: {
  p: ReturnType<typeof P>; stance: string; text: string; tone: 'accent' | 'teal';
}) {
  const bg = tone === 'accent' ? 'var(--accent-soft)' : 'var(--teal-soft)';
  const fg = tone === 'accent' ? 'oklch(0.3 0.1 40)' : 'oklch(0.3 0.08 200)';
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Avatar p={p} size={22} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: fg }}>{p.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{stance}</div>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 13, color: fg, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

// ── WBTension ──
function WBTension({ a, selected, setSelected }: {
  a: typeof ANALYSIS; selected: string; setSelected: (id: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {a.tension.map((t) => {
          const [p1, p2] = t.between.map(P);
          const active = t.id === selected;
          return (
            <button key={t.id} onClick={() => setSelected(t.id)} style={{
              textAlign: 'left', padding: '12px 14px',
              border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
              background: active ? 'var(--paper)' : 'var(--paper-2)',
              borderRadius: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <MonoMeta>{t.id}</MonoMeta>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <div style={{ width: 54, height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${t.intensity * 100}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <MonoMeta style={{ fontSize: 10 }}>{(t.intensity * 100).toFixed(0)}</MonoMeta>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--serif)' }}>{t.topic}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
                <Avatar p={p1} size={16} radius={3} />
                <span>{p1.name}</span>
                <span style={{ color: 'var(--ink-4)' }}>↔</span>
                <Avatar p={p2} size={16} radius={3} />
                <span>{p2.name}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{
        border: '1px solid var(--line-2)', borderRadius: 8, padding: '20px 22px',
        background: 'var(--paper)', overflow: 'auto',
      }}>
        {(() => {
          const t = a.tension.find((x) => x.id === selected) ?? a.tension[0];
          const [p1, p2] = t.between.map(P);
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <MonoMeta>{t.id}</MonoMeta>
                <Chip tone="accent">强度 {(t.intensity * 100).toFixed(0)}</Chip>
              </div>
              <h3 style={{
                fontFamily: 'var(--serif)', fontSize: 22, margin: '0 0 12px',
                fontWeight: 600, letterSpacing: '-0.01em',
              }}>
                {t.topic}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'stretch', marginBottom: 20 }}>
                <Stance p={p1} stance={`${p1.name} 立场`} text={t.summary.split('；')[0] ?? t.summary} tone="accent" />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 99, background: 'var(--paper-2)',
                    border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink-3)',
                  }}>vs</div>
                </div>
                <Stance p={p2} stance={`${p2.name} 立场`} text={t.summary.split('；')[1]?.trim() ?? ''} tone="teal" />
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', fontFamily: 'var(--serif)' }}>
                {t.summary}
              </p>
              {t.moments.length > 0 && (
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SectionLabel>关键段落</SectionLabel>
                  {t.moments.map((m, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14,
                      color: 'var(--ink-2)', padding: '8px 14px',
                      background: 'var(--paper-2)', borderLeft: '2px solid var(--accent)', borderRadius: 3,
                    }}>{m}</div>
                  ))}
                </div>
              )}
              <div style={{
                marginTop: 22, padding: '14px 16px', background: 'var(--paper-2)',
                border: '1px solid var(--line-2)', borderRadius: 6,
              }}>
                <SectionLabel>专家解读 · E09-09</SectionLabel>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: '8px 0 0', color: 'var(--ink-2)' }}>
                  从二阶效应看，这里的真正问题不是"哪一层更好"，而是一个组合敞口问题。若推理层胜出，我们的头部布局已
                  足够；若训练层胜出，现有仓位会被摊薄稀释。当前分歧其实是在 hedge 的粒度上没有对齐。
                  <Chip tone="ghost" style={{ marginLeft: 6 }}>[M#42]</Chip>
                </p>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── WBMinutes ──
function WBMinutes({ a }: { a: typeof ANALYSIS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '16px 20px', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <SectionLabel>Decision</SectionLabel>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.55, marginTop: 6 }}>
          {a.summary.decision}
        </div>
      </div>
      <div style={{ padding: '4px 0', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-2)' }}>
          <SectionLabel>Action items · {a.summary.actionItems.length}</SectionLabel>
        </div>
        {a.summary.actionItems.map((it, idx) => (
          <div key={it.id} style={{
            display: 'grid', gridTemplateColumns: '48px 140px 1fr 110px 24px',
            alignItems: 'center', gap: 12, padding: '12px 20px',
            borderTop: idx === 0 ? 'none' : '1px solid var(--line-2)',
          }}>
            <MonoMeta>{it.id}</MonoMeta>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar p={P(it.who)} size={22} />
              <span style={{ fontSize: 13 }}>{P(it.who).name}</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{it.what}</div>
            <MonoMeta>{it.due}</MonoMeta>
            <Icon name="chevron" size={14} style={{ color: 'var(--ink-4)' }} />
          </div>
        ))}
      </div>
      <div style={{ padding: '16px 20px', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <SectionLabel>Open risks · {a.summary.risks.length}</SectionLabel>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.85, color: 'var(--ink)' }}>
          {a.summary.risks.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}

// ── WBNewCognition ──
function WBNewCognition({ a }: { a: typeof ANALYSIS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {a.newCognition.map((n) => {
        const p = P(n.who);
        return (
          <div key={n.id} style={{
            background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6,
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar p={p} size={24} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
              <MonoMeta>{n.id}</MonoMeta>
              <Chip tone="teal" style={{ marginLeft: 'auto' }}>信念更新</Chip>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 10, alignItems: 'stretch' }}>
              <div style={{
                background: 'var(--paper-2)', padding: '10px 12px', borderRadius: 4,
                fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
              }}>{n.before}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                <Icon name="arrow" size={20} />
              </div>
              <div style={{
                background: 'var(--teal-soft)', padding: '10px 12px', borderRadius: 4,
                fontSize: 13, lineHeight: 1.5, color: 'oklch(0.28 0.08 200)',
                fontFamily: 'var(--serif)', fontWeight: 500,
              }}>{n.after}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>
              <span style={{ color: 'var(--ink-4)' }}>由</span> {n.trigger}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WBFocusMap ──
function WBFocusMap({ a }: { a: typeof ANALYSIS }) {
  const maxR = Math.max(...a.focusMap.map((x) => x.returnsTo));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '160px 44px 1fr 70px',
        padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 10,
        color: 'var(--ink-4)', letterSpacing: 0.3, textTransform: 'uppercase' as const,
      }}>
        <span>PARTICIPANT</span><span>×</span><span>THEMES</span><span style={{ textAlign: 'right' }}>RETURNS</span>
      </div>
      {a.focusMap.map((f) => {
        const p = P(f.who);
        return (
          <div key={f.who} style={{
            display: 'grid', gridTemplateColumns: '160px 44px 1fr 70px',
            padding: '12px 14px', alignItems: 'center', gap: 10,
            background: 'var(--paper)', borderRadius: 5, border: '1px solid var(--line-2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar p={p} size={26} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.role}</div>
              </div>
            </div>
            <MonoMeta>×{f.returnsTo}</MonoMeta>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {f.themes.map((t, i) => <Chip key={i} tone="amber">{t}</Chip>)}
            </div>
            <div>
              <div style={{
                width: `${(f.returnsTo / maxR) * 100}%`, height: 4, background: 'var(--amber)',
                borderRadius: 2, marginLeft: 'auto',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WBConsensus ──
function WBConsensus({ a }: { a: typeof ANALYSIS }) {
  const cons = a.consensus.filter((x) => x.kind === 'consensus');
  const divs = a.consensus.filter((x) => x.kind === 'divergence');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>共识</span>
          <MonoMeta>{cons.length}</MonoMeta>
        </div>
        {cons.map((c) => (
          <div key={c.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.5 }}>{c.text}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {c.supportedBy.map((id) => (
                <Avatar key={id} p={P(id)} size={18} radius={4} />
              ))}
              <MonoMeta style={{ marginLeft: 6, alignSelf: 'center' }}>{c.supportedBy.length}/6 支持</MonoMeta>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="git" size={14} style={{ color: 'var(--teal)' }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>分歧</span>
          <MonoMeta>{divs.length}</MonoMeta>
        </div>
        {divs.map((d) => (
          <div key={d.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>{d.text}</div>
            {d.sides.map((s, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8, alignItems: 'center',
                padding: '6px 10px', marginBottom: 4, borderRadius: 3,
                background: i === 0 ? 'var(--teal-soft)' : 'oklch(0.96 0.015 40)',
              }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{s.stance}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{s.reason}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {s.by.map((id) => <Avatar key={id} p={P(id)} size={16} radius={3} />)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WBCrossView ──
function WBCrossView({ a }: { a: typeof ANALYSIS }) {
  const tones: Record<string, 'accent' | 'teal' | 'amber' | 'ghost'> = {
    support: 'accent', oppose: 'teal', partial: 'amber', neutral: 'ghost',
  };
  const labels: Record<string, string> = {
    support: '附议', oppose: '反对', partial: '部分认同', neutral: '中性',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {a.crossView.map((v) => {
        const p = P(v.claimBy);
        return (
          <div key={v.id} style={{
            background: 'var(--paper)', border: '1px solid var(--line-2)',
            borderRadius: 6, overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Avatar p={p} size={20} radius={4} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{p.name} 主张</span>
                <MonoMeta style={{ marginLeft: 'auto' }}>{v.id}</MonoMeta>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500, lineHeight: 1.45 }}>
                {v.claim}
              </div>
            </div>
            <div>
              {v.responses.map((r, i) => {
                const rp = P(r.who);
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '120px 80px 1fr', gap: 10, alignItems: 'center',
                    padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar p={rp} size={18} radius={4} />
                      <span style={{ fontSize: 12 }}>{rp.name}</span>
                    </div>
                    <Chip tone={tones[r.stance]}>{labels[r.stance]}</Chip>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--serif)' }}>{r.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── VariantWorkbench ──
export function VariantWorkbench() {
  const { id } = useParams<{ id: string }>();
  const [dim, setDim] = useState('tension');
  const [selectedT, setSelectedT] = useState('T1');
  const [a, setA] = useState<typeof ANALYSIS>(ANALYSIS);
  const [usingMock, setUsingMock] = useState(true);

  useEffect(() => {
    if (!id) return;
    meetingNotesApi.getMeetingDetail(id, 'B')
      .then((data: any) => {
        if (data?.analysis) { setA(data.analysis); setUsingMock(false); }
      })
      .catch(() => {});
  }, [id]);

  const dimList = [
    { id: 'minutes',       icon: 'ledger'  as const, label: '常规纪要' },
    { id: 'tension',       icon: 'bolt'    as const, label: '张力' },
    { id: 'new_cognition', icon: 'sparkle' as const, label: '新认知' },
    { id: 'focus_map',     icon: 'target'  as const, label: '关注点' },
    { id: 'consensus',     icon: 'scale'   as const, label: '共识/分歧' },
    { id: 'cross_view',    icon: 'network' as const, label: '观点对位' },
  ];

  const activeDim = dimList.find((x) => x.id === dim) ?? dimList[0];

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper-2)',
      display: 'grid', gridTemplateRows: '44px 1fr', color: 'var(--ink)',
      fontFamily: 'var(--sans)', fontSize: 13, overflow: 'hidden',
    }}>
      {/* ── Top bar ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px',
        borderBottom: '1px solid var(--line)', background: 'var(--paper)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5, background: 'var(--ink)',
            color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600, fontSize: 13,
          }}>M</div>
          <span style={{ fontWeight: 600 }}>Minutes</span>
          <MonoMeta>/ workbench</MonoMeta>
        </div>
        <div style={{ height: 22, width: 1, background: 'var(--line)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
          <Icon name="folder" size={14} />
          <span>{MEETING.id}</span>
          <Icon name="chevron" size={12} style={{ color: 'var(--ink-4)' }} />
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{MEETING.title}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {usingMock && <MockBadge />}
          <Chip tone="ghost"><Icon name="mic" size={11} />m4a + docx</Chip>
          <Chip tone="ghost">preset: standard</Chip>
          <Chip tone="accent">3 experts active</Chip>
          <div style={{ width: 1, height: 22, background: 'var(--line)' }} />
          <TopBtn icon="search">搜索</TopBtn>
          <TopBtn icon="upload">导出</TopBtn>
        </div>
      </header>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 360px', height: '100%', minHeight: 0 }}>

        {/* Left: nav + expert stack */}
        <aside style={{
          borderRight: '1px solid var(--line)', background: 'var(--paper)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 16px 10px' }}>
            <SectionLabel>维度 Dimensions</SectionLabel>
          </div>
          <nav style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {dimList.map((d) => {
              const active = d.id === dim;
              return (
                <button key={d.id} onClick={() => setDim(d.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  border: 0, background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'oklch(0.32 0.1 40)' : 'var(--ink-2)',
                  cursor: 'pointer', borderRadius: 5, fontSize: 13,
                  fontWeight: active ? 600 : 450, textAlign: 'left',
                }}>
                  <Icon name={d.icon} size={15} />
                  <span>{d.label}</span>
                  {active && <Icon name="dot" size={8} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: '22px 16px 10px' }}>
            <SectionLabel>专家栈 Experts</SectionLabel>
          </div>
          <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
            {EXPERTS.filter((e) => e.selected).map((e) => (
              <div key={e.id} style={{
                border: '1px solid var(--line-2)', borderRadius: 6, padding: '9px 10px', background: 'var(--paper-2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{e.id}</span>
                  <Chip tone="ink" style={{ padding: '1px 6px', fontSize: 10 }}>{(e.match * 100).toFixed(0)}%</Chip>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4, lineHeight: 1.35 }}>{e.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{e.field}</div>
              </div>
            ))}
            <button style={{
              border: '1px dashed var(--line)', background: 'transparent', padding: '8px 10px',
              borderRadius: 6, color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
            }}>
              <Icon name="plus" size={12} /> 添加专家
            </button>
          </div>
        </aside>

        {/* Center: dimension workspace */}
        <section style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 14, background: 'var(--paper)',
          }}>
            <h2 style={{
              fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.01em',
            }}>{activeDim.label}</h2>
            <MonoMeta>
              {dim === 'tension'       && `${a.tension.length} items`}
              {dim === 'new_cognition' && `${a.newCognition.length} updates`}
              {dim === 'focus_map'     && `${a.focusMap.length} participants`}
              {dim === 'consensus'     && `${a.consensus.length} entries`}
              {dim === 'cross_view'    && `${a.crossView.length} claims`}
              {dim === 'minutes'       && `${a.summary.actionItems.length} actions`}
            </MonoMeta>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <Chip tone="ghost"><Icon name="sparkle" size={10} />知识锚定已启用</Chip>
              <Chip tone="ghost">置信度: 0.78</Chip>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
            {dim === 'tension'       && <WBTension       a={a} selected={selectedT} setSelected={setSelectedT} />}
            {dim === 'minutes'       && <WBMinutes        a={a} />}
            {dim === 'new_cognition' && <WBNewCognition   a={a} />}
            {dim === 'focus_map'     && <WBFocusMap       a={a} />}
            {dim === 'consensus'     && <WBConsensus      a={a} />}
            {dim === 'cross_view'    && <WBCrossView      a={a} />}
          </div>
        </section>

        {/* Right: transcript / evidence */}
        <aside style={{
          borderLeft: '1px solid var(--line)', background: 'var(--paper)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <SectionLabel>原文锚点 Evidence</SectionLabel>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
              每一条分析都回溯到 2-3 个原文段落
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {TRANSCRIPT.map((t, i) => (
              <div key={i} style={{
                borderLeft: t.highlight ? '2px solid var(--accent)' : '2px solid var(--line-2)',
                paddingLeft: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <Avatar p={P(t.who)} size={16} radius={3} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{P(t.who).name}</span>
                  <MonoMeta style={{ marginLeft: 'auto', fontSize: 10 }}>{t.time}</MonoMeta>
                </div>
                <div style={{
                  fontSize: 12.5, lineHeight: 1.6,
                  color: t.highlight ? 'var(--ink)' : 'var(--ink-2)',
                  fontFamily: 'var(--serif)',
                }}>{t.text}</div>
                {t.tag && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {t.tag.map((x, j) => (
                      <Chip key={j} tone="accent" style={{ fontSize: 10, padding: '1px 6px' }}>{x}</Chip>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default VariantWorkbench;
