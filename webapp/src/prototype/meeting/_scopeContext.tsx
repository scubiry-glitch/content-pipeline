// MeetingScopeContext — /meeting/* 全局作用域状态
// 被 MeetingShell 包裹；DimShell（ScopePill/RunBadge/CrossAxisLink）、LongitudinalView 消费
// 数据来源：fixture 起步 → Phase 8 useEffect 调 listScopes({kind}) 增量替换

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';

export type ScopeKind = 'LIBRARY' | 'PROJECT' | 'CLIENT' | 'TOPIC';

export interface ScopeInstance {
  id: string;
  label: string;
  meta: string;
}

export interface ScopeKindGroup {
  id: string;      // 'all' | 'project' | 'client' | 'topic'（URL/path 用的 lowercase）
  label: string;   // 全库 | 项目 | 客户 | 主题
  kind: ScopeKind; // LIBRARY | PROJECT | CLIENT | TOPIC
  instances: ScopeInstance[]; // 'all' 时 []
}

interface ScopeContextValue {
  kindId: string;       // 当前 kind id ('all' / 'project' / ...)
  instanceId: string;   // 当前 instance id ('all' / 'p-ai-q2' / ...)
  kind: ScopeKind;
  label: string;
  meta: string;
  kinds: ScopeKindGroup[];
  loading: boolean;
  setKind: (kindId: string) => void;
  setInstance: (kindId: string, instanceId: string) => void;
}

const DEFAULT_KINDS: ScopeKindGroup[] = [
  { id: 'all',     label: '全库', kind: 'LIBRARY', instances: [] },
  { id: 'project', label: '项目', kind: 'PROJECT', instances: [
    { id: 'p-ai-q2', label: 'AI 基础设施 · Q2 加配', meta: '11 meetings · 42 days' },
    { id: 'p-hw-h1', label: '消费硬件 · 2026 H1',    meta: '8 meetings · 88 days' },
    { id: 'p-ic',    label: '投委会 · 周例会',        meta: '14 meetings · 14 weeks' },
  ]},
  { id: 'client',  label: '客户', kind: 'CLIENT', instances: [
    { id: 'c-lpA', label: '远翎资本 LP-A', meta: '6 meetings' },
    { id: 'c-lpB', label: '鼎蓝家办 LP-B', meta: '4 meetings' },
  ]},
  { id: 'topic',   label: '主题', kind: 'TOPIC', instances: [
    { id: 't-infer',   label: '推理层加码',       meta: '9 meetings · 跨 3 项目' },
    { id: 't-lp-comm', label: 'LP 沟通节奏',      meta: '7 meetings · 跨 2 客户' },
  ]},
];

const LIBRARY_META = '48 meetings · 14 projects · 9 people';

const ScopeCtx = createContext<ScopeContextValue | null>(null);

export function MeetingScopeProvider({ children }: { children: ReactNode }) {
  const [kinds, setKinds] = useState<ScopeKindGroup[]>(DEFAULT_KINDS);
  const [loading, setLoading] = useState(false);
  const [kindId, setKindId] = useState<string>('all');
  const [instanceIds, setInstanceIds] = useState<Record<string, string>>({
    project: DEFAULT_KINDS[1].instances[0].id,
    client:  DEFAULT_KINDS[2].instances[0].id,
    topic:   DEFAULT_KINDS[3].instances[0].id,
  });

  // 用 listScopes({kind}) 增量替换 fixture。失败就保留 DEFAULT_KINDS（降级）。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      meetingNotesApi.listScopes({ kind: 'project' }),
      meetingNotesApi.listScopes({ kind: 'client' }),
      meetingNotesApi.listScopes({ kind: 'topic' }),
    ]).then((results) => {
      if (cancelled) return;
      setKinds((prev) => prev.map((g) => {
        if (g.id === 'all') return g;
        const idx = { project: 0, client: 1, topic: 2 }[g.id as 'project' | 'client' | 'topic'];
        if (idx === undefined) return g;
        const r = results[idx];
        if (r.status !== 'fulfilled' || !r.value?.items?.length) return g;
        const instances: ScopeInstance[] = r.value.items.map((s: { id?: string; name?: string; label?: string; meetingsCount?: number; n?: number; lastUpdate?: string }) => ({
          id: s.id ?? '',
          label: s.name ?? s.label ?? s.id ?? '',
          meta: `${s.meetingsCount ?? s.n ?? '?'} meetings${s.lastUpdate ? ` · ${s.lastUpdate}` : ''}`,
        }));
        return { ...g, instances };
      }));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const setInstance = useCallback((targetKind: string, targetInst: string) => {
    setInstanceIds((prev) => ({ ...prev, [targetKind]: targetInst }));
    setKindId(targetKind);
  }, []);

  const value = useMemo<ScopeContextValue>(() => {
    const group = kinds.find((g) => g.id === kindId) ?? kinds[0];
    if (group.id === 'all') {
      return {
        kindId: 'all', instanceId: 'all', kind: 'LIBRARY',
        label: group.label, meta: LIBRARY_META,
        kinds, loading, setKind: setKindId, setInstance,
      };
    }
    const inst = group.instances.find((i) => i.id === instanceIds[group.id]) ?? group.instances[0];
    return {
      kindId: group.id, instanceId: inst?.id ?? '',
      kind: group.kind, label: inst?.label ?? group.label, meta: inst?.meta ?? '',
      kinds, loading, setKind: setKindId, setInstance,
    };
  }, [kinds, kindId, instanceIds, loading, setInstance]);

  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useMeetingScope(): ScopeContextValue {
  const v = useContext(ScopeCtx);
  if (!v) {
    // 不强依赖 Provider — 降级为 LIBRARY all，便于单独测试某个轴页
    return {
      kindId: 'all', instanceId: 'all', kind: 'LIBRARY',
      label: '全库', meta: LIBRARY_META,
      kinds: DEFAULT_KINDS, loading: false,
      setKind: () => {}, setInstance: () => {},
    };
  }
  return v;
}

export const LIBRARY_SCOPE_META = LIBRARY_META;
