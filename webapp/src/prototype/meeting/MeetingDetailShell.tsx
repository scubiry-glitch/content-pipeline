// MeetingDetailShell — /meeting/:id/{a,b,c} 的外层
// 顶栏显示 meeting 元数据 + A/B/C tab 切换 + 导航回库
// 真正内容由子路由 VariantEditorial / VariantWorkbench / VariantThreads 提供

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Icon, MonoMeta, Chip } from './_atoms';
import { MEETING } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import './_tokens.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export function MeetingDetailShell() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const forceMock = useForceMock();

  const m = id && id !== MEETING.id ? { ...MEETING, id } : MEETING;

  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [apiDate, setApiDate] = useState<string | null>(null);

  useEffect(() => {
    if (forceMock || !id || !UUID_RE.test(id)) return;
    meetingNotesApi.listMeetings({ limit: 200 })
      .then((r: any) => {
        const found = r?.items?.find((item: any) => String(item.id) === id);
        if (found?.title) setApiTitle(String(found.title));
        if (found?.created_at) setApiDate(String(found.created_at).slice(0, 10));
      })
      .catch(() => {});
  }, [id, forceMock]);

  const views = [
    { to: 'a', label: 'A · Editorial', sub: '文档精读' },
    { to: 'b', label: 'B · Workbench', sub: '三栏工作台' },
    { to: 'c', label: 'C · Threads',   sub: '人物编织' },
  ];

  return (
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
          <div style={{
            fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 520,
          }}>
            {apiTitle ?? m.title}
          </div>
          <MonoMeta>{apiDate ?? m.date} · {m.duration}</MonoMeta>
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
        <Outlet />
      </main>
    </div>
  );
}

export default MeetingDetailShell;
