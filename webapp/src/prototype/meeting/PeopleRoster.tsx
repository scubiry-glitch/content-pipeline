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
  const [roleLabels, setRoleLabels] = useState<Record<string, string[]>>({});
  const [descEdit, setDescEdit] = useState<Record<string, string>>({}); // 描述编辑缓冲
  const [savingDesc, setSavingDesc] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>('');
  const [preview, setPreview] = useState<null | 'loading' | { aliases: string[]; totalRefs: number; sourceIds: string[] }>(null);
  const [merging, setMerging] = useState(false);
  const [selNames, setSelNames] = useState<Record<string, string>>({}); // 跨页记住已选人名

  const nameOf = (id: string) => selNames[id] ?? items.find((i) => i.id === id)?.canonicalName ?? id.slice(0, 8);

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
  // 选择跨页/跨过滤保留（不在翻页时清空），支持把不同页的重复人合到一起
  useEffect(() => { setPreview(null); load(); /* eslint-disable-next-line */ }, [page, kind, submittedQ]);
  useEffect(() => { if (!selected.includes(target)) setTarget(selected[0] || ''); /* eslint-disable-next-line */ }, [selected]);

  const toggleSelect = (p: PersonRosterRow) => {
    setPreview(null);
    setSelNames((m) => ({ ...m, [p.id]: p.canonicalName }));
    setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
  };
  const clearSelection = () => { setSelected([]); setSelNames({}); setPreview(null); };

  const doRename = async (p: PersonRosterRow) => {
    const name = window.prompt(`改名：「${p.canonicalName}」→`, p.canonicalName);
    if (!name || !name.trim() || name.trim() === p.canonicalName) return;
    const newName = name.trim();
    try {
      await meetingNotesApi.renamePerson(p.id, { canonical_name: newName });
      await load();
    } catch (e: any) {
      // 409：已有同名人物 → 多半是同一个人，直接问要不要合并过去
      const conflictId = e?.status === 409 ? e?.body?.conflictPersonId : null;
      if (conflictId) {
        if (confirm(`已存在同名人物「${newName}」。若是同一个人，点“确定”把「${p.canonicalName}」合并到 TA（会议/承诺等归入对方，本记录删除，不可撤销）。`)) {
          try {
            await meetingNotesApi.mergePeople(conflictId, { fromId: p.id });
            setExpandedId(null);
            await load();
          } catch (e2: any) { alert(e2?.message || '合并失败'); }
        }
        return;
      }
      alert(e?.message || '改名失败');
    }
  };

  const doPreview = async () => {
    const sources = selected.filter((id) => id !== target);
    if (!target || sources.length === 0) return;
    setPreview('loading');
    try {
      const rs = await Promise.all(sources.map((s) => meetingNotesApi.mergePeople(target, { fromId: s, dryRun: true })));
      const aliases = Array.from(new Set(rs.flatMap((r) => ('previewMergedAliases' in r ? r.previewMergedAliases : []))));
      const totalRefs = rs.reduce((n, r) => n + ('refs' in r ? r.refs.reduce((a, x) => a + x.n, 0) : 0), 0);
      setPreview({ aliases, totalRefs, sourceIds: sources });
    } catch (e: any) { alert(e?.message || '预览失败'); setPreview(null); }
  };

  const doMerge = async () => {
    const sources = selected.filter((id) => id !== target);
    if (!target || sources.length === 0) return;
    if (!confirm(`确认把 ${sources.map(nameOf).join('、')} 合并进「${nameOf(target)}」？源记录将被删除、其会议/承诺等全部归到本命。此操作不可撤销。`)) return;
    setMerging(true);
    try {
      for (const s of sources) await meetingNotesApi.mergePeople(target, { fromId: s });
      clearSelection(); setExpandedId(null);
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
        setRoleLabels((m) => ({ ...m, [p.id]: r.roleLabels || [] }));
      } catch {
        setMeetings((m) => ({ ...m, [p.id]: [] }));
      }
    }
    setDescEdit((d) => (p.id in d ? d : { ...d, [p.id]: p.description ?? '' }));
  };

  const removeAlias = async (p: PersonRosterRow, alias: string) => {
    if (!confirm(`从「${p.canonicalName}」删除别名「${alias}」？`)) return;
    try {
      await meetingNotesApi.removePersonAlias(p.id, alias);
      await load();
    } catch (e: any) { alert(e?.message || '删除别名失败'); }
  };

  const deletePerson = async (p: PersonRosterRow) => {
    if (!confirm(`⚠ 硬删除人物「${p.canonicalName}」？\n其会议 / 承诺等引用会一并清除或置空，各会议中对 TA 的绑定也会解除。此操作不可撤销。`)) return;
    try {
      const r = await meetingNotesApi.deletePerson(p.id);
      const n = Object.values(r.affected).reduce((a, x) => a + x.n, 0);
      setExpandedId(null);
      setSelected((s) => s.filter((x) => x !== p.id));
      setSelNames((m) => { const c = { ...m }; delete c[p.id]; return c; });
      await load();
      alert(`已删除「${p.canonicalName}」${n > 0 ? `，清理 ${n} 条引用` : ''}。`);
    } catch (e: any) { alert(e?.message || '删除失败'); }
  };

  const saveDesc = async (p: PersonRosterRow) => {
    const text = (descEdit[p.id] ?? '').trim();
    if (text === (p.description ?? '')) return;
    setSavingDesc(p.id);
    try {
      await meetingNotesApi.renamePerson(p.id, { description: text });
      await load();
    } catch (e: any) {
      alert(e?.message || '保存描述失败');
    } finally {
      setSavingDesc(null);
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
          <button style={btn} onClick={clearSelection}>取消</button>
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
                      <td style={{ ...td, width: 24 }} onClick={(e) => { e.stopPropagation(); toggleSelect(p); }}>
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
                            <button style={{ ...btn, padding: '1px 8px', marginLeft: 8, fontSize: 12 }}
                              onClick={(e) => { e.stopPropagation(); doRename(p); }}>✎ 改名</button>
                            <button style={{ ...btn, padding: '1px 8px', marginLeft: 6, fontSize: 12, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                              onClick={(e) => { e.stopPropagation(); deletePerson(p); }}>🗑 删除人物</button>
                            {p.aliases.length > 0 && (
                              <>
                                <span style={{ ...sub, marginLeft: 16 }}>合并别名</span>{' '}
                                {p.aliases.map((a) => (
                                  <span key={a} style={{ ...badge, background: '#eef2ff', color: '#3730a3', marginRight: 4 }}>
                                    {a}
                                    <button title="删除该别名" onClick={(e) => { e.stopPropagation(); removeAlias(p, a); }}
                                      style={{ marginLeft: 4, border: 'none', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <span style={sub}>角色</span>
                            <span style={{ fontSize: 13, marginLeft: 8, color: p.role ? '#0f172a' : '#94a3b8' }}>{p.role || '—'}</span>
                            {(roleLabels[p.id]?.length ?? 0) > 0 && (
                              <>
                                <span style={{ ...sub, marginLeft: 16 }}>会议参考</span>{' '}
                                {roleLabels[p.id].map((rl, k) => (
                                  <span key={k} style={{ ...badge, background: '#f1f5f9', color: '#475569', marginRight: 4 }}>{rl}</span>
                                ))}
                              </>
                            )}
                          </div>
                          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={sub}>描述</span>
                            <input
                              value={descEdit[p.id] ?? p.description ?? ''}
                              onChange={(e) => setDescEdit((d) => ({ ...d, [p.id]: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="合并参考语言 / 备注（如：集团财务负责人）"
                              style={{ flex: 1, maxWidth: 460, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 12.5 }}
                            />
                            <button style={{ ...btn, padding: '3px 10px', fontSize: 12 }} disabled={savingDesc === p.id}
                              onClick={(e) => { e.stopPropagation(); saveDesc(p); }}>{savingDesc === p.id ? '保存中…' : '保存'}</button>
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
