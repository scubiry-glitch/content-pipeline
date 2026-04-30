// MeetingDetailShell — /meeting/:id/{a,b,c} 的外层
// 顶栏显示 meeting 元数据 + A/B/C tab 切换 + 导航回库
// 真正内容由子路由 VariantEditorial / VariantWorkbench / VariantThreads 提供

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Icon, MonoMeta, Chip } from './_atoms';
import { MEETING } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { MockToggleProvider, MockToggleBar, useForceMock } from './_mockToggle';
import './_tokens.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export type MeetingShellContext = {
  /** Title being edited in the shell top bar. Children should prefer this over their own fetch. */
  shellTitle: string;
  /** 完整 GET /meetings/:id/detail?view=A 响应；Variants 直接消费，不要再单独 fetch。 */
  meetingDetail: any | null;
  /** 'loading' = 还在抓; 'ok' = 已就绪; 'error' = 后端 404/异常; 'skipped' = forceMock 或非 UUID id */
  detailState: 'loading' | 'ok' | 'error' | 'skipped';
};

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

  const m = id && id !== MEETING.id ? { ...MEETING, id } : MEETING;

  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [apiDate, setApiDate] = useState<string | null>(null);
  const [apiResponded, setApiResponded] = useState(false);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error' | 'skipped'>('skipped');
  /** 缓存完整 detail 响应供 Variants 通过 Outlet context 复用 — 避免子组件重复 fetch */
  const [apiDetail, setApiDetail] = useState<any | null>(null);
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
      setEditingTitle(false);
      return;
    }
    setApiResponded(false);
    setApiState('loading');
    setApiTitle(null);
    setApiDate(null);
    setApiDetail(null);
    setRunSource(null);
    setEditingTitle(false);
    let cancelled = false;
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

  return (
    <MockToggleProvider>
    <div
      className="meeting-proto"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      {/* Detail top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line-2)',
        padding: '12px 28px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate('/meeting/library')}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'var(--ink-3)', fontFamily: 'var(--sans)', fontSize: 12.5,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
          返回库
        </button>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          {editingTitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 640 }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveTitle();
                  if (e.key === 'Escape') cancelEditTitle();
                }}
                style={{
                  width: 420,
                  maxWidth: '48vw',
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
                {savingTitle ? '保存中…' : '保存'}
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
                取消
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
                maxWidth: 520,
                textAlign: 'left',
              }}
              disabled={!UUID_RE.test(id)}
              title={UUID_RE.test(id) ? '点击编辑会议名称' : undefined}
            >
              <div style={{
                fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 15,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {effectiveTitle}
              </div>
            </button>
          )}
          <MonoMeta>
            {apiDate ?? m.date}
            {/* duration 字段后端尚未返回，避免在 API 模式下泄漏 fixture “118 分钟”。 */}
            {!apiResponded && ` · ${m.duration}`}
          </MonoMeta>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
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

          <div style={{
            display: 'flex', gap: 2, border: '1px solid var(--line)',
            borderRadius: 6, padding: 3, background: 'var(--paper-2)',
          }}>
            {views.map((v) => (
              <NavLink
                key={v.to}
                to={v.to}
                title={v.sub}
                style={({ isActive }) => ({
                  padding: '5px 12px', borderRadius: 4, fontSize: 12.5,
                  fontFamily: 'var(--sans)', textDecoration: 'none',
                  fontWeight: isActive ? 600 : 450,
                  background: isActive ? 'var(--ink)' : 'transparent',
                  color: isActive ? 'var(--paper)' : 'var(--ink-2)',
                })}
              >
                {v.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet context={{
          shellTitle: effectiveTitle,
          meetingDetail: apiDetail,
          detailState: apiState,
        } satisfies MeetingShellContext} />
      </main>
      <MockToggleBar />
    </div>
    </MockToggleProvider>
  );
}

export default MeetingDetailShell;
