import { useEffect, useState } from 'react';
import { meetingNotesApi, type MergeCandidate } from '../../api/meetingNotes';

const STATUS_FILTERS = [
  { value: 'pending', label: '待复核' },
  { value: 'approved', label: '已合并' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'all', label: '全部' },
];

export function EntityMergeReview() {
  const [items, setItems] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listMergeCandidates({ status, limit: 100 });
      setItems(r.items || []);
    } catch (e: any) {
      alert(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const onApprove = async (row: MergeCandidate) => {
    if (row.entityType === 'person') return; // person 禁审批
    if (!confirm(`合并「${row.sourceName ?? row.sourceEntityId}」→「${row.targetName ?? row.targetEntityId}」？此操作不可逆。`)) return;
    setBusyId(row.id);
    try {
      await meetingNotesApi.approveMergeCandidate(row.id);
      await load();
    } catch (e: any) {
      if (e?.code === 'PERSON_MERGE_MANUAL') alert('person 候选请人工经 people merge 处理');
      else alert(e?.message || '合并失败');
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (row: MergeCandidate) => {
    if (!confirm(`拒绝该合并候选？`)) return;
    setBusyId(row.id);
    try {
      await meetingNotesApi.rejectMergeCandidate(row.id);
      await load();
    } catch (e: any) {
      alert(e?.message || '拒绝失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>实体合并复核</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            向量相似的实体对；非 person 可一键合并（不可逆），person 需人工经 people merge。
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
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>无候选</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>目标（保留）</th>
                <th style={th}>来源（删除）</th>
                <th style={th}>类型</th>
                <th style={th}>相似度</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const isPerson = it.entityType === 'person';
                const canAct = it.status === 'pending' && busyId !== it.id;
                return (
                  <tr key={it.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={td}>{it.targetName ?? it.targetEntityId}</td>
                    <td style={td}>{it.sourceName ?? it.sourceEntityId}</td>
                    <td style={td}><span style={badge}>{it.entityType}</span></td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{(it.similarity * 100).toFixed(1)}%</td>
                    <td style={{ ...td, fontSize: 12, color: '#64748b' }}>{it.status}</td>
                    <td style={td}>
                      <button
                        onClick={() => onApprove(it)}
                        disabled={!canAct || isPerson}
                        title={isPerson ? 'person 需人工 people merge' : '合并（不可逆）'}
                        style={{ ...smallBtn, ...(!canAct || isPerson ? disabledBtn : approveBtn) }}>
                        合并
                      </button>
                      <button
                        onClick={() => onReject(it)}
                        disabled={!canAct}
                        style={{ ...smallBtn, marginLeft: 6, ...(!canAct ? disabledBtn : {}) }}>
                        拒绝
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
const approveBtn: React.CSSProperties = { background: '#3b82f6', color: 'white', borderColor: '#3b82f6' };
const disabledBtn: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const badge: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: '#e0e7ff', color: '#3730a3' };
