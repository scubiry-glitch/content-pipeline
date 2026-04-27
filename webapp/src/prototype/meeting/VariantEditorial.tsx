// VariantEditorial — A 视图 · 文档精读
// 原型来源：/tmp/mn-proto/variant-a.jsx VariantEditorial

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { MEETING, EXPERTS, ANALYSIS, P as defaultP } from './_fixtures';
import type { Participant } from './_fixtures';
import { Icon, Avatar, Chip, Dot, MonoMeta, SectionLabel, MockBadge, momentToText } from './_atoms';
import { useForceMock } from './_mockToggle';
import { adaptApiAnalysis } from './_apiAdapters';
import { useMeetingShellTitle } from './MeetingDetailShell';

type PFn = (id: string) => Participant;

// ── Section header helper ──
function sectionHeader(num: string, title: string, sub: string) {
  return (
    <header style={{ marginBottom: 28, maxWidth: 720 }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>§ {num}</div>
      <h2 style={{
        fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 30, letterSpacing: '-0.01em',
        margin: '6px 0 10px',
      }}>{title}</h2>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0, maxWidth: 620 }}>{sub}</p>
    </header>
  );
}

// ── SecMinutes ──
function SecMinutes({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
  return (
    <section>
      {sectionHeader('01', '常规会议纪要', '以事实与行动为主干的标准纪要，保留决议链条。')}
      <div style={{
        background: 'var(--paper-2)', border: '1px solid var(--line-2)',
        borderLeft: '2px solid var(--accent)',
        padding: '18px 22px', borderRadius: 4, maxWidth: 720, marginBottom: 28,
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.3 }}>DECISION</div>
        <p style={{
          fontFamily: 'var(--serif)', fontSize: 18, lineHeight: 1.55, margin: '6px 0 0',
          color: 'var(--ink)',
        }}>{a.summary?.decision ?? ''}</p>
      </div>

      <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 16, margin: '0 0 14px' }}>Action Items</h3>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
        {(a.summary?.actionItems ?? []).map((it) => (
          <div key={it.id} style={{
            display: 'grid', gridTemplateColumns: '42px 100px 1fr 92px', alignItems: 'center',
            padding: '14px 0', borderTop: '1px solid var(--line-2)', gap: 16,
          }}>
            <MonoMeta>{it.id}</MonoMeta>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar p={P(it.who)} size={22} />
              <span style={{ fontSize: 13 }}>{P(it.who).name}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>{it.what}</div>
            <MonoMeta style={{ textAlign: 'right' }}>{it.due}</MonoMeta>
          </div>
        ))}
        <div style={{ height: 1, background: 'var(--line-2)' }} />
      </div>

      <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 16, margin: '32px 0 14px' }}>Open Risks</h3>
      <ul style={{ margin: 0, paddingLeft: 18, maxWidth: 720, color: 'var(--ink)', fontSize: 14, lineHeight: 1.75 }}>
        {(a.summary?.risks ?? []).map((r, i) => <li key={i}>{r}</li>)}
      </ul>
    </section>
  );
}

// ── TensionArrow ──
function TensionArrow({ intensity }: { intensity: number }) {
  const segs = 12;
  const filled = Math.round(intensity * segs);
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '0 6px' }}>
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} style={{
          width: 5, height: 2 + Math.abs(i - segs / 2) * 0.5,
          background: i < filled ? 'var(--accent)' : 'var(--line)',
          borderRadius: 1,
        }} />
      ))}
    </div>
  );
}

// ── SecTension ──
function SecTension({ a, isMock, P = defaultP }: { a: typeof ANALYSIS; isMock?: boolean; P?: PFn }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {sectionHeader('02', '张力', '不是冲突 —— 是未解的推拉。每一条张力附带触发点、强度与未化解的残留。')}
        {isMock && <MockBadge style={{ marginTop: 6, flexShrink: 0 }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 }}>
        {(a.tension ?? []).map((t) => {
          const between = t.between ?? [];
          const a1 = between.length > 0 ? P(between[0]) : null;
          const a2 = between.length > 1 ? P(between[1]) : null;
          return (
            <article key={t.id} style={{
              border: '1px solid var(--line-2)', borderRadius: 6, padding: '20px 22px',
              background: 'var(--paper-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {a1 && <><Avatar p={a1} size={26} /><span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{a1.name}</span></>}
                  <TensionArrow intensity={t.intensity} />
                  {a2 && <><span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{a2.name}</span><Avatar p={a2} size={26} /></>}
                </div>
                <MonoMeta>强度 {(t.intensity * 100).toFixed(0)}</MonoMeta>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.005em' }}>
                {t.topic}
              </div>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65, marginTop: 8 }}>{t.summary}</p>
              {(t.moments ?? []).length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(t.moments ?? []).map((m, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14,
                      color: 'var(--ink-2)', paddingLeft: 14, borderLeft: '2px solid var(--accent-soft)',
                    }}>{momentToText(m)}</div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── SecNewCognition ──
function SecNewCognition({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
  return (
    <section>
      {sectionHeader('03', '新认知', '会议前后，谁的信念被更新？谁被什么触发？')}
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 800 }}>
        {(a.newCognition ?? []).map((n, idx) => {
          const p = P(n.who);
          return (
            <div key={n.id} style={{
              display: 'grid', gridTemplateColumns: '80px 1fr', gap: 24,
              padding: '28px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--line-2)',
            }}>
              <div>
                <Avatar p={p} size={48} radius={8} />
                <div style={{ fontSize: 12, fontWeight: 500, marginTop: 8 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{p.role}</div>
              </div>
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'stretch' }}>
                  <div style={{
                    background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                    padding: '12px 14px', borderRadius: 4,
                  }}>
                    <MonoMeta>BEFORE</MonoMeta>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, marginTop: 4, lineHeight: 1.5, color: 'var(--ink-2)' }}>{n.before}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
                    <Icon name="arrow" size={22} stroke={1.3} />
                  </div>
                  <div style={{
                    background: 'var(--accent-soft)', border: '1px solid oklch(0.85 0.07 40)',
                    padding: '12px 14px', borderRadius: 4,
                  }}>
                    <MonoMeta style={{ color: 'oklch(0.4 0.1 40)' }}>AFTER</MonoMeta>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, marginTop: 4, lineHeight: 1.5, color: 'oklch(0.28 0.08 40)' }}>{n.after}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 12, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--ink-4)' }}>触发</span>
                  <span>{n.trigger}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── SecFocusMap ──
function SecFocusMap({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
  const maxR = Math.max(1, ...(a.focusMap ?? []).map((x) => x.returnsTo));
  return (
    <section>
      {sectionHeader('04', '各自关注点', '每人反复回到的主题 · 圆点尺寸为回归次数。')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 820 }}>
        {(a.focusMap ?? []).map((f) => {
          const p = P(f.who);
          return (
            <div key={f.who} style={{
              border: '1px solid var(--line-2)', borderRadius: 6, padding: '16px 18px', background: 'var(--paper-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar p={p} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.role}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Dot color="var(--amber)" size={8 + (f.returnsTo / maxR) * 8} />
                  <MonoMeta>×{f.returnsTo}</MonoMeta>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(f.themes ?? []).map((t, i) => <Chip key={i} tone="amber">{t}</Chip>)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── SecConsensus ──
function SecConsensus({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
  const cons = (a.consensus ?? []).filter((x) => x.kind === 'consensus');
  const divs = (a.consensus ?? []).filter((x) => x.kind === 'divergence');
  return (
    <section>
      {sectionHeader('05', '共识与分歧', '已对齐的默认共识 vs 仍在分岔的判断。')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 820, marginTop: 4 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>共识 · Consensus</span>
            <MonoMeta>{cons.length}</MonoMeta>
          </div>
          {cons.map((c) => (
            <div key={c.id} style={{
              padding: '12px 14px', background: 'var(--accent-soft)',
              border: '1px solid oklch(0.87 0.06 40)', borderRadius: 4, marginBottom: 10,
            }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14.5, lineHeight: 1.55, color: 'oklch(0.28 0.08 40)' }}>
                {c.text}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                {c.supportedBy.map((id) => (
                  <Avatar key={id} p={P(id)} size={20} radius={4} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="git" size={16} style={{ color: 'var(--teal)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>分歧 · Divergence</span>
            <MonoMeta>{divs.length}</MonoMeta>
          </div>
          {divs.map((d) => (
            <div key={d.id} style={{
              padding: '12px 14px', background: 'var(--paper-2)',
              border: '1px solid var(--line-2)', borderRadius: 4, marginBottom: 10,
            }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14.5, lineHeight: 1.45, color: 'var(--ink)', marginBottom: 10 }}>
                {d.text}
              </div>
              {(d.sides ?? []).map((s, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 10, alignItems: 'center',
                  padding: '8px 10px', marginTop: i === 0 ? 0 : 4,
                  background: i === 0 ? 'var(--teal-soft)' : 'oklch(0.95 0.02 200)',
                  borderRadius: 3, fontSize: 12.5,
                }}>
                  <span style={{ fontWeight: 600, color: 'oklch(0.3 0.08 200)' }}>{s.stance}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{s.reason}</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {s.by.map((id) => <Avatar key={id} p={P(id)} size={18} radius={3} />)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── SecCrossView ──
function SecCrossView({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
  const stanceTone: Record<string, 'accent' | 'teal' | 'amber' | 'ghost'> = {
    support: 'accent', oppose: 'teal', partial: 'amber', neutral: 'ghost',
  };
  const stanceLabel: Record<string, string> = {
    support: '附议', oppose: '反对', partial: '部分认同', neutral: '中性',
  };
  return (
    <section>
      {sectionHeader('06', '观点对位 · Cross-view', '对一条关键主张，其他人如何回应？')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, maxWidth: 800 }}>
        {(a.crossView ?? []).map((v) => {
          const claimer = P(v.claimBy);
          return (
            <article key={v.id}>
              <div style={{
                background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                borderLeft: '2px solid var(--accent)', padding: '16px 20px', borderRadius: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Avatar p={claimer} size={24} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{claimer.name} 主张</span>
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 19, lineHeight: 1.45, fontWeight: 500 }}>
                  {v.claim}
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
                {(v.responses ?? []).map((r, i) => {
                  const rp = P(r.who);
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '110px 72px 1fr', gap: 16, alignItems: 'center',
                      padding: '12px 0', borderTop: '1px solid var(--line-2)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar p={rp} size={22} />
                        <span style={{ fontSize: 12.5 }}>{rp.name}</span>
                      </div>
                      <Chip tone={stanceTone[r.stance]}>{stanceLabel[r.stance]}</Chip>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55, fontFamily: 'var(--serif)', color: 'var(--ink-2)' }}>{r.text}</div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── API meeting metadata ──
// 后端透传 assets.metadata.participants 的全部字段（含 id/initials/tone/speakingPct），
// 这样 P() 解析人物时可以优先用 API ID（如 'p1'），不会回落到 mock 的陈汀/沈岚。
interface ApiParticipant {
  id?: string;
  name: string;
  role?: string;
  initials?: string;
  tone?: string;
  speakingPct?: number;
}
interface ApiMeetingMeta {
  title: string | null;
  date: string | null;
  participants: ApiParticipant[];
}

// ── VariantEditorial ──
export function VariantEditorial() {
  const { id } = useParams<{ id: string }>();
  const forceMock = useForceMock();
  const [dim, setDim] = useState('minutes');
  const [a, setA] = useState<typeof ANALYSIS>(ANALYSIS);
  const [usingMock, setUsingMock] = useState(true);
  const [tensionMock, setTensionMock] = useState(true);
  const [apiMeta, setApiMeta] = useState<ApiMeetingMeta | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error' | 'skipped'>('skipped');
  const shellTitle = useMeetingShellTitle();
  const displayTitle = shellTitle || apiMeta?.title || MEETING.title;

  useEffect(() => {
    // Reset to mock state when toggled back to mock mode
    if (forceMock) {
      setA(ANALYSIS);
      setApiMeta(null);
      setUsingMock(true);
      setTensionMock(true);
      setApiState('skipped');
      return;
    }
    if (!id) { setApiState('skipped'); return; }
    setApiState('loading');
    meetingNotesApi.getMeetingDetail(id, 'A')
      .then((data: any) => {
        if (data?.analysis) {
          setA(adaptApiAnalysis(data.analysis));
          setApiMeta({
            title: data.analysis.title ?? null,
            date: data.analysis.date ?? null,
            participants: Array.isArray(data.analysis.participants) ? data.analysis.participants : [],
          });
          setUsingMock(false);
          setApiState('ok');
        } else {
          // analysis === null：后端无该会议数据 · 标记为 error 让 fixture 兜底显示
          setApiState('error');
        }
      })
      .catch(() => { setApiState('error'); });
    // Phase 15.15 · C.1 · tension probe
    meetingNotesApi.getMeetingTensions(id)
      .then((data) => {
        if (data?.items?.length) {
          setA((prev) => ({ ...prev, tension: data.items.map((t) => ({
            id: t.tension_key,
            between: t.between_ids,
            topic: t.topic,
            intensity: t.intensity,
            summary: t.summary ?? '',
            moments: t.moments ?? [],
          })) }));
          setTensionMock(false);
        }
      })
      .catch(() => {});
  }, [id, forceMock]);

  // Build a P() that prefers API-provided participants (with id/initials/tone)
  // over the mock _fixtures.PARTICIPANTS. Falls back to default P for unknown IDs.
  const P = useMemo<PFn>(() => {
    const map = new Map<string, Participant>();
    (apiMeta?.participants ?? []).forEach((p) => {
      if (!p.id) return;
      map.set(p.id, {
        id: p.id,
        name: p.name || p.id,
        role: p.role ?? '',
        initials: p.initials ?? (p.name ? p.name.slice(0, 1) : '?'),
        tone: (p.tone as Participant['tone']) ?? 'neutral',
        speakingPct: typeof p.speakingPct === 'number' ? p.speakingPct : 0,
      });
    });
    return (id: string) => map.get(id) ?? defaultP(id);
  }, [apiMeta]);

  const navItems = [
    { id: 'minutes',       label: '一、常规纪要',   num: '01' },
    { id: 'tension',       label: '二、张力',        num: '02' },
    { id: 'new_cognition', label: '三、新认知',      num: '03' },
    { id: 'focus_map',     label: '四、各自关注点',  num: '04' },
    { id: 'consensus',     label: '五、共识与分歧',  num: '05' },
    { id: 'cross_view',    label: '六、观点对位',    num: '06' },
  ];

  // 默认 API 优先：UUID id 在 API 加载期间不渲染 fixture 内容，避免用户看到 mock 数据闪现
  if (apiState === 'loading') {
    return (
      <div style={{
        width: '100%', height: '100%', background: 'var(--paper)',
        color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--sans)', fontSize: 13,
      }}>加载中…</div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)',
      color: 'var(--ink)', overflow: 'hidden', display: 'flex',
      fontFamily: 'var(--sans)',
    }}>
      {/* ── Left rail ── */}
      <aside style={{
        width: 260, flexShrink: 0, padding: '32px 24px 24px 32px',
        borderRight: '1px solid var(--line-2)',
        display: 'flex', flexDirection: 'column', gap: 28, overflowY: 'auto',
      }}>
        <div>
          <SectionLabel>Meeting · 会议</SectionLabel>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
            marginTop: 10, letterSpacing: 0.3,
          }}>{id ?? MEETING.id}</div>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: 20, lineHeight: 1.25, fontWeight: 500,
            color: 'var(--ink)', marginTop: 8, letterSpacing: '-0.005em',
          }}>
            {displayTitle}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 12, lineHeight: 1.7 }}>
            {apiMeta?.date
              ? apiMeta.date.slice(0, 10)
              : `${MEETING.date} · ${MEETING.duration}`}
            {!apiMeta?.date && <><br />{MEETING.room}</>}
          </div>
          {usingMock && <MockBadge style={{ marginTop: 8 }} />}
        </div>

        <div>
          <SectionLabel>Contents</SectionLabel>
          <nav style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
            {navItems.map((n) => {
              const active = n.id === dim;
              return (
                <button key={n.id} onClick={() => setDim(n.id)} style={{
                  textAlign: 'left', padding: '9px 10px', border: 0, background: 'transparent',
                  cursor: 'pointer', borderRadius: 6, marginLeft: -10,
                  display: 'flex', alignItems: 'baseline', gap: 10,
                  color: active ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: active ? 600 : 400,
                  fontFamily: 'var(--serif)', fontSize: 14,
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10, color: active ? 'var(--accent)' : 'var(--ink-4)',
                    width: 18,
                  }}>{n.num}</span>
                  {n.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div>
          <SectionLabel>Participants · 在场</SectionLabel>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(apiMeta && apiMeta.participants.length > 0
              ? apiMeta.participants
              : EXPERTS.filter((e) => e.selected).map((e) => ({ name: e.name, role: e.field }))
            ).map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, background: 'var(--paper-3)',
                  color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{p.name.slice(0, 2)}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{p.name}</div>
                  {p.role && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{p.role}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Article body ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '48px 56px 80px', position: 'relative' }}>
        {/* Header */}
        <div style={{ maxWidth: 720 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.5,
          }}>
            <Dot color="var(--accent)" />
            会议纪要 · 深度解析版
            <span style={{ color: 'var(--ink-4)' }}>|</span>
            由 3 位专家并行分析 · preset: standard
          </div>
          <h1 style={{
            fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 44, lineHeight: 1.12,
            letterSpacing: '-0.02em', margin: '14px 0 8px',
          }}>
            {displayTitle}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
            {apiMeta
              ? `参与者 ${apiMeta.participants.length} 人 · 深度解析`
              : `参与者 6 人 · 发言 237 段 · 处理 ${MEETING.tokens} tokens · 生成用时 98 秒`}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--line-2)', margin: '36px 0 44px', maxWidth: 860 }} />

        {/* Dimension content */}
        {dim === 'minutes'       && <SecMinutes       a={a} P={P} />}
        {dim === 'tension'       && <SecTension       a={a} isMock={tensionMock} P={P} />}
        {dim === 'new_cognition' && <SecNewCognition  a={a} P={P} />}
        {dim === 'focus_map'     && <SecFocusMap      a={a} P={P} />}
        {dim === 'consensus'     && <SecConsensus     a={a} P={P} />}
        {dim === 'cross_view'    && <SecCrossView     a={a} P={P} />}
      </main>
    </div>
  );
}

export default VariantEditorial;
