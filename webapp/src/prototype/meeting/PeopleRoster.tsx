import { useEffect, useState } from 'react';
import { meetingNotesApi, type PersonRosterRow } from '../../api/meetingNotes';

export function PeopleRoster() {
  const [items, setItems] = useState<PersonRosterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async (query: string) => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listPeopleRoster({ q: query || undefined, limit: 2000 });
      setItems(r.items || []);
      setTotal(r.total ?? (r.items || []).length);
    } catch (e: any) {
      alert(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(''); }, []);

  const bridgedCount = items.filter((p) => p.bridged).length;

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>人物花名册</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            全局 mn_people（跨 workspace）· 共 {total} 人{items.length < total ? `（显示前 ${items.length}）` : ''}，本页已桥接 content_entities {bridgedCount} 人
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); load(q); }} style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按名字 / 别名搜索"
            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: 220 }} />
          <button type="submit" style={{ ...btn, background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>搜索</button>
          {q && <button type="button" onClick={() => { setQ(''); load(''); }} style={btn}>清除</button>}
        </form>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>无人物</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>名字</th>
                <th style={th}>别名</th>
                <th style={th}>角色</th>
                <th style={th}>组织</th>
                <th style={th}>已桥接实体</th>
                <th style={th}>workspace</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.canonicalName}</td>
                  <td style={{ ...td, color: '#64748b' }}>{p.aliases.length ? p.aliases.join('、') : '—'}</td>
                  <td style={td}>{p.role || '—'}</td>
                  <td style={td}>{p.org || '—'}</td>
                  <td style={td}>
                    {p.bridged
                      ? <span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>已桥接</span>
                      : <span style={{ ...badge, background: '#fef3c7', color: '#92400e' }}>未桥接</span>}
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>
                    {p.workspaceId ? String(p.workspaceId).slice(0, 8) : '—'}
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

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0f172a' };
const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: '#f1f5f9', color: '#475569' };
const badge: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 };
