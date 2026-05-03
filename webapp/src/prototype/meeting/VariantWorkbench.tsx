// VariantWorkbench — B 视图 · 三栏工作台
// 原型来源：/tmp/mn-proto/variant-b.jsx VariantWorkbench

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { MEETING, EXPERTS, ANALYSIS, P as defaultP } from './_fixtures';
import type { Participant } from './_fixtures';
import { Icon, Avatar, Chip, MonoMeta, SectionLabel, MockBadge, momentToText, momentSpeaker, momentBody } from './_atoms';
import { CrossAxisLinkInline } from './_axisShared';
import { useForceMock } from './_mockToggle';
import { adaptApiAnalysis, normalizeTensionMoments } from './_apiAdapters';
import { useMeetingShellTitle, useMeetingDetail, useMeetingHealth } from './MeetingDetailShell';
import { MeetingChatDrawer } from './MeetingChatDrawer';

type PFn = (id: string) => Participant;

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
  p: Participant; stance: string; text: string; tone: 'accent' | 'teal';
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
type TensionInterp = {
  biases: Array<{ id: string; bias_type: string; severity?: string; where_excerpt?: string }>;
  models: Array<{ id: string; model_name: string; outcome?: string; correctly_used?: boolean }>;
  judgments: Array<{ id: string; text: string; domain?: string; generality_score?: number }>;
  peakNote?: string;
};
function WBTension({ a, selected, setSelected, isMock, P = defaultP, interp, onAskAboutTension }: {
  a: typeof ANALYSIS; selected: string; setSelected: (id: string) => void; isMock?: boolean; P?: PFn;
  interp?: Record<string, TensionInterp>;
  onAskAboutTension?: (t: typeof ANALYSIS.tension[number]) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isMock && <div style={{ textAlign: 'right', marginBottom: 2 }}><MockBadge /></div>}
        {a.tension.map((t) => {
          const between = t.between ?? [];
          const p1 = between.length > 0 ? P(between[0]) : null;
          const p2 = between.length > 1 ? P(between[1]) : null;
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
                {p1 && <><Avatar p={p1} size={16} radius={3} /><span>{p1.name}</span></>}
                {p1 && p2 && <span style={{ color: 'var(--ink-4)' }}>↔</span>}
                {p2 && <><Avatar p={p2} size={16} radius={3} /><span>{p2.name}</span></>}
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
          if (!t) {
            return (
              <div style={{ padding: 28, color: 'var(--ink-3)', fontSize: 13 }}>
                暂无张力数据
              </div>
            );
          }
          const between = t.between ?? [];
          const p1 = between.length > 0 ? P(between[0]) : null;
          const p2 = between.length > 1 ? P(between[1]) : null;
          // 立场文本来源优先级（fixture 用「；」分隔, API 用「;」/逗号 + moments）：
          //   1) summary 用「；」/「;」/「。」可拆成两半 → 直接对半分
          //   2) moments 里抽 "<name>:「quote」" 形式按 P(pid).name 前缀匹配
          //   3) summary 第一句给 p1, 第二句兜底
          const stanceText = (() => {
            const s = String(t.summary ?? '');
            // 先尝试 ；/ ; / 。 三种分隔
            const m = s.split(/[；;]\s*/);
            if (m.length >= 2) return [m[0], m.slice(1).join('；').trim()] as const;
            // 从 moments 里抽 per-person 引用
            const quoteFor = (name: string): string => {
              if (!name) return '';
              for (const mom of (t.moments ?? [])) {
                const speaker = momentSpeaker(mom);
                if (!speaker) continue;
                if (speaker.includes(name) || name.includes(speaker)) return momentBody(mom);
              }
              return '';
            };
            const q1 = p1 ? quoteFor(p1.name) : '';
            const q2 = p2 ? quoteFor(p2.name) : '';
            if (q1 || q2) return [q1, q2] as const;
            // 最后兜底：summary 全文给 p1
            return [s, ''] as const;
          })();
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <MonoMeta>{t.id}</MonoMeta>
                <Chip tone="accent">强度 {(t.intensity * 100).toFixed(0)}</Chip>
                {onAskAboutTension && (
                  <button
                    type="button"
                    onClick={() => onAskAboutTension(t)}
                    style={{
                      marginLeft: 'auto',
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                      border: '1px solid var(--accent)', background: 'var(--accent-soft)',
                      color: 'oklch(0.32 0.1 40)', fontSize: 11.5, borderRadius: 4, cursor: 'pointer',
                      fontFamily: 'var(--sans)', fontWeight: 600,
                    }}
                    title="在抽屉里就这条张力追问"
                  >
                    💬 追问此会
                  </button>
                )}
              </div>
              <h3 style={{
                fontFamily: 'var(--serif)', fontSize: 22, margin: '0 0 12px',
                fontWeight: 600, letterSpacing: '-0.01em',
              }}>
                {t.topic}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'stretch', marginBottom: 20 }}>
                {p1 ? (
                  <Stance p={p1} stance={`${p1.name} 立场`} text={stanceText[0] || '（无对应引用段落）'} tone="accent" />
                ) : <div />}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 99, background: 'var(--paper-2)',
                    border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink-3)',
                  }}>vs</div>
                </div>
                {p2 ? (
                  <Stance p={p2} stance={`${p2.name} 立场`} text={stanceText[1] || '（无对应引用段落）'} tone="teal" />
                ) : <div />}
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
                    }}>{momentToText(m)}</div>
                  ))}
                </div>
              )}
              {/* 解读面板：mock 用 demo 文案；API 用 axes（cognitive_biases / mental_models / tension_peaks）按主题关键词匹配 */}
              {isMock ? (
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
              ) : (() => {
                const ip = interp?.[t.id];
                const has = ip && (ip.biases.length > 0 || ip.models.length > 0 || ip.judgments.length > 0 || ip.peakNote);
                return (
                  <div style={{
                    marginTop: 22, padding: '14px 16px', background: 'var(--paper-2)',
                    border: '1px solid var(--line-2)', borderRadius: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SectionLabel>解读 · 来自 axes</SectionLabel>
                      <MonoMeta style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                        knowledge · meta.affect_curve
                      </MonoMeta>
                    </div>
                    {!has && (
                      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '8px 0 0', lineHeight: 1.7 }}>
                        当前张力主题与 cognitive_biases / mental_models / judgments 无强关键词匹配，且
                        affect_curve.tension_peaks 没有对应排名条目。
                      </p>
                    )}
                    {!!ip?.biases.length && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{
                          fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.3,
                          textTransform: 'uppercase' as const, marginBottom: 4,
                        }}>cognitive_biases</div>
                        {ip.biases.map((b) => (
                          <div key={b.id} style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', marginTop: 4 }}>
                            <Chip tone="accent" style={{ fontSize: 10, padding: '1px 6px', marginRight: 6 }}>
                              {b.bias_type}{b.severity ? ` · ${b.severity}` : ''}
                            </Chip>
                            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>「{b.where_excerpt ?? ''}」</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!!ip?.models.length && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{
                          fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.3,
                          textTransform: 'uppercase' as const, marginBottom: 4,
                        }}>mental_models</div>
                        {ip.models.map((m) => (
                          <div key={m.id} style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', marginTop: 4 }}>
                            <Chip tone="teal" style={{ fontSize: 10, padding: '1px 6px', marginRight: 6 }}>
                              {m.model_name}{m.correctly_used === false ? ' · ⚠ 未对位' : ''}
                            </Chip>
                            <span>{m.outcome ?? ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!!ip?.judgments.length && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{
                          fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.3,
                          textTransform: 'uppercase' as const, marginBottom: 4,
                        }}>judgments（高泛化度 + 主题相关）</div>
                        {ip.judgments.map((j) => (
                          <div key={j.id} style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', marginTop: 4 }}>
                            <Chip tone="ghost" style={{ fontSize: 10, padding: '1px 6px', marginRight: 6 }}>
                              {j.domain ?? '通用'}{typeof j.generality_score === 'number' ? ` · ${(j.generality_score).toFixed(2)}` : ''}
                            </Chip>
                            <span style={{ fontFamily: 'var(--serif)' }}>{j.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {ip?.peakNote && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{
                          fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.3,
                          textTransform: 'uppercase' as const, marginBottom: 4,
                        }}>affect_curve · tension_peak（按强度排名匹配）</div>
                        <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', fontFamily: 'var(--serif)' }}>
                          {ip.peakNote}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── WBMinutes ──
function WBMinutes({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
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
function WBNewCognition({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
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
function WBFocusMap({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
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
function WBConsensus({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
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
function WBCrossView({ a, P = defaultP }: { a: typeof ANALYSIS; P?: PFn }) {
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
  const forceMock = useForceMock();
  const [dim, setDim] = useState('tension');
  const [selectedT, setSelectedT] = useState('T1');
  const [a, setA] = useState<typeof ANALYSIS>(ANALYSIS);
  const [usingMock, setUsingMock] = useState(true);
  const [tensionMock, setTensionMock] = useState(true);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error' | 'skipped'>('skipped');
  const [apiParticipants, setApiParticipants] = useState<Array<{ id?: string; name: string; role?: string; initials?: string; tone?: string; speakingPct?: number }>>([]);
  // Phase: 张力 → 解读（从 axes.knowledge + meta.affect_curve 抽取，按主题关键词与强度排名近似匹配）
  const [apiAxes, setApiAxes] = useState<any>(null);
  // 专家栈：detail API 透传的 expertRoles + JOIN expert_profiles 后的卡片数据
  const [apiExperts, setApiExperts] = useState<Array<{
    id: string; name: string; role: 'people' | 'projects' | 'knowledge';
    roleLabel: string; field: string; style: string; mentalModels: string[]; match: number;
  }>>([]);
  const shellTitle = useMeetingShellTitle();
  const displayTitle = shellTitle || MEETING.title;
  // 复用 Shell 已经抓的 detail 响应 — 避免重复 fetch
  const { detail: shellDetail, state: shellDetailState } = useMeetingDetail();

  // 「追问此会」抽屉：drawerTension=null 时为会议级（顶栏入口）；非空为张力级（详情按钮入口）
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatDrawerTension, setChatDrawerTension] = useState<typeof ANALYSIS.tension[number] | null>(null);
  const openChatDrawer = (t: typeof ANALYSIS.tension[number] | null) => {
    setChatDrawerTension(t);
    setChatDrawerOpen(true);
  };

  // 把 API 提供的 participants（带真实 id/name/role/tone）映射成局部 P()，
  // 让 WB* 子组件按 'p1'/'p2'… 查询到真实人名（永邦、赵一濛…），而不是 fixture 的陈汀/王校长。
  const P = useMemo<PFn>(() => {
    const map = new Map<string, Participant>();
    apiParticipants.forEach((p) => {
      if (typeof p.id !== 'string' || !p.id) return;
      map.set(p.id, {
        id: p.id,
        name: p.name || p.id,
        role: p.role ?? '',
        initials: p.initials ?? p.name.slice(0, 2),
        tone: (p.tone as 'warm' | 'cool' | 'neutral') ?? 'neutral',
        speakingPct: p.speakingPct ?? 0,
      });
    });
    return (id: string) => map.get(id) ?? defaultP(id);
  }, [apiParticipants]);

  // 张力解读：用主题关键词（停用词过滤后 ≥2 char tokens）匹配 axes 的 where_excerpt / outcome；
  // tension_peaks 按 intensity 排名映射到 analysis.tension 同 rank 那条。
  // 没有匹配项时返回 null 让 WBTension 渲染兜底文案。
  type TensionInterp = {
    biases: Array<{ id: string; bias_type: string; severity?: string; where_excerpt?: string }>;
    models: Array<{ id: string; model_name: string; outcome?: string; correctly_used?: boolean }>;
    judgments: Array<{ id: string; text: string; domain?: string; generality_score?: number }>;
    peakNote?: string;
  };
  const tensionInterp = useMemo<Record<string, TensionInterp>>(() => {
    const out: Record<string, TensionInterp> = {};
    if (!apiAxes) return out;
    const biases: any[] = apiAxes?.knowledge?.cognitive_biases ?? [];
    const models: any[] = apiAxes?.knowledge?.mental_models ?? [];
    const judgments: any[] = apiAxes?.knowledge?.judgments ?? [];
    const peaks: any[] = apiAxes?.meta?.affect_curve?.tension_peaks ?? [];

    // 中文 ≥2 字 token；剥常见标点
    const tokenize = (s: string): string[] => {
      const cleaned = (s ?? '').replace(/[，。、；：?？!！"「」『』()（）/\\\-—_.…]/g, ' ');
      const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
      // 也加入 1+1 的滑窗（捕获双字关键词），但只在 token 长度 >= 3 时才滑
      const grams: string[] = [];
      for (const t of tokens) {
        grams.push(t);
        if (t.length >= 3) for (let i = 0; i + 2 <= t.length; i++) grams.push(t.slice(i, i + 2));
      }
      return Array.from(new Set(grams));
    };
    const score = (haystack: string, kws: string[]): number => {
      if (!haystack) return 0;
      let s = 0;
      for (const k of kws) if (k.length >= 2 && haystack.includes(k)) s += k.length >= 3 ? 2 : 1;
      return s;
    };

    // 按 intensity 排名映射 tension_peaks
    const peaksByRank = peaks.slice().sort((a, b) => {
      const ai = Number(a.intensity ?? 0), bi = Number(b.intensity ?? 0);
      return bi - ai;
    });
    const tensionsByIntensity = (a.tension ?? []).slice().sort((x: any, y: any) => Number(y.intensity ?? 0) - Number(x.intensity ?? 0));

    for (const t of (a.tension ?? [])) {
      const kws = tokenize(`${t.topic ?? ''} ${t.summary ?? ''}`);
      const scoredBiases = biases
        .map((b) => ({ b, s: score(`${b.bias_type ?? ''} ${b.where_excerpt ?? ''}`, kws) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, 3)
        .map((x) => ({
          id: String(x.b.id),
          bias_type: String(x.b.bias_type ?? ''),
          severity: x.b.severity,
          where_excerpt: x.b.where_excerpt,
        }));
      const scoredModels = models
        .map((m) => ({ m, s: score(`${m.model_name ?? ''} ${m.outcome ?? ''}`, kws) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, 3)
        .map((x) => ({
          id: String(x.m.id),
          model_name: String(x.m.model_name ?? ''),
          outcome: x.m.outcome,
          correctly_used: x.m.correctly_used,
        }));
      const scoredJudgments = judgments
        .map((j) => ({
          j,
          // 主题关键词权重 + generality_score 作为先验
          s: score(`${j.text ?? ''} ${j.domain ?? ''}`, kws) + Number(j.generality_score ?? 0),
        }))
        .filter((x) => x.s >= 1.0) // 阈值从 1.5 → 1.0：只要 generality 高（≥0.6）+ 单字关键词或单一好词命中即可
        .sort((x, y) => y.s - x.s)
        .slice(0, 3)
        .map((x) => ({
          id: String(x.j.id),
          text: String(x.j.text ?? ''),
          domain: x.j.domain,
          generality_score: Number(x.j.generality_score ?? 0),
        }));
      // 找到 t 在 intensity 排序中的下标，对应同一下标的 peak
      const rank = tensionsByIntensity.findIndex((x: any) => x.id === t.id);
      const peakNote = rank >= 0 && peaksByRank[rank]?.note ? String(peaksByRank[rank].note) : undefined;
      out[t.id] = { biases: scoredBiases, models: scoredModels, judgments: scoredJudgments, peakNote };
    }
    return out;
  }, [apiAxes, a]);

  // 同步 Shell 已抓取的 detail —— 不再单独 fetch（dev StrictMode 下避免重复请求）
  useEffect(() => {
    if (forceMock) {
      setA(ANALYSIS);
      setUsingMock(true);
      setTensionMock(true);
      setApiState('skipped');
      setApiParticipants([]);
      return;
    }
    if (shellDetailState === 'loading') { setApiState('loading'); return; }
    if (shellDetailState === 'skipped') { setApiState('skipped'); return; }
    const data = shellDetail;
    if (shellDetailState === 'error' || !data?.analysis) { setApiState('error'); return; }
    setA(adaptApiAnalysis(data.analysis));
    setUsingMock(false);
    setApiState('ok');
    if (Array.isArray(data.analysis.participants)) {
      setApiParticipants(data.analysis.participants);
    }
    if (Array.isArray(data.analysis.experts)) {
      setApiExperts(data.analysis.experts);
    }
    const tensionsInAnalysis = Array.isArray(data.analysis.tension) && data.analysis.tension.length > 0;
    const sectionTension = (data.analysis.sections ?? []).find((s: any) => s.id === 'tension');
    const tensionsInSections = Array.isArray(sectionTension?.body) && sectionTension.body.length > 0;
    if (tensionsInAnalysis || tensionsInSections) setTensionMock(false);
  }, [forceMock, shellDetail, shellDetailState]);

  // 独立 endpoint —— axes (cognitive_biases / mental_models / affect_curve · 用于张力解读)
  // 与 Shell 抓的 detail 互不重叠，保持单独 fetch
  useEffect(() => {
    if (forceMock || !id) { setApiAxes(null); return; }
    meetingNotesApi.getMeetingAxes(id).then((axes) => setApiAxes(axes)).catch(() => {});
  }, [id, forceMock]);

  // Phase 15.15 · C.1 · tension probe（独立 endpoint）
  useEffect(() => {
    if (forceMock || !id) return;
    meetingNotesApi.getMeetingTensions(id)
      .then((data) => {
        if (data?.items?.length) {
          // 把 between_ids（mn_people UUID）→ canonical_name 注入 apiParticipants，
          // 让 P(uuid) 能解析出真实姓名而非显示原始 UUID。
          const uuidEntries: Array<{ id: string; name: string }> = [];
          data.items.forEach((t) => {
            (t.between_ids ?? []).forEach((uid, i) => {
              const name = t.between_names?.[i];
              if (uid && name) uuidEntries.push({ id: uid, name });
            });
          });
          if (uuidEntries.length) {
            setApiParticipants((prev) => {
              const existing = new Set(prev.map((p) => p.id));
              const newEntries = uuidEntries.filter((e) => !existing.has(e.id));
              return newEntries.length ? [...prev, ...newEntries] : prev;
            });
          }

          setA((prev) => ({ ...prev, tension: data.items.map((t) => ({
            id: t.tension_key,
            between: t.between_ids,
            topic: t.topic,
            intensity: t.intensity,
            summary: t.summary ?? '',
            moments: normalizeTensionMoments(t.moments),
          })) }));
          setTensionMock(false);
        }
      })
      .catch(() => {});
  }, [id, forceMock]);

  const dimList = [
    { id: 'minutes',       icon: 'ledger'  as const, label: '常规纪要' },
    { id: 'tension',       icon: 'bolt'    as const, label: '张力' },
    { id: 'new_cognition', icon: 'sparkle' as const, label: '新认知' },
    { id: 'focus_map',     icon: 'target'  as const, label: '关注点' },
    { id: 'consensus',     icon: 'scale'   as const, label: '共识/分歧' },
    { id: 'cross_view',    icon: 'network' as const, label: '观点对位' },
  ];

  const activeDim = dimList.find((x) => x.id === dim) ?? dimList[0];

  if (apiState === 'loading') {
    return (
      <div style={{
        width: '100%', height: '100%', background: 'var(--paper-2)',
        color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--sans)', fontSize: 13,
      }}>加载中…</div>
    );
  }

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
          <span>{id ?? MEETING.id}</span>
          <Icon name="chevron" size={12} style={{ color: 'var(--ink-4)' }} />
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{displayTitle}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {usingMock && <MockBadge />}
          {/* 这三个 chip 当前没有真实数据来源（音视频源、preset、active experts 计数）·
              API 模式下隐藏，避免误导；mock 模式保留作为 demo 风味。 */}
          {usingMock && <>
            <Chip tone="ghost"><Icon name="mic" size={11} />m4a + docx</Chip>
            <Chip tone="ghost">preset: standard</Chip>
            <Chip tone="accent">3 experts active</Chip>
            <div style={{ width: 1, height: 22, background: 'var(--line)' }} />
          </>}
          <button
            type="button"
            onClick={() => openChatDrawer(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
              border: '1px solid var(--accent)', background: 'var(--accent-soft)',
              color: 'oklch(0.32 0.1 40)', fontSize: 12, borderRadius: 5, cursor: 'pointer',
              fontFamily: 'var(--sans)', fontWeight: 600,
            }}
            title="基于会议上下文向 Claude 或专家追问"
          >
            💬 追问此会
          </button>
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

          <div style={{ padding: '22px 16px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SectionLabel>专家栈 Experts</SectionLabel>
            {!usingMock && <MockBadge />}
          </div>
          <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
            {usingMock ? (
              <>
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
              </>
            ) : apiExperts.length > 0 ? (
              <>
                {apiExperts.map((e) => {
                  const tone =
                    e.role === 'people' ? 'teal' :
                    e.role === 'projects' ? 'amber' : 'accent';
                  return (
                    <div key={e.id} style={{
                      border: '1px solid var(--line-2)', borderRadius: 6, padding: '9px 10px', background: 'var(--paper-2)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{e.id}</span>
                        <Chip tone={tone} style={{ padding: '1px 6px', fontSize: 10 }}>{e.roleLabel}</Chip>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4, lineHeight: 1.35 }}>{e.name}</div>
                      {e.field && (
                        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{e.field}</div>
                      )}
                      {e.mentalModels.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {e.mentalModels.slice(0, 3).map((m, i) => (
                            <span key={i} style={{
                              fontFamily: 'var(--mono)', fontSize: 9.5, padding: '1px 5px',
                              background: 'var(--paper)', border: '1px solid var(--line-2)',
                              borderRadius: 3, color: 'var(--ink-3)',
                            }}>{m}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{
                fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6,
                padding: '10px 10px', border: '1px dashed var(--line-2)', borderRadius: 6,
              }}>
                本会议无 run.expertRoles 数据（未跑过专家分析的 standard run）。
              </div>
            )}
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
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* dim → axis 映射，把当前 dim 的"跨轴线索"挂到 header 右上角 */}
              <CrossAxisLinkInline axis={
                dim === 'minutes' || dim === 'consensus' ? '项目'
                : dim === 'focus_map' ? '人物'
                : '知识' /* tension / new_cognition / cross_view 都归到知识轴 */
              } />
              {/* 知识锚定 / 置信度 当前没有真实指标来源 · 仅 mock 模式展示 */}
              {usingMock && <>
                <Chip tone="ghost"><Icon name="sparkle" size={10} />知识锚定已启用</Chip>
                <Chip tone="ghost">置信度: 0.78</Chip>
              </>}
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
            {dim === 'tension'       && <WBTension       a={a} selected={selectedT} setSelected={setSelectedT} isMock={tensionMock} P={P} interp={tensionInterp} onAskAboutTension={openChatDrawer} />}
            {dim === 'minutes'       && <WBMinutes        a={a} P={P} />}
            {dim === 'new_cognition' && <WBNewCognition   a={a} P={P} />}
            {dim === 'focus_map'     && <WBFocusMap       a={a} P={P} />}
            {dim === 'consensus'     && <WBConsensus      a={a} P={P} />}
            {dim === 'cross_view'    && <WBCrossView      a={a} P={P} />}
          </div>
        </section>

        {/* Right: transcript / evidence */}
        <aside style={{
          borderLeft: '1px solid var(--line)', background: 'var(--paper)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* R3-A · 改动一：B 视图吸收 meta.necessity + tension 张力数据 */}
          <CostAndTensionCard />

          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SectionLabel>原文锚点 Evidence</SectionLabel>
              {!usingMock && <MockBadge />}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
              每一条分析都回溯到 2-3 个原文段落
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {usingMock && TRANSCRIPT.map((t, i) => (
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
            {/* API 模式：把当前 dim 关联的 moments / trigger 当原文锚点展示
                · tension     → 选中条目的 moments[]（"name:「quote」" 形式拆解）
                · new_cog     → 每条 newCognition 的 trigger
                · cross_view  → claim 的发言（claimBy + claim）+ responses
                · 其他 dim 暂无逐句锚点，显示提示。 */}
            {!usingMock && (() => {
              const blocks: Array<{ who: string; text: string; tag?: string }> = [];
              if (dim === 'tension') {
                const t = a.tension.find((x) => x.id === selectedT) ?? a.tension[0];
                for (const raw of (t?.moments ?? [])) {
                  const speaker = momentSpeaker(raw) || '?';
                  const quote = momentBody(raw);
                  if (!quote) continue;
                  // 通过名字反查 pid（apiParticipants 名字前缀匹配）
                  const pid = apiParticipants.find((pp) => pp.name && (pp.name.includes(speaker) || speaker.includes(pp.name)))?.id ?? '?';
                  blocks.push({ who: pid, text: quote, tag: t?.id });
                }
              } else if (dim === 'new_cognition') {
                for (const n of a.newCognition) {
                  if (n.trigger) blocks.push({ who: n.who, text: n.trigger, tag: n.id });
                }
              } else if (dim === 'cross_view') {
                for (const v of a.crossView as any[]) {
                  blocks.push({ who: v.claimBy, text: v.claim, tag: v.id });
                  for (const r of (v.responses ?? [])) {
                    blocks.push({ who: r.who, text: r.text, tag: v.id });
                  }
                }
              }
              if (blocks.length === 0) {
                return (
                  <div style={{
                    fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7,
                    padding: '14px 14px', border: '1px dashed var(--line-2)', borderRadius: 6,
                  }}>
                    当前维度暂无逐句原文锚点。
                    {dim === 'tension' && '（选中左侧任一张力条目以查看其 moments）'}
                  </div>
                );
              }
              return blocks.map((b, i) => {
                const p = P(b.who);
                return (
                  <div key={i} style={{
                    borderLeft: '2px solid var(--accent)', paddingLeft: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Avatar p={p} size={16} radius={3} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                    </div>
                    <div style={{
                      fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)',
                      fontFamily: 'var(--serif)',
                    }}>{b.text}</div>
                    {b.tag && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                        <Chip tone="accent" style={{ fontSize: 10, padding: '1px 6px' }}>{b.tag}</Chip>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </aside>
      </div>

      {/* 「追问此会」抽屉：会议级 + 张力级两种入口共用 */}
      <MeetingChatDrawer
        open={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        meetingId={id ?? null}
        meetingTitle={displayTitle}
        tension={chatDrawerTension}
        resolveParticipant={P}
      />
    </div>
  );
}

// R3-A · 改动一：B 视图右栏顶部 — 「这场会的代价」卡片
// 数据：useMeetingHealth() — necessity（verdict / suggestedDuration / reasons）
//       + tension（peakIntensity / count）
// anchors: id='necessity-section' + id='tension-section'，对应顶部对应徽章点击
function CostAndTensionCard() {
  const health = useMeetingHealth();
  const n = health?.necessity;
  const t = health?.tension;
  const verdictLabel = (v?: string) =>
    v === 'async_ok' ? '本可异步' : v === 'partial' ? '部分必要' : v === 'needed' ? '确有必要' : '—';
  const verdictColor = (v?: string) =>
    v === 'async_ok' ? 'oklch(0.40 0.10 30)'
    : v === 'partial' ? 'oklch(0.45 0.09 75)'
    : v === 'needed'  ? 'oklch(0.40 0.09 160)'
    : 'var(--ink-3)';
  return (
    <div id="necessity-section" style={{
      padding: '14px 16px', borderBottom: '1px solid var(--line)',
      background: 'var(--paper-2)',
    }}>
      <SectionLabel>这场会的代价 · Cost & Tension</SectionLabel>
      {!n && !t ? (
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8 }}>
          数据待生成 · meta.necessity / tension
        </div>
      ) : (
        <>
          {n && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600,
                  color: verdictColor(n.verdict),
                }}>
                  {verdictLabel(n.verdict)}
                </span>
                {n.suggestedDurationMin !== undefined && (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                    建议 {n.suggestedDurationMin} 分钟
                  </span>
                )}
              </div>
              {Array.isArray(n.reasons) && n.reasons.length > 0 && (
                <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                  {n.reasons.slice(0, 3).map((r, i) => (
                    <li key={i} style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 3 }}>
                      · {r.t || r.k || ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {t && t.count > 0 && (
            <div id="tension-section" style={{
              marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>张力</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, color: 'oklch(0.40 0.11 25)' }}>
                  {t.peakIntensity.toFixed(2)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>峰值</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                  {t.count} 处
                </span>
              </div>
              {/* 简易强度条：max=1，按 peakIntensity 显示 */}
              <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, t.peakIntensity * 100))}%`,
                  height: '100%',
                  background: 'oklch(0.60 0.16 25)',
                }} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default VariantWorkbench;
