import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type Role = 'owner' | 'admin' | 'member';

interface Member {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  status: string;
  joinedAt: string;
}

interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  isShared: boolean;
  role: Role;
  members: Member[];
  createdAt: string;
}

const roleLabel: Record<Role, string> = { owner: '所有者', admin: '管理员', member: '成员' };

export function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refresh: refreshAuth } = useAuth();

  const [ws, setWs] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 邀请表单
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [inviting, setInviting] = useState(false);

  // 改名
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = (await authClient.get(`/workspaces/${id}`)) as WorkspaceDetail;
      setWs(res);
      setNewName(res.name);
    } catch (e: any) {
      setError(e?.response?.data?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <div style={{ padding: 32, color: '#94a3b8' }}>Loading…</div>;
  if (!ws) return <div style={{ padding: 32, color: '#dc2626' }}>{error || '未找到'}</div>;

  const myRole = ws.role;
  const canEdit = myRole === 'owner' || myRole === 'admin';
  const canDelete = myRole === 'owner';
  const canChangeRole = myRole === 'owner';

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await authClient.post(`/workspaces/${ws.id}/members`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail('');
      setInviteRole('member');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || '邀请失败');
    } finally {
      setInviting(false);
    }
  };

  const onChangeRole = async (userId: string, role: Role) => {
    try {
      await authClient.patch(`/workspaces/${ws.id}/members/${userId}`, { role });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || '修改失败');
    }
  };

  const onRemove = async (userId: string, name: string) => {
    if (!confirm(`确认移除 ${name}？`)) return;
    try {
      await authClient.delete(`/workspaces/${ws.id}/members/${userId}`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || '移除失败');
    }
  };

  const onRename = async () => {
    if (!newName.trim() || newName.trim() === ws.name) {
      setRenaming(false);
      return;
    }
    try {
      await authClient.patch(`/workspaces/${ws.id}`, { name: newName.trim() });
      setRenaming(false);
      await load();
      await refreshAuth();
    } catch (e: any) {
      alert(e?.response?.data?.message || '重命名失败');
    }
  };

  const onDelete = async () => {
    if (!confirm(`确认删除工作区 "${ws.name}"？此操作不可撤销，所有成员将无法访问。`)) return;
    try {
      await authClient.delete(`/workspaces/${ws.id}`);
      await refreshAuth();
      navigate('/settings/workspaces');
    } catch (e: any) {
      alert(e?.response?.data?.message || '删除失败');
    }
  };

  const onToggleShared = async () => {
    if (!ws) return;
    const next = !ws.isShared;
    const verb = next ? '开启' : '关闭';
    const warn = next
      ? `${verb}「全员可读」后，所有登录用户（包括非成员）都能看到本工作区的全部内容。确认？`
      : `${verb}「全员可读」后，仅本工作区成员可见数据。其他用户立刻看不到这里的内容。确认？`;
    if (!confirm(warn)) return;
    try {
      await authClient.patch(`/workspaces/${ws.id}`, { isShared: next });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || '更新失败');
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <Link to="/settings/workspaces" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>
        ← 返回工作区列表
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <div style={{ flex: 1 }}>
          {renaming && canEdit ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: '4px 8px', maxWidth: 400 }}
                onKeyDown={(e) => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape') { setRenaming(false); setNewName(ws.name); } }}
              />
              <button onClick={onRename} style={primaryBtn}>保存</button>
              <button onClick={() => { setRenaming(false); setNewName(ws.name); }} style={ghostBtn}>取消</button>
            </div>
          ) : (
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 12 }}>
              {ws.name}
              {canEdit && (
                <button onClick={() => setRenaming(true)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                  ✎ 重命名
                </button>
              )}
            </h1>
          )}
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            <span style={{ fontFamily: 'monospace' }}>{ws.slug}</span>
            {' · 您是 '}
            <strong>{roleLabel[myRole]}</strong>
          </p>
        </div>
        {canDelete && (
          <button onClick={onDelete} style={{ ...ghostBtn, color: '#dc2626', borderColor: '#fecaca' }}>
            删除工作区
          </button>
        )}
      </div>

      {error && <div style={errBox}>{error}</div>}

      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '24px 0 12px' }}>
        可见性
      </h2>
      <div style={{
        background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            全员可读（is_shared）
            <span style={{
              padding: '1px 6px', fontSize: 11, fontWeight: 500, borderRadius: 4,
              background: ws.isShared ? '#dcfce7' : '#f1f5f9',
              color: ws.isShared ? '#166534' : '#475569',
            }}>
              {ws.isShared ? '开启' : '关闭'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.6 }}>
            开启后，<strong>所有登录用户</strong>都能读取本工作区的内容（无需是成员）。写权限仍只对成员开放。<br />
            关闭后回到严格隔离 — 仅本工作区成员可见。
          </div>
        </div>
        {canEdit ? (
          <button onClick={onToggleShared} style={ws.isShared ? ghostBtn : primaryBtn}>
            {ws.isShared ? '关闭共享' : '开启共享'}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>仅 owner / admin 可改</span>
        )}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '24px 0 12px' }}>
        成员（{ws.members.length}）
      </h2>

      {canEdit && (
        <form onSubmit={onInvite} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 8 }}>
          <input
            type="email"
            placeholder="成员邮箱（必须已注册账号）"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviting}
            style={inputStyle}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            disabled={inviting}
            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
          >
            <option value="member">成员</option>
            {myRole === 'owner' && <option value="admin">管理员</option>}
          </select>
          <button type="submit" disabled={inviting || !inviteEmail.trim()} style={primaryBtn}>
            {inviting ? '添加中…' : '添加成员'}
          </button>
        </form>
      )}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>姓名</th>
              <th style={th}>邮箱</th>
              <th style={th}>角色</th>
              <th style={th}>加入时间</th>
              <th style={{ ...th, width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {ws.members.map((m) => {
              const isMe = user?.id === m.userId;
              return (
                <tr key={m.userId} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={td}>
                    <strong>{m.name}</strong>
                    {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>（您）</span>}
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{m.email}</td>
                  <td style={td}>
                    {canChangeRole && !isMe && m.role !== 'owner' ? (
                      <select
                        value={m.role}
                        onChange={(e) => onChangeRole(m.userId, e.target.value as Role)}
                        style={{ padding: '2px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                      >
                        <option value="member">成员</option>
                        <option value="admin">管理员</option>
                        <option value="owner">所有者（转让）</option>
                      </select>
                    ) : (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px',
                        background: m.role === 'owner' ? '#dbeafe' : m.role === 'admin' ? '#e0f2fe' : '#f1f5f9',
                        color: m.role === 'owner' ? '#1e40af' : m.role === 'admin' ? '#0c4a6e' : '#475569',
                        borderRadius: 4, fontSize: 11, fontWeight: 500,
                      }}>
                        {roleLabel[m.role]}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </td>
                  <td style={td}>
                    {canEdit && m.role !== 'owner' && !isMe && (
                      <button
                        onClick={() => onRemove(m.userId, m.name)}
                        style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                      >
                        移除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14,
};
const errBox: React.CSSProperties = {
  marginBottom: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13,
};
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3,
};
const td: React.CSSProperties = {
  padding: '12px', fontSize: 13, color: '#0f172a',
};
