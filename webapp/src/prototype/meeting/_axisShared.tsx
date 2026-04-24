// _axisShared.tsx — DimShell + ScopePill / RunBadge / CrossAxisLink (原型级交互)
// 原型来源：
//   - DimShell：dimensions-people.jsx
//   - ScopePill / RunBadge / CrossAxisLink：main-shell.jsx L463-868

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, MonoMeta, SectionLabel } from './_atoms';
import type { IconName } from './_atoms';
import { useMeetingScope, type ScopeKind } from './_scopeContext';

export type AxisName = '人物' | '项目' | '知识' | '会议本身' | '纵向视图 · 跨会议';

export interface TabDef {
  id: string;
  label: string;
  sub: string;
  icon: IconName;
}

function axisColorFor(axis: string): string {
  if (axis === '人物') return 'var(--accent)';
  if (axis === '项目') return 'var(--teal)';
  if (axis === '知识') return 'var(--amber)';
  return 'var(--ink)';
}

// ── CrossAxisLink · 跨轴线索弹层 ────────────────────────────────

const CROSSAXIS_RELATED: Record<string, { targetAxis: string; targetLabel: string; detail: string; count: number; to: string }[]> = {
  '人物': [
    { targetAxis: '项目', targetLabel: '项目轴 · 风险热度', detail: '张总 3 个挂名项目全部亮红灯',       count: 3, to: '/meeting/axes/projects' },
    { targetAxis: '知识', targetLabel: '知识轴 · 认知偏差', detail: '其发言触发 4 次 anchoring bias',     count: 4, to: '/meeting/axes/knowledge' },
    { targetAxis: '纵向', targetLabel: '纵向 · 信念漂移',   detail: '对「推理层」的判断从 +0.7 降到 −0.2', count: 1, to: '/meeting/longitudinal' },
  ],
  '项目': [
    { targetAxis: '人物', targetLabel: '人物轴 · 承诺兑现', detail: '3 位 steward 兑现率均 <50%',         count: 3, to: '/meeting/axes/people' },
    { targetAxis: '知识', targetLabel: '知识轴 · 反事实',   detail: '2 条被否决的路径现在重新相关',         count: 2, to: '/meeting/axes/knowledge' },
    { targetAxis: '会议', targetLabel: '会议轴 · 必要性',   detail: '最近 4 场会议中 2 场标记「低必要」',   count: 2, to: '/meeting/axes/meta' },
  ],
  '知识': [
    { targetAxis: '人物', targetLabel: '人物轴 · 发言质量', detail: '引用率最高的 3 位的心智模型覆盖',     count: 3, to: '/meeting/axes/people' },
    { targetAxis: '项目', targetLabel: '项目轴 · 假设清单', detail: 'J-01 判断关联 5 条未验证假设',        count: 5, to: '/meeting/axes/projects' },
  ],
  '会议本身': [
    { targetAxis: '人物', targetLabel: '人物轴 · 沉默信号', detail: '低质量会议中的普遍沉默者',            count: 2, to: '/meeting/axes/people' },
    { targetAxis: '项目', targetLabel: '项目轴 · 开放问题', detail: '高情绪温度 → 12 条未决问题',          count: 12, to: '/meeting/axes/projects' },
  ],
  '纵向视图 · 跨会议': [
    { targetAxis: '人物', targetLabel: '人物轴 · 角色演化', detail: '角色切换最频繁的 2 位',              count: 2, to: '/meeting/axes/people' },
    { targetAxis: '知识', targetLabel: '知识轴 · 心智命中', detail: '命中率 >70% 的 3 个心智模型',        count: 3, to: '/meeting/axes/knowledge' },
  ],
};

const AXIS_TONE: Record<string, string> = {
  '人物': 'var(--accent)', '项目': 'var(--teal)', '知识': 'var(--amber)',
  '会议': 'var(--ink)', '纵向': 'var(--ink-2)',
};

function CrossAxisLink({ axis }: { axis: AxisName }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const related = CROSSAXIS_RELATED[axis] ?? CROSSAXIS_RELATED['人物'];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="此轴与其他轴的跨维线索"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', border: '1px solid var(--line-2)',
          background: 'var(--paper-2)', borderRadius: 4, cursor: 'pointer',
          fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-2)',
        }}
      >
        <Icon name="git" size={11} />
        相关
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', marginLeft: 2 }}>
          {related.length}
        </span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
            minWidth: 340, background: 'var(--paper)', border: '1px solid var(--line)',
            borderRadius: 8, boxShadow: '0 12px 28px -12px rgba(0,0,0,0.18)',
            padding: 10, fontFamily: 'var(--sans)',
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)',
              letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 6px 8px',
            }}>跨轴线索 · 此轴发现的问题在别处的映射</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {related.map((r, i) => {
                const tone = AXIS_TONE[r.targetAxis] ?? 'var(--ink)';
                return (
                  <button key={i} onClick={() => { setOpen(false); navigate(r.to); }} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 10px',
                    border: 0, background: 'transparent', borderRadius: 5, cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'var(--sans)', transition: 'background 140ms',
                  }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}>
                    <span style={{ width: 3, alignSelf: 'stretch', background: tone, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{r.targetLabel}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.45 }}>{r.detail}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: tone, fontWeight: 600 }}>{r.count}</span>
                      <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── ScopePill · kind × instance 切换 + toast 反馈 ───────────────

interface ToastState {
  kind: 'auto' | 'manual' | 'manual-lib';
  label: string;
  msg: string;
  meta: string;
}

const KIND_TONE: Record<ScopeKind, string> = {
  LIBRARY: 'var(--ink)',
  PROJECT: 'var(--teal)',
  CLIENT:  'var(--accent)',
  TOPIC:   'var(--amber)',
};

function ScopePill() {
  const scope = useMeetingScope();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function fireToast(nextKindId: string, nextLabel: string) {
    const data: ToastState = nextKindId === 'project'
      ? { kind: 'auto',       label: nextLabel, msg: '后台已入队增量',          meta: 'run-240 · queued · ~45s' }
      : nextKindId === 'all'
      ? { kind: 'manual-lib', label: nextLabel, msg: '全库重算需手动触发',      meta: '预计 18 min · ~320k tokens · 上次 14 天前' }
      : { kind: 'manual',     label: nextLabel, msg: '此 scope 需手动触发重算', meta: '数据显示上一次 run 的结果' };
    setToast(data);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  const tone = KIND_TONE[scope.kind];

  return (
    <div style={{ position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 38,
          minWidth: 320, maxWidth: 380,
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 10px 28px -10px rgba(0,0,0,0.18)',
          padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
          fontFamily: 'var(--sans)',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 5, flexShrink: 0,
            background: toast.kind === 'auto' ? 'var(--teal-soft)'
                      : toast.kind === 'manual-lib' ? 'var(--amber-soft)'
                      : 'var(--paper-2)',
            border: `1px solid ${
              toast.kind === 'auto' ? 'var(--teal)'
              : toast.kind === 'manual-lib' ? 'var(--amber)'
              : 'var(--line)'
            }`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: toast.kind === 'auto' ? 'var(--teal)'
                 : toast.kind === 'manual-lib' ? 'var(--amber)'
                 : 'var(--ink-2)',
            fontSize: 13,
          }}>{toast.kind === 'auto' ? '↻' : '⏸'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.003em' }}>
              已切到「{toast.label}」 · {toast.msg}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>
              {toast.meta}
            </div>
            {toast.kind !== 'auto' && (
              <button onClick={() => { setToast(null); navigate('/meeting/generation-center'); }} style={{
                marginTop: 8, padding: '5px 10px', fontSize: 11,
                border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
                borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--sans)',
              }}>去生成中心手动触发 →</button>
            )}
          </div>
          <button onClick={() => setToast(null)} style={{
            border: 0, background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer',
            padding: 0, lineHeight: 1, fontSize: 14,
          }}>×</button>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title="当前作用域 · 点击切换"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px 5px 8px', border: '1px solid var(--line)',
          background: 'var(--paper)', borderRadius: 999, cursor: 'pointer',
          fontFamily: 'var(--sans)', color: 'var(--ink-2)', fontSize: 11.5,
        }}
      >
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 0.4,
          padding: '2px 6px', borderRadius: 3, background: tone, color: 'var(--paper)',
        }}>{scope.kind}</span>
        <span style={{
          fontWeight: 600, color: 'var(--ink)',
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{scope.label}</span>
        <span style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{scope.meta}</span>
        <Icon name="chevronDown" size={11} style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
            background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8,
            boxShadow: '0 12px 32px -12px rgba(0,0,0,0.18)',
            minWidth: 320, padding: 10, fontFamily: 'var(--sans)',
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)',
              letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 6px 8px',
            }}>切换作用域 · 同一批数据的不同投射</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {scope.kinds.map((k) => {
                const active = k.id === scope.kindId;
                const kTone = KIND_TONE[k.kind];
                return (
                  <button key={k.id} onClick={() => {
                    setOpen(false);
                    scope.setKind(k.id);
                    fireToast(k.id, k.id === 'all' ? '全库' : (k.instances.find((i) => i.id === scope.instanceId)?.label ?? k.label));
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: active ? `1px solid ${kTone}` : '1px solid var(--line-2)',
                    background: active ? 'var(--paper-2)' : 'transparent',
                    borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: kTone }} />
                    <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, color: 'var(--ink)' }}>{k.label}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-4)' }}>{k.kind}</span>
                  </button>
                );
              })}
            </div>

            {/* instance picker */}
            {scope.kindId !== 'all' && (() => {
              const group = scope.kinds.find((g) => g.id === scope.kindId);
              if (!group || group.instances.length === 0) return null;
              return (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)',
                    letterSpacing: 0.4, textTransform: 'uppercase', padding: '0 6px 6px',
                  }}>选择{group.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {group.instances.map((x) => {
                      const active = scope.instanceId === x.id;
                      return (
                        <button key={x.id} onClick={() => {
                          setOpen(false);
                          scope.setInstance(group.id, x.id);
                          fireToast(group.id, x.label);
                        }} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                          border: 0, borderRadius: 4, cursor: 'pointer',
                          background: active ? 'var(--paper-2)' : 'transparent',
                          textAlign: 'left', fontFamily: 'var(--sans)',
                        }}>
                          <span style={{
                            width: 12, height: 12, borderRadius: 99, flexShrink: 0,
                            border: active ? `3.5px solid ${tone}` : '1px solid var(--line)',
                          }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, color: 'var(--ink)' }}>{x.label}</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>{x.meta}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div style={{
              marginTop: 10, padding: '8px 10px', background: 'var(--paper-2)',
              borderRadius: 5, fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.55,
            }}>
              <b style={{ color: 'var(--ink-2)' }}>提示</b>：切换作用域会重新计算此轴 —— project 自动 · library 手动触发。
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── RunBadge · hover popover ──────────────────────────────────

function RunBadge({ axis, run = 'run-237', version = 'v14', time = '08:03' }: { axis: AxisName; run?: string; version?: string; time?: string }) {
  const [open, setOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const axisQuery = { '人物': 'people', '项目': 'projects', '知识': 'knowledge', '会议本身': 'meta', '纵向视图 · 跨会议': 'longitudinal' }[axis];

  function mouseEnter() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 180);
  }
  function mouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(false), 260);
  }
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  return (
    <div style={{ position: 'relative' }} onMouseEnter={mouseEnter} onMouseLeave={mouseLeave}>
      <button
        title="点击进入生成中心 · 查看此轴的 run 详情与历史版本"
        onClick={() => navigate(`/meeting/generation-center?tab=versions&axis=${axisQuery}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', border: '1px solid var(--line-2)',
          background: 'var(--paper)', borderRadius: 4, cursor: 'pointer',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
          letterSpacing: 0.3,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--teal)', boxShadow: '0 0 0 2px var(--teal-soft)' }} />
        {version} · {time}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 39,
          minWidth: 300, background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 8, boxShadow: '0 12px 28px -12px rgba(0,0,0,0.2)',
          padding: '14px 16px', fontFamily: 'var(--sans)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.4,
              padding: '2px 7px', borderRadius: 3, background: 'var(--ink)', color: 'var(--paper)',
            }}>{run}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600, letterSpacing: '-0.003em' }}>
              {axis} · {version}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 11.5, lineHeight: 1.55 }}>
            <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>strategy</span>
            <span style={{ color: 'var(--ink)' }}>debate · 3 experts</span>
            <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>preset</span>
            <span style={{ color: 'var(--ink)' }}>standard</span>
            <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>scope</span>
            <span style={{ color: 'var(--ink)' }}>LIBRARY · 全库 48 meetings</span>
            <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>cost</span>
            <span style={{ color: 'var(--ink)' }}>49,622 tokens · 2m 08s</span>
          </div>

          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-2)',
            display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
              VS 上版 v13
            </div>
            <div style={{ display: 'flex', gap: 10, color: 'var(--ink-2)' }}>
              <span>承诺 <b style={{ color: 'var(--teal)' }}>+3</b></span>
              <span>at-risk <b style={{ color: 'var(--accent)' }}>+1</b></span>
              <span>置信度 <b style={{ color: 'var(--ink)' }}>0.78 → 0.81</b></span>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <button onClick={() => navigate(`/meeting/generation-center?tab=versions&axis=${axisQuery}`)} style={{
              flex: 1, padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--sans)',
              border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
              borderRadius: 4, cursor: 'pointer',
            }}>生成中心 · versions →</button>
            <button onClick={() => navigate(`/meeting/generation-center?tab=versions&axis=${axisQuery}&diff=v13`)} style={{
              padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--sans)',
              border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink-2)',
              borderRadius: 4, cursor: 'pointer',
            }}>diff v13</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DimShell ─────────────────────────────────────────────────

export function DimShell({
  axis, tabs, tab, setTab, children, onOpenRegenerate,
}: {
  axis: AxisName;
  tabs: TabDef[];
  tab: string;
  setTab: (id: string) => void;
  children: ReactNode;
  onOpenRegenerate?: () => void;
}) {
  const axisColor = axisColorFor(axis);
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)',
      display: 'grid', gridTemplateRows: '64px 1fr', color: 'var(--ink)',
      fontFamily: 'var(--sans)', overflow: 'hidden',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px',
        borderBottom: '1px solid var(--line-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 7,
            background: 'var(--paper-2)', border: '1px solid var(--line-2)',
            borderLeft: `3px solid ${axisColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, color: 'var(--ink)',
          }}>{axis[0]}</div>
          <div>
            <MonoMeta style={{ fontSize: 10 }}>AXIS · 一库多视图</MonoMeta>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.005em', marginTop: -2 }}>
              {axis}轴
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', marginLeft: 18, gap: 2, border: '1px solid var(--line)', borderRadius: 6, padding: 2 }}>
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} title={t.sub} style={{
                padding: '6px 13px', border: 0, borderRadius: 4, fontSize: 12.5,
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--paper)' : 'var(--ink-2)',
                cursor: 'pointer', fontWeight: active ? 600 : 450,
                fontFamily: 'var(--sans)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Icon name={t.icon} size={12} />{t.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {tabs.map((t) => t.id === tab ? (
            <span key={t.id} style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.sub}</span>
          ) : null)}
          <CrossAxisLink axis={axis} />
          <ScopePill />
          <button
            onClick={onOpenRegenerate}
            disabled={!onOpenRegenerate}
            title="重新生成此轴数据"
            style={{
              border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 5,
              padding: '5px 10px', fontSize: 11.5,
              cursor: onOpenRegenerate ? 'pointer' : 'not-allowed',
              color: onOpenRegenerate ? 'var(--ink-2)' : 'var(--ink-4)',
              display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--sans)',
              opacity: onOpenRegenerate ? 1 : 0.6,
            }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span> 重算
          </button>
          <RunBadge axis={axis} />
        </div>
      </header>

      <div style={{ overflow: 'auto' }}>{children}</div>
    </div>
  );
}

// ── Regenerate overlay wrapper — 浮层容器（共享给 5 个使用 DimShell 的页面） ──

export function RegenerateOverlay({
  open, onClose, children,
}: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(30, 28, 26, 0.45)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
      }}
    >
      <div style={{
        width: 'min(920px, 94vw)', height: '100%',
        background: 'var(--paper)', boxShadow: '-20px 0 40px -10px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <button onClick={onClose} title="关闭" style={{
          position: 'absolute', top: 14, right: 16, zIndex: 2,
          border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
          width: 28, height: 28, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-2)',
        }}>
          <Icon name="x" size={14} />
        </button>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Shared callout / stat cells (unchanged) ──────────────────

export function CalloutCard({
  title, children, tone = 'ink',
}: { title: string; children: ReactNode; tone?: 'ink' | 'accent' | 'teal' }) {
  const bg = tone === 'accent' ? 'var(--accent-soft)' : tone === 'teal' ? 'var(--teal-soft)' : 'var(--paper-2)';
  const bd = tone === 'accent' ? 'oklch(0.85 0.07 40)' : tone === 'teal' ? 'oklch(0.85 0.05 200)' : 'var(--line-2)';
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 6, padding: '14px 16px' }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, color: 'var(--ink-2)', fontFamily: 'var(--serif)' }}>
        {children}
      </div>
    </div>
  );
}

export function StatCell({ l, v }: { l: string; v: string | number }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 5 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{l}</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, marginTop: 2, letterSpacing: '-0.01em' }}>{v}</div>
    </div>
  );
}

export function BigStat({ label, v, accent }: { label: string; v: string | number; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <MonoMeta style={{ fontSize: 9.5 }}>{label}</MonoMeta>
      <div style={{
        fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600,
        color: accent ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.01em',
      }}>{v}</div>
    </div>
  );
}
