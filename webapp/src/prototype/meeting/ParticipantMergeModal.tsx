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
import { meetingNotesApi } from '../../api/meetingNotes';
import { Icon } from './_atoms';

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
  participant: { id: string; name: string };
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

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people
      .filter((p) => p.id !== participant.id)
      .filter((p) => !q
        || p.canonical_name.toLowerCase().includes(q)
        || (p.aliases ?? []).some((a) => a.toLowerCase().includes(q)));
  }, [people, filter, participant.id]);

  async function handleMerge(targetId: string, targetName: string) {
    if (!confirm(`把「${participant.name}」合并到「${targetName}」？\n（会议中所有引用会改写到目标人物，原 ID 删除）`)) return;
    setPendingTargetId(targetId);
    setError(null);
    try {
      await meetingNotesApi.mergePeople(targetId, { fromId: participant.id });
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
          }}>合并到项目人物 · Merge participant</div>
          <h2 style={{
            fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, margin: 0,
            letterSpacing: '-0.005em',
          }}>
            {participant.name}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
            选择项目维度已有的人物作为合并目标，本会议中以及全库对该参会者的引用会全部改写到目标。
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
          {!scopeId && !loadingBindings && (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 12.5 }}>
              先把会议绑定到 project/client/topic（在会议头部「关联到项目」），再来合并。
            </div>
          )}
          {scopeId && loadingPeople && (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 12.5 }}>加载候选人物…</div>
          )}
          {scopeId && !loadingPeople && candidates.length === 0 && (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 12.5 }}>
              该 scope 下暂无可合并的人物（或都已是当前参会者）。
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
                  {busy ? '合并中…' : `${p.commitment_count} 承诺`}
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{
            padding: '10px 22px', borderTop: '1px solid var(--line-2)',
            color: 'var(--amber)', fontSize: 12, fontFamily: 'var(--mono)',
          }}>
            合并失败：{error}
          </div>
        )}

        <div style={{
          padding: '10px 22px 14px', borderTop: '1px solid var(--line-2)',
          fontSize: 11, color: 'var(--ink-3)',
        }}>
          合并后所有引用 (mn_commitments / mn_speech_quality / mn_role_trajectory_points 等) reassign，
          原行的 canonical/aliases 并入目标的 aliases。操作不可逆。
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
