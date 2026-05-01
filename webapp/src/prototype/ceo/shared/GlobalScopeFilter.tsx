// 全局 ScopeFilter — CEO 6 房间通用筛选器
// 路由级 (URL query 持久化), 在 WorldShell 顶部渲染 (仅 internal 模式).
//
// 状态:
//   ?scopes=id1,id2,...                    — 选中的 scope (项目/客户/主题)
//   ?axes=id1:people,id1:projects,id2:...   — 每个 scope 的 axis 子选择 (默认 = 全部 3 axis)
//
// 样式:
//   默认收起 (单行 chip 摘要), 点 [展开] 显示 3 列复选框 + 已选 scope 的 axis sub-checkboxes
//
// Hook 暴露:
//   useGlobalScope() — { scopeIds: string[], axisOf(scopeId): string[] }

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ScopeRow {
  id: string;
  name: string;
  kind: 'project' | 'client' | 'topic' | 'library';
  status: string;
}

const KINDS: Array<{ kind: 'project' | 'client' | 'topic'; label: string; tone: string }> = [
  { kind: 'project', label: '项目', tone: '#7BA7C4' },
  { kind: 'client', label: '客户', tone: '#D4A84B' },
  { kind: 'topic', label: '主题', tone: '#A6CC9A' },
];

const ALL_AXES = ['people', 'projects', 'knowledge'] as const;
type Axis = (typeof ALL_AXES)[number];

const AXIS_LABEL: Record<Axis, string> = {
  people: '人物',
  projects: '项目',
  knowledge: '知识',
};

// localStorage sentinel — 一旦设置过就不再自动套用推荐 scope
// 写入时机: (1) 首次自动套用后  (2) 用户点 ✕ 清除 (= 明确表示要"全部")
const AUTO_PICK_SENTINEL_KEY = 'ceo:scopes:auto-picked:v1';

export function GlobalScopeFilter() {
  const [params, setParams] = useSearchParams();
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [expandedScope, setExpandedScope] = useState<string | null>(null);
  const [autoPickHint, setAutoPickHint] = useState<string | null>(null);

  const selected = useMemo(() => parseSelected(params.get('scopes')), [params]);
  const axisOverrides = useMemo(() => parseAxes(params.get('axes')), [params]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      KINDS.map((k) =>
        fetch(`/api/v1/meeting-notes/scopes?kind=${k.kind}`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .catch(() => ({ items: [] })),
      ),
    )
      .then(async (results) => {
        if (cancelled) return;
        const merged: ScopeRow[] = [];
        for (const res of results as Array<{ items: ScopeRow[] }>) {
          for (const s of res.items ?? []) merged.push(s);
        }
        setScopes(merged);
        setLoading(false);

        // 首屏自动套用最丰富的 scope —
        // 仅当：URL 没有 ?scopes 参数 + localStorage 还没记录过自动套用
        const urlHasScopes = !!params.get('scopes');
        const alreadyPicked =
          typeof window !== 'undefined' && window.localStorage.getItem(AUTO_PICK_SENTINEL_KEY);
        if (urlHasScopes || alreadyPicked) return;

        try {
          const r = await fetch('/api/v1/ceo/recommended-scopes?limit=2');
          if (!r.ok) return;
          const data = (await r.json()) as { items?: Array<{ id: string; name: string; score: number }> };
          const picks = data.items ?? [];
          if (cancelled || picks.length === 0) return;
          const ids = picks.map((p) => p.id).join(',');
          const next = new URLSearchParams(params);
          next.set('scopes', ids);
          setParams(next, { replace: true });
          window.localStorage.setItem(AUTO_PICK_SENTINEL_KEY, '1');
          const summary = picks.map((p) => p.name).join(' + ');
          setAutoPickHint(`已默认选中素材最丰富的 ${picks.length} 个 scope: ${summary}`);
          // 6s 后淡出提示
          window.setTimeout(() => !cancelled && setAutoPickHint(null), 6000);
        } catch {
          /* 推荐失败不影响首屏可用性 */
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byKind = useMemo(() => {
    const m: Record<'project' | 'client' | 'topic', ScopeRow[]> = { project: [], client: [], topic: [] };
    for (const s of scopes) {
      if (s.kind in m) m[s.kind].push(s);
    }
    return m;
  }, [scopes]);

  const scopeById = useMemo(() => new Map(scopes.map((s) => [s.id, s])), [scopes]);

  const updateParams = (updater: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    updater(next);
    setParams(next, { replace: true });
  };

  const toggleScope = (id: string) => {
    updateParams((p) => {
      const sel = parseSelected(p.get('scopes'));
      if (sel.has(id)) sel.delete(id);
      else sel.add(id);
      if (sel.size === 0) p.delete('scopes');
      else p.set('scopes', Array.from(sel).join(','));
    });
  };

  const toggleAxis = (scopeId: string, axis: Axis) => {
    updateParams((p) => {
      const map = parseAxes(p.get('axes'));
      const cur = map.get(scopeId) ?? new Set<string>(ALL_AXES);
      if (cur.has(axis)) cur.delete(axis);
      else cur.add(axis);
      // 全选时不写 (默认 = 全选, 节省 URL 长度)
      if (cur.size === ALL_AXES.length) {
        map.delete(scopeId);
      } else {
        map.set(scopeId, cur);
      }
      const flat: string[] = [];
      for (const [sid, axes] of map.entries()) {
        for (const a of axes) flat.push(`${sid}:${a}`);
      }
      if (flat.length === 0) p.delete('axes');
      else p.set('axes', flat.join(','));
    });
  };

  const clearAll = () => {
    updateParams((p) => {
      p.delete('scopes');
      p.delete('axes');
    });
    setExpandedScope(null);
    // 用户明确选择"全部" — 写入 sentinel，下次进入也不要再自动套推荐
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTO_PICK_SENTINEL_KEY, '1');
    }
    setAutoPickHint(null);
  };

  if (loading) {
    return null;
  }

  // ─── 收起态 ─────────────────────────────────────────────────
  const summary = selected.size === 0
    ? '全部 scope'
    : `${selected.size} scope · ${selected.size * ALL_AXES.length - countDeselectedAxes(selected, axisOverrides)} axis`;

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'rgba(217,184,142,0.04)',
        borderBottom: '1px solid rgba(217,184,142,0.15)',
        fontFamily: 'var(--sans)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '6px 22px',
          fontSize: 11,
          fontFamily: 'var(--mono)',
        }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: '4px 10px',
            background: expanded ? 'rgba(217,184,142,0.12)' : 'transparent',
            border: '1px solid rgba(217,184,142,0.4)',
            color: '#D9B88E',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            borderRadius: 4,
            cursor: 'pointer',
            letterSpacing: 0.3,
          }}
        >
          {expanded ? '▾ 收起 scope' : '▸ 范围筛选'}
        </button>
        <span style={{ color: 'rgba(232,227,216,0.55)', fontSize: 10.5 }}>{summary}</span>
        {autoPickHint && (
          <span
            style={{
              padding: '2px 8px',
              fontSize: 9.5,
              fontFamily: 'var(--mono)',
              color: '#A6CC9A',
              background: 'rgba(166,204,154,0.10)',
              border: '1px solid rgba(166,204,154,0.35)',
              borderRadius: 4,
              letterSpacing: 0.2,
            }}
            title="点 ✕ 清除 切回'全部 scope'"
          >
            ⓘ {autoPickHint}
          </span>
        )}
        {selected.size > 0 && (
          <>
            <span style={{ flex: 1 }} />
            {Array.from(selected)
              .slice(0, 4)
              .map((id) => {
                const s = scopeById.get(id);
                const k = s ? KINDS.find((x) => x.kind === s.kind) : null;
                return (
                  <span
                    key={id}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: k ? `${k.tone}20` : 'transparent',
                      border: `1px solid ${k ? k.tone : 'rgba(232,227,216,0.18)'}`,
                      color: k?.tone ?? 'rgba(232,227,216,0.7)',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s?.name ?? id.slice(0, 6)}
                  </span>
                );
              })}
            {selected.size > 4 && (
              <span style={{ color: 'rgba(232,227,216,0.45)', fontSize: 10 }}>+{selected.size - 4}</span>
            )}
            <button
              onClick={clearAll}
              style={{
                padding: '2px 8px',
                background: 'transparent',
                color: 'rgba(232,227,216,0.45)',
                border: '1px solid rgba(232,227,216,0.18)',
                borderRadius: 99,
                fontFamily: 'var(--mono)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              ✕ 清除
            </button>
          </>
        )}
      </div>

      {/* ─── 展开态 ─── */}
      {expanded && (
        <div
          style={{
            padding: '10px 22px 14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 18,
            borderTop: '1px solid rgba(217,184,142,0.08)',
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
                  marginBottom: 6,
                }}
              >
                {k.label} · {byKind[k.kind].length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {byKind[k.kind].length === 0 && (
                  <span style={{ fontSize: 10.5, color: 'rgba(232,227,216,0.4)', fontStyle: 'italic' }}>
                    无
                  </span>
                )}
                {byKind[k.kind].map((s) => {
                  const active = selected.has(s.id);
                  const isExp = expandedScope === s.id;
                  const axisSet = axisOverrides.get(s.id) ?? new Set<string>(ALL_AXES);
                  return (
                    <div key={s.id}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <button
                          onClick={() => toggleScope(s.id)}
                          style={{
                            padding: '3px 9px',
                            fontFamily: 'var(--mono)',
                            fontSize: 10.5,
                            letterSpacing: 0.2,
                            borderRadius: 99,
                            cursor: 'pointer',
                            background: active ? `${k.tone}25` : 'transparent',
                            color: active ? k.tone : 'rgba(232,227,216,0.7)',
                            border: `1px solid ${active ? k.tone : 'rgba(232,227,216,0.18)'}`,
                            flex: 1,
                            textAlign: 'left',
                          }}
                        >
                          {active ? '✓ ' : ''}
                          {s.name}
                        </button>
                        {active && (
                          <button
                            onClick={() => setExpandedScope(isExp ? null : s.id)}
                            style={{
                              padding: '2px 7px',
                              background: isExp ? `${k.tone}15` : 'transparent',
                              color: 'rgba(232,227,216,0.5)',
                              border: '1px solid rgba(232,227,216,0.15)',
                              borderRadius: 4,
                              fontFamily: 'var(--mono)',
                              fontSize: 9,
                              cursor: 'pointer',
                            }}
                            title="切换 axis 子筛选"
                          >
                            {isExp ? '▾' : '▸'} 轴
                          </button>
                        )}
                      </div>
                      {active && isExp && (
                        <div
                          style={{
                            marginTop: 4,
                            marginLeft: 12,
                            display: 'flex',
                            gap: 6,
                            paddingLeft: 8,
                            borderLeft: `1px dashed ${k.tone}40`,
                          }}
                        >
                          {ALL_AXES.map((ax) => {
                            const on = axisSet.has(ax);
                            return (
                              <button
                                key={ax}
                                onClick={() => toggleAxis(s.id, ax)}
                                style={{
                                  padding: '2px 7px',
                                  background: on ? `${k.tone}18` : 'transparent',
                                  color: on ? k.tone : 'rgba(232,227,216,0.4)',
                                  border: `1px solid ${on ? `${k.tone}80` : 'rgba(232,227,216,0.12)'}`,
                                  borderRadius: 99,
                                  fontFamily: 'var(--mono)',
                                  fontSize: 9.5,
                                  cursor: 'pointer',
                                }}
                              >
                                {on ? '✓ ' : ''}
                                {AXIS_LABEL[ax]}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 公共 Hook ────────────────────────────────────────────────

/** 读当前 URL 中的 scope 选择 */
export function useGlobalScope(): {
  scopeIds: string[];
  /** 给定 scopeId 返回它当前激活的 axis (若未 override 则返回 ALL_AXES) */
  axisOf: (scopeId: string) => string[];
  /** 是否任何过滤器都没被设置 (= 全集) */
  isAll: boolean;
} {
  const [params] = useSearchParams();
  const scopeIds = useMemo(() => Array.from(parseSelected(params.get('scopes'))), [params]);
  const axisMap = useMemo(() => parseAxes(params.get('axes')), [params]);
  const isAll = scopeIds.length === 0;
  return {
    scopeIds,
    isAll,
    axisOf: (scopeId: string) =>
      Array.from(axisMap.get(scopeId) ?? new Set<string>(ALL_AXES)),
  };
}

// ─── helpers ──────────────────────────────────────────────────

function parseSelected(query: string | null): Set<string> {
  if (!query) return new Set();
  return new Set(query.split(',').map((s) => s.trim()).filter(Boolean));
}

function parseAxes(query: string | null): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!query) return out;
  for (const part of query.split(',')) {
    const [sid, axis] = part.split(':');
    if (!sid || !axis) continue;
    if (!ALL_AXES.includes(axis as Axis)) continue;
    const cur = out.get(sid) ?? new Set<string>();
    cur.add(axis);
    out.set(sid, cur);
  }
  return out;
}

function countDeselectedAxes(
  selected: Set<string>,
  axisMap: Map<string, Set<string>>,
): number {
  let n = 0;
  for (const sid of selected) {
    const set = axisMap.get(sid);
    if (set) n += ALL_AXES.length - set.size;
  }
  return n;
}
