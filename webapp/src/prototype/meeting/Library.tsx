// Library.tsx — 会议纪要库
// 原型来源：/tmp/mn-proto/library.jsx Library / FolderNode / MeetingCard / PreviewPanel
// 三栏：左侧文件夹树 · 中间会议卡片 · 右侧详情预览

import { useState, useMemo, useEffect, useCallback, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Chip, Dot, Icon, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import type { IconName } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';

// ── Types ───────────────────────────────────────────────────────────────────

type GroupKey = 'project' | 'client' | 'topic';
type ColorKey = 'accent' | 'teal' | 'amber' | 'ghost';

// 区分 API 模式真实 UUID 与 fixture id（'p-yuanling-q2-infra' 等）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TreeNode {
  id: string;
  name: string;
  color?: ColorKey;
  count: number;
  children?: TreeNode[];
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  attendees: number;
  groups: Record<GroupKey, string>;
  status: 'analyzed' | 'draft';
  tension: number;
  consensus: number;
  divergence: number;
  starred: boolean;
  preset: string;
  tags: string[];
  archived?: boolean;
}

// ── Mock data ───────────────────────────────────────────────────────────────

const GROUP_TREES: Record<GroupKey, TreeNode[]> = {
  project: [
    { id: 'p-yuanling-q2', name: '远翎资本 · Q2 2026', color: 'accent', count: 8,
      children: [
        { id: 'p-yuanling-q2-infra',    name: 'AI 基础设施', count: 5 },
        { id: 'p-yuanling-q2-consumer', name: '消费科技',    count: 3 },
      ] },
    { id: 'p-yuanling-q1', name: '远翎资本 · Q1 2026', color: 'ghost', count: 12 },
    { id: 'p-internal',    name: '内部团队会',          color: 'amber', count: 6 },
    { id: 'p-lp',          name: 'LP 沟通',             color: 'teal',  count: 4 },
    { id: 'p-archive',     name: '归档',                color: 'ghost', count: 47 },
  ],
  client: [
    { id: 'c-yuanling',   name: '远翎资本',  color: 'accent', count: 20 },
    { id: 'c-hengxin',    name: '恒信创投',  color: 'teal',   count: 7 },
    { id: 'c-starwave',   name: '星浪科技',  color: 'amber',  count: 4 },
    { id: 'c-unassigned', name: '未分配',    color: 'ghost',  count: 3 },
  ],
  topic: [
    { id: 't-ai-infra',   name: 'AI 基础设施', color: 'accent', count: 9 },
    { id: 't-valuation',  name: '估值方法',    color: 'teal',   count: 6 },
    { id: 't-compliance', name: '合规与 LP',   color: 'amber',  count: 5 },
    { id: 't-exit',       name: '退出路径',    color: 'ghost',  count: 4 },
    { id: 't-geo',        name: '地缘与政策',  color: 'ghost',  count: 3 },
  ],
};

const MEETINGS: Meeting[] = [
  { id: 'M-2026-04-11-0237', title: '2026 Q2 远翎资本 · AI 基础设施投资策略评审',
    date: '2026-04-11', duration: '118m', attendees: 6,
    groups: { project: 'p-yuanling-q2-infra', client: 'c-yuanling', topic: 't-ai-infra' },
    status: 'analyzed', tension: 3, consensus: 2, divergence: 2, starred: true,
    preset: 'standard', tags: ['投资策略', '基础设施', 'Q2'] },
  { id: 'M-2026-04-04-0214', title: '推理层 candidate 尽调 · 闭门评估',
    date: '2026-04-04', duration: '74m', attendees: 4,
    groups: { project: 'p-yuanling-q2-infra', client: 'c-yuanling', topic: 't-ai-infra' },
    status: 'analyzed', tension: 1, consensus: 3, divergence: 1, starred: false,
    preset: 'standard', tags: ['尽调', '推理层'] },
  { id: 'M-2026-03-28-0201', title: '远翎资本 · Q1 复盘 · 基础设施方向',
    date: '2026-03-28', duration: '142m', attendees: 8,
    groups: { project: 'p-yuanling-q1', client: 'c-yuanling', topic: 't-ai-infra' },
    status: 'analyzed', tension: 5, consensus: 4, divergence: 3, starred: true,
    preset: 'max', tags: ['Q1 复盘'] },
  { id: 'M-2026-03-22-0188', title: '估值模型校准 · 工程侧 + 产品侧',
    date: '2026-03-22', duration: '56m', attendees: 5,
    groups: { project: 'p-internal', client: 'c-yuanling', topic: 't-valuation' },
    status: 'analyzed', tension: 2, consensus: 3, divergence: 1, starred: false,
    preset: 'standard', tags: ['估值', '内部'] },
  { id: 'M-2026-03-14-0173', title: '团队内部 · 推理层 subadvisor 选择讨论',
    date: '2026-03-14', duration: '68m', attendees: 4,
    groups: { project: 'p-internal', client: 'c-yuanling', topic: 't-ai-infra' },
    status: 'analyzed', tension: 2, consensus: 2, divergence: 2, starred: false,
    preset: 'standard', tags: ['subadvisor', '推理层'] },
  { id: 'M-2026-03-08-0166', title: '恒信创投 · 半导体中游联合投资路演',
    date: '2026-03-08', duration: '92m', attendees: 7,
    groups: { project: 'p-yuanling-q1', client: 'c-hengxin', topic: 't-ai-infra' },
    status: 'analyzed', tension: 4, consensus: 2, divergence: 3, starred: false,
    preset: 'standard', tags: ['联合投资', '半导体'] },
  { id: 'M-2026-02-22-0149', title: 'LP 沟通会 · Q1 进度披露',
    date: '2026-02-22', duration: '95m', attendees: 12,
    groups: { project: 'p-lp', client: 'c-yuanling', topic: 't-compliance' },
    status: 'analyzed', tension: 3, consensus: 5, divergence: 1, starred: true,
    preset: 'standard', tags: ['LP', '披露'] },
  { id: 'M-2026-02-15-0138', title: '星浪科技 · 产品路径与 AI 基建选型',
    date: '2026-02-15', duration: '81m', attendees: 5,
    groups: { project: 'p-yuanling-q1', client: 'c-starwave', topic: 't-ai-infra' },
    status: 'analyzed', tension: 2, consensus: 4, divergence: 2, starred: false,
    preset: 'lite', tags: ['产品', '基建选型'] },
  { id: 'M-2026-02-08-0121', title: 'H-chip 进口配额 · 应急预案研讨',
    date: '2026-02-08', duration: '47m', attendees: 4,
    groups: { project: 'p-internal', client: 'c-yuanling', topic: 't-geo' },
    status: 'analyzed', tension: 4, consensus: 1, divergence: 3, starred: false,
    preset: 'max', tags: ['地缘', 'H-chip'] },
  { id: 'M-2026-01-30-0107', title: '2026 退出路径预演 · 头部 3 家',
    date: '2026-01-30', duration: '103m', attendees: 6,
    groups: { project: 'p-yuanling-q1', client: 'c-yuanling', topic: 't-exit' },
    status: 'analyzed', tension: 3, consensus: 2, divergence: 3, starred: false,
    preset: 'standard', tags: ['退出', '预演'] },
  { id: 'M-2026-01-18-0093', title: '合规边界 · 信息披露颗粒度讨论',
    date: '2026-01-18', duration: '38m', attendees: 3,
    groups: { project: 'p-internal', client: 'c-yuanling', topic: 't-compliance' },
    status: 'draft', tension: 1, consensus: 1, divergence: 1, starred: false,
    preset: 'lite', tags: ['合规', '披露'] },
];

// ── API → Meeting 适配 ──────────────────────────────────────────────────────

// 后端 GET /meetings 返回 { id, title, meeting_kind, created_at, last_run, scope_bindings }
// 字段比 Meeting 少很多 · 缺失字段填默认值，让 fixture 风格的 UI 仍能渲染
function formatMeetingDate(api: any): string {
  // 显示优先级：metadata.occurred_at（YYYY-MM-DD 或带时间）> created_at（带时间）
  // 带时间的 ISO 串 → 'YYYY-MM-DD HH:mm'，纯日期串原样显示
  const raw = String(api.occurred_at ?? api.created_at ?? '');
  if (!raw) return '';
  const datePart = raw.slice(0, 10);
  // 检测时间分量：包含 'T' 或 ' ' 后跟数字
  const m = raw.match(/[T\s](\d{2}:\d{2})/);
  return m ? `${datePart} ${m[1]}` : datePart;
}

function adaptApiMeeting(api: any): Meeting {
  const scopes: Array<{ scopeId: string; kind: string; name?: string; slug?: string }> = api.scope_bindings ?? [];
  const findScope = (kind: string) => scopes.find((s) => s.kind === kind);
  const project = findScope('project');
  const client = findScope('client');
  const topic = findScope('topic');
  const lastRun = api.last_run ?? {};
  const durMin = Number(api.duration_min);
  return {
    id: String(api.id),
    title: String(api.title ?? '未命名会议'),
    date: formatMeetingDate(api),
    duration: Number.isFinite(durMin) && durMin > 0 ? `${durMin}m` : '—',
    attendees: Number.isFinite(Number(api.attendee_count)) ? Number(api.attendee_count) : 0,
    // 注：以前优先 slug 让 fixture 风格 UI 渲染；切到 scopeId(UUID) 优先后，
    // 树节点 id（apiScopes[*].id 也是 UUID）才能匹配上，filter / 移动到其他分组才能工作。
    groups: {
      project: project?.scopeId ?? project?.slug ?? 'p-internal',
      client: client?.scopeId ?? client?.slug ?? 'c-yuanling',
      topic: topic?.scopeId ?? topic?.slug ?? 't-ai-infra',
    },
    status: lastRun.state === 'succeeded' ? 'analyzed' : 'draft',
    tension: Number(api.tension_count ?? 0) || 0,
    consensus: Number(api.consensus_count ?? 0) || 0,
    divergence: Number(api.divergence_count ?? 0) || 0,
    starred: false,
    preset: 'standard',
    tags: api.meeting_kind ? [String(api.meeting_kind)] : [],
    archived: Boolean(api.archived),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) { const r = findNode(n.children, id); if (r) return r; }
  }
  return null;
}

const dotColor: Record<ColorKey, string> = {
  accent: 'var(--accent)', teal: 'var(--teal)', amber: 'var(--amber)', ghost: 'var(--ink-4)',
};

function folderRowStyle(active: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 10px', border: 0, borderRadius: 5, cursor: 'pointer',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'oklch(0.32 0.1 40)' : 'var(--ink-2)',
    fontWeight: active ? 600 : 450, fontSize: 12.5, fontFamily: 'var(--sans)',
    textAlign: 'left', margin: '1px 0',
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FolderNode({
  node, active, onSelect, onRename, renaming, depth = 0, onCommitRename, onDelete,
  onDropMeeting, onAddChild, addingChildId, onCommitAddChild, onCancelAddChild,
}: {
  node: TreeNode;
  active: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string | null) => void;
  renaming: string | null;
  depth?: number;
  /** 双击 → 改名输入；Enter/Blur 时把新值通过这个回调发到上层做 PUT /scopes/:id */
  onCommitRename?: (id: string, newName: string) => void;
  /** 悬停时显示的删除按钮回调 */
  onDelete?: (node: TreeNode) => void;
  /** 拖拽落点：把 meetingId 绑到 node.id 这个 scope 上 */
  onDropMeeting?: (meetingId: string, scopeId: string) => void;
  /** 在该 node 下新建子分组（hover 时显示「+ 子」按钮触发） */
  onAddChild?: (parentId: string) => void;
  /** 当前正在该 node 下显示创建子分组 inline 表单的 id */
  addingChildId?: string | null;
  /** 提交内联创建子分组（提供 newName） */
  onCommitAddChild?: (parentId: string, newName: string) => void;
  /** 取消内联创建 */
  onCancelAddChild?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const isActive = active === node.id;
  const isAddingHere = addingChildId === node.id;
  const dropEnabled = !!onDropMeeting;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node.id); } }}
        onDragOver={dropEnabled ? (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'link';
          setDragHover(true);
        } : undefined}
        onDragLeave={dropEnabled ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragHover(false); } : undefined}
        onDrop={dropEnabled ? (e) => {
          e.preventDefault();
          setDragHover(false);
          const mid = e.dataTransfer.getData('application/x-meeting-id') || e.dataTransfer.getData('text/plain');
          if (mid) onDropMeeting(mid, node.id);
        } : undefined}
        style={{
          ...folderRowStyle(isActive), paddingLeft: 8 + depth * 14,
          ...(dragHover ? {
            outline: '2px solid var(--accent)', outlineOffset: -2,
            background: 'var(--accent-soft)',
          } : {}),
        }}>
        {node.children ? (
          <span onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            style={{ display: 'flex', cursor: 'pointer', color: 'var(--ink-3)' }}>
            <Icon name="chevronDown" size={12} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          </span>
        ) : (
          <span style={{ width: 12, display: 'inline-block' }} />
        )}
        <Dot color={dotColor[node.color ?? 'ghost']} size={7} />
        {renaming === node.id ? (
          <input autoFocus defaultValue={node.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== node.name) onCommitRename?.(node.id, v);
              onRename(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.currentTarget as HTMLInputElement).value.trim();
                if (v && v !== node.name) onCommitRename?.(node.id, v);
                onRename(null);
              } else if (e.key === 'Escape') {
                onRename(null);
              }
            }}
            style={{
              flex: 1, border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 5px',
              fontSize: 12.5, fontFamily: 'var(--sans)', outline: 'none', background: 'var(--paper)',
            }}
          />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); onRename(node.id); }}
            style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title="双击改名"
          >{node.name}</span>
        )}
        {hover && (onCommitRename || onDelete || onAddChild) && renaming !== node.id ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {onAddChild && (
              <button
                type="button"
                title={`在「${node.name}」下新建子分组`}
                onClick={(e) => { e.stopPropagation(); setOpen(true); onAddChild(node.id); }}
                style={{
                  cursor: 'pointer',
                  color: 'var(--ink-3)',
                  border: '1px solid var(--line-2)',
                  background: 'var(--paper)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  fontSize: 10,
                  lineHeight: 1.2,
                  fontFamily: 'var(--sans)',
                }}
              >
                +子
              </button>
            )}
            {onCommitRename && (
              <span
                role="button"
                title="改名（也可双击节点名）"
                onClick={(e) => { e.stopPropagation(); onRename(node.id); }}
                style={{
                  cursor: 'pointer', color: 'var(--ink-4)',
                  padding: '0 4px', fontSize: 11, lineHeight: 1, fontFamily: 'var(--sans)',
                }}
              >
                改名
              </span>
            )}
            {onDelete && (
              <span
                role="button"
                title="删除分组"
                onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                style={{ display: 'flex', cursor: 'pointer', color: 'var(--ink-4)', padding: 2 }}
              >
                <Icon name="x" size={12} />
              </span>
            )}
          </span>
        ) : (
          <MonoMeta style={{ fontSize: 10 }}>{node.count}</MonoMeta>
        )}
      </div>
      {/* 子分组创建内联表单（替代 window.prompt） */}
      {isAddingHere && onCommitAddChild && (
        <InlineCreateScope
          parentName={node.name}
          paddingLeft={28 + depth * 14}
          onSubmit={(name) => onCommitAddChild(node.id, name)}
          onCancel={() => onCancelAddChild?.()}
        />
      )}
      {node.children && open && (
        <div>
          {node.children.map(c => (
            <FolderNode key={c.id} node={c} active={active} onSelect={onSelect}
              onRename={onRename} renaming={renaming} depth={depth + 1}
              onCommitRename={onCommitRename} onDelete={onDelete}
              onDropMeeting={onDropMeeting}
              onAddChild={onAddChild}
              addingChildId={addingChildId}
              onCommitAddChild={onCommitAddChild}
              onCancelAddChild={onCancelAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 内联创建分组（替代 window.prompt UX）— 顶层 / 子层共用
function InlineCreateScope({
  parentName, paddingLeft, onSubmit, onCancel,
}: {
  parentName?: string;
  paddingLeft: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState('');
  return (
    <div style={{
      paddingLeft, paddingRight: 6, paddingTop: 4, paddingBottom: 4,
    }}>
      {parentName && (
        <div style={{ fontSize: 10, color: 'var(--ink-4)', marginBottom: 3 }}>
          在 <span style={{ color: 'var(--ink-3)' }}>{parentName}</span> 下
        </div>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { const v = val.trim(); if (v) onSubmit(v); }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="子分组名称"
          style={{
            flex: 1, padding: '3px 6px', border: '1px solid var(--accent)', borderRadius: 3,
            fontSize: 12, fontFamily: 'var(--sans)', outline: 'none', background: 'var(--paper)',
          }}
        />
        <button
          onClick={() => { const v = val.trim(); if (v) onSubmit(v); }}
          disabled={!val.trim()}
          style={{
            padding: '3px 8px', fontSize: 11, border: '1px solid var(--ink)',
            background: val.trim() ? 'var(--ink)' : 'var(--paper)',
            color: val.trim() ? 'var(--paper)' : 'var(--ink-4)',
            borderRadius: 3, cursor: val.trim() ? 'pointer' : 'not-allowed',
          }}
        >建</button>
        <button
          onClick={onCancel}
          style={{ padding: '3px 4px', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 11 }}
          title="取消"
        >×</button>
      </div>
    </div>
  );
}

function MiniStat({ icon, color, v, label }: { icon: IconName; color: string; v: number; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
      borderRadius: 99, fontSize: 10.5, color: 'var(--ink-2)',
    }}>
      <Icon name={icon} size={10} style={{ color }} />
      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{v}</span>
      <span style={{ color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

function MeetingCard({ m, active, onClick, onOpen, groupName, draggable }: {
  m: Meeting; active: boolean; onClick: () => void; onOpen: () => void; groupName: string;
  /** 是否允许拖拽到左侧分组节点（API 模式 + UUID id 才开启） */
  draggable?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  // 改用 div + role=button 包裹: 部分浏览器（含 Safari/某些 Chrome 配置）对
  // <button draggable> 的 dragstart 事件触发不可靠, 用 div 最稳。
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
        else if (e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.effectAllowed = 'linkMove';
        e.dataTransfer.setData('application/x-meeting-id', m.id);
        e.dataTransfer.setData('text/plain', m.id);
        setIsDragging(true);
      } : undefined}
      onDragEnd={draggable ? () => setIsDragging(false) : undefined}
      title={draggable ? '⋮⋮ 拖到左侧分组节点绑定 · 单击预览 · 双击打开' : '单击预览 · 双击打开 Editorial 视图'}
      style={{
        position: 'relative',
        textAlign: 'left', background: 'var(--paper)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
        borderRadius: 8, padding: '14px 16px', cursor: draggable ? 'grab' : 'pointer',
        display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
        fontFamily: 'var(--sans)', color: 'var(--ink)',
        opacity: isDragging ? 0.4 : 1,
        userSelect: draggable ? 'none' : 'auto',  // 拖拽时不闪烁选区
      }}
    >
      {/* 显式拖拽手柄 — 让用户知道这张卡可以拖 */}
      {draggable && (
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 6, right: 6,
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)',
            letterSpacing: -1, lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
          }}
        >⋮⋮</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MonoMeta>{m.date}</MonoMeta>
        <Chip tone="ghost" style={{ fontSize: 10, padding: '1px 6px' }}>{m.preset}</Chip>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {m.starred && <Dot color="var(--amber)" size={7} />}
          <MonoMeta style={{ fontSize: 10 }}>{m.id.split('-').pop()}</MonoMeta>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.005em' }}>
        {m.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
        <Icon name="clock" size={11} /> {m.duration}
        <Icon name="users" size={11} style={{ marginLeft: 4 }} /> {m.attendees > 0 ? `${m.attendees} 人` : '—'}
        {groupName && <>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span>{groupName}</span>
        </>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <MiniStat icon="bolt"  color="var(--accent)"        v={m.tension}   label="张力" />
        <MiniStat icon="check" color="oklch(0.5 0.1 140)"  v={m.consensus}  label="共识" />
        <MiniStat icon="git"   color="var(--teal)"          v={m.divergence} label="分歧" />
        {m.status === 'draft' && <Chip tone="amber" style={{ marginLeft: 'auto' }}>草稿</Chip>}
      </div>
    </div>
  );
}

function GroupRow({ label, v }: { label: string; v: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <MonoMeta style={{ width: 36 }}>{label}</MonoMeta>
      <span style={{ color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
      <Icon name="chevron" size={11} style={{ color: 'var(--ink-4)' }} />
    </div>
  );
}

function StatBox({ label, v, tone }: { label: string; v: number; tone: 'accent' | 'teal' | 'amber' }) {
  const colors = {
    accent: { bg: 'var(--accent-soft)', fg: 'oklch(0.32 0.1 40)',   bd: 'oklch(0.85 0.07 40)' },
    teal:   { bg: 'var(--teal-soft)',   fg: 'oklch(0.3 0.08 200)',  bd: 'oklch(0.85 0.05 200)' },
    amber:  { bg: 'var(--amber-soft)',  fg: 'oklch(0.38 0.09 75)',  bd: 'oklch(0.85 0.07 75)' },
  }[tone];
  return (
    <div style={{ background: colors.bg, border: `1px solid ${colors.bd}`, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: colors.fg, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, color: colors.fg, marginTop: 2, letterSpacing: '-0.01em' }}>{v}</div>
    </div>
  );
}

type PreviewAction = 'view-a' | 'view-b' | 'view-c' | 'move' | 'export' | 'archive' | 'unarchive' | 'delete';

// ── MoveToScopeModal ────────────────────────────────────────────────────────
// 替代 window.prompt 的「移动到其他分组」UI
function MoveToScopeModal({
  meeting, tree, currentScopeId, groupKindLabel, busy,
  onBind, onUnbind, onClose,
}: {
  meeting: Meeting;
  tree: TreeNode[];
  currentScopeId: string | null;
  groupKindLabel: string;
  busy: boolean;
  onBind: (scopeId: string) => void;
  onUnbind: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  // 把 tree 拍平成 [{node, depth}] 便于过滤显示
  type FlatRow = { node: TreeNode; depth: number };
  const flat = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.children) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree]);

  const q = query.trim().toLowerCase();
  const filtered = q.length === 0 ? flat : flat.filter((r) => r.node.name.toLowerCase().includes(q));

  // ESC 关闭
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'var(--sans)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: '0 16px 48px -12px rgba(0,0,0,0.32)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--line-2)' }}>
          <SectionLabel>移动到 {groupKindLabel}</SectionLabel>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600,
            color: 'var(--ink)', marginTop: 6, lineHeight: 1.35,
            overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
          }}>
            {meeting.title}
          </div>
          {currentScopeId && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              background: 'var(--accent-soft)', border: '1px solid oklch(0.85 0.07 40)',
              borderRadius: 5, display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'oklch(0.32 0.1 40)',
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.3 }}>当前</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {findNode(tree, currentScopeId)?.name ?? currentScopeId}
              </span>
              <button
                onClick={onUnbind}
                disabled={busy}
                style={{
                  border: '1px solid oklch(0.85 0.07 40)', background: 'var(--paper)',
                  color: 'oklch(0.4 0.12 40)', padding: '2px 8px', borderRadius: 99,
                  fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1, fontFamily: 'var(--sans)',
                }}
                title="解除当前 scope 绑定（不删除会议）"
              >× 解除绑定</button>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--line-2)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--paper-2)', border: '1px solid var(--line-2)',
            borderRadius: 6, padding: '6px 10px',
          }}>
            <Icon name="search" size={12} style={{ color: 'var(--ink-3)' }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`搜索${groupKindLabel}…`}
              style={{
                flex: 1, border: 0, background: 'transparent',
                fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--sans)', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Scope list */}
        <div style={{ overflowY: 'auto', padding: '8px 12px', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {flat.length === 0 ? '暂无可用分组 · 请先在左栏新建' : '无匹配项'}
            </div>
          )}
          {filtered.map(({ node, depth }) => {
            const isCurrent = node.id === currentScopeId;
            const disabled = busy || isCurrent;
            return (
              <button
                key={node.id}
                onClick={() => !disabled && onBind(node.id)}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', paddingLeft: 10 + depth * 14,
                  border: 0, borderRadius: 5,
                  background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                  color: isCurrent ? 'oklch(0.4 0.1 40)' : 'var(--ink-2)',
                  cursor: disabled ? 'default' : 'pointer',
                  fontSize: 12.5, fontFamily: 'var(--sans)', textAlign: 'left',
                  margin: '1px 0',
                }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--paper-2)'; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
              >
                <Dot color={dotColor[node.color ?? 'ghost']} size={6} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.name}
                </span>
                {isCurrent && (
                  <MonoMeta style={{ fontSize: 9.5, color: 'oklch(0.4 0.1 40)' }}>当前</MonoMeta>
                )}
                {!isCurrent && (
                  <MonoMeta style={{ fontSize: 10 }}>{node.count}</MonoMeta>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px', borderTop: '1px solid var(--line-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--paper-2)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            💡 也可以把卡片拖到左侧分组节点
          </div>
          <button
            onClick={onClose}
            style={{
              border: '1px solid var(--line)', background: 'var(--paper)',
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--sans)',
            }}
          >取消</button>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ m, tree, groupBy, onAction, onClose, busy }: {
  m: Meeting; tree: TreeNode[]; groupBy: GroupKey;
  onAction: (action: PreviewAction, m: Meeting) => void;
  onClose: () => void;
  busy?: PreviewAction | null;
}) {
  const quickActions: Array<{ icon: IconName; label: string; action: PreviewAction }> = [
    { icon: 'book',    label: '打开 Editorial 视图',     action: 'view-a' },
    { icon: 'layers',  label: '打开 Workbench',           action: 'view-b' },
    { icon: 'network', label: '打开 Threads',             action: 'view-c' },
    { icon: 'folder',  label: '移动到其他分组…',         action: 'move'   },
    { icon: 'upload',  label: '导出为 PDF / Markdown',    action: 'export' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>预览</SectionLabel>
          <button
            onClick={onClose}
            title="关闭预览"
            style={{
              border: 0, background: 'transparent', cursor: 'pointer',
              color: 'var(--ink-4)', padding: '2px 4px', display: 'flex',
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.3, marginTop: 8 }}>{m.id}</div>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '6px 0 10px', letterSpacing: '-0.005em', lineHeight: 1.25 }}>
          {m.title}
        </h3>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          {m.date} · {m.duration} · {m.attendees > 0 ? `${m.attendees} 人` : '—'} · preset: {m.preset}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--line-2)' }} />

      <div>
        <SectionLabel>归属分组</SectionLabel>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupRow label="项目" v={findNode(tree, m.groups.project)?.name ?? m.groups.project} />
          <GroupRow label="客户" v={findNode(tree, m.groups.client)?.name  ?? m.groups.client} />
          <GroupRow label="主题" v={findNode(tree, m.groups.topic)?.name   ?? m.groups.topic} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {m.tags.map((t, i) => <Chip key={i} tone="ghost">{t}</Chip>)}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--line-2)' }} />

      <div>
        <SectionLabel>解析摘要</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
          <StatBox label="张力" v={m.tension}   tone="accent" />
          <StatBox label="共识" v={m.consensus} tone="amber" />
          <StatBox label="分歧" v={m.divergence} tone="teal" />
        </div>
      </div>

      <div style={{ padding: '12px 14px', background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <SectionLabel>快速动作</SectionLabel>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {quickActions.map((x, i) => (
            <button key={i} onClick={() => onAction(x.action, m)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
              border: '1px solid var(--line-2)', background: 'var(--paper)', borderRadius: 5,
              cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--sans)', color: 'var(--ink-2)',
            }}>
              <Icon name={x.icon} size={13} />
              {x.label}
              <Icon name="chevron" size={11} style={{ marginLeft: 'auto', color: 'var(--ink-4)' }} />
            </button>
          ))}
        </div>
      </div>

      {/* 归档 / 删除 · 不可逆操作单独分组，提示明显 */}
      <div style={{ padding: '12px 14px', background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6 }}>
        <SectionLabel>会议生命周期</SectionLabel>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {m.archived ? (
            <button
              onClick={() => onAction('unarchive', m)}
              disabled={busy === 'unarchive'}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                border: '1px solid var(--line-2)', background: 'var(--paper)', borderRadius: 5,
                cursor: busy === 'unarchive' ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--sans)', color: 'var(--ink-2)',
                opacity: busy === 'unarchive' ? 0.6 : 1,
              }}
            >
              <Icon name="folder" size={13} />
              {busy === 'unarchive' ? '处理中…' : '取消归档 · 恢复到列表'}
            </button>
          ) : (
            <button
              onClick={() => onAction('archive', m)}
              disabled={busy === 'archive'}
              title="归档后从默认列表移除，可在「显示归档」下找回"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                border: '1px solid var(--line-2)', background: 'var(--paper)', borderRadius: 5,
                cursor: busy === 'archive' ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--sans)', color: 'var(--ink-2)',
                opacity: busy === 'archive' ? 0.6 : 1,
              }}
            >
              <Icon name="folder" size={13} />
              {busy === 'archive' ? '处理中…' : '归档 · 逻辑删除'}
            </button>
          )}
          <button
            onClick={() => onAction('delete', m)}
            disabled={busy === 'delete'}
            title="物理删除会议及其全部解析记录，不可恢复"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
              border: '1px solid oklch(0.85 0.1 25)', background: 'oklch(0.98 0.02 25)',
              borderRadius: 5, color: 'oklch(0.45 0.18 25)', fontSize: 12.5, fontFamily: 'var(--sans)',
              cursor: busy === 'delete' ? 'not-allowed' : 'pointer',
              opacity: busy === 'delete' ? 0.6 : 1,
            }}
          >
            <Icon name="x" size={13} />
            {busy === 'delete' ? '删除中…' : '永久删除 · 不可恢复'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function Library() {
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState<GroupKey>('project');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  // Mobile: left folder tree toggled via button
  const [showMobileTree, setShowMobileTree] = useState(false);

  // API probe：默认 API 优先 · 加载期间不闪 mock · 仅 forceMock 或 API 失败时降级
  const forceMock = useForceMock();
  const [apiMeetings, setApiMeetings] = useState<Meeting[] | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [scopesOk, setScopesOk] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Scopes by kind · API 优先；空/失败 → fallback 到 GROUP_TREES fixture
  // parentScopeId / parent_scope_id 兼容后端 camelCase + snake_case
  type ApiScope = {
    id: string; kind: 'project' | 'client' | 'topic'; slug: string; name: string;
    status?: string;
    parentScopeId?: string | null;
    parent_scope_id?: string | null;
  };
  const [apiScopes, setApiScopes] = useState<Record<GroupKey, ApiScope[]> | null>(null);
  const [scopeReloadTick, setScopeReloadTick] = useState(0);
  useEffect(() => {
    if (forceMock) { setApiMeetings(null); setApiState('ok'); setScopesOk(false); setApiScopes(null); return; }
    let cancelled = false;
    setApiState('loading');
    meetingNotesApi.listMeetings({ limit: 50, status: showArchived ? 'archived' : 'active' })
      .then((r) => {
        if (cancelled) return;
        setApiMeetings((r?.items ?? []).map(adaptApiMeeting));
        setApiState('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setApiState('error');
      });
    Promise.allSettled([
      meetingNotesApi.listScopes({ kind: 'project' }),
      meetingNotesApi.listScopes({ kind: 'client' }),
      meetingNotesApi.listScopes({ kind: 'topic' }),
    ]).then((results) => {
      if (cancelled) return;
      const next: Record<GroupKey, ApiScope[]> = { project: [], client: [], topic: [] };
      const kinds: GroupKey[] = ['project', 'client', 'topic'];
      let anyOk = false;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value?.items)) {
          next[kinds[i]] = (r.value.items as ApiScope[]).filter((x) => x?.id);
          if (next[kinds[i]].length > 0) anyOk = true;
        }
      });
      setScopesOk(anyOk);
      setApiScopes(anyOk ? next : null);
    });
    return () => { cancelled = true; };
  }, [forceMock, showArchived, scopeReloadTick]);
  // 严格 API 模式：forceMock=true → fixture；否则一律走 API（loading/error/empty 都展示空，不再 fallback 到 mock）
  const meetingsDisplay = forceMock
    ? MEETINGS
    : apiState === 'ok'
      ? (apiMeetings ?? [])
      : [];
  const isMock = forceMock;
  const isLoading = !forceMock && apiState === 'loading';
  const isApiError = !forceMock && apiState === 'error';

  // 树结构：API 模式按 parent_scope_id 拼成多级树（支持二级项目），
  // 节点 count 用 apiMeetings.scope_bindings 实时聚合；否则回 GROUP_TREES fixture
  const tree: TreeNode[] = useMemo(() => {
    if (apiScopes && apiScopes[groupBy]?.length) {
      const counts = new Map<string, number>();
      for (const m of (apiMeetings ?? [])) {
        const gid = m.groups[groupBy];
        if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1);
      }
      const colorPool: ColorKey[] = ['accent', 'teal', 'amber', 'ghost'];
      // Pass 1: 建 id → 节点 map（带空 children）
      const idMap = new Map<string, TreeNode & { _parent: string | null }>();
      apiScopes[groupBy].forEach((s, i) => {
        idMap.set(s.id, {
          id: s.id,
          name: s.name,
          color: colorPool[i % colorPool.length],
          count: counts.get(s.id) ?? counts.get(s.slug) ?? 0,
          children: [],
          _parent: s.parentScopeId ?? s.parent_scope_id ?? null,
        });
      });
      // Pass 2: 把每个非根节点挂到父节点 children
      const roots: TreeNode[] = [];
      idMap.forEach((node) => {
        const parentId = node._parent;
        if (parentId && idMap.has(parentId)) {
          idMap.get(parentId)!.children!.push(node);
        } else {
          roots.push(node);
        }
      });
      // Pass 3: 节点按 name 中文排序；空 children 数组转 undefined（FolderNode 据此决定显示 caret）
      const sortDeep = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
        nodes.forEach((n) => {
          if (n.children && n.children.length === 0) (n as any).children = undefined;
          else if (n.children) sortDeep(n.children);
        });
      };
      sortDeep(roots);
      return roots;
    }
    // 严格 API 模式：API 没返回 scope 时给空树，避免误把 fixture 当成真实分组结构
    return forceMock ? GROUP_TREES[groupBy] : [];
  }, [apiScopes, groupBy, apiMeetings, forceMock]);

  const allGroupIds = useMemo(() => {
    const collect = (nodes: TreeNode[]): string[] =>
      nodes.flatMap(n => [n.id, ...(n.children ? collect(n.children) : [])]);
    return collect(tree);
  }, [tree]);

  const matchGroup = (m: Meeting, gid: string | null): boolean => {
    if (!gid) return true;
    const mid = m.groups[groupBy];
    if (mid === gid) return true;
    // 递归：选中父级时, 后代节点（任意深度）下绑定的会议也要显示
    const node = findNode(tree, gid);
    if (!node?.children) return false;
    const collectDescendants = (n: TreeNode): string[] =>
      (n.children ?? []).flatMap((c) => [c.id, ...collectDescendants(c)]);
    return collectDescendants(node).includes(mid);
  };

  // 搜索：本地过滤 (title / kind / scope_bindings) + enter 触发跨会议全文 grep
  const [searchQuery, setSearchQuery] = useState('');
  const [grepResults, setGrepResults] = useState<Array<{
    meetingId: string; meetingTitle: string;
    axis: string; kind?: string; snippet: string; person_name?: string;
  }> | null>(null);
  const [grepLoading, setGrepLoading] = useState(false);
  const normalizedQ = searchQuery.trim().toLowerCase();
  const localFiltered = normalizedQ.length === 0
    ? meetingsDisplay
    : meetingsDisplay.filter((m) => {
        const hay = [
          m.title,
          (m as any).meeting_kind,
          ...(((m as any).scope_bindings ?? []).map((s: any) => s?.name)),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(normalizedQ);
      });
  const visible = localFiltered.filter(m => matchGroup(m, activeGroup));
  const selected = selectedId ? (meetingsDisplay.find(m => m.id === selectedId) ?? null) : null;
  const closePreview = useCallback(() => setSelectedId(null), []);

  // 跨可见会议全文 grep（每个会议串行调；可见 ≤ 12 时 ok，多了截断防雪崩）
  async function runFulltextGrep() {
    const q = searchQuery.trim();
    if (q.length < 1) { setGrepResults(null); return; }
    if (forceMock) { alert('Mock 模式不支持全文搜索'); return; }
    setGrepLoading(true);
    setGrepResults([]);
    const targets = visible.slice(0, 12);  // 可见前 12 条
    const accum: typeof grepResults = [];
    for (const m of targets) {
      try {
        const r = await meetingNotesApi.grepMeeting(m.id, q, 8);
        for (const it of (r.items ?? [])) {
          accum!.push({
            meetingId: m.id,
            meetingTitle: m.title,
            axis: it.axis,
            kind: it.kind,
            snippet: it.snippet,
            person_name: it.person_name,
          });
        }
      } catch { /* skip */ }
    }
    setGrepResults(accum);
    setGrepLoading(false);
  }

  const [busyAction, setBusyAction] = useState<PreviewAction | null>(null);
  // 移动到分组的 modal: 非 null 时显示
  const [moveModalMeeting, setMoveModalMeeting] = useState<Meeting | null>(null);

  // ── Scope CRUD ────────────────────────────────────────────────────────────
  const slugify = (s: string): string => {
    // 中文 → 拼音是个大坑；这里用 base36 timestamp 作为后缀以保证 UNIQUE(kind,slug)
    const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const tail = Date.now().toString(36).slice(-5);
    return ascii ? `${ascii}-${tail}` : `s-${tail}`;
  };
  const reloadScopes = () => setScopeReloadTick((t) => t + 1);
  // 顶层创建：内联表单 toggle（不再用 window.prompt）
  const [addingRoot, setAddingRoot] = useState(false);
  // 子层创建：当前正在某 scope 下显示创建表单的 scope.id
  const [addingChildId, setAddingChildId] = useState<string | null>(null);
  const handleAddScope = async (name: string, parentScopeId: string | null = null) => {
    if (forceMock) { alert('Mock 模式不支持创建分组 · 请先切到 API 模式'); return; }
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await meetingNotesApi.createScope({
        kind: groupBy,
        slug: slugify(trimmed),
        name: trimmed,
        parentScopeId,
      });
      setAddingRoot(false);
      setAddingChildId(null);
      reloadScopes();
    } catch (e: any) { alert(`创建失败：${e?.message ?? e}`); }
  };
  // 拖拽落到 scope 上 → bind meeting；已绑定时静默跳过；非 UUID 给明确提示
  const handleDropMeeting = async (meetingId: string, scopeId: string) => {
    if (forceMock) {
      alert('Mock 模式不支持拖拽绑定 · 切到 API 模式（右下角开关）后重试');
      return;
    }
    if (!UUID_RE.test(scopeId)) {
      alert(
        '这个分组节点是占位示例（数据库里没有真实记录），不能绑定。\n\n' +
        '请先在左侧用「+」按钮新建一个真实分组，再把会议拖过去。',
      );
      return;
    }
    if (!UUID_RE.test(meetingId)) {
      alert('这个会议是 mock 示例，不在数据库里，不支持拖拽绑定');
      return;
    }
    const meet = (apiMeetings ?? []).find((x) => x.id === meetingId);
    if (meet && meet.groups[groupBy] === scopeId) {
      // 已绑定: 视觉上无操作即可
      return;
    }
    try {
      await meetingNotesApi.bindMeeting(scopeId, meetingId, '由 library 拖拽');
      const r = await meetingNotesApi.listMeetings({ limit: 50, status: showArchived ? 'archived' : 'active' });
      setApiMeetings((r?.items ?? []).map(adaptApiMeeting));
    } catch (e: any) {
      alert(`绑定失败：${e?.message ?? e}`);
    }
  };
  const handleRenameScope = async (id: string, newName: string) => {
    const name = newName.trim();
    if (!name) return;
    if (forceMock) { alert('Mock 模式下不支持改名 · 请关闭 Mock 后再操作'); return; }
    if (!UUID_RE.test(id)) {
      alert(
        `该「${groupBy === 'project' ? '项目' : groupBy === 'client' ? '客户' : '主题'}」分组是预置示例，数据库里还没创建对应的真实分组。\n\n` +
        `请用左侧「+ 添加」按钮先创建一个新分组，再对它改名。`,
      );
      return;
    }
    try {
      await meetingNotesApi.updateScope(id, { name });
      reloadScopes();
    } catch (e: any) { alert(`改名失败：${e?.message ?? e}`); }
  };
  const handleDeleteScope = async (node: TreeNode) => {
    if (forceMock) { alert('Mock 模式下不支持删除 · 请关闭 Mock 后再操作'); return; }
    if (!UUID_RE.test(node.id)) {
      alert(
        `该分组是预置示例，数据库里没有对应行，无法删除。\n\n` +
        `预置示例分组只是 demo 占位，刷新页面或切换 group kind 它们会自动隐藏（如果数据库里有真实分组）。`,
      );
      return;
    }
    const confirmed = window.confirm(
      `删除分组「${node.name}」？\n\n该分组下的会议绑定（mn_scope_members）会被解除，但会议本身不会被删除。`,
    );
    if (!confirmed) return;
    try {
      await meetingNotesApi.deleteScope(node.id);
      if (activeGroup === node.id) setActiveGroup(null);
      reloadScopes();
    } catch (e: any) { alert(`删除失败：${e?.message ?? e}`); }
  };

  const handlePreviewAction = async (action: PreviewAction, m: Meeting) => {
    if (action === 'view-a') return navigate(`/meeting/${m.id}/a`);
    if (action === 'view-b') return navigate(`/meeting/${m.id}/b`);
    if (action === 'view-c') return navigate(`/meeting/${m.id}/c`);
    if (action === 'export') return alert('导出 PDF/Markdown · 待接入 getMeetingDetail 下载');

    // 移动到其他分组 / 归档 / 取消归档 / 删除 · 仅对 UUID id（API 模式）有效
    if (forceMock) {
      alert('Mock 模式下不支持此操作 · 请关闭 Mock 后再操作');
      return;
    }
    if (!UUID_RE.test(m.id)) {
      alert('该会议是预置示例（不在数据库），不支持移动 / 归档 / 删除');
      return;
    }
    try {
      if (action === 'move') {
        // 打开 modal — 替代 window.prompt UX；实际 bind/unbind 由 modal 回调里走
        setMoveModalMeeting(m);
        return;
      }
      if (action === 'archive') {
        setBusyAction('archive');
        await meetingNotesApi.archiveMeeting(m.id);
        // 默认列表只显示 active：归档后从当前列表移除
        setApiMeetings((prev) => (prev ?? []).filter((x) => x.id !== m.id));
        if (selectedId === m.id) setSelectedId(null);
      } else if (action === 'unarchive') {
        setBusyAction('unarchive');
        await meetingNotesApi.unarchiveMeeting(m.id);
        setApiMeetings((prev) => (prev ?? []).map((x) => x.id === m.id ? { ...x, archived: false } : x));
      } else if (action === 'delete') {
        const ok = window.confirm(`确认永久删除会议「${m.title}」？\n\n此操作将从数据库删除会议及其全部解析记录（张力 / 共识 / 决策 / 假设 / …），不可恢复。`);
        if (!ok) return;
        setBusyAction('delete');
        await meetingNotesApi.deleteMeeting(m.id);
        setApiMeetings((prev) => (prev ?? []).filter((x) => x.id !== m.id));
        if (selectedId === m.id) setSelectedId(null);
      }
    } catch (e: any) {
      alert(`操作失败：${e?.message ?? e}`);
    } finally {
      setBusyAction(null);
    }
  };

  // MoveToScopeModal 回调：bind / unbind / 关闭 + 重拉 meetings
  const reloadMeetings = async () => {
    const r = await meetingNotesApi.listMeetings({ limit: 50, status: showArchived ? 'archived' : 'active' });
    setApiMeetings((r?.items ?? []).map(adaptApiMeeting));
  };
  const handleModalBind = async (scopeId: string) => {
    const meet = moveModalMeeting;
    if (!meet) return;
    const currentScopeId = meet.groups[groupBy];
    if (scopeId === currentScopeId) { setMoveModalMeeting(null); return; }
    try {
      setBusyAction('move');
      // 先解再绑（后端无原子换绑接口）
      if (currentScopeId && UUID_RE.test(currentScopeId)) {
        try { await meetingNotesApi.unbindScope(currentScopeId, meet.id); } catch { /* 旧绑可能不存在 */ }
      }
      await meetingNotesApi.bindMeeting(scopeId, meet.id, '由 library modal 移动');
      await reloadMeetings();
      setMoveModalMeeting(null);
    } catch (e: any) {
      alert(`绑定失败：${e?.message ?? e}`);
    } finally {
      setBusyAction(null);
    }
  };
  const handleModalUnbind = async () => {
    const meet = moveModalMeeting;
    if (!meet) return;
    const currentScopeId = meet.groups[groupBy];
    if (!currentScopeId || !UUID_RE.test(currentScopeId)) {
      setMoveModalMeeting(null);
      return;
    }
    try {
      setBusyAction('move');
      await meetingNotesApi.unbindScope(currentScopeId, meet.id);
      await reloadMeetings();
      setMoveModalMeeting(null);
    } catch (e: any) {
      alert(`解绑失败：${e?.message ?? e}`);
    } finally {
      setBusyAction(null);
    }
  };

  const groupTabs: Array<{ id: GroupKey; label: string }> = [
    { id: 'project', label: '按项目' },
    { id: 'client',  label: '按客户' },
    { id: 'topic',   label: '按主题' },
  ];

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)',
      display: 'grid', gridTemplateRows: isMobile ? 'auto 1fr' : '56px 1fr', color: 'var(--ink)',
      fontFamily: 'var(--sans)', overflow: 'hidden',
    }}>
      {/* Top bar */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16,
        padding: isMobile ? '0 12px' : '0 24px',
        borderBottom: '1px solid var(--line-2)', background: 'var(--paper)',
        minHeight: 48, overflowX: isMobile ? 'auto' : 'visible',
        flexWrap: isMobile ? 'wrap' : 'nowrap',
        paddingTop: isMobile ? 8 : 0, paddingBottom: isMobile ? 8 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--ink)',
            color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600, fontSize: 14,
          }}>M</div>
          {!isMobile && <span style={{ fontWeight: 600, fontSize: 14 }}>会议纪要库</span>}
          {!isMobile && <MonoMeta>/ library</MonoMeta>}
        </div>

        {!isMobile && <div style={{ height: 24, width: 1, background: 'var(--line)' }} />}
        {!isMobile && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>分组方式</div>}
        <div style={{ display: 'flex', gap: 2, border: '1px solid var(--line)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
          {groupTabs.map(g => (
            <button key={g.id} onClick={() => { setGroupBy(g.id); setActiveGroup(null); }} style={{
              padding: '4px 12px', border: 0, borderRadius: 4, fontSize: 12,
              background: groupBy === g.id ? 'var(--ink)' : 'transparent',
              color: groupBy === g.id ? 'var(--paper)' : 'var(--ink-2)',
              cursor: 'pointer', fontWeight: groupBy === g.id ? 600 : 450, fontFamily: 'var(--sans)',
            }}>{g.label}</button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {isMock && <MockBadge />}
          {!isMobile && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              title={showArchived ? '当前显示归档会议 · 点击切回 active' : '切换到「归档」视图，可在那里取消归档或永久删除'}
              style={{
                padding: '5px 11px', border: '1px solid var(--line)',
                background: showArchived ? 'var(--ink)' : 'var(--paper)',
                color: showArchived ? 'var(--paper)' : 'var(--ink-2)',
                fontSize: 12, borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--sans)',
                fontWeight: showArchived ? 600 : 450,
              }}
            >
              {showArchived ? '归档' : '显示归档'}
            </button>
          )}
          {!isMobile && <Chip tone="ghost">{meetingsDisplay.length} 条会议 · {allGroupIds.length} 个分组</Chip>}
          {!isMobile && (
            <button
              onClick={() => alert('全文搜索 · 待接入（TODO: search API）')}
              style={{
                padding: '6px 14px', border: '1px solid var(--line)', background: 'var(--paper)',
                color: 'var(--ink-2)', fontSize: 12, borderRadius: 5, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)',
              }}>
              <Icon name="search" size={12} /> 搜索
            </button>
          )}
          <button
            onClick={() => navigate('/meeting/new')}
            style={{
              padding: '6px 14px', border: '1px solid var(--ink)', background: 'var(--ink)',
              color: 'var(--paper)', fontSize: 12, borderRadius: 5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', fontWeight: 500,
            }}>
            <Icon name="plus" size={12} /> 新建纪要
          </button>
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : (selected ? '240px 1fr 380px' : '240px 1fr'),
        overflow: 'hidden',
        transition: 'grid-template-columns 0.2s ease',
      }}>
        {/* Left: folder tree — hidden on mobile (toggled via sheet) */}
        {!isMobile && <aside style={{
          borderRight: '1px solid var(--line-2)', background: 'var(--paper-2)',
          padding: '18px 14px', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
            <SectionLabel>{groupBy === 'project' ? '项目' : groupBy === 'client' ? '客户' : '主题'}</SectionLabel>
            <button
              onClick={() => {
                if (forceMock) { alert('Mock 模式不支持创建分组 · 请先切到 API 模式'); return; }
                setAddingRoot((v) => !v);
              }}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', padding: 2, borderRadius: 3, display: 'flex' }}
              title={forceMock ? 'Mock 模式不支持 · 切到 API 模式' : '新建顶层分组'}
            >
              <Icon name="plus" size={13} />
            </button>
          </div>

          {/* 顶层创建 inline 表单 */}
          {addingRoot && (
            <InlineCreateScope
              paddingLeft={8}
              onSubmit={(name) => handleAddScope(name, null)}
              onCancel={() => setAddingRoot(false)}
            />
          )}

          <button
            onClick={() => setActiveGroup(null)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; }}
            style={folderRowStyle(activeGroup === null)}
          >
            <Icon name="layers" size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>全部</span>
            <MonoMeta style={{ fontSize: 10 }}>{meetingsDisplay.length}</MonoMeta>
          </button>

          <div style={{ height: 8 }} />

          {tree.map(node => (
            <FolderNode key={node.id} node={node} active={activeGroup}
              onSelect={setActiveGroup} onRename={setRenaming} renaming={renaming}
              onCommitRename={handleRenameScope} onDelete={handleDeleteScope}
              onDropMeeting={!forceMock ? handleDropMeeting : undefined}
              onAddChild={(pid) => {
                if (forceMock) {
                  alert('Mock 模式不支持创建子分组 · 请先切到 API 模式');
                  return;
                }
                setAddingChildId(pid);
              }}
              addingChildId={addingChildId}
              onCommitAddChild={(pid, n) => handleAddScope(n, pid)}
              onCancelAddChild={() => setAddingChildId(null)}
            />
          ))}

          <div style={{ height: 18 }} />
          <div style={{
            padding: '10px 10px', border: '1px dashed var(--line)', borderRadius: 5,
            color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon name="folder" size={12} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>TIP</span>
            </div>
            把会议卡片拖到分组节点 → 自动绑定。Hover 节点 → ＋ 建子分组。
          </div>
        </aside>}

        {/* Middle: meeting cards */}
        <main style={{ overflow: 'auto', padding: isMobile ? '12px 16px' : '20px 28px' }}>
          {/* Mobile: group filter shortcuts */}
          {isMobile && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
              <button
                onClick={() => setActiveGroup(null)}
                style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 99, border: '1px solid var(--line-2)',
                  background: activeGroup === null ? 'var(--ink)' : 'var(--paper)',
                  color: activeGroup === null ? 'var(--paper)' : 'var(--ink-2)',
                  fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)', fontWeight: activeGroup === null ? 600 : 450,
                }}
              >全部</button>
              {tree.slice(0, 5).map((node) => (
                <button
                  key={node.id}
                  onClick={() => setActiveGroup(node.id)}
                  style={{
                    flexShrink: 0, padding: '5px 12px', borderRadius: 99, border: '1px solid var(--line-2)',
                    background: activeGroup === node.id ? 'var(--ink)' : 'var(--paper)',
                    color: activeGroup === node.id ? 'var(--paper)' : 'var(--ink-2)',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)', fontWeight: activeGroup === node.id ? 600 : 450,
                  }}
                >
                  {node.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: isMobile ? 18 : 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
              {activeGroup ? (findNode(tree, activeGroup)?.name ?? '—') : '全部会议'}
            </h2>
            <MonoMeta>{visible.length} 条</MonoMeta>
          </div>
          {!isMobile && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>
              按生成时间倒序 · 点击卡片预览 · 拖拽到左侧分组移动
            </div>
          )}
          {/* 搜索：即时过滤 title/kind，按 Enter 或点全文搜按钮跨可见会议 grep */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
            padding: '8px 10px', background: 'var(--paper-2)',
            border: '1px solid var(--line-2)', borderRadius: 6,
          }}>
            <Icon name="search" size={14} style={{ color: 'var(--ink-3)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runFulltextGrep();
                } else if (e.key === 'Escape') {
                  setSearchQuery('');
                  setGrepResults(null);
                }
              }}
              placeholder={isMobile ? '搜索会议标题 / 分组…' : '搜会议标题 / 类型 / 分组 — 回车跨会议全文搜索（如「上海」、「贝壳」、「装修分期」…）'}
              style={{
                flex: 1, padding: '4px 6px', border: 0, background: 'transparent',
                fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--sans)', outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setGrepResults(null); }}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 11 }}
              >清空</button>
            )}
            <button
              onClick={runFulltextGrep}
              disabled={!searchQuery.trim() || grepLoading || forceMock}
              title={forceMock ? 'Mock 模式不支持全文搜索' : `跨当前可见会议（最多 12 条）做全文 grep`}
              style={{
                padding: '4px 10px', border: '1px solid var(--accent)',
                background: grepLoading ? 'var(--paper)' : 'var(--accent)',
                color: grepLoading ? 'var(--ink-3)' : 'var(--paper)',
                borderRadius: 4, fontSize: 11.5,
                cursor: !searchQuery.trim() || grepLoading || forceMock ? 'not-allowed' : 'pointer',
                opacity: !searchQuery.trim() || forceMock ? 0.5 : 1,
              }}
            >{grepLoading ? '搜索中…' : '全文搜索'}</button>
          </div>

          {/* 全文 grep 结果面板（按会议分组） */}
          {grepResults !== null && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--paper)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SectionLabel>全文搜索 · "{searchQuery}"</SectionLabel>
                <MonoMeta>{grepResults.length} 条命中</MonoMeta>
                <button
                  onClick={() => setGrepResults(null)}
                  style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--ink-4)' }}
                >× 关闭</button>
              </div>
              {grepResults.length === 0 && !grepLoading && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '6px 0' }}>
                  在当前可见会议（{Math.min(visible.length, 12)} 条）的 axes 数据 + 转写文本里没找到 "{searchQuery}"
                </div>
              )}
              {grepResults.length > 0 && (() => {
                const byMeeting: Record<string, { title: string; rows: typeof grepResults }> = {};
                for (const r of grepResults) {
                  if (!byMeeting[r.meetingId]) byMeeting[r.meetingId] = { title: r.meetingTitle, rows: [] as any };
                  byMeeting[r.meetingId].rows!.push(r);
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(byMeeting).map(([mid, bucket]) => (
                      <div key={mid}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <button
                            onClick={() => navigate(`/meeting/${mid}/a`)}
                            style={{
                              border: 0, background: 'transparent', cursor: 'pointer',
                              fontFamily: 'var(--serif)', fontSize: 13, fontWeight: 600, color: 'var(--accent)', padding: 0,
                            }}
                          >{bucket.title.slice(0, 60)}</button>
                          <MonoMeta>{bucket.rows!.length} 条</MonoMeta>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
                          {bucket.rows!.slice(0, 6).map((r, i) => (
                            <div key={i} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                              <span style={{
                                display: 'inline-block', minWidth: 90,
                                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
                              }}>[{r.axis}/{r.kind}]</span>
                              {r.person_name && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginRight: 6 }}>
                                  {r.person_name}:
                                </span>
                              )}
                              {r.snippet}
                            </div>
                          ))}
                          {bucket.rows!.length > 6 && (
                            <MonoMeta>+ {bucket.rows!.length - 6} 条更多…</MonoMeta>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Sub-folders if current group has children */}
          {activeGroup && (() => {
            const node = findNode(tree, activeGroup);
            if (!node?.children) return null;
            return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {node.children.map(c => (
                  <button key={c.id} onClick={() => setActiveGroup(c.id)} style={{
                    padding: '6px 12px', border: '1px solid var(--line-2)', background: 'var(--paper)',
                    borderRadius: 5, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--sans)', color: 'var(--ink-2)',
                  }}>
                    <Icon name="folder" size={11} />
                    {c.name}
                    <MonoMeta style={{ fontSize: 10 }}>{c.count}</MonoMeta>
                  </button>
                ))}
              </div>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            {visible.map(m => (
              <MeetingCard key={m.id} m={m}
                active={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
                onOpen={() => navigate(`/meeting/${m.id}/a`)}
                groupName={findNode(tree, m.groups[groupBy])?.name ?? ''}
                draggable={!forceMock && UUID_RE.test(m.id)}
              />
            ))}
            {visible.length === 0 && (
              <div style={{
                gridColumn: '1 / -1', padding: '40px 20px',
                textAlign: 'center', color: 'var(--ink-3)', fontSize: 13,
                background: 'var(--paper-2)', borderRadius: 6, border: '1px dashed var(--line)',
              }}>
                {isLoading
                  ? '加载中…'
                  : isApiError
                    ? 'API 请求失败 · 请检查后端服务（已禁用 mock 兜底）'
                    : '这个分组里还没有会议纪要'}
              </div>
            )}
          </div>
        </main>

        {/* Right: preview panel — desktop only; mobile uses bottom sheet below */}
        {!isMobile && selected && (
          <aside style={{ borderLeft: '1px solid var(--line-2)', background: 'var(--paper)', overflow: 'auto', padding: '22px 22px' }}>
            <PreviewPanel m={selected} tree={tree} groupBy={groupBy} onAction={handlePreviewAction} onClose={closePreview} busy={busyAction} />
          </aside>
        )}
      </div>

      {/* Mobile: preview bottom sheet */}
      {isMobile && selected && (
        <>
          <div
            onClick={closePreview}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
            background: 'var(--paper)',
            borderRadius: '14px 14px 0 0',
            borderTop: '1px solid var(--line-2)',
            height: '76vh',
            overflow: 'auto',
            padding: '0 20px 32px',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.22)',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--line)' }} />
            </div>
            <PreviewPanel m={selected} tree={tree} groupBy={groupBy} onAction={handlePreviewAction} onClose={closePreview} busy={busyAction} />
          </div>
        </>
      )}

      {/* Move-to-scope modal — 替代 window.prompt */}
      {moveModalMeeting && (
        <MoveToScopeModal
          meeting={moveModalMeeting}
          tree={tree}
          currentScopeId={moveModalMeeting.groups[groupBy] && UUID_RE.test(moveModalMeeting.groups[groupBy])
            ? moveModalMeeting.groups[groupBy]
            : null}
          groupKindLabel={groupBy === 'project' ? '项目' : groupBy === 'client' ? '客户' : '主题'}
          busy={busyAction === 'move'}
          onBind={handleModalBind}
          onUnbind={handleModalUnbind}
          onClose={() => setMoveModalMeeting(null)}
        />
      )}
    </div>
  );
}

export default Library;
