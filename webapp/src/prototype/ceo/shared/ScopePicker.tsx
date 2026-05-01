// 多选 scope 复选框组件 — 项目/客户/主题三组
// 来源数据: GET /api/v1/meeting-notes/scopes?kind=project|client|topic
// 选中状态: URL query ?scopes=id1,id2,id3 (URLSearchParams 受控)

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ScopeRow {
  id: string;
  name: string;
  kind: 'project' | 'client' | 'topic' | 'library';
  status: string;
  parent_scope_id?: string | null;
}

const KINDS: Array<{ kind: ScopeRow['kind']; label: string; tone: string }> = [
  { kind: 'project', label: '项目', tone: '#7BA7C4' },
  { kind: 'client',  label: '客户', tone: '#D4A84B' },
  { kind: 'topic',   label: '主题', tone: '#A6CC9A' },
];

interface Props {
  /** 是否压缩为单行（详情页用），否则 3 列网格（Boardroom 顶栏用）*/
  compact?: boolean;
}

export function ScopePicker({ compact = false }: Props) {
  const [params, setParams] = useSearchParams();
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const selected = parseSelected(params.get('scopes'));

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      KINDS.map((k) =>
        fetch(`/api/v1/meeting-notes/scopes?kind=${k.kind}`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .catch(() => ({ items: [] })),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const merged: ScopeRow[] = [];
        for (const res of results as Array<{ items: ScopeRow[] }>) {
          for (const s of res.items ?? []) merged.push(s);
        }
        setScopes(merged);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const arr = Array.from(next);
    if (arr.length === 0) {
      params.delete('scopes');
    } else {
      params.set('scopes', arr.join(','));
    }
    setParams(params, { replace: true });
  };

  const clear = () => {
    params.delete('scopes');
    setParams(params, { replace: true });
  };

  if (loading) {
    return (
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(240,232,214,0.5)' }}>
        加载 scopes…
      </span>
    );
  }

  const byKind: Record<string, ScopeRow[]> = { project: [], client: [], topic: [] };
  for (const s of scopes) {
    if (s.kind in byKind) byKind[s.kind].push(s);
  }

  return (
    <div
      style={{
        display: compact ? 'flex' : 'grid',
        gridTemplateColumns: compact ? undefined : 'repeat(3, 1fr)',
        flexWrap: compact ? 'wrap' : undefined,
        gap: compact ? 8 : 14,
        padding: compact ? '6px 10px' : '12px 14px',
        background: 'rgba(212,168,75,0.04)',
        border: '1px solid rgba(212,168,75,0.2)',
        borderRadius: 6,
      }}
    >
      {KINDS.map((k) => (
        <div key={k.kind}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: k.tone,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {k.label} · {byKind[k.kind].length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {byKind[k.kind].length === 0 ? (
              <span style={{ fontSize: 10.5, color: 'rgba(240,232,214,0.4)', fontStyle: 'italic' }}>
                无
              </span>
            ) : (
              byKind[k.kind].map((s) => {
                const active = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    style={{
                      padding: '3px 9px',
                      fontFamily: 'var(--mono)',
                      fontSize: 10.5,
                      letterSpacing: 0.2,
                      borderRadius: 99,
                      cursor: 'pointer',
                      background: active ? `${k.tone}25` : 'transparent',
                      color: active ? k.tone : 'rgba(240,232,214,0.7)',
                      border: `1px solid ${active ? k.tone : 'rgba(240,232,214,0.18)'}`,
                    }}
                  >
                    {active ? '✓ ' : ''}
                    {s.name}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ))}
      {selected.size > 0 && (
        <button
          onClick={clear}
          style={{
            alignSelf: 'flex-start',
            padding: '4px 10px',
            background: 'transparent',
            color: 'rgba(240,232,214,0.5)',
            border: '1px solid rgba(240,232,214,0.2)',
            borderRadius: 99,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          ✕ 清除 ({selected.size})
        </button>
      )}
    </div>
  );
}

export function parseSelected(query: string | null): Set<string> {
  if (!query) return new Set();
  return new Set(query.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Hook: 用于 Boardroom 子组件读 URL 中已选 scopes */
export function useSelectedScopes(): string[] {
  const [params] = useSearchParams();
  return Array.from(parseSelected(params.get('scopes')));
}
