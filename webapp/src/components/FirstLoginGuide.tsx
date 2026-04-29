import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'cp.welcome.dismissed';
const OPEN_EVENT = 'cp:open-welcome';

/** 给其他组件 (例如顶栏下拉菜单) 用的: 唤起欢迎引导 */
export function openWelcomeGuide() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/**
 * 首次登录引导:
 * - 用户改完初始密码 (mustChangePassword: false) 后, 在主界面 sticky 顶部显示一次
 * - 引导用户进 /settings/workspaces 验证默认 ws / 进 /admin/users 创建团队成员
 * - 关闭后写 localStorage, 默认登录不再弹出
 * - 用户随时可在 顶栏下拉菜单 → "查看入门引导" 重新唤起 (派发 cp:open-welcome 事件)
 */
export function FirstLoginGuide() {
  const { user, currentWorkspace } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true); // 默认关 (避免闪现)
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    // 仅在 mustChangePassword=false (改完密) 时考虑展示
    if (user.mustChangePassword) return;
    const key = `${STORAGE_KEY}:${user.id}`;
    setDismissed(localStorage.getItem(key) === '1');
  }, [user]);

  // 监听菜单触发的"重新唤起"
  useEffect(() => {
    const handler = () => {
      setForceOpen(true);
      setDismissed(false);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  if (!user || user.mustChangePassword) return null;
  if (!forceOpen && dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(`${STORAGE_KEY}:${user.id}`, '1');
    setDismissed(true);
    setForceOpen(false);
  };

  return (
    <div style={bannerStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: 1 }}>
        <div style={iconStyle}>👋</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            欢迎使用内容生产流水线，{user.name}！
          </div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            你当前所在工作区:&nbsp;
            <strong>{currentWorkspace?.name || '未选择'}</strong>
            （{currentWorkspace?.role || '—'}）。
            建议接下来:
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/settings/workspaces')} style={primaryBtn}>
              管理工作区
            </button>
            {user.isSuperAdmin && (
              <>
                <button onClick={() => navigate('/admin/users')} style={ghostBtn}>
                  创建团队成员
                </button>
                <button onClick={() => navigate('/admin/audit')} style={ghostBtn}>
                  查看审计日志
                </button>
              </>
            )}
            <button onClick={() => navigate('/')} style={ghostBtn}>开始用</button>
          </div>
        </div>
        <button onClick={dismiss} style={closeBtn} title="不再显示">✕</button>
      </div>
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  margin: '12px 16px 0',
  padding: '14px 16px',
  background: 'linear-gradient(135deg, #eff6ff 0%, #ede9fe 100%)',
  border: '1px solid #c7d2fe',
  borderRadius: 10,
  display: 'flex',
};
const iconStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'white', border: '1px solid #c7d2fe',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, flexShrink: 0,
};
const primaryBtn: React.CSSProperties = {
  padding: '6px 14px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '6px 14px', background: 'white', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: 16, color: '#94a3b8', padding: 4, alignSelf: 'flex-start',
};
