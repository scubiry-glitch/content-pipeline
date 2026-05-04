// _meetingPicker.tsx — 会议下拉选择器
//
// 三轴视图（AxisKnowledge / AxisPeople / AxisMeta）共用：当 URL 没显式 ?meetingId
// 时各页面各自 auto-pick 一场，但用户没法在 UI 上换。这个组件提供一个下拉，列出
// scope 下所有会议，选中即写入 URL ?meetingId（replace，不进历史栈）。
//
// 数据源：GET /scopes/:id/meetings → { meetingIds, items: [{id, title, occurred_at, ...}] }

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MeetingItem = {
  id: string;
  title: string;
  meeting_kind: string | null;
  occurred_at: string | null;
  created_at: string;
  archived: boolean;
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  // 常见形态：'2026-03-12' / '2026-03-12T10:00:00Z' / '2026-03-12 10:00'
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s).slice(0, 10);
}

export function MeetingPicker({
  scopeId,
  autoMeetingId,
  scopeKind,
  scopeOverridden,
}: {
  scopeId: string;
  autoMeetingId: string | null;
  scopeKind?: string;
  scopeOverridden?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMeetingId = searchParams.get('meetingId');
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!UUID_RE.test(scopeId)) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    meetingNotesApi.listScopeMeetings(scopeId)
      .then((r) => {
        if (cancelled) return;
        setItems((r?.items ?? []) as MeetingItem[]);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scopeId]);

  const effectiveId = urlMeetingId ?? autoMeetingId ?? '';

  const onChange = (next: string) => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (next) n.set('meetingId', next);
      else n.delete('meetingId');
      return n;
    }, { replace: true });
  };

  const status: 'url' | 'auto' | 'none' = urlMeetingId
    ? 'url'
    : (autoMeetingId ? 'auto' : 'none');

  return (
    <div style={{
      padding: '8px 28px',
      background: 'var(--paper-2)',
      borderBottom: '1px solid var(--line-2)',
      fontSize: 11,
      fontFamily: 'var(--mono)',
      color: 'var(--ink-3)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      {scopeKind && (
        <span>
          scope={scopeKind} ·
          id=<code style={{ color: 'var(--ink-2)' }}>{scopeId?.slice(0, 8) ?? '—'}…</code>
          {scopeOverridden && <span style={{ color: '#b91c1c', marginLeft: 4 }}>(URL 覆盖)</span>}
        </span>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        meeting=
        <select
          value={effectiveId}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || items.length === 0}
          style={{
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)',
            background: 'var(--paper-1)', border: '1px solid var(--line-2)',
            borderRadius: 4, padding: '2px 6px', minWidth: 220, maxWidth: 360,
          }}
          title={items.find((m) => m.id === effectiveId)?.title ?? ''}
        >
          {items.length === 0 && (
            <option value="">{loading ? '加载中…' : (UUID_RE.test(scopeId) ? '该 scope 无会议' : '— mock —')}</option>
          )}
          {effectiveId && !items.find((m) => m.id === effectiveId) && (
            <option value={effectiveId}>{effectiveId.slice(0, 8)}… (scope 外)</option>
          )}
          {items.map((m) => {
            const date = fmtDate(m.occurred_at ?? m.created_at);
            const label = `${date ? date + ' · ' : ''}${m.title || m.id.slice(0, 8) + '…'}${m.archived ? ' [归档]' : ''}`;
            return <option key={m.id} value={m.id}>{label}</option>;
          })}
        </select>
        {status === 'url'  && <span style={{ color: '#b91c1c', marginLeft: 2 }}>(URL 显式)</span>}
        {status === 'auto' && <span style={{ color: '#065f46', marginLeft: 2 }}>(auto-pick)</span>}
        {status === 'none' && <span style={{ color: '#9a3412', marginLeft: 2 }}>(无)</span>}
        {urlMeetingId && (
          <button
            onClick={() => onChange('')}
            style={{
              fontFamily: 'var(--mono)', fontSize: 10.5, marginLeft: 4,
              background: 'transparent', border: '1px solid var(--line-2)', borderRadius: 4,
              padding: '1px 6px', cursor: 'pointer', color: 'var(--ink-3)',
            }}
            title="清除 URL ?meetingId，回到 auto-pick"
          >
            清除
          </button>
        )}
      </span>
    </div>
  );
}
