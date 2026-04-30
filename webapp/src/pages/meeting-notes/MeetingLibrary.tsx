// MeetingLibrary — 会议纪要库
// 布局: 顶部 tab(全部/项目/客户/主题) + 左侧 scope 树 + 右侧会议网格
// 关键交互: 卡片 HTML5 原生拖拽到树节点 → 绑定; 树支持二级项目; 内联创建子分组

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill } from '../../components/meeting-notes/shared';

type ScopeKind = 'project' | 'client' | 'topic';
type GroupKind = 'all' | ScopeKind;
type Scope = {
  id: string;
  kind: ScopeKind;
  slug: string;
  name: string;
  status: 'active' | 'archived';
  parentScopeId: string | null;
  parent_scope_id?: string | null;  // 兼容后端旧字段名（snake_case）
};

// 拖拽 payload 的 mime type
const DRAG_MIME = 'application/x-meeting-id';

// ─── State badge ─────────────────────────────────────────────────────────────
function RunBadge({ state }: { state?: string }) {
  if (!state) return null;
  const map: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
    running:   'bg-blue-100 text-blue-700',
    queued:    'bg-gray-100 text-gray-500',
    cancelled: 'bg-gray-100 text-gray-400',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${map[state] ?? 'bg-gray-100 text-gray-400'}`}>
      {state}
    </span>
  );
}

// ─── Kind 配色 ────────────────────────────────────────────────────────────────
const KIND_COLOR: Record<ScopeKind, { chip: string; tag: string; tree: string }> = {
  project: { chip: 'bg-blue-50 border-blue-200 text-blue-700',     tag: 'P', tree: 'border-blue-400' },
  client:  { chip: 'bg-amber-50 border-amber-200 text-amber-700',  tag: 'C', tree: 'border-amber-400' },
  topic:   { chip: 'bg-purple-50 border-purple-200 text-purple-700', tag: 'T', tree: 'border-purple-400' },
};

const KIND_LABEL: Record<ScopeKind, string> = { project: '项目', client: '客户', topic: '主题' };

// ─── Scope chip on meeting card (removable, tone-coded) ─────────────────────
function ScopeChip({
  scope, onRemove,
}: {
  scope: { scopeId: string; kind: string; name: string };
  onRemove: () => void;
}) {
  const color = KIND_COLOR[(scope.kind as ScopeKind)] ?? { chip: 'bg-gray-50 border-gray-200 text-gray-600', tag: '?', tree: '' };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-medium ${color.chip}`}>
      <span className="opacity-60 font-mono">{color.tag}</span>
      {scope.name}
      <button
        className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
        title="移除"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >×</button>
    </span>
  );
}

// ─── Inline create form (替代旧 BindPopover 的"新建"段) ────────────────────
function CreateScopeForm({
  kind, parentId, parentName, onCreated, onCancel,
}: {
  kind: ScopeKind;
  parentId: string | null;
  parentName?: string;
  onCreated: (scope: Scope) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `s-${Date.now()}`;
      const created = await meetingNotesApi.createScope({
        kind, slug, name: name.trim(),
        parentScopeId: parentId,
      });
      onCreated(created as Scope);
      setName('');
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    setBusy(false);
  };
  return (
    <div className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded">
      {parentName && (
        <div className="text-[10px] text-gray-400 mb-1">在 <span className="text-gray-600 font-medium">{parentName}</span> 下新建{KIND_LABEL[kind]}</div>
      )}
      <div className="flex gap-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={parentId ? `子${KIND_LABEL[kind]}名称` : `新${KIND_LABEL[kind]}名称`}
          className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          disabled={!name.trim() || busy}
          onClick={submit}
          className="text-xs px-2 py-1 bg-gray-900 text-white rounded disabled:opacity-40"
        >{busy ? '…' : '建'}</button>
        <button onClick={onCancel} className="text-xs px-1.5 text-gray-400 hover:text-gray-700" title="取消">×</button>
      </div>
      {err && <div className="text-[10px] text-red-600 mt-1">{err}</div>}
    </div>
  );
}

// ─── Scope tree node (recursive, drop target, "+ 子" affordance) ────────────
type ScopeWithChildren = Scope & { children: ScopeWithChildren[]; meetingCount: number };

function ScopeTreeNode({
  node, depth, selectedId, expanded, onToggleExpand, onSelect,
  onDropMeeting, onAddChild, addingChildId, onCreated, onCancelAdd,
}: {
  node: ScopeWithChildren;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onDropMeeting: (meetingId: string, scopeId: string) => void;
  onAddChild: (parentId: string) => void;
  addingChildId: string | null;
  onCreated: (scope: Scope) => void;
  onCancelAdd: () => void;
}) {
  const [hover, setHover] = useState(false);
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const color = KIND_COLOR[node.kind];
  const isAddingHere = addingChildId === node.id;

  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          const mid = e.dataTransfer.getData(DRAG_MIME);
          if (mid) onDropMeeting(mid, node.id);
        }}
        style={{ paddingLeft: 6 + depth * 14 }}
        className={`group flex items-center gap-1.5 py-1 pr-2 text-xs cursor-pointer rounded transition-colors ${
          isSelected ? 'bg-gray-900 text-white' : hover ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-gray-100 text-gray-700'
        }`}
      >
        {/* Expand caret (only if has children) */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            className={`w-4 h-4 flex items-center justify-center text-[10px] ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {/* Kind tag */}
        <span className={`font-mono text-[9px] px-1 rounded ${
          isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
        }`}>{color.tag}</span>
        {/* Name */}
        <span className="truncate flex-1">{node.name}</span>
        {/* Meeting count */}
        {node.meetingCount > 0 && (
          <span className={`font-mono text-[10px] ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
            {node.meetingCount}
          </span>
        )}
        {/* Add-child button (only on hover for clean UI) */}
        <button
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          className={`opacity-0 group-hover:opacity-100 text-[11px] leading-none px-1 ${isSelected ? 'text-gray-200 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}
          title={`在「${node.name}」下新建${KIND_LABEL[node.kind]}`}
        >＋</button>
      </div>

      {/* Inline create form */}
      {isAddingHere && (
        <div style={{ paddingLeft: 24 + depth * 14, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}>
          <CreateScopeForm
            kind={node.kind}
            parentId={node.id}
            parentName={node.name}
            onCreated={onCreated}
            onCancel={onCancelAdd}
          />
        </div>
      )}

      {/* Children */}
      {isExpanded && node.children.map((child) => (
        <ScopeTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onDropMeeting={onDropMeeting}
          onAddChild={onAddChild}
          addingChildId={addingChildId}
          onCreated={onCreated}
          onCancelAdd={onCancelAdd}
        />
      ))}
    </div>
  );
}

// ─── Scope rail (left sidebar with kind sections + tree) ────────────────────
function ScopeRail({
  scopes, kindFilter, selectedId, onSelect, meetingCounts, onDropMeeting, onScopesChanged,
}: {
  scopes: Scope[];
  kindFilter: GroupKind;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  meetingCounts: Map<string, number>;
  onDropMeeting: (meetingId: string, scopeId: string) => void;
  onScopesChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingChildId, setAddingChildId] = useState<string | null>(null);
  // 顶层 "+ 新建" 状态：null=不显示, kind=显示对应 kind 的 form
  const [addingRoot, setAddingRoot] = useState<ScopeKind | null>(null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 把 scopes 拍成树形，按 kind 分组
  const tree = useMemo(() => {
    const byKind: Record<ScopeKind, ScopeWithChildren[]> = { project: [], client: [], topic: [] };
    const idMap = new Map<string, ScopeWithChildren>();
    for (const s of scopes) {
      const node: ScopeWithChildren = {
        ...s,
        parentScopeId: s.parentScopeId ?? s.parent_scope_id ?? null,
        children: [],
        meetingCount: meetingCounts.get(s.id) ?? 0,
      };
      idMap.set(s.id, node);
    }
    for (const node of idMap.values()) {
      const parentId = node.parentScopeId;
      if (parentId && idMap.has(parentId)) {
        idMap.get(parentId)!.children.push(node);
      } else {
        byKind[node.kind].push(node);
      }
    }
    // 排序：每层按 name
    const sortDeep = (nodes: ScopeWithChildren[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      nodes.forEach((n) => sortDeep(n.children));
    };
    (Object.keys(byKind) as ScopeKind[]).forEach((k) => sortDeep(byKind[k]));
    return byKind;
  }, [scopes, meetingCounts]);

  // 选中节点时，自动展开其所有祖先
  useEffect(() => {
    if (!selectedId) return;
    const idMap = new Map(scopes.map((s) => [s.id, s]));
    const ancestors = new Set<string>();
    let cur = idMap.get(selectedId)?.parentScopeId ?? idMap.get(selectedId)?.parent_scope_id ?? null;
    while (cur) {
      ancestors.add(cur);
      cur = idMap.get(cur)?.parentScopeId ?? idMap.get(cur)?.parent_scope_id ?? null;
    }
    if (ancestors.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        ancestors.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [selectedId, scopes]);

  const kindsToRender: ScopeKind[] = kindFilter === 'all'
    ? ['project', 'client', 'topic']
    : [kindFilter];

  return (
    <aside className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-3 self-start sticky top-4 max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">分组</div>
        <button
          onClick={() => onSelect(null)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${selectedId == null ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
        >全部</button>
      </div>

      {kindsToRender.map((kind) => {
        const roots = tree[kind];
        return (
          <div key={kind} className="mb-3">
            <div className="flex items-center justify-between mb-1 px-1">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{KIND_LABEL[kind]} · {roots.length}</div>
              <button
                onClick={() => setAddingRoot(addingRoot === kind ? null : kind)}
                className="text-[11px] leading-none text-gray-400 hover:text-gray-700 px-1"
                title={`新建顶层${KIND_LABEL[kind]}`}
              >＋</button>
            </div>
            {addingRoot === kind && (
              <div className="px-1 mb-2">
                <CreateScopeForm
                  kind={kind}
                  parentId={null}
                  onCreated={(s) => { setAddingRoot(null); onScopesChanged(); onSelect(s.id); }}
                  onCancel={() => setAddingRoot(null)}
                />
              </div>
            )}
            {roots.length === 0 && addingRoot !== kind && (
              <div className="text-[11px] text-gray-400 px-2 py-1">暂无{KIND_LABEL[kind]}</div>
            )}
            {roots.map((root) => (
              <ScopeTreeNode
                key={root.id}
                node={root}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onSelect={onSelect}
                onDropMeeting={onDropMeeting}
                onAddChild={(pid) => { setAddingChildId(pid); setExpanded((prev) => new Set(prev).add(pid)); }}
                addingChildId={addingChildId}
                onCreated={(_s) => { setAddingChildId(null); onScopesChanged(); }}
                onCancelAdd={() => setAddingChildId(null)}
              />
            ))}
          </div>
        );
      })}
    </aside>
  );
}

// ─── Quick bind menu (替代旧 BindPopover, 更紧凑 + 支持搜索) ──────────────────
function QuickBindMenu({
  meetingId, scopes, onClose, onBound,
}: {
  meetingId: string;
  scopes: Scope[];
  onClose: () => void;
  onBound: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopes
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
      .slice(0, 30);
  }, [scopes, query]);

  const bind = async (scopeId: string) => {
    setBusy(true);
    try {
      await meetingNotesApi.bindMeeting(scopeId, meetingId);
      onBound();
    } catch { /* ignore */ }
    setBusy(false);
  };

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索分组… 或拖卡片到左侧树"
        className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400 mb-2"
      />
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-[11px] text-gray-400 px-2 py-2 text-center">无匹配分组</div>
        )}
        {filtered.map((s) => {
          const color = KIND_COLOR[s.kind];
          return (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => bind(s.id)}
              className="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-gray-50"
            >
              <span className={`font-mono text-[9px] px-1 rounded bg-gray-100 text-gray-500`}>{color.tag}</span>
              <span className="truncate">{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Meeting card (draggable) ─────────────────────────────────────────────────
function MeetingCard({
  meeting, scopes, onRefresh,
}: {
  meeting: any;
  scopes: Scope[];
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleRemoveScope = async (scopeId: string) => {
    try {
      await meetingNotesApi.unbindScope(scopeId, meeting.id);
      onRefresh();
    } catch { /* ignore */ }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'link';
        e.dataTransfer.setData(DRAG_MIME, meeting.id);
        // 兜底纯文本，便于调试 / 跨应用粘贴
        e.dataTransfer.setData('text/plain', meeting.title ?? meeting.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition cursor-pointer relative ${
        dragging ? 'opacity-40' : ''
      }`}
      onClick={() => navigate(`/meeting-notes/${meeting.id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-serif font-medium text-sm leading-snug line-clamp-2 flex-1">
          {meeting.title}
        </div>
        <RunBadge state={meeting.last_run?.state} />
      </div>

      <div className="text-[10px] text-gray-400 font-mono mb-3">
        {meeting.meeting_kind && <span className="mr-2">{meeting.meeting_kind}</span>}
        {new Date(meeting.created_at).toLocaleDateString('zh-CN')}
        <span className="ml-2 opacity-60">⋮⋮ 拖拽分组</span>
      </div>

      <div
        className="flex flex-wrap gap-1.5 items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {(meeting.scope_bindings ?? []).map((s: any) => (
          <ScopeChip
            key={s.scopeId}
            scope={s}
            onRemove={() => handleRemoveScope(s.scopeId)}
          />
        ))}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600"
            title="搜索并绑定到分组"
          >＋ 绑定</button>
          {showMenu && (
            <QuickBindMenu
              meetingId={meeting.id}
              scopes={scopes}
              onBound={() => { setShowMenu(false); onRefresh(); }}
              onClose={() => setShowMenu(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Library run row ─────────────────────────────────────────────────────────
function LibRunRow({ run }: { run: any }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
      <RunBadge state={run.state} />
      <span className="font-mono text-xs text-gray-400">{run.id.slice(0, 8)}</span>
      <span className="text-gray-600 flex-1">全库分析 · {run.axis}</span>
      <span className="text-[11px] text-gray-400 font-mono">
        {new Date(run.created_at).toLocaleDateString('zh-CN')}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function MeetingLibrary() {
  const [groupKind, setGroupKind] = useState<GroupKind>('all');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [libraryRuns, setLibraryRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [meetingsRes, scopesRes] = await Promise.all([
        meetingNotesApi.listMeetings({ limit: 50 }),
        meetingNotesApi.listScopes(),
      ]);
      setMeetings(meetingsRes.items ?? []);
      setLibraryRuns(meetingsRes.libraryRuns ?? []);
      setScopes((scopesRes.items ?? []) as Scope[]);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  // 过滤后展示的 scope（按当前 groupKind tab）
  const visibleScopes = useMemo(() => {
    if (groupKind === 'all') return scopes;
    return scopes.filter((s) => s.kind === groupKind);
  }, [scopes, groupKind]);

  // 计算每个 scope 已绑定多少 meeting（用于 tree 节点角标）
  const meetingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const meet of meetings) {
      for (const sb of (meet.scope_bindings ?? []) as Array<{ scopeId: string }>) {
        m.set(sb.scopeId, (m.get(sb.scopeId) ?? 0) + 1);
      }
    }
    return m;
  }, [meetings]);

  // 选中 scope 时，meeting 列表过滤为绑定到该 scope（或其后代）的会议
  const visibleMeetings = useMemo(() => {
    if (!selectedScopeId) return meetings;
    // 收集 selectedScopeId 及其所有后代
    const childMap = new Map<string, string[]>();
    for (const s of scopes) {
      const pid = s.parentScopeId ?? s.parent_scope_id ?? null;
      if (pid) {
        if (!childMap.has(pid)) childMap.set(pid, []);
        childMap.get(pid)!.push(s.id);
      }
    }
    const targetIds = new Set<string>([selectedScopeId]);
    const stack = [selectedScopeId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const child of childMap.get(id) ?? []) {
        if (!targetIds.has(child)) { targetIds.add(child); stack.push(child); }
      }
    }
    return meetings.filter((m) => (m.scope_bindings ?? []).some((sb: any) => targetIds.has(sb.scopeId)));
  }, [meetings, scopes, selectedScopeId]);

  // 拖拽落到 scope 上 → bind
  const handleDropMeeting = async (meetingId: string, scopeId: string) => {
    // 已绑定就跳过
    const meet = meetings.find((m) => m.id === meetingId);
    if (meet && (meet.scope_bindings ?? []).some((sb: any) => sb.scopeId === scopeId)) return;
    try {
      await meetingNotesApi.bindMeeting(scopeId, meetingId);
      await load();
    } catch { /* ignore */ }
  };

  const tabs: { id: GroupKind; label: string }[] = [
    { id: 'all',     label: '全部' },
    { id: 'project', label: '项目' },
    { id: 'client',  label: '客户' },
    { id: 'topic',   label: '主题' },
  ];

  const selectedScope = selectedScopeId ? scopes.find((s) => s.id === selectedScopeId) : null;

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="会议纪要库"
        subtitle="左侧分组树支持拖拽 · 项目/客户/主题可嵌套子层"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex gap-1 p-1 bg-white border rounded">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setGroupKind(t.id); setSelectedScopeId(null); }}
                  className={`px-3 py-1 text-sm rounded ${
                    groupKind === t.id ? 'bg-stone-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >{t.label}</button>
              ))}
            </div>
            <button
              onClick={() => navigate('/meeting-notes/new')}
              className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded shadow-sm flex items-center gap-1.5"
            >
              <span className="text-base leading-none">＋</span> 新建会议纪要
            </button>
          </div>
        }
      />

      {loading && <div className="text-gray-400 text-sm">loading…</div>}

      {!loading && (
        <div className="flex gap-4 max-w-[1400px]">
          {/* ── 左侧 scope tree ── */}
          <ScopeRail
            scopes={visibleScopes}
            kindFilter={groupKind}
            selectedId={selectedScopeId}
            onSelect={setSelectedScopeId}
            meetingCounts={meetingCounts}
            onDropMeeting={handleDropMeeting}
            onScopesChanged={load}
          />

          {/* ── 右侧 meeting 网格 ── */}
          <div className="flex-1 min-w-0">
            {selectedScope && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">当前分组</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${KIND_COLOR[selectedScope.kind].chip}`}>
                  <span className="opacity-60 font-mono mr-1">{KIND_COLOR[selectedScope.kind].tag}</span>
                  {selectedScope.name}
                </span>
                <button
                  onClick={() => setSelectedScopeId(null)}
                  className="text-[11px] text-gray-400 hover:text-gray-700"
                >× 清除筛选</button>
              </div>
            )}

            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
              会议 · {visibleMeetings.length} 条
              {visibleMeetings.length !== meetings.length && (
                <span className="text-gray-300 ml-1">（共 {meetings.length} 条）</span>
              )}
            </div>

            {visibleMeetings.length === 0 ? (
              <div className="text-sm text-gray-500 p-10 text-center border border-dashed rounded">
                {selectedScopeId
                  ? '此分组下暂无会议。从右侧拖卡片到左侧分组节点即可绑定。'
                  : '还没有会议纪要。点击「新建会议纪要」上传第一份。'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleMeetings.map((m) => (
                  <MeetingCard key={m.id} meeting={m} scopes={scopes} onRefresh={load} />
                ))}
              </div>
            )}

            {libraryRuns.length > 0 && groupKind === 'all' && !selectedScopeId && (
              <div className="mt-8">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
                  全库分析记录（未关联具体会议）
                </div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {libraryRuns.map((r) => <LibRunRow key={r.id} run={r} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MeetingLibrary;
