import { Fragment, useEffect, useState } from 'react';
import { meetingNotesApi, type PersonRosterRow, type PersonMeeting } from '../../api/meetingNotes';

const PAGE_SIZE = 50;

const KIND_LABEL: Record<string, string> = {
  person: '真人', role: '角色', topic: '话题', section: '章节',
  metadata: '元数据', placeholder: '占位符', unclear: '待定',
};
const KIND_COLOR: Record<string, { bg: string; fg: string }> = {
  person: { bg: '#d1fae5', fg: '#065f46' }, placeholder: { bg: '#fef3c7', fg: '#92400e' },
  unclear: { bg: '#e5e7eb', fg: '#374151' },
};

export function PeopleRoster() {
  const [items, setItems] = useState<PersonRosterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [kind, setKind] = useState('person'); // 默认只看真人
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Record<string, PersonMeeting[] | 'loading'>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>('');
  const [preview, setPreview] = useState<null | 'loading' | { aliases: string[]; totalRefs: number; sourceIds: string[] }>(null);
  const [merging, setMerging] = useState(false);

  const nameOf = (id: string) => items.find((i) => i.id === id)?.canonicalName ?? id.slice(0, 8);

  const load = async () => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listPeopleRoster({
        q: submittedQ || undefined,
        kind: kind === 'all' ? undefined : kind,
        includeJunk: kind === 'all',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(r.items || []);
      setTotal(r.total ?? (r.items || []).length);
    } catch (e: any) {
      alert(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { setSelected([]); setPreview(null); load(); /* eslint-disable-next-line */ }, [page, kind, submittedQ]);
  useEffect(() => { if (!selected.includes(target)) setTarget(selected[0] || ''); /* eslint-disable-next-line */ }, [selected]);

  const toggleSelect = (id: string) => {
    setPreview(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const doPreview = async () => {
    const sources = selected.filter((id) => id !== target);
    if (!target || sources.length === 0) return;
    setPreview('loading');
    try {
      const rs = await Promise.all(sources.map((s) => meetingNotesApi.mergePeople(target, s, true)));
      const aliases = Array.from(new Set(rs.flatMap((r) => r.previewMergedAliases ?? [])));
      const totalRefs = rs.reduce((n, r) => n + (r.refs?.reduce((a, x) => a + x.n, 0) ?? 0), 0);
      setPreview({ aliases, totalRefs, sourceIds: sources });
    } catch (e: any) { alert(e?.message || '预览失败'); setPreview(null); }
  };

  const doMerge = async () => {
    const sources = selected.filter((id) => id !== target);
    if (!target || sources.length === 0) return;
    if (!confirm(`确认把 ${sources.map(nameOf).join('、')} 合并进「${nameOf(target)}」？源记录将被删除、其会议/承诺等全部归到本命。此操作不可撤销。`)) return;
    setMerging(true);
    try {
      for (const s of sources) await meetingNotesApi.mergePeople(target, s, false);
      setSelected([]); setPreview(null); setExpandedId(null);
      setMeetings((m) => { const c = { ...m }; delete c[target]; return c; });
      await load();
    } catch (e: any) { alert(e?.message || '合并失败'); }
    finally { setMerging(false); }
  };

  const toggle = async (p: PersonRosterRow) => {
    if (expandedId === p.id) { setExpandedId(null); return; }
    setExpandedId(p.id);
    if (!meetings[p.id]) {
      setMeetings((m) => ({ ...m, [p.id]: 'loading' }));
      try {
        const r = await meetingNotesApi.getPersonMeetings(p.id);
        setMeetings((m) => ({ ...m, [p.id]: r.meetings || [] }));
      } catch {
        setMeetings((m) => ({ ...m, [p.id]: [] }));
      }
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>人物花名册</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            全局 mn_people（跨 workspace）· 共 {total} 人 · 第 {from}–{to} 条 · 点行展开看别名与会议
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setPage(0); setSubmittedQ(q); }} style={{ display: 'flex', gap: 8 }}>
          <select value={kind} onChange={(e) => { setPage(0); setKind(e.target.value); }} style={{ ...btn, cursor: 'pointer' }}>
            <option value="person">真人</option>
            <option value="placeholder">占位符</option>
            <option value="unclear">待定</option>
            <option value="all">全部(含 junk)</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按名字 / 别名搜索"
            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: 200 }} />
          <button type="submit" style={{ ...btn, background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>搜索</button>
          {submittedQ && <button type="button" onClick={() => { setQ(''); setPage(0); setSubmittedQ(''); }} style={btn}>清除</button>}
        </form>
      </div>

      {selected.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: '#1e40af' }}>已选 {selected.length} 人</span>
          {selected.length >= 2 ? (
            <>
              <span style={{ color: '#475569' }}>合并为本命</span>
              <select value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); }} style={{ ...btn, cursor: 'pointer' }}>
                {selected.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
              <button style={{ ...btn, background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }} onClick={doPreview}>预览合并</button>
              {preview === 'loading' && <span style={{ color: '#64748b' }}>预览中…</span>}
              {preview && preview !== 'loading' && (
                <>
                  <span style={{ color: '#475569' }}>
                    → 并入本命，影响 <b>{preview.totalRefs}</b> 条引用，合并后别名 <b>{preview.aliases.length}</b> 个
                  </span>
                  <button disabled={merging} style={{ ...btn, background: '#dc2626', color: 'white', borderColor: '#dc2626' }} onClick={doMerge}>
                    {merging ? '合并中…' : `确认合并 ${preview.sourceIds.length} 人`}
                  </button>
                </>
              )}
            </>
          ) : (
            <span style={{ color: '#64748b' }}>再勾选至少一个才能合并</span>
          )}
          <button style={btn} onClick={() => { setSelected([]); setPreview(null); }}>取消</button>
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>无人物</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}></th>
                <th style={th}></th>
                <th style={th}>名字</th>
                <th style={th}>类别</th>
                <th style={th}>角色</th>
                <th style={th}>组织</th>
                <th style={th}>别名数</th>
                <th style={th}>已桥接</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const open = expandedId === p.id;
                const kc = KIND_COLOR[p.personKind || ''] || { bg: '#e5e7eb', fg: '#374151' };
                const mtgs = meetings[p.id];
                return (
                  <Fragment key={p.id}>
                    <tr onClick={() => toggle(p)}
                      style={{ borderTop: '1px solid #e2e8f0', cursor: 'pointer', background: selected.includes(p.id) ? '#eff6ff' : open ? '#f8fafc' : 'white' }}>
                      <td style={{ ...td, width: 24 }} onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}>
                        <input type="checkbox" checked={selected.includes(p.id)} readOnly style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ ...td, color: '#94a3b8', width: 24 }}>{open ? '▾' : '▸'}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{p.canonicalName}</td>
                      <td style={td}>
                        <span style={{ ...badge, background: kc.bg, color: kc.fg }}>{KIND_LABEL[p.personKind || ''] || p.personKind || '—'}</span>
                      </td>
                      <td style={td}>{p.role || '—'}</td>
                      <td style={td}>{p.org || '—'}</td>
                      <td style={{ ...td, color: '#64748b' }}>{p.aliases.length || '—'}</td>
                      <td style={td}>
                        {p.bridged
                          ? <span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>已桥接</span>
                          : <span style={{ ...badge, background: '#fef3c7', color: '#92400e' }}>未桥接</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={2} />
                        <td colSpan={6} style={{ padding: '4px 12px 16px' }}>
                          <div style={{ marginBottom: 10 }}>
                            <span style={sub}>本命</span> <b style={{ color: '#0f172a' }}>{p.canonicalName}</b>
                            {p.aliases.length > 0 && (
                              <>
                                <span style={{ ...sub, marginLeft: 16 }}>合并别名</span>{' '}
                                {p.aliases.map((a) => (
                                  <span key={a} style={{ ...badge, background: '#eef2ff', color: '#3730a3', marginRight: 4 }}>{a}</span>
                                ))}
                              </>
                            )}
                          </div>
                          <div>
                            <span style={sub}>出现的会议</span>
                            {mtgs === 'loading' ? (
                              <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>加载中…</span>
                            ) : !mtgs || mtgs.length === 0 ? (
                              <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>无关联会议</span>
                            ) : (
                              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                                {mtgs.map((m) => (
                                  <li key={m.id} style={{ fontSize: 13, marginBottom: 3 }}>
                                    <a href={`/meeting/${m.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                                      {m.title}
                                    </a>
                                    {m.date && <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>{m.date.slice(0, 10)}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button style={btn} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 上一页</button>
        <span style={{ fontSize: 13, color: '#64748b' }}>第 {page + 1} / {pages} 页</span>
        <button style={btn} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>下一页 →</button>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0f172a' };
const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: '#f1f5f9', color: '#475569' };
const badge: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 };
const sub: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 };
