import { useState, type FormEvent } from 'react';
import { authClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

/**
 * 强制改密弹窗：当 user.mustChangePassword=true 时全屏遮罩，
 * 直到用户成功改密才放行。super_admin 创建的初始密码 / 重置后的密码
 * 都会被标记为 must_change_password=true，强制走这一步。
 */
export function ChangePasswordGate() {
  const { user, refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !user.mustChangePassword) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    if (next !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (next === current) {
      setError('新密码不能与当前密码相同');
      return;
    }
    setSubmitting(true);
    try {
      await authClient.post('/auth/change-password', { current, next });
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || '改密失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <form onSubmit={onSubmit} style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
          首次登录请修改密码
        </h2>
        <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#64748b' }}>
          管理员设置的初始密码 / 重置密码必须修改后才能继续使用。
        </p>

        <label style={labelStyle}>
          当前密码
          <input
            type="password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          新密码（≥ 8 位）
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={submitting}
            minLength={8}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          确认新密码
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            minLength={8}
            required
            style={inputStyle}
          />
        </label>

        {error && <div style={errBox}>{error}</div>}

        <button
          type="submit"
          disabled={submitting || !current || !next || !confirm}
          style={primaryBtn}
        >
          {submitting ? '修改中…' : '修改密码并继续'}
        </button>
      </form>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: 28,
  width: '100%',
  maxWidth: 420,
  boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  fontWeight: 500,
  color: '#475569',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 14,
};

const primaryBtn: React.CSSProperties = {
  marginTop: 8,
  padding: '10px 16px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const errBox: React.CSSProperties = {
  padding: 10,
  background: '#fef2f2',
  color: '#b91c1c',
  borderRadius: 6,
  fontSize: 13,
};
