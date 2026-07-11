import { useEffect, useState } from 'react';
import { meetingNotesApi, type UnresolvedMention } from '../../api/meetingNotes';

const STATUS_FILTERS = [
  { value: 'pending', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'all', label: '全部' },
];

export function UnresolvedReview() {
  const [items, setItems] = useState<UnresolvedMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listUnresolvedMentions({ status, limit: 200 });
      setItems(r.items || []);
    } catch (e: any) {
      alert(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const onResolve = async (row: UnresolvedMention) => {
    if (!confirm(`把「${row.rawName}」标记为已解决（移出待处理队列）？`)) return;
    setBusyId(row.id);
    try {
      await meetingNotesApi.resolveUnresolvedMention(row.id);
      await load();
    } catch (e: any) {
      alert(e?.message || '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>待认领人名</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            会议里没匹配到花名册的人名；确认处理后标记已解决、移出队列。
          </p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
          {STATUS_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
        </select>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>队列为空</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>原始名</th>
                <th style={th}>归一名</th>
                <th style={th}>出现次数</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const canAct = it.status === 'pending' && busyId !== it.id;
                return (
                  <tr key={it.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{it.rawName}</td>
                    <td style={{ ...td, color: '#64748b' }}>{it.normalizedName}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{it.occurrences}</td>
                    <td style={{ ...td, fontSize: 12, color: '#64748b' }}>{it.status}</td>
                    <td style={td}>
                      <button onClick={() => onResolve(it)} disabled={!canAct}
                        style={{ ...smallBtn, ...(!canAct ? disabledBtn : {}) }}>
                        标记已解决
                      </button>
                    </td>
                  </tr>
                );
              })}
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
const smallBtn: React.CSSProperties = { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: '#f1f5f9', color: '#475569' };
const disabledBtn: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
