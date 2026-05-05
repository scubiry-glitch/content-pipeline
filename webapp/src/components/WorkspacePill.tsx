// 紧凑版 workspace 切换器，专给 CEO / Minutes 等独立原型壳用。
// 与 WorkspaceSwitcher 区别：去掉用户信息/退出/会话过期等大块内容，只留切换 + 管理入口。
// 视觉默认 ghost 风格，适配深/浅两种主题。
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { mutateCache } from '../hooks/useSWRConfig';

type Tone = 'light' | 'dark';

interface Props {
  tone?: Tone;
  size?: 'sm' | 'xs';
}

export function WorkspacePill({ tone = 'light', size = 'sm' }: Props) {
  const { user, currentWorkspace, workspaces, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
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
      await mutateCache(() => true);
    } finally {
      setBusy(false);
    }
  }

  const isDark = tone === 'dark';
  const isXs = size === 'xs';
  const label = currentWorkspace?.name ?? '未选择';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`当前工作区: ${label}（点击切换）`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: isXs ? '2px 7px' : '4px 9px',
          background: isDark ? 'rgba(217,184,142,0.10)' : 'rgba(0,0,0,0.04)',
          border: isDark ? '1px solid rgba(217,184,142,0.22)' : '1px solid rgba(0,0,0,0.08)',
          borderRadius: 99,
          fontSize: isXs ? 10.5 : 11,
          fontFamily: 'var(--mono)',
          color: isDark ? 'rgba(232,227,216,0.7)' : '#7A6E5E',
          cursor: 'pointer',
          maxWidth: 160,
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}
      >
        <span style={{ fontSize: isXs ? 10 : 11 }}>🏢</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{label}</span>
        <span style={{ opacity: 0.6, fontSize: 8 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            minWidth: 220,
            zIndex: 200,
            padding: 4,
            color: '#0f172a',
            fontFamily: 'var(--sans)',
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              fontSize: 10,
              color: '#94a3b8',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            您的工作区
          </div>
          {workspaces.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>暂无工作区</div>
          )}
          {workspaces.map((ws) => {
            const active = ws.id === currentWorkspace?.id;
            return (
              <button
                key={ws.id}
                disabled={busy}
                onClick={() => onSwitch(ws.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  background: active ? '#eff6ff' : 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  fontSize: 12.5,
                  color: '#0f172a',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, color: '#3b82f6' }}>{active ? '✓' : ''}</span>
                  <span style={{ fontWeight: 500 }}>{ws.name}</span>
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{ws.role}</span>
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

          <button
            onClick={() => {
              setOpen(false);
              navigate('/settings/workspaces');
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: 5,
              fontSize: 12,
              color: '#334155',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 12 }}>⚙</span> 管理工作区…
          </button>
        </div>
      )}
    </div>
  );
}
