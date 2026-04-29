import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AuthWorkspace } from '../contexts/AuthContext';
import { authClient } from '../api/client';
import { openWelcomeGuide } from './FirstLoginGuide';
import { mutateCache } from '../hooks/useSWRConfig';

const roleLabel: Record<AuthWorkspace['role'], string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
};

export function WorkspaceSwitcher() {
  const { user, currentWorkspace, workspaces, switchWorkspace, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!user) return null;

  async function onSwitch(wsId: string) {
    if (wsId === currentWorkspace?.id) {
      setOpen(false);
      return;
    }
    try {
      setBusy(true);
      await switchWorkspace(wsId);
      setOpen(false);
      // 全局 SWR mutate (传 () => true 命中所有 cache key) 让数据无白屏刷新.
      // 比 window.location.reload() 体验好, 但前提是所有列表都用 SWR — 若有
      // 自管理 state 的页面 (e.g. useState 直接 setItems), 需要它们各自监听
      // currentWorkspace 变化重拉.
      await mutateCache(() => true);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      setBusy(true);
      const ws = (await authClient.post('/workspaces', { name })) as { id: string };
      await switchWorkspace(ws.id);
      await refresh();
      setNewName('');
      setCreating(false);
      setOpen(false);
      await mutateCache(() => true);
    } catch (e: any) {
      alert(e?.response?.data?.message || '创建失败');
    } finally {
      setBusy(false);
    }
  }

  const label = currentWorkspace
    ? `${currentWorkspace.name} · ${roleLabel[currentWorkspace.role]}`
    : '未选择工作区';

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="切换工作区"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          color: '#334155',
          cursor: 'pointer',
          maxWidth: 240,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 14 }}>🏢</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ marginLeft: 4, color: '#94a3b8', fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.10)',
            minWidth: 280,
            zIndex: 100,
            padding: 4,
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            您的工作区
          </div>
          {workspaces.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#64748b' }}>
              暂无工作区
            </div>
          )}
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              disabled={busy}
              onClick={() => onSwitch(ws.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: ws.id === currentWorkspace?.id ? '#eff6ff' : 'transparent',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                color: '#0f172a',
                cursor: busy ? 'not-allowed' : 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (ws.id !== currentWorkspace?.id) e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                if (ws.id !== currentWorkspace?.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, color: '#3b82f6' }}>
                  {ws.id === currentWorkspace?.id ? '✓' : ''}
                </span>
                <span style={{ fontWeight: 500 }}>{ws.name}</span>
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{roleLabel[ws.role]}</span>
            </button>
          ))}

          <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

          {creating ? (
            <div style={{ padding: '6px 12px' }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="新工作区名称"
                onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                disabled={busy}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button
                  onClick={onCreate}
                  disabled={busy || !newName.trim()}
                  style={{ flex: 1, padding: '5px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >
                  创建
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(''); }}
                  disabled={busy}
                  style={{ flex: 1, padding: '5px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 14 }}>+</span> 创建新工作区
            </button>
          )}

          <button
            onClick={() => { setOpen(false); navigate('/settings/workspaces'); }}
            style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 14 }}>⚙</span> 管理工作区…
          </button>

          <button
            onClick={() => { setOpen(false); openWelcomeGuide(); }}
            style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 14 }}>👋</span> 查看入门引导
          </button>

          <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

          <div style={{ padding: '6px 12px', fontSize: 12, color: '#64748b' }}>
            <div style={{ fontWeight: 500, color: '#0f172a' }}>{user.name}</div>
            <div style={{ fontSize: 11 }}>{user.email}</div>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            style={{ ...menuItemStyle, color: '#dc2626' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 14 }}>↪</span> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  color: '#334155',
  cursor: 'pointer',
  textAlign: 'left',
};
