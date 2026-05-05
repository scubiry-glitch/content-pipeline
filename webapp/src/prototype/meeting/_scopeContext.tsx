// MeetingScopeContext — /meeting/* 全局作用域状态
// 被 MeetingShell 包裹；DimShell（ScopePill/RunBadge/CrossAxisLink）、LongitudinalView 消费
// 数据来源：fixture 起步 → Phase 8 useEffect 调 listScopes({kind}) 增量替换

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';

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
  /**
   * 当前作用域用于 API 调用的 scope id：
   *   - 当用户已选具体 instance（kindId !== 'all'）时 = instanceId
   *   - 当 kindId === 'all'（默认）时 = 第一个 project 的 id（API 加载后替换 fixture）
   *   - 没有任何 project 时退回 fixture id（保持原型可独立运行）
   * 各 axis 页用这个值替换历史上硬编码的 'p-ai-q2'，从而无须用户先操作 ScopePill。
   */
  effectiveScopeId: string;
  kind: ScopeKind;
  label: string;
  meta: string;
  kinds: ScopeKindGroup[];
  loading: boolean;
  setKind: (kindId: string) => void;
  setInstance: (kindId: string, instanceId: string) => void;
}

// MOCK_KINDS: 仅 forceMock=true 时使用. API 模式下用 EMPTY_KINDS, 不再回退 mock.
const MOCK_KINDS: ScopeKindGroup[] = [
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

// API 模式初始: 保留 group 骨架, instances 一律空, 等 listScopes 真实数据填充.
const EMPTY_KINDS: ScopeKindGroup[] = [
  { id: 'all',     label: '全库', kind: 'LIBRARY', instances: [] },
  { id: 'project', label: '项目', kind: 'PROJECT', instances: [] },
  { id: 'client',  label: '客户', kind: 'CLIENT',  instances: [] },
  { id: 'topic',   label: '主题', kind: 'TOPIC',   instances: [] },
];

const LIBRARY_META = '48 meetings · 14 projects · 9 people';

const ScopeCtx = createContext<ScopeContextValue | null>(null);

export function MeetingScopeProvider({ children }: { children: ReactNode }) {
  const forceMock = useForceMock();
  const [kinds, setKinds] = useState<ScopeKindGroup[]>(forceMock ? MOCK_KINDS : EMPTY_KINDS);
  const [loading, setLoading] = useState(false);
  const [kindId, setKindId] = useState<string>('all');
  const [instanceIds, setInstanceIds] = useState<Record<string, string>>({
    project: forceMock ? MOCK_KINDS[1].instances[0].id : '',
    client:  forceMock ? MOCK_KINDS[2].instances[0].id : '',
    topic:   forceMock ? MOCK_KINDS[3].instances[0].id : '',
  });

  // 用 listScopes({kind}) 增量填充. forceMock 用 MOCK_KINDS 不发请求;
  // API 模式失败的 group 保持空 (不再回退 mock).
  useEffect(() => {
    if (forceMock) { setKinds(MOCK_KINDS); return; }
    setKinds(EMPTY_KINDS); // 切换到 API 模式时立刻清掉残留 mock
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
        // API 失败/空数据 → 保持 instances=[](API 模式不再回退 mock).
        if (r.status !== 'fulfilled' || !Array.isArray(r.value?.items)) {
          return { ...g, instances: [] };
        }
        const instances: ScopeInstance[] = r.value.items.map((s: { id?: string; name?: string; label?: string; meetingsCount?: number; n?: number; lastUpdate?: string }) => {
          const cnt = s.meetingsCount ?? s.n;
          const meta = cnt != null
            ? `${cnt} 场会议${s.lastUpdate ? ` · ${s.lastUpdate}` : ''}`
            : (s.lastUpdate ?? '');
          return { id: s.id ?? '', label: s.name ?? s.label ?? s.id ?? '', meta };
        });
        return { ...g, instances };
      }));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [forceMock]);

  const setInstance = useCallback((targetKind: string, targetInst: string) => {
    setInstanceIds((prev) => ({ ...prev, [targetKind]: targetInst }));
    setKindId(targetKind);
  }, []);

  const value = useMemo<ScopeContextValue>(() => {
    const group = kinds.find((g) => g.id === kindId) ?? kinds[0];
    // 默认聚合：第一个 project（API 加载后即为真实 DB scope）→ 各 axis 页面 effectiveScopeId 用它
    const projectGroup = kinds.find((g) => g.id === 'project');
    // API 模式无 project 时返回空字符串, 调用方用 UUID_RE.test 等判断不发请求.
    const firstProjectId = projectGroup?.instances[0]?.id ?? '';
    if (group.id === 'all') {
      return {
        kindId: 'all', instanceId: 'all', effectiveScopeId: firstProjectId,
        kind: 'LIBRARY',
        label: group.label, meta: LIBRARY_META,
        kinds, loading, setKind: setKindId, setInstance,
      };
    }
    const inst = group.instances.find((i) => i.id === instanceIds[group.id]) ?? group.instances[0];
    const instId = inst?.id ?? '';
    return {
      kindId: group.id, instanceId: instId, effectiveScopeId: instId || firstProjectId,
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
      kindId: 'all', instanceId: 'all',
      effectiveScopeId: MOCK_KINDS[1].instances[0]?.id ?? 'p-ai-q2',
      kind: 'LIBRARY',
      label: '全库', meta: LIBRARY_META,
      kinds: MOCK_KINDS, loading: false,
      setKind: () => {}, setInstance: () => {},
    };
  }
  return v;
}

export const LIBRARY_SCOPE_META = LIBRARY_META;
