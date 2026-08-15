// ParticipantMergeModal — 把会议中的"在场-人物"合并到项目维度已有的人物
//
// 用法：在 VariantEditorial 等会议页里，sidebar Participants 每条加一个"合并→"按钮，
// 点击打开本 Modal。Modal 流程：
//   1) GET /meetings/:id/scope-bindings 拿到本会议绑定的 project/client/topic scope
//   2) 默认选第一个非 library/meeting 的 scope；用户也可下拉切换
//   3) GET /scopes/:scopeId/people 列该 scope 下的候选合并目标（排除自身）
//   4) 用户点目标行 → POST /people/:targetId/merge { fromId } → 成功后回调 onMerged
//
// 命中后整个 mn_* 链上 fromId 的引用 reassign 到 targetId，aliases 自动并入。

import { useEffect, useMemo, useState } from 'react';
import { meetingNotesApi, type ParticipantReviewCandidate, type PersonRosterRow } from '../../api/meetingNotes';
import { Icon } from './_atoms';

const stripParen = (s: string) => s.replace(/[（(].*?[)）]/g, '').trim();
const mapRosterRow = (x: PersonRosterRow): CandidatePerson => ({
  id: x.id, canonical_name: x.canonicalName, aliases: x.aliases ?? [], role: x.role, org: x.org, commitment_count: 0,
});

type Binding = {
  scopeId: string;
  kind: 'library' | 'project' | 'client' | 'topic' | 'meeting';
  name: string;
  slug: string;
};

type CandidatePerson = {
  id: string;
  canonical_name: string;
  aliases: string[];
  role: string | null;
  org: string | null;
  commitment_count: number;
};

const KIND_LABEL: Record<Binding['kind'], string> = {
  library: '库',
  project: '项目',
  client:  '客户',
  topic:   '议题',
  meeting: '单次会议',
};

export function ParticipantMergeModal({
  meetingId,
  participant,
  onClose,
  onMerged,
}: {
  meetingId: string;
  participant: { id: string; name: string; participantId?: string; candidates?: ParticipantReviewCandidate[] };
  onClose: () => void;
  onMerged: (targetId: string) => void;
}) {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loadingBindings, setLoadingBindings] = useState(true);
  const [scopeId, setScopeId] = useState<string | null>(null);

  const [people, setPeople] = useState<CandidatePerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [globalMode, setGlobalMode] = useState(false);        // 候选来自全局花名册而非本 scope
  const [globalPeople, setGlobalPeople] = useState<CandidatePerson[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [srcPool, setSrcPool] = useState<CandidatePerson[]>([]); // 全局按名解析源参会人
  const [creating, setCreating] = useState(false);
  const [mergeScope, setMergeScope] = useState<'meeting' | 'global'>('meeting'); // 默认只本场,避免泛指串场

  // 全局解析源参会人(scope people 可能漏掉无事实的人)
  useEffect(() => {
    const norm = stripParen(participant.name);
    meetingNotesApi.listPeopleRoster({ q: norm || participant.name, kind: 'person', limit: 10 })
      .then((r) => setSrcPool((r.items ?? []).map(mapRosterRow)))
      .catch(() => {});
  }, [participant.name]);

  // 全局候选(target)：按 filter 服务端搜索
  useEffect(() => {
    if (!globalMode) return;
    let cancelled = false;
    setLoadingGlobal(true);
    const t = setTimeout(() => {
      meetingNotesApi.listPeopleRoster({ q: filter.trim() || undefined, kind: 'person', limit: 50 })
        .then((r) => { if (!cancelled) setGlobalPeople((r.items ?? []).map(mapRosterRow)); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoadingGlobal(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [globalMode, filter]);

  // Bindings
  useEffect(() => {
    let cancelled = false;
    setLoadingBindings(true);
    meetingNotesApi.getMeetingScopeBindings(meetingId)
      .then((r) => {
        if (cancelled) return;
        // 优先 project / client / topic（library 通常含全库人物，太宽泛）
        const ranked = (r.items ?? []).slice().sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
        setBindings(ranked);
        setScopeId(ranked[0]?.scopeId ?? null);
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? String(e)); })
      .finally(() => { if (!cancelled) setLoadingBindings(false); });
    return () => { cancelled = true; };
  }, [meetingId]);

  // People in scope
  useEffect(() => {
    if (!scopeId) { setPeople([]); return; }
    let cancelled = false;
    setLoadingPeople(true);
    meetingNotesApi.listScopePeople(scopeId)
      .then((r) => { if (!cancelled) setPeople(r.items ?? []); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? String(e)); })
      .finally(() => { if (!cancelled) setLoadingPeople(false); });
    return () => { cancelled = true; };
  }, [scopeId]);

  // participant.id 是 parse 标签 id(如 "p4"),不是 mn_people uuid。
  // 按名字/别名把参会人解析成真实 mn_people 记录(scope people ∪ 全局按名查到的)，拿到 fromId。
  const resolvedSource = useMemo(() => {
    const raw = participant.name;
    const norm = stripParen(raw);
    const pool = [...people, ...srcPool];
    return (
      pool.find((p) => p.canonical_name === raw) ??
      pool.find((p) => p.canonical_name === norm) ??
      pool.find((p) => stripParen(p.canonical_name) === norm) ??
      pool.find((p) => (p.aliases ?? []).some((a) => a === raw || a === norm || stripParen(a) === norm)) ??
      null
    );
  }, [people, srcPool, participant.name]);

  const candidates = useMemo(() => {
    if (globalMode) return globalPeople.filter((p) => p.id !== resolvedSource?.id);
    const q = filter.trim().toLowerCase();
    return people
      .filter((p) => p.id !== resolvedSource?.id)
      .filter((p) => !q
        || p.canonical_name.toLowerCase().includes(q)
        || (p.aliases ?? []).some((a) => a.toLowerCase().includes(q)));
  }, [globalMode, globalPeople, people, filter, resolvedSource]);

  // 全局也没有这个名字 → 新建人物(用 filter 或参会人名)
  const createName = (filter.trim() || stripParen(participant.name)).trim();
  const exactExists = candidates.some((p) => p.canonical_name === createName)
    || resolvedSource?.canonical_name === createName;
  async function handleCreate() {
    if (!createName) return;
    if (!confirm(`全局花名册没有「${createName}」。新建为一个独立人物？`)) return;
    setCreating(true);
    setError(null);
    try {
      const r = await meetingNotesApi.createPerson({ canonicalName: createName, meetingId });
      // 本场模式:新建后把本场标签绑定到新人物(泛指本场识别)
      if (mergeScope === 'meeting') {
        await meetingNotesApi.bindParticipant(meetingId, { participantId: participant.participantId ?? participant.id, targetPersonId: r.person.id });
      }
      onMerged(r.person.id); // 复用回调:刷新
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleMerge(targetId: string, targetName: string) {
    const scoped = mergeScope === 'meeting';

    // 本场:绑定本场标签→目标(不需要源人物,泛指也能用;有事实会顺带本场重指)
    if (scoped) {
      if (!confirm(`【只本场】把本场会议里的「${participant.name}」识别为「${targetName}」？\n只本场生效(写入本场覆盖),不影响其他场次;若有发言/承诺会一并归到 TA。`)) return;
      setPendingTargetId(targetId);
      setError(null);
      try {
        await meetingNotesApi.bindParticipant(meetingId, { participantId: participant.participantId ?? participant.id, targetPersonId: targetId });
        onMerged(targetId);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setPendingTargetId(null);
      }
      return;
    }

    // 全局:整体合并(需要源人物)
    if (!resolvedSource) {
      setError(`找不到「${participant.name}」对应的人物记录，无法全局合并。可切「只本场」直接识别，或用下方“新建”。`);
      return;
    }
    if (resolvedSource.id === targetId) {
      setError(`「${participant.name}」已经是「${targetName}」（同一人 / 已是其别名），无需再合并。`);
      return;
    }
    if (!confirm(`【所有场次·全局】把「${participant.name}」(实为「${resolvedSource.canonical_name}」)整体合并到「${targetName}」？\n全库所有场次的引用都改写、原 ID 删除。仅当确认是同一人时用。`)) return;
    setPendingTargetId(targetId);
    setError(null);
    try {
      await meetingNotesApi.mergePeople(targetId, { fromId: resolvedSource.id });
      onMerged(targetId);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPendingTargetId(null);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(30, 28, 26, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 'min(560px, 92vw)', maxHeight: '82vh',
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8,
        boxShadow: '0 24px 60px -10px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', position: 'relative',
        fontFamily: 'var(--sans)',
      }}>
        <button onClick={onClose} title="关闭" style={{
          position: 'absolute', top: 12, right: 14,
          border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
          width: 26, height: 26, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-2)',
        }}>
          <Icon name="x" size={12} />
        </button>

        <div style={{ padding: '20px 22px 12px' }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6,
          }}>确认本场参会人 · Participant review</div>
          <h2 style={{
            fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, margin: 0,
            letterSpacing: '-0.005em',
          }}>
            {participant.name}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
            候选仅用于推荐；点击后才将此标签确认到花名册人物。默认只影响本场会议，并同步重指本场张力、共识和行动项。
          </div>
          {!loadingPeople && (
            <div style={{ fontSize: 12, marginTop: 6, color: resolvedSource ? '#065f46' : '#92400e' }}>
              {resolvedSource
                ? `发现历史同名/别名记录「${resolvedSource.canonical_name}」；仍需确认后才绑定本场。`
                : '未发现历史同名记录。可搜索花名册或新建独立人物后确认。'}
            </div>
          )}
          {(participant.candidates?.length ?? 0) > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.3 }}>系统推荐 · 待人工确认</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
                {participant.candidates!.map((candidate) => {
                  const busy = pendingTargetId === candidate.person.id;
                  return (
                    <button
                      key={candidate.person.id}
                      onClick={() => handleMerge(candidate.person.id, candidate.person.canonicalName)}
                      disabled={!!pendingTargetId}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10,
                        textAlign: 'left', padding: '8px 10px', border: '1px solid var(--line-2)', borderRadius: 4,
                        background: busy ? 'var(--paper-3)' : 'var(--paper-2)', color: 'var(--ink)',
                        cursor: pendingTargetId ? 'wait' : 'pointer', fontSize: 12,
                      }}
                    >
                      <span>
                        <b>{candidate.person.canonicalName}</b>
                        <span style={{ color: 'var(--ink-3)' }}> · {candidate.reasons.join('、')}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>
                        {busy ? '确认中…' : '确认是此人'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
            <span style={{ color: 'var(--ink-3)' }}>操作范围</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={mergeScope === 'meeting'} onChange={() => setMergeScope('meeting')} />
              确认本场（推荐，不串场）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={mergeScope === 'global'} onChange={() => setMergeScope('global')} />
              全局人物合并（高风险）
            </label>
          </div>
        </div>

        <div style={{ padding: '4px 22px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Scope</span>
          {loadingBindings ? (
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>加载中…</span>
          ) : bindings.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>本会议未绑定任何 scope</span>
          ) : (
            <select
              value={scopeId ?? ''}
              onChange={(e) => setScopeId(e.target.value)}
              style={{
                flex: 1, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4,
                background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5,
              }}
            >
              {bindings.map((b) => (
                <option key={b.scopeId} value={b.scopeId}>
                  [{KIND_LABEL[b.kind]}] {b.name}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={globalMode} onChange={(e) => setGlobalMode(e.target.checked)} />
            全局花名册
          </label>
        </div>

        <div style={{ padding: '4px 22px' }}>
          <input
            placeholder="搜索人名 / alias…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 4,
              background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 12px 4px' }}>
          {!globalMode && !scopeId && !loadingBindings && (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 12.5 }}>
              本会议未绑定 project/client/topic。勾选上方「全局花名册」可在全库人物里合并，或先「关联到项目」。
            </div>
          )}
          {(globalMode ? loadingGlobal : (scopeId && loadingPeople)) && (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 12.5 }}>加载候选人物…</div>
          )}
          {!(globalMode ? loadingGlobal : loadingPeople) && (globalMode || scopeId) && candidates.length === 0 && (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 12.5 }}>
              {globalMode ? '全局花名册没有匹配的人物。' : '该 scope 下暂无可合并的人物（或都已是当前参会者）。'}
            </div>
          )}
          {candidates.map((p) => {
            const busy = pendingTargetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleMerge(p.id, p.canonical_name)}
                disabled={!!pendingTargetId}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 12px', margin: '4px 0',
                  border: '1px solid var(--line-2)', borderRadius: 5,
                  background: busy ? 'var(--paper-3)' : 'var(--paper)',
                  cursor: pendingTargetId ? 'wait' : 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.canonical_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
                    {[p.role, p.org].filter(Boolean).join(' · ')}
                    {p.aliases?.length ? ` · 别名 ${p.aliases.join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                  {busy ? (mergeScope === 'meeting' ? '确认中…' : '合并中…') : (mergeScope === 'meeting' ? '确认本场' : `${p.commitment_count} 承诺`)}
                </div>
              </button>
            );
          })}

          {globalMode && !loadingGlobal && createName && !exactExists && (
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', margin: '6px 0 2px',
                border: '1px dashed var(--line-2)', borderRadius: 5, background: 'var(--paper)',
                cursor: creating ? 'wait' : 'pointer', color: 'var(--ink-2)', fontSize: 12.5,
              }}
            >
              ＋ 全局花名册没有 →「{createName}」<b>新建为独立人物</b>
            </button>
          )}
        </div>

        {error && (
          <div style={{
            padding: '10px 22px', borderTop: '1px solid var(--line-2)',
            color: 'var(--amber)', fontSize: 12, fontFamily: 'var(--mono)',
          }}>
操作失败：{error}
          </div>
        )}

        <div style={{
          padding: '10px 22px 14px', borderTop: '1px solid var(--line-2)',
          fontSize: 11, color: 'var(--ink-3)',
        }}>
          本场确认只重指当前会议的引用，不会把 ASR 标签写入全局别名；
          仅“全局人物合并”才会改写全库引用并合并别名，且不可逆。
        </div>
      </div>
    </div>
  );
}

function kindRank(k: Binding['kind']): number {
  switch (k) {
    case 'project': return 0;
    case 'client':  return 1;
    case 'topic':   return 2;
    case 'meeting': return 3;
    case 'library': return 4;
  }
}

export default ParticipantMergeModal;
