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
};

export function useMeetingShellTitle(fallback?: string): string {
  const ctx = useOutletContext<MeetingShellContext | undefined>();
  return ctx?.shellTitle ?? fallback ?? '';
}

export function MeetingDetailShell() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const forceMock = useForceMock();

  const m = id && id !== MEETING.id ? { ...MEETING, id } : MEETING;

  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [apiDate, setApiDate] = useState<string | null>(null);
  const [apiResponded, setApiResponded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    if (forceMock || !id || !UUID_RE.test(id)) {
      setApiResponded(false);
      setEditingTitle(false);
      return;
    }
    setApiResponded(false);
    setEditingTitle(false);
    let cancelled = false;
    // Prefer getMeetingDetail (returns title/date directly from assets table).
    // Falls back gracefully if not available.
    meetingNotesApi.getMeetingDetail(id, 'A')
      .then((r: any) => {
        if (cancelled) return;
        const a = r?.analysis ?? {};
        if (a.title) setApiTitle(String(a.title));
        if (a.date) setApiDate(String(a.date).slice(0, 10));
        setApiResponded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setApiResponded(true);
      });
    return () => { cancelled = true; };
  }, [id, forceMock]);

  const effectiveTitle = apiTitle ?? m.title;

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
        <Outlet context={{ shellTitle: effectiveTitle } satisfies MeetingShellContext} />
      </main>
      <MockToggleBar />
    </div>
    </MockToggleProvider>
  );
}

export default MeetingDetailShell;
