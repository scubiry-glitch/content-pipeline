// _axisShared.tsx — DimShell + ScopePill / RunBadge / CrossAxisLink (原型级交互)
// 原型来源：
//   - DimShell：dimensions-people.jsx
//   - ScopePill / RunBadge / CrossAxisLink：main-shell.jsx L463-868

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import type { IconName } from './_atoms';
import { useMeetingScope, type ScopeKind } from './_scopeContext';
import { AxisVersionPanel } from './AxisVersionPanel';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import { useIsMobile } from '../_useIsMobile';

export type AxisName = '人物' | '项目' | '知识' | '会议本身' | '纵向视图 · 跨会议';

export interface TabDef {
  id: string;
  label: string;
  sub: string;
  icon: IconName;
}

export function useStickyTab(
  storageKey: string,
  fallback: string,
  validIds?: readonly string[],
): [string, (next: string) => void] {
  const [tab, setTabState] = useState<string>(() => {
    if (typeof window === 'undefined') return fallback;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return fallback;
      if (validIds && !validIds.includes(stored)) return fallback;
      return stored;
    } catch {
      return fallback;
    }
  });
  const setTab = (next: string) => {
    setTabState(next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* noop */ }
  };
  return [tab, setTab];
}

/**
 * 双向同步 scopeId ↔ URL ?scopeId。
 *
 * - ScopePill 切换 scope → 更新 URL（让链接可分享）
 * - URL 带 ?scopeId 打开页面 → 同步到 context（让 ScopePill 显示正确 scope）
 *
 * 调用时机：在 AxisPeople / AxisProjects / AxisKnowledge 的主组件顶层调用一次。
 */
export function useScopeUrlSync(
  setSearchParams: (fn: (prev: URLSearchParams) => URLSearchParams, opts?: { replace?: boolean }) => void,
  urlScopeId: string | undefined,
) {
  const scope = useMeetingScope();
  // 捕捉挂载时的 URL scopeId；后续不再随 urlScopeId 变动
  const initialUrlScopeIdRef = useRef(urlScopeId);
  // 标记 URL→context 同步是否已完成（或不需要）
  const syncedRef = useRef(!urlScopeId); // 没有初始 URL scopeId 时视为"已同步"

  // Effect A: URL → context（scopes 加载完成后，把 URL scopeId 同步给 context）
  useEffect(() => {
    const initId = initialUrlScopeIdRef.current;
    if (!initId || scope.loading || syncedRef.current) return;
    for (const group of scope.kinds) {
      if (group.instances.some((i) => i.id === initId)) {
        if (scope.instanceId !== initId) scope.setInstance(group.id, initId);
        break;
      }
    }
    syncedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.loading, scope.kinds]);

  // Effect B: context → URL（每次 effectiveScopeId 变化，更新 URL ?scopeId）
  // 等 Effect A 完成后才执行（避免用默认 scope 覆盖分享链接的 scopeId）
  useEffect(() => {
    if (!syncedRef.current) return;
    const newId = scope.effectiveScopeId;
    if (!newId) return;
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (n.get('scopeId') === newId) return prev; // 无变化，不触发 re-render
      n.set('scopeId', newId);
      n.delete('version'); // version 是 scope 级别的，切换 scope 时清除
      return n;
    }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.effectiveScopeId]);
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

// AxisName(中文) → 后端 axis(英文 enum)
const CN_AXIS_TO_API: Record<string, 'people' | 'projects' | 'knowledge' | 'meta'> = {
  '人物': 'people',
  '项目': 'projects',
  '知识': 'knowledge',
  '会议本身': 'meta',
};

/** 给 view A/B/C 顶栏复用：相同弹层逻辑、相同数据源 */
export function CrossAxisLinkInline(props: { axis: AxisName }) {
  return <CrossAxisLink {...props} />;
}

function CrossAxisLink({ axis }: { axis: AxisName }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  // 双数据源：优先 meetingId（view A/B/C 路由 /meeting/:id/...），
  // 没有时退到 scope context（axis 聚合页 /meeting/axes/* 没 :id）
  const { id: meetingId } = useParams<{ id: string }>();
  const scope = useMeetingScope();
  const forceMock = useForceMock();
  const apiAxis = CN_AXIS_TO_API[axis as string];
  const [apiItems, setApiItems] = useState<Array<{
    targetAxis: string; label: string; detail: string; count: number; to: string;
    anchor?: { kind: string; ids: string[] };
  }> | null>(null);
  const [apiState, setApiState] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'error'>('idle');

  useEffect(() => {
    if (forceMock || !apiAxis) { setApiItems(null); setApiState('idle'); return; }
    setApiState('loading');
    const promise = meetingId
      ? meetingNotesApi.getCrossAxisClues(meetingId, apiAxis)
      : meetingNotesApi.getCrossAxisCluesByScope({
          axis: apiAxis,
          scopeKind: scope?.kind?.toLowerCase(),
          // scope.kindId === 'all' 时不传 scopeId（端点跨全库）
          ...(scope?.kindId !== 'all' && scope?.effectiveScopeId
              ? { scopeId: scope.effectiveScopeId } : {}),
        });
    promise
      .then((r) => {
        setApiItems(r.items ?? []);
        setApiState((r.items?.length ?? 0) > 0 ? 'ok' : 'empty');
      })
      .catch(() => setApiState('error'));
  }, [forceMock, meetingId, apiAxis, scope?.kind, scope?.kindId, scope?.effectiveScopeId]);

  const fallback = CROSSAXIS_RELATED[axis] ?? CROSSAXIS_RELATED['人物'];
  const related = (apiItems && apiItems.length > 0) ? apiItems : (forceMock ? fallback : []);
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
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>跨轴线索 · 此轴发现的问题在别处的映射</span>
              {forceMock && <MockBadge />}
            </div>
            {related.length === 0 && (
              <div style={{
                fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6,
                padding: '12px 12px', border: '1px dashed var(--line-2)', borderRadius: 6,
              }}>
                {apiState === 'loading' ? '加载中…'
                  : apiState === 'empty' ? (meetingId ? '本会议无跨轴线索（数据不足或该 axis 上没有可关联的诊断指标）' : '当前 scope 下无跨轴线索（scope 内无 standard run 数据）')
                  : (meetingId ? '本会议尚未跑过 standard run，无跨轴线索可计算' : '加载失败')}
              </div>
            )}
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

export function ScopePill() {
  const scope = useMeetingScope();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function fireToast(nextKindId: string, nextLabel: string) {
    const data: ToastState = nextKindId === 'project'
      ? { kind: 'auto',       label: nextLabel, msg: '后台已入队增量',          meta: 'run-240 · queued · ~45s' }
      : nextKindId === 'all'
      ? { kind: 'manual-lib', label: nextLabel, msg: '全库重算需手动触发',      meta: '预计 18 min · ~320k tokens · 上次 14 天前' }
      : { kind: 'manual',     label: nextLabel, msg: '显示已有数据',             meta: '如需更新，前往生成中心手动触发' };
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
          flexShrink: 0,
        }}>{scope.kind}</span>
        <span style={{
          fontWeight: 600, color: 'var(--ink)',
          maxWidth: isMobile ? 72 : 180,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{scope.label}</span>
        {!isMobile && <span style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{scope.meta}</span>}
        <Icon name="chevronDown" size={11} style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', flexShrink: 0 }} />
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

type RunDetail = {
  id: string; preset: string | null; strategy: string | null;
  startedAt: string; finishedAt: string; costTokens: number; costMs: number;
};

function RunBadge({ axis, onRegenerate }: {
  axis: AxisName; onRegenerate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const scope = useMeetingScope();
  const [versionLabel, setVersionLabel] = useState<string | null>(null);
  const [prevLabel, setPrevLabel] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);

  const axisQuery = { '人物': 'people', '项目': 'projects', '知识': 'knowledge', '会议本身': 'meta', '纵向视图 · 跨会议': 'longitudinal' }[axis];
  const backendAxis = AXIS_BACKEND_ID[axis];
  const versionsSupported = backendAxis !== 'longitudinal';

  useEffect(() => {
    if (!versionsSupported) return;
    let cancelled = false;
    meetingNotesApi.listVersions(scope.kindId, backendAxis, scope.effectiveScopeId, 2)
      .then(async (r) => {
        if (cancelled) return;
        const items: any[] = r?.items ?? [];
        const latest = items[0] ?? null;
        const prev   = items[1] ?? null;
        setVersionLabel(latest?.versionLabel ?? null);
        setPrevLabel(prev?.versionLabel ?? null);
        if (latest?.runId) {
          const run = await meetingNotesApi.getRun(latest.runId).catch(() => null);
          if (!cancelled && run) setRunDetail(run as RunDetail);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [backendAxis, scope.kindId, scope.effectiveScopeId, versionsSupported]);

  const version  = versionLabel ?? '—';
  const time     = runDetail?.startedAt
    ? new Date(runDetail.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const duration = runDetail?.costMs
    ? (() => { const s = Math.round(runDetail.costMs / 1000); return s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`; })()
    : null;
  const costTokens = runDetail?.costTokens ? runDetail.costTokens.toLocaleString() : null;
  const runId    = runDetail?.id?.slice(0, 8) ?? '—';

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
    <>
      <div style={{ position: 'relative' }} onMouseEnter={mouseEnter} onMouseLeave={mouseLeave}>
        <button
          title="hover 查看 run 详情 · 点击进入生成中心"
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
              }}>{runId}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600, letterSpacing: '-0.003em' }}>
                {axis} · {version}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 11.5, lineHeight: 1.55 }}>
              <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>scope</span>
              <span style={{ color: 'var(--ink)' }}>{scope.kind} · {scope.label}</span>
              {runDetail?.preset && <>
                <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>preset</span>
                <span style={{ color: 'var(--ink)' }}>{runDetail.preset}{runDetail.strategy ? ` · ${runDetail.strategy}` : ''}</span>
              </>}
              {costTokens && <>
                <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>cost</span>
                <span style={{ color: 'var(--ink)' }}>{costTokens} tokens{duration ? ` · ${duration}` : ''}</span>
              </>}
              {time !== '—' && <>
                <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>ran at</span>
                <span style={{ color: 'var(--ink)' }}>{time}</span>
              </>}
            </div>

            {prevLabel && (
              <div style={{
                marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-2)',
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-4)',
              }}>
                上一版本：{prevLabel} · 版本对比请前往生成中心
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              {onRegenerate && (
                <button onClick={() => { setOpen(false); onRegenerate(); }} style={{
                  padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--sans)',
                  border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink-2)',
                  borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}>↻ 重算</button>
              )}
              {versionsSupported && (
                <button onClick={() => { setOpen(false); setShowVersions(true); }} style={{
                  padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--sans)',
                  border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink-2)',
                  borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}>📚 版本</button>
              )}
              <button onClick={() => navigate(`/meeting/generation-center?tab=versions&axis=${axisQuery}`)} style={{
                flex: 1, padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--sans)',
                border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
                borderRadius: 4, cursor: 'pointer',
              }}>生成中心 →</button>
            </div>
          </div>
        )}
      </div>
      {showVersions && (
        <AxisVersionPanel axis={backendAxis} scopeKind="project" onClose={() => setShowVersions(false)} />
      )}
    </>
  );
}

// ── DimShell ─────────────────────────────────────────────────

// 中文 axis label → 后端 canonical id（与 axes/registry.ts AXIS_SUBDIMS 一致）
const AXIS_BACKEND_ID: Record<AxisName, string> = {
  '人物': 'people',
  '项目': 'projects',
  '知识': 'knowledge',
  '会议本身': 'meta',
  '纵向视图 · 跨会议': 'longitudinal',
};

export function DimShell({
  axis, tabs, tab, setTab, children, onOpenRegenerate, mock, version, scopeLabel,
}: {
  axis: AxisName;
  tabs: TabDef[];
  tab: string;
  setTab: (id: string) => void;
  children: ReactNode;
  onOpenRegenerate?: () => void;
  mock?: boolean;
  /** URL ?version= 值，显示在标题栏 */
  version?: string;
  /** URL ?scopeId= 对应的名称（可选，用于显示当前作用域） */
  scopeLabel?: string;
}) {
  const axisColor = axisColorFor(axis);
  const isMobile = useIsMobile();

  const axisTitle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 7, flexShrink: 0,
        background: 'var(--paper-2)', border: '1px solid var(--line-2)',
        borderLeft: `3px solid ${axisColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, color: 'var(--ink)',
      }}>{axis[0]}</div>
      <div style={{ minWidth: 0 }}>
        <MonoMeta style={{ fontSize: 10 }}>AXIS · 一库多视图</MonoMeta>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.005em', marginTop: -2 }}>
          {axis}轴
          {mock && <MockBadge />}
          {version && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
              padding: '2px 7px', borderRadius: 4,
              background: 'var(--amber-soft)', color: 'oklch(0.38 0.09 75)',
              border: '1px solid oklch(0.85 0.07 75)',
            }}>{version}</span>
          )}
          {scopeLabel && (
            <span style={{
              fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 400,
              color: 'var(--ink-3)', marginLeft: 2,
            }}>· {scopeLabel}</span>
          )}
        </div>
      </div>
    </div>
  );

  // tab refs（仅 mobile 用于 scrollIntoView 自动居中）
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabStrip = (
    <div style={{
      display: 'flex', gap: 2, border: '1px solid var(--line)', borderRadius: 6, padding: 2,
      flexShrink: 0,
      ...(isMobile ? {
        // mobile: 每个 tab snap 到中央，整条 strip 占满父滚动容器
        scrollSnapAlign: 'start' as const,
      } : {}),
    }}>
      {tabs.map((t, idx) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[idx] = el; }}
            data-tab-id={t.id}
            onClick={() => setTab(t.id)}
            title={t.sub}
            style={{
              padding: isMobile ? '7px 14px' : '6px 13px',
              border: 0, borderRadius: 4, fontSize: 12.5,
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--paper)' : 'var(--ink-2)',
              cursor: 'pointer', fontWeight: active ? 600 : 450,
              fontFamily: 'var(--sans)', display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', flexShrink: 0,
              ...(isMobile ? {
                scrollSnapAlign: 'center' as const,
                scrollSnapStop: 'always' as const,
              } : {}),
            }}>
            <Icon name={t.icon} size={12} />{t.label}
          </button>
        );
      })}
    </div>
  );

  // mobile-only: 滚动容器 ref + active 自动居中 + 左右渐隐显隐
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [edgeState, setEdgeState] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const recomputeEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setEdgeState({
      left: scrollLeft > 4,
      right: scrollLeft + clientWidth < scrollWidth - 4,
    });
  };
  useEffect(() => {
    if (!isMobile) return;
    // active tab 自动 smooth-scroll 到中央
    const idx = tabs.findIndex((t) => t.id === tab);
    const btn = tabRefs.current[idx];
    if (btn && typeof btn.scrollIntoView === 'function') {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    // 居中后 edge state 也会变，下一帧重算
    requestAnimationFrame(recomputeEdges);
  }, [tab, isMobile, tabs]);
  useEffect(() => {
    if (!isMobile) return;
    recomputeEdges();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => recomputeEdges();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', recomputeEdges);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', recomputeEdges);
    };
  }, [isMobile]);

  const regenerateButton = (
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
        opacity: onOpenRegenerate ? 1 : 0.6, flexShrink: 0,
      }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span>{!isMobile && ' 重算'}
    </button>
  );

  const subLabel = tabs.find((t) => t.id === tab)?.sub;

  return (
    <div style={{
      width: '100%', maxWidth: '100vw', height: '100%', background: 'var(--paper)',
      display: 'grid', gridTemplateRows: isMobile ? 'auto 1fr' : 'auto 1fr', color: 'var(--ink)',
      fontFamily: 'var(--sans)', overflow: 'hidden',
    }}>
      {isMobile ? (
        <header style={{ borderBottom: '1px solid var(--line-2)' }}>
          {/* Row 1: axis title + regenerate */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
            minHeight: 48,
          }}>
            {axisTitle}
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>{regenerateButton}</div>
          </div>
          {/* Row 2: tab strip — snap-scroll + 自动居中 + 左右渐隐 + 位置点 */}
          <div style={{ position: 'relative' }}>
            <div
              ref={scrollerRef}
              className="mp-scroll-h"
              style={{
                overflowX: 'auto', overflowY: 'hidden',
                padding: '0 14px 8px', WebkitOverflowScrolling: 'touch',
                scrollSnapType: 'x proximity',
              }}
            >
              {tabStrip}
            </div>
            {/* 左渐隐 */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 8, width: 18,
              background: 'linear-gradient(to right, var(--paper), transparent)',
              pointerEvents: 'none',
              opacity: edgeState.left ? 1 : 0,
              transition: 'opacity 180ms ease',
            }} />
            {/* 右渐隐 */}
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 8, width: 18,
              background: 'linear-gradient(to left, var(--paper), transparent)',
              pointerEvents: 'none',
              opacity: edgeState.right ? 1 : 0,
              transition: 'opacity 180ms ease',
            }} />
          </div>
          {/* 位置点：tabs ≥ 4 个才显，每个点对应一个 tab，激活态用 ink */}
          {tabs.length >= 4 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, padding: '0 14px 6px',
            }}>
              {tabs.map((t, i) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    aria-label={`跳到 ${t.label}`}
                    style={{
                      width: active ? 16 : 5, height: 5, borderRadius: 99, border: 0,
                      background: active ? 'var(--ink)' : 'var(--ink-4)',
                      opacity: active ? 1 : 0.45,
                      cursor: 'pointer', padding: 0,
                      transition: 'width 200ms ease, opacity 200ms ease, background 200ms ease',
                    }}
                  />
                );
              })}
            </div>
          )}
          {/* Row 3: sub label + meta controls (flex wrap so popovers don't get clipped) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '6px 14px 8px',
            borderTop: '1px solid var(--line-2)',
          }}>
            {subLabel && (
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {subLabel}
              </span>
            )}
            <div style={{
              marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}>
              <CrossAxisLink axis={axis} />
              <RunBadge axis={axis} onRegenerate={onOpenRegenerate} />
            </div>
          </div>
        </header>
      ) : (
        // Desktop: 两行布局 — Row1 标题 + 跨轴/RunBadge,Row2 tab strip + 当前 sub label
        // 单行布局在 6-tab 轴(项目轴)上 tabs 拥挤,拆两行后给 tabs 整行空间
        <header style={{
          display: 'flex', flexDirection: 'column',
          borderBottom: '1px solid var(--line-2)',
        }}>
          {/* Row 1: 轴标题 · ScopePill · 跨轴 / RunBadge
              ScopePill 从 MeetingShell header 收编进来,axis 页面桌面端外层 header 已隐藏,
              避免 3 row 堆叠 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '10px 28px 8px',
            minHeight: 52,
          }}>
            {axisTitle}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <ScopePill />
              <CrossAxisLink axis={axis} />
              <RunBadge axis={axis} onRegenerate={onOpenRegenerate} />
            </div>
          </div>
          {/* Row 2: tab strip 整行 + 当前 sub label */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '0 28px 10px',
            minWidth: 0,
          }}>
            <div style={{ minWidth: 0, overflowX: 'auto' }} className="mp-scroll-h">
              {tabStrip}
            </div>
            {subLabel && (
              <span style={{
                fontSize: 12, color: 'var(--ink-3)',
                fontFamily: 'var(--sans)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                minWidth: 0,
              }}>
                {subLabel}
              </span>
            )}
          </div>
        </header>
      )}

      <div style={{
        overflowY: 'auto', overflowX: 'hidden',
        width: '100%', minWidth: 0,
      }}>{children}</div>
    </div>
  );
}

// ── Versions button — 打开 AxisVersionPanel 浮层 ────────────────

function VersionsButton({ axis }: { axis: AxisName }) {
  const [open, setOpen] = useState(false);
  const backendAxis = AXIS_BACKEND_ID[axis];
  // 纵向视图轴目前没接入 mn_axis_versions（snapshot 是 axis-bound 的，longitudinal 暂留空）
  const supported = backendAxis !== 'longitudinal';
  return (
    <>
      <button
        onClick={() => supported && setOpen(true)}
        disabled={!supported}
        title={supported ? '查看此轴的版本历史 / 回滚' : '纵向视图暂无版本快照'}
        style={{
          border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 5,
          padding: '5px 10px', fontSize: 11.5,
          cursor: supported ? 'pointer' : 'not-allowed',
          color: supported ? 'var(--ink-2)' : 'var(--ink-4)',
          display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--sans)',
          opacity: supported ? 1 : 0.6,
        }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>📚</span> 版本
      </button>
      {open && (
        <AxisVersionPanel
          axis={backendAxis}
          scopeKind="project"
          onClose={() => setOpen(false)}
        />
      )}
    </>
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

export function AxisLoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ padding: '24px 32px 36px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: i === 0 ? 20 : 52,
          background: 'var(--paper-2)', borderRadius: 5, marginBottom: 10,
          opacity: Math.max(0.3, 1 - i * 0.18),
        }} />
      ))}
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
