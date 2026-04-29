import { useEffect, useState } from 'react';
import { authClient } from '../../api/client';

interface AuditEvent {
  id: string;
  userId: string | null;
  email: string | null;
  event: string;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

interface LockedAccount {
  email: string;
  lockedAt: string;
  retryAfterSeconds: number;
}

const EVENT_FILTERS = [
  { value: '', label: '全部' },
  { value: 'login.success', label: '登录成功' },
  { value: 'login.failure', label: '登录失败' },
  { value: 'login.locked', label: '触发锁定' },
  { value: 'logout', label: '登出' },
  { value: 'password.change', label: '改密' },
  { value: 'password.reset', label: 'admin 重置密码' },
  { value: 'user.create', label: '创建账号' },
  { value: 'user.disable', label: '禁用账号' },
  { value: 'workspace.delete', label: 'ws 删除' },
];

const eventBadge = (event: string): React.CSSProperties => {
  const map: Record<string, [string, string]> = {
    'login.success':   ['#d1fae5', '#065f46'],
    'login.failure':   ['#fef3c7', '#92400e'],
    'login.locked':    ['#fee2e2', '#991b1b'],
    'logout':          ['#e0e7ff', '#3730a3'],
    'password.change': ['#dbeafe', '#1e40af'],
    'password.reset':  ['#fed7aa', '#9a3412'],
    'user.create':     ['#d1fae5', '#065f46'],
    'user.disable':    ['#fee2e2', '#991b1b'],
    'workspace.delete':['#fee2e2', '#991b1b'],
  };
  const [bg, fg] = map[event] || ['#f1f5f9', '#475569'];
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 500, background: bg, color: fg,
  };
};

export function AdminAudit() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [statsDays, setStatsDays] = useState(7);
  const [locked, setLocked] = useState<LockedAccount[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterEmail, setFilterEmail] = useState('');

  const loadStats = async () => {
    try {
      const r = (await authClient.get(`/admin/audit/stats?days=${statsDays}`)) as { counts: Record<string, number> };
      setStats(r.counts || {});
    } catch { /* */ }
  };

  const loadLocked = async () => {
    try {
      const r = (await authClient.get('/admin/audit/locked-accounts')) as { items: LockedAccount[] };
      setLocked(r.items || []);
    } catch { /* */ }
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEvent) params.set('event', filterEvent);
      if (filterEmail) params.set('email', filterEmail);
      params.set('limit', '200');
      const r = (await authClient.get(`/admin/audit?${params.toString()}`)) as { items: AuditEvent[] };
      setEvents(r.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); loadLocked(); loadEvents(); /* eslint-disable-next-line */ }, [statsDays]);
  useEffect(() => { loadEvents(); /* eslint-disable-next-line */ }, [filterEvent, filterEmail]);

  const onUnlock = async (email: string) => {
    if (!confirm(`手动解锁 ${email} ?`)) return;
    try {
      await authClient.post('/admin/audit/unlock', { email });
      await loadLocked();
      await loadEvents();
    } catch (e: any) {
      alert(e?.response?.data?.message || '解锁失败');
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>审计日志</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            登录 / 改密 / 创建账号 / workspace 变更等敏感操作记录
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>统计窗口:</span>
          {[1, 7, 30].map((d) => (
            <button key={d} onClick={() => setStatsDays(d)}
              style={{ ...smallBtn, background: statsDays === d ? '#3b82f6' : '#f1f5f9', color: statsDays === d ? 'white' : '#475569' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {EVENT_FILTERS.filter((f) => f.value).map((f) => (
          <div key={f.value} style={statCard}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>{f.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {stats[f.value] || 0}
            </div>
          </div>
        ))}
      </div>

      {/* 当前锁定账号 */}
      {locked.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
            ⚠ 当前锁定中的账号 ({locked.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {locked.map((l) => (
                <tr key={l.email}>
                  <td style={{ padding: '4px 0', fontSize: 13, color: '#0f172a' }}>{l.email}</td>
                  <td style={{ padding: '4px 0', fontSize: 12, color: '#64748b' }}>
                    剩余 {Math.ceil(l.retryAfterSeconds / 60)} 分钟
                  </td>
                  <td style={{ padding: '4px 0', textAlign: 'right' }}>
                    <button onClick={() => onUnlock(l.email)} style={smallBtn}>立即解锁</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 过滤器 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
          {EVENT_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label || '全部 event'}</option>))}
        </select>
        <input type="text" placeholder="按邮箱过滤" value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
          style={{ flex: 1, padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
      </div>

      {/* 事件列表 */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>无记录</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>时间</th>
                <th style={th}>Event</th>
                <th style={th}>邮箱</th>
                <th style={th}>IP</th>
                <th style={th}>详情</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ ...td, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td style={td}><span style={eventBadge(e.event)}>{e.event}</span></td>
                  <td style={td}>{e.email || '—'}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                    {e.ip || '—'}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: '#64748b', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.metadata && Object.keys(e.metadata).length > 0
                      ? JSON.stringify(e.metadata)
                      : '—'}
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

const smallBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};
const statCard: React.CSSProperties = {
  background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: 12,
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3,
};
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0f172a' };
