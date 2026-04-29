import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '../../api/client';

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// 安全随机临时密码: 12 位, 含字母+数字+常用符号 (避开易混淆字符)
function generateTempPassword(): string {
  const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((n) => charset[n % charset.length]).join('');
}

export function AdminUsers() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 新建账号
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newSuper, setNewSuper] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 临时密码弹窗 (改密 / 创建后展示)
  const [credModal, setCredModal] = useState<{ email: string; password: string; action: 'created' | 'reset' } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = (await authClient.get('/admin/users')) as AdminUserRow[];
      setRows(res);
    } catch (e: any) {
      setErr(e?.response?.data?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    const submittedEmail = newEmail.trim();
    const submittedPwd = newPwd;
    try {
      await authClient.post('/admin/users', {
        email: submittedEmail,
        name: newName.trim(),
        password: submittedPwd,
        isSuperAdmin: newSuper,
      });
      setNewEmail(''); setNewName(''); setNewPwd(''); setNewSuper(false); setCreating(false);
      await load();
      setCredModal({ email: submittedEmail, password: submittedPwd, action: 'created' });
    } catch (e: any) {
      setErr(e?.response?.data?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onToggleStatus = async (u: AdminUserRow) => {
    const next = u.status === 'active' ? 'disabled' : 'active';
    if (!confirm(`确认将 ${u.email} 切换为 ${next}?`)) return;
    try {
      await authClient.patch(`/admin/users/${u.id}`, { status: next });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || '切换失败');
    }
  };

  const onResetPassword = async (u: AdminUserRow) => {
    if (!confirm(`为 ${u.email} 生成临时密码并重置? 用户下次登录会强制改密.`)) return;
    const pwd = generateTempPassword();
    try {
      await authClient.patch(`/admin/users/${u.id}`, { password: pwd });
      setCredModal({ email: u.email, password: pwd, action: 'reset' });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || '重置失败');
    }
  };

  const onToggleSuperAdmin = async (u: AdminUserRow) => {
    const next = !u.isSuperAdmin;
    if (!confirm(`确认将 ${u.email} 的 super_admin 设为 ${next}?`)) return;
    try {
      await authClient.patch(`/admin/users/${u.id}`, { isSuperAdmin: next });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || '失败');
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>用户管理</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            super_admin 专用 · 创建账号 / 重置密码 / 启停用 / super_admin 转让
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} style={primaryBtn}>+ 创建账号</button>
        )}
      </div>

      {creating && (
        <form onSubmit={onCreate} style={cardStyle}>
          <div style={rowStyle}>
            <input type="email" placeholder="邮箱" required value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)} disabled={submitting} style={inputStyle} />
            <input type="text" placeholder="姓名" required value={newName}
              onChange={(e) => setNewName(e.target.value)} disabled={submitting} style={inputStyle} />
            <input type="text" placeholder="初始密码 (≥8)" required minLength={8} value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)} disabled={submitting} style={inputStyle} />
            <button type="button" onClick={() => setNewPwd(generateTempPassword())}
              disabled={submitting} style={ghostBtn} title="生成 12 位安全临时密码">
              🎲 生成
            </button>
          </div>
          <label style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={newSuper} onChange={(e) => setNewSuper(e.target.checked)} disabled={submitting} />
            创建为 super_admin (可进 /admin/* 后台)
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting ? '创建中…' : '创建'}
            </button>
            <button type="button" onClick={() => { setCreating(false); setNewEmail(''); setNewName(''); setNewPwd(''); setNewSuper(false); }}
              disabled={submitting} style={ghostBtn}>取消</button>
          </div>
        </form>
      )}

      {err && <div style={errBox}>{err}</div>}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>无账号</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>邮箱</th>
                <th style={th}>姓名</th>
                <th style={th}>状态</th>
                <th style={th}>super_admin</th>
                <th style={th}>必须改密</th>
                <th style={th}>最近登录</th>
                <th style={{ ...th, width: 220 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.name}</td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                      background: u.status === 'active' ? '#d1fae5' : '#fee2e2',
                      color: u.status === 'active' ? '#065f46' : '#991b1b',
                    }}>{u.status}</span>
                  </td>
                  <td style={td}>{u.isSuperAdmin ? '✓' : '—'}</td>
                  <td style={td}>{u.mustChangePassword ? '⚠' : '—'}</td>
                  <td style={{ ...td, fontSize: 12, color: '#64748b' }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button onClick={() => onResetPassword(u)} style={smallBtn}>改密</button>
                      <button onClick={() => onToggleStatus(u)} style={smallBtn}>
                        {u.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button onClick={() => onToggleSuperAdmin(u)} style={smallBtn}>
                        {u.isSuperAdmin ? '取消 super' : '设 super'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {credModal && (
        <div style={modalOverlay} onClick={() => setCredModal(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {credModal.action === 'created' ? '账号已创建' : '密码已重置'}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 16px' }}>
              请把以下临时密码通过私密渠道（IM 私聊 / 邮件）发给 <strong>{credModal.email}</strong>。
              该用户首次登录会被强制改密。
            </p>
            <div style={credBox}>
              <code style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 14, color: '#0f172a', wordBreak: 'break-all' }}>
                {credModal.password}
              </code>
              <button onClick={() => navigator.clipboard.writeText(credModal.password)} style={smallBtn}>
                📋 复制
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setCredModal(null)} style={primaryBtn}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const modalCard: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
};
const credBox: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center',
  padding: 12, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8,
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14,
};
const cardStyle: React.CSSProperties = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16,
  marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8,
};
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8 };
const errBox: React.CSSProperties = {
  marginBottom: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13,
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3,
};
const td: React.CSSProperties = { padding: '12px', fontSize: 13, color: '#0f172a' };
