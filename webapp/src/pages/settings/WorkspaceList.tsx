import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
}

const roleLabel: Record<WorkspaceRow['role'], string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
};

export function WorkspaceList() {
  const { refresh: refreshAuth } = useAuth();
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = (await authClient.get('/workspaces')) as WorkspaceRow[];
      setRows(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await authClient.post('/workspaces', { name: name.trim() });
      setName('');
      setCreating(false);
      await load();
      await refreshAuth();
    } catch (e: any) {
      setError(e?.response?.data?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>工作区</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>管理您加入的所有工作区</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            style={primaryBtn}
          >
            + 创建工作区
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={onCreate} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>工作区名称</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：行业研究"
              disabled={submitting}
              style={inputStyle}
            />
            <button type="submit" disabled={submitting || !name.trim()} style={primaryBtn}>
              {submitting ? '创建中…' : '创建'}
            </button>
            <button type="button" onClick={() => { setCreating(false); setName(''); setError(null); }} disabled={submitting} style={ghostBtn}>
              取消
            </button>
          </div>
        </form>
      )}

      {error && <div style={errBox}>{error}</div>}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>暂无工作区</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>名称</th>
                <th style={th}>Slug</th>
                <th style={th}>角色</th>
                <th style={th}>创建时间</th>
                <th style={{ ...th, width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((ws) => (
                <tr key={ws.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={td}><strong>{ws.name}</strong></td>
                  <td style={{ ...td, color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{ws.slug}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      background: ws.role === 'owner' ? '#dbeafe' : ws.role === 'admin' ? '#e0f2fe' : '#f1f5f9',
                      color: ws.role === 'owner' ? '#1e40af' : ws.role === 'admin' ? '#0c4a6e' : '#475569',
                      borderRadius: 4, fontSize: 11, fontWeight: 500,
                    }}>
                      {roleLabel[ws.role]}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>
                    {new Date(ws.createdAt).toLocaleDateString()}
                  </td>
                  <td style={td}>
                    <Link to={`/settings/workspaces/${ws.id}`} style={{ color: '#3b82f6', fontSize: 13, textDecoration: 'none' }}>
                      详情 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
