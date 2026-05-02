import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../api/client';

export function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth providers 可用性
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    authClient.get('/auth/oauth/status')
      .then((res: any) => setGoogleEnabled(!!res?.google?.enabled))
      .catch(() => setGoogleEnabled(false));
  }, []);

  // 已登录则直接跳走（在 effect 里跳，避免 render 阶段 setState 触发 React 警告）
  useEffect(() => {
    if (!loading && user) {
      navigate(decodeURIComponent(next), { replace: true });
    }
  }, [loading, user, next, navigate]);
  if (!loading && user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(decodeURIComponent(next), { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Login failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)',
      padding: 16,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
        padding: 40,
        width: '100%',
        maxWidth: 400,
      }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
          Content Pipeline
        </h1>
        <p style={{ margin: '8px 0 32px', color: '#64748b', fontSize: 14 }}>
          登录到您的工作区
        </p>

        <form onSubmit={onSubmit}>
          <label style={labelStyle}>邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@local"
            required
            autoFocus
            disabled={submitting}
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 16 }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={submitting}
            style={inputStyle}
          />

          {error && (
            <div style={{
              marginTop: 12,
              padding: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              borderRadius: 6,
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 24,
              width: '100%',
              padding: '10px 16px',
              background: submitting ? '#94a3b8' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>

        <div style={{
          marginTop: 24, paddingTop: 16,
          borderTop: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {googleEnabled ? (
            <a
              href="/api/auth/oauth/google/start"
              style={{
                padding: '8px 16px',
                background: 'white',
                color: '#1f2937',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>G</span>
              使用 Google 登录
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="后端未配置 GOOGLE_OAUTH_CLIENT_ID / SECRET; admin 配置后自动启用"
              style={{
                padding: '8px 16px',
                background: '#f1f5f9',
                color: '#94a3b8',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'not-allowed',
              }}
            >
              使用 Google 登录（未配置）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#334155',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
