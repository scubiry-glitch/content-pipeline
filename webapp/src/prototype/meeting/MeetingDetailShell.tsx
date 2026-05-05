// MeetingDetailShell — /meeting/:id/{a,b,c} 的外层
// 顶栏显示 meeting 元数据 + A/B/C tab 切换 + 导航回库
// 真正内容由子路由 VariantEditorial / VariantWorkbench / VariantThreads 提供

import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Icon, MonoMeta, Chip } from './_atoms';
import { MEETING } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { MockToggleProvider, MockToggleBar, useForceMock } from './_mockToggle';
import { useIsMobile } from '../_useIsMobile';
import { AxisVersionPanel } from './AxisVersionPanel';
import './_tokens.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export type MeetingShellContext = {
  /** Title being edited in the shell top bar. Children should prefer this over their own fetch. */
  shellTitle: string;
  /** 完整 GET /meetings/:id/detail?view=A 响应；Variants 直接消费，不要再单独 fetch。 */
  meetingDetail: any | null;
  /** 'loading' = 还在抓; 'ok' = 已就绪; 'error' = 后端 404/异常; 'skipped' = forceMock 或非 UUID id */
  detailState: 'loading' | 'ok' | 'error' | 'skipped';
  /** R3-A · 改动一：单场会议体征（quality+necessity+affect+tension），来自 GET /meetings/:id/health */
  health: MeetingHealth | null;
};

// R3-A · 改动一：单场会议 health 聚合（quality + necessity + affect + tension）
// 由 GET /meetings/:id/health 一次取齐 → 顶部 4 徽章 + Outlet context 透传给 A/B/C
export interface MeetingHealth {
  quality: { overall: number; dims: Array<{ id: string; label: string; score: number; note: string }>; computedAt?: string } | null;
  necessity: { verdict: 'async_ok' | 'partial' | 'needed'; suggestedDurationMin?: number; reasons?: Array<{ k?: string; t?: string }>; computedAt?: string } | null;
  affect: {
    samples?: Array<{ t?: number; v?: number; i?: number; tag?: string }>;
    tensionPeaks?: unknown;
    insightPoints?: unknown;
    peak?: { valence: number; intensity: number; tag?: string } | null;
    computedAt?: string;
  } | null;
  tension: { peakIntensity: number; count: number };
}

export function useMeetingHealth(): MeetingHealth | null {
  const ctx = useOutletContext<MeetingShellContext | null>();
  return ctx?.health ?? null;
}

export function useMeetingShellTitle(fallback?: string): string {
  const ctx = useOutletContext<MeetingShellContext | undefined>();
  return ctx?.shellTitle ?? fallback ?? '';
}

/** Variants 通过这个 hook 拿到 Shell 一次性 fetch 的 detail 响应 + 加载状态。 */
export function useMeetingDetail(): { detail: any | null; state: 'loading' | 'ok' | 'error' | 'skipped' } {
  const ctx = useOutletContext<MeetingShellContext | undefined>();
  return { detail: ctx?.meetingDetail ?? null, state: ctx?.detailState ?? 'skipped' };
}

export function MeetingDetailShell() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const forceMock = useForceMock();
  const isMobile = useIsMobile();

  const m = id && id !== MEETING.id ? { ...MEETING, id } : MEETING;

  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [apiDate, setApiDate] = useState<string | null>(null);
  const [apiResponded, setApiResponded] = useState(false);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error' | 'skipped'>('skipped');
  /** 缓存完整 detail 响应供 Variants 通过 Outlet context 复用 — 避免子组件重复 fetch */
  const [apiDetail, setApiDetail] = useState<any | null>(null);
  /** R3-A · 改动一：单场体征 health 数据（4 徽章 + Outlet 透传） */
  const [health, setHealth] = useState<MeetingHealth | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  // claude-cli 模式标记 — 取自 assets.metadata.claudeSession
  const [claudeSession, setClaudeSession] = useState<{ sessionId?: string; lastResumedAt?: string; runCount?: number } | null>(null);
  // 最近一次 run 来源（mode + model），用于 B 视图顶部展示模式标签 + hover 模型名
  const [runSource, setRunSource] = useState<{
    runId?: string;
    state?: string;
    mode?: 'multi-axis' | 'claude-cli' | 'api-oneshot';
    modelName?: string;
  } | null>(null);

  useEffect(() => {
    if (forceMock || !id || !UUID_RE.test(id)) {
      setApiResponded(false);
      setApiState('skipped');
      setApiDetail(null);
      setRunSource(null);
      setHealth(null);
      setEditingTitle(false);
      return;
    }
    setApiResponded(false);
    setApiState('loading');
    setApiTitle(null);
    setApiDate(null);
    setApiDetail(null);
    setRunSource(null);
    setHealth(null);
    setEditingTitle(false);
    let cancelled = false;
    // R3-A · 并行拉 health（顶部 4 徽章 + Outlet 透传），失败不影响主 detail 加载
    meetingNotesApi.getMeetingHealth(id)
      .then((h: MeetingHealth | null) => { if (!cancelled) setHealth(h); })
      .catch(() => { if (!cancelled) setHealth(null); });
    // 单一 fetch — 同时供 shell 顶栏与子 Variants 消费，Variants 通过 useMeetingDetail() 读取
    meetingNotesApi.getMeetingDetail(id, 'A')
      .then((r: any) => {
        if (cancelled) return;
        const a = r?.analysis ?? {};
        if (a.title) setApiTitle(String(a.title));
        if (a.date) setApiDate(String(a.date).slice(0, 10));
        setClaudeSession(a.claudeSession ?? null);
        setRunSource(a.runSource ?? null);
        setApiDetail(r ?? null);
        setApiResponded(true);
        setApiState('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setRunSource(null);
        setApiDetail(null);
        setApiResponded(true);
        setApiState('error');
      });
    return () => { cancelled = true; };
  }, [id, forceMock]);

  // 默认 API 优先：加载中显示占位，避免闪 fixture 标题；仅 forceMock / API 错误时才回 mock
  const effectiveTitle = apiTitle
    ?? (forceMock || apiState === 'error' || apiState === 'skipped' ? m.title : '加载中…');

  const startEditTitle = () => {
    setTitleDraft(effectiveTitle);
    setEditingTitle(true);
  };

  const cancelEditTitle = () => {
    setEditingTitle(false);
    setTitleDraft('');
  };

  const saveTitle = async () => {
    const nextTitle = titleDraft.trim();
    if (!id || !UUID_RE.test(id) || !nextTitle) return;
    if (nextTitle === effectiveTitle) {
      cancelEditTitle();
      return;
    }
    try {
      setSavingTitle(true);
      const updated = await meetingNotesApi.updateMeeting(id, { title: nextTitle });
      setApiTitle(updated?.title ?? nextTitle);
      setEditingTitle(false);
      setTitleDraft('');
    } finally {
      setSavingTitle(false);
    }
  };

  const views = [
    { to: 'a', label: 'A · Editorial', sub: '文档精读' },
    { to: 'b', label: 'B · Workbench', sub: '三栏工作台' },
    { to: 'c', label: 'C · Threads',   sub: '人物编织' },
  ];

  const viewTabsRow = (
    <div style={{
      display: 'flex', gap: 2, border: '1px solid var(--line)',
      borderRadius: 6, padding: 3, background: 'var(--paper-2)',
      ...(isMobile ? { width: '100%' } : {}),
    }}>
      {views.map((v) => (
        <NavLink
          key={v.to}
          to={v.to}
          title={v.sub}
          style={({ isActive }) => ({
            padding: isMobile ? '7px 0' : '5px 12px',
            borderRadius: 4, fontSize: 12.5,
            fontFamily: 'var(--sans)', textDecoration: 'none',
            fontWeight: isActive ? 600 : 450,
            background: isActive ? 'var(--ink)' : 'transparent',
            color: isActive ? 'var(--paper)' : 'var(--ink-2)',
            ...(isMobile ? { flex: 1, textAlign: 'center' } : {}),
          })}
        >
          {isMobile ? v.to.toUpperCase() : v.label}
        </NavLink>
      ))}
    </div>
  );

  return (
    <MockToggleProvider>
    <div
      className="meeting-proto"
      style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh',
        width: '100%', maxWidth: '100vw', overflowX: 'hidden',
      }}
    >
      {/* Detail top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line-2)',
        padding: isMobile ? '10px 14px' : '12px 28px',
        display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 0,
      }}>
        {/* Row 1: 返回 + title + date + (desktop: badges/share/tabs) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16 }}>
          <button
            onClick={() => navigate('/meeting/library')}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--ink-3)', fontFamily: 'var(--sans)', fontSize: 12.5,
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            }}
          >
            <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
            {!isMobile && '返回库'}
          </button>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
            {editingTitle ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveTitle();
                    if (e.key === 'Escape') cancelEditTitle();
                  }}
                  style={{
                    flex: 1,
                    maxWidth: isMobile ? '100%' : '48vw',
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    background: 'var(--paper)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--serif)',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                />
                <button
                  onClick={() => { void saveTitle(); }}
                  disabled={savingTitle || !titleDraft.trim()}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    background: 'var(--paper-2)',
                    color: 'var(--ink)',
                    padding: '5px 9px',
                    cursor: savingTitle ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    opacity: savingTitle ? 0.7 : 1,
                  }}
                >
                  {savingTitle ? '…' : '保存'}
                </button>
                <button
                  onClick={cancelEditTitle}
                  disabled={savingTitle}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--ink-3)',
                    padding: '4px 6px',
                    cursor: savingTitle ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={startEditTitle}
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  margin: 0,
                  cursor: UUID_RE.test(id) ? 'text' : 'default',
                  minWidth: 0,
                  textAlign: 'left',
                }}
                disabled={!UUID_RE.test(id)}
                title={UUID_RE.test(id) ? '点击编辑会议名称' : undefined}
              >
                <div style={{
                  fontFamily: 'var(--serif)', fontWeight: 600,
                  fontSize: isMobile ? 14 : 15,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: isMobile ? '52vw' : 520,
                }}>
                  {effectiveTitle}
                </div>
              </button>
            )}
            <MonoMeta style={{ flexShrink: 0 }}>
              {apiDate ?? m.date}
              {!apiResponded && !isMobile && ` · ${m.duration}`}
            </MonoMeta>
          </div>

          {/* Desktop-only: run badges + ID chip + share + view tabs */}
          {!isMobile && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {runSource?.mode === 'multi-axis' && (
                <span
                  title={`Multi-axis run · ${runSource.runId?.slice(0, 8) ?? '-'} · ${runSource.state ?? 'unknown'}\n模型: ${runSource.modelName ?? 'unknown'}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px', borderRadius: 4,
                    background: 'oklch(0.93 0.04 160)',
                    color: 'oklch(0.31 0.10 160)',
                    border: '1px solid oklch(0.80 0.08 160)',
                    fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
                    letterSpacing: 0.2,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: 'oklch(0.52 0.16 160)' }} />
                  Multi-axis
                </span>
              )}
              {runSource?.mode === 'api-oneshot' && (
                <span
                  title={`API Oneshot run · ${runSource.runId?.slice(0, 8) ?? '-'} · ${runSource.state ?? 'unknown'}\n模型: ${runSource.modelName ?? 'unknown'}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px', borderRadius: 4,
                    background: 'oklch(0.93 0.04 210)',
                    color: 'oklch(0.30 0.11 210)',
                    border: '1px solid oklch(0.80 0.08 210)',
                    fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
                    letterSpacing: 0.2,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: 'oklch(0.50 0.16 210)' }} />
                  API Oneshot
                </span>
              )}
              {claudeSession?.sessionId && (
                <span
                  title={`Claude CLI session ${claudeSession.sessionId}${claudeSession.runCount ? ` · ${claudeSession.runCount} runs` : ''}${claudeSession.lastResumedAt ? ` · last ${claudeSession.lastResumedAt}` : ''}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px', borderRadius: 4,
                    background: 'oklch(0.93 0.04 285)',
                    color: 'oklch(0.32 0.12 285)',
                    border: '1px solid oklch(0.78 0.08 285)',
                    fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
                    letterSpacing: 0.2,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: 'oklch(0.55 0.18 285)' }} />
                  Claude CLI
                  <span style={{ opacity: 0.6, fontWeight: 500 }}>· {claudeSession.sessionId.slice(0, 8)}…</span>
                </span>
              )}
              <Chip tone="ghost">{m.id}</Chip>
              <VersionsButton meetingId={id} disabled={!UUID_RE.test(id)} />
              <ShareButton meetingId={id} disabled={!UUID_RE.test(id)} />
              {viewTabsRow}
            </div>
          )}

          {/* Mobile: share button only */}
          {isMobile && (
            <div style={{ flexShrink: 0 }}>
              <ShareButton meetingId={id} disabled={!UUID_RE.test(id)} />
            </div>
          )}
        </div>

        {/* Row 2 (mobile only): A/B/C tab switcher */}
        {isMobile && viewTabsRow}
      </header>

      {/* R3-A · 改动一：4 徽章 status bar — 决策质量 / 必要性 / 情绪峰 / 张力峰 */}
      <MeetingHealthBadges health={health} />

      <main style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', overflow: 'auto' }}>
        <Outlet context={{
          shellTitle: effectiveTitle,
          meetingDetail: apiDetail,
          detailState: apiState,
          health,
        } satisfies MeetingShellContext} />
      </main>
      <MockToggleBar />
    </div>
    </MockToggleProvider>
  );
}

// R3-A · 改动一：单场会议 health 4 徽章
// 决策质量 / 必要性 / 情绪峰 / 张力峰；点击徽章 → 当前视图内对应 anchor 的平滑滚动
function MeetingHealthBadges({ health }: { health: MeetingHealth | null }) {
  const isMobile = useIsMobile();
  // 数据完全空也保留一行轻量占位，让用户知道有这个区域（避免页面突然多/少一条）
  const verdictText = (v?: 'async_ok' | 'partial' | 'needed') =>
    v === 'async_ok' ? '本可异步' : v === 'partial' ? '部分必要' : v === 'needed' ? '确有必要' : '—';
  const verdictTone = (v?: 'async_ok' | 'partial' | 'needed'): { fg: string; bg: string; bd: string } =>
    v === 'async_ok' ? { fg: 'oklch(0.40 0.10 30)',  bg: 'oklch(0.95 0.04 30)',  bd: 'oklch(0.85 0.07 30)' }
    : v === 'partial' ? { fg: 'oklch(0.45 0.09 75)',  bg: 'oklch(0.96 0.05 75)',  bd: 'oklch(0.85 0.08 75)' }
    : v === 'needed'  ? { fg: 'oklch(0.40 0.09 160)', bg: 'oklch(0.95 0.04 160)', bd: 'oklch(0.85 0.07 160)' }
    : { fg: 'var(--ink-3)', bg: 'var(--paper-2)', bd: 'var(--line-2)' };

  const qualityScore = health?.quality?.overall;
  const necessity = health?.necessity?.verdict;
  const affectPeak = health?.affect?.peak;
  const tensionPeak = health?.tension?.peakIntensity ?? 0;
  const tensionCount = health?.tension?.count ?? 0;

  const necTone = verdictTone(necessity);

  const goAnchor = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={isMobile ? 'mp-scroll-h' : undefined} style={{
      display: 'flex', alignItems: 'center',
      flexWrap: isMobile ? 'nowrap' : 'wrap', gap: 6,
      padding: isMobile ? '6px 14px' : '8px 28px', background: 'var(--paper-2)',
      borderBottom: '1px solid var(--line-2)',
      fontFamily: 'var(--mono)', fontSize: 11,
      // mobile: 信息不省略，横滑代替换行
      ...(isMobile ? {
        overflowX: 'auto' as const, overflowY: 'hidden' as const,
        WebkitOverflowScrolling: 'touch' as const,
      } : {}),
    }}>
      <span style={{
        color: 'var(--ink-3)', letterSpacing: '0.16em', textTransform: 'uppercase', marginRight: 4,
        flexShrink: 0,
      }}>
        体征
      </span>
      <button
        onClick={() => goAnchor('quality-section')}
        title="决策质量 5D · 跳到 A 视图文末「质量审定」"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
          background: 'oklch(0.96 0.03 285)',
          color: 'oklch(0.32 0.10 285)',
          border: '1px solid oklch(0.85 0.07 285)',
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'oklch(0.55 0.16 285)' }} />
        质量 {qualityScore !== undefined ? qualityScore.toFixed(2) : '—'}
      </button>
      <button
        onClick={() => goAnchor('necessity-section')}
        title="本场必要性评估 · 跳到 B 视图右栏「这场会的代价」"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
          background: necTone.bg, color: necTone.fg, border: `1px solid ${necTone.bd}`,
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: necTone.fg }} />
        必要性 {verdictText(necessity)}
      </button>
      <button
        onClick={() => goAnchor('affect-section')}
        title="情绪曲线峰值 · 跳到 C 视图时间轴叠加层"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
          background: 'oklch(0.96 0.04 75)',
          color: 'oklch(0.40 0.10 75)',
          border: '1px solid oklch(0.85 0.08 75)',
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'oklch(0.65 0.14 75)' }} />
        情绪峰 {affectPeak ? `${affectPeak.valence > 0 ? '+' : ''}${affectPeak.valence.toFixed(2)}` : '—'}
      </button>
      <button
        onClick={() => goAnchor('tension-section')}
        title="张力清单峰值 · 跳到 B 视图右栏张力时序条"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
          background: 'oklch(0.96 0.04 25)',
          color: 'oklch(0.40 0.11 25)',
          border: '1px solid oklch(0.85 0.08 25)',
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'oklch(0.60 0.16 25)' }} />
        张力峰 {tensionPeak > 0 ? tensionPeak.toFixed(2) : '—'}
        {tensionCount > 0 && <span style={{ opacity: 0.6, fontWeight: 500 }}>· {tensionCount}</span>}
      </button>
      {!isMobile && (
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 10 }}>
          来源 · GET /meetings/:id/health
        </span>
      )}
    </div>
  );
}

// ——————————————————————————————————————————————————
// Share feature
// ——————————————————————————————————————————————————

type ShareRecord = {
  id: string;
  share_token: string;
  mode: string;
  targets: string[];
  created_at: string;
  expires_at: string | null;
};

function VersionsButton({ meetingId, disabled }: { meetingId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={disabled ? '' : '查看本场会议的版本历史 / 回滚（每次重跑 oneshot/CLI 都会写一版 vN）'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 5,
          padding: '5px 10px', fontSize: 11.5,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? 'var(--ink-4)' : 'var(--ink-2)', fontFamily: 'var(--sans)',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>📚</span> 版本
      </button>
      {open && (
        <AxisVersionPanel
          axis="all"
          scopeKind="meeting"
          scopeIdOverride={meetingId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareButton({ meetingId, disabled }: { meetingId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
          border: '1px solid var(--line)', background: open ? 'var(--paper-2)' : 'var(--paper)',
          color: 'var(--ink-2)', fontFamily: 'var(--sans)', fontSize: 12.5,
          opacity: disabled ? 0.5 : 1,
        }}
        title="分享这条会议纪要"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="13" cy="3" r="1.5" />
          <circle cx="13" cy="13" r="1.5" />
          <circle cx="3" cy="8" r="1.5" />
          <line x1="4.4" y1="7.2" x2="11.6" y2="3.8" />
          <line x1="4.4" y1="8.8" x2="11.6" y2="12.2" />
        </svg>
        分享
      </button>
      {open && (
        <div ref={panelRef} style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
          width: 340, background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 20,
        }}>
          <SharePanel meetingId={meetingId} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function SharePanel({ meetingId, onClose: _onClose }: { meetingId: string; onClose: () => void }) {
  const [mode, setMode] = useState<'link' | 'targeted'>('link');
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShares = useCallback(() => {
    setLoadingShares(true);
    meetingNotesApi.listShares(meetingId)
      .then((res) => setShares(res.shares))
      .catch(() => setShares([]))
      .finally(() => setLoadingShares(false));
  }, [meetingId]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const addEmail = () => {
    const e = emailInput.trim();
    if (e && !emails.includes(e)) setEmails((prev) => [...prev, e]);
    setEmailInput('');
  };

  const createShare = async () => {
    if (mode === 'targeted' && emails.length === 0) {
      setError('请至少添加一个邮箱');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await meetingNotesApi.createShare(meetingId, { mode, targets: mode === 'targeted' ? emails : [] });
      setEmails([]);
      setEmailInput('');
      loadShares();
    } catch {
      setError('创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    await meetingNotesApi.deleteShare(meetingId, shareId).catch(() => null);
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  const copyLink = (token: string, shareId: string) => {
    const url = `${window.location.origin}/meeting/shared/${token}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId((id) => (id === shareId ? null : id)), 2000);
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8,
  };

  return (
    <div>
      <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 14, marginBottom: 16, color: 'var(--ink)' }}>
        分享会议纪要
      </div>

      {/* Mode toggle */}
      <div style={sectionLabel}>访问权限</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['link', 'targeted'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12.5,
              fontFamily: 'var(--sans)', cursor: 'pointer',
              border: mode === m ? '1.5px solid var(--ink)' : '1px solid var(--line)',
              background: mode === m ? 'var(--ink)' : 'var(--paper)',
              color: mode === m ? 'var(--paper)' : 'var(--ink-2)',
              fontWeight: mode === m ? 600 : 450,
            }}
          >
            {m === 'link' ? '知道链接即可访问' : '指定人员'}
          </button>
        ))}
      </div>

      {/* Targeted: email list */}
      {mode === 'targeted' && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionLabel}>添加邮箱</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="email"
              placeholder="example@company.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6,
                border: '1px solid var(--line)', background: 'var(--paper)',
                fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink)',
              }}
            />
            <button
              onClick={addEmail}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--line)', background: 'var(--paper-2)',
                color: 'var(--ink-2)', cursor: 'pointer',
              }}
            >
              添加
            </button>
          </div>
          {emails.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {emails.map((e) => (
                <span key={e} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 99,
                  background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)',
                }}>
                  {e}
                  <button
                    onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--ink-3)', fontSize: 12, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: 'oklch(0.50 0.18 25)', fontSize: 12, marginBottom: 10 }}>{error}</p>}

      <button
        onClick={() => void createShare()}
        disabled={creating}
        style={{
          width: '100%', padding: '8px 0', borderRadius: 6,
          border: 0, background: 'var(--ink)', color: 'var(--paper)',
          fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600,
          cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.7 : 1,
          marginBottom: 20,
        }}
      >
        {creating ? '创建中…' : '创建分享链接'}
      </button>

      {/* Existing shares */}
      <div style={sectionLabel}>已有分享链接</div>
      {loadingShares ? (
        <p style={{ color: 'var(--ink-3)', fontSize: 12 }}>加载中…</p>
      ) : shares.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontSize: 12 }}>暂无</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shares.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 7,
              background: 'var(--paper-2)', border: '1px solid var(--line-2)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink-2)' }}>
                  {s.mode === 'targeted' ? `指定人员 (${(s.targets ?? []).length} 人)` : '知道链接即可访问'}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                  {new Date(s.created_at).toLocaleDateString('zh-CN')}
                  {s.expires_at && ` · 过期 ${new Date(s.expires_at).toLocaleDateString('zh-CN')}`}
                </div>
              </div>
              <button
                onClick={() => copyLink(s.share_token, s.id)}
                style={{
                  padding: '4px 9px', borderRadius: 5, fontSize: 11.5,
                  border: '1px solid var(--line)', background: 'var(--paper)',
                  color: copiedId === s.id ? 'oklch(0.45 0.12 160)' : 'var(--ink-2)',
                  cursor: 'pointer', fontFamily: 'var(--sans)',
                }}
              >
                {copiedId === s.id ? '已复制' : '复制链接'}
              </button>
              <button
                onClick={() => void revokeShare(s.id)}
                title="撤销分享"
                style={{
                  padding: '4px 7px', borderRadius: 5, fontSize: 11,
                  border: '1px solid var(--line)', background: 'var(--paper)',
                  color: 'var(--ink-3)', cursor: 'pointer',
                }}
              >
                撤销
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MeetingDetailShell;
