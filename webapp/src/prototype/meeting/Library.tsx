// Library.tsx — 会议纪要库
// 原型来源：/tmp/mn-proto/library.jsx Library / FolderNode / MeetingCard / PreviewPanel
// 三栏：左侧文件夹树 · 中间会议卡片 · 右侧详情预览

import { useState, useMemo, useEffect, CSSProperties } from 'react';
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

function FolderNode({ node, active, onSelect, onRename, renaming, depth = 0, onCommitRename, onDelete }: {
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
}) {
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState(false);
  const isActive = active === node.id;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button onClick={() => onSelect(node.id)} style={{
        ...folderRowStyle(isActive), paddingLeft: 8 + depth * 14,
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
        {hover && (onCommitRename || onDelete) && renaming !== node.id ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
      </button>
      {node.children && open && (
        <div>
          {node.children.map(c => (
            <FolderNode key={c.id} node={c} active={active} onSelect={onSelect}
              onRename={onRename} renaming={renaming} depth={depth + 1}
              onCommitRename={onCommitRename} onDelete={onDelete} />
          ))}
        </div>
      )}
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

function MeetingCard({ m, active, onClick, onOpen, groupName }: {
  m: Meeting; active: boolean; onClick: () => void; onOpen: () => void; groupName: string;
}) {
  return (
    <button onClick={onClick} onDoubleClick={onOpen} title="单击预览 · 双击打开 Editorial 视图" style={{
      textAlign: 'left', background: 'var(--paper)',
      border: active ? '1px solid var(--accent)' : '1px solid var(--line-2)',
      borderRadius: 8, padding: '14px 16px', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
      fontFamily: 'var(--sans)', color: 'var(--ink)',
    }}>
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
    </button>
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

function PreviewPanel({ m, tree, groupBy, onAction, busy }: {
  m: Meeting; tree: TreeNode[]; groupBy: GroupKey;
  onAction: (action: PreviewAction, m: Meeting) => void;
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
        <SectionLabel>预览</SectionLabel>
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
  const [selectedId, setSelectedId] = useState('M-2026-04-11-0237');
  const [renaming, setRenaming] = useState<string | null>(null);

  // API probe：默认 API 优先 · 加载期间不闪 mock · 仅 forceMock 或 API 失败时降级
  const forceMock = useForceMock();
  const [apiMeetings, setApiMeetings] = useState<Meeting[] | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [scopesOk, setScopesOk] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Scopes by kind · API 优先；空/失败 → fallback 到 GROUP_TREES fixture
  type ApiScope = { id: string; kind: 'project' | 'client' | 'topic'; slug: string; name: string; status?: string };
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
  // forceMock → fixture；API ok → API 结果；loading → 空列表（避免闪 mock）；error → fixture
  const meetingsDisplay = forceMock || apiState === 'error'
    ? MEETINGS
    : apiState === 'loading'
      ? []
      : (apiMeetings ?? []);
  const isMock = forceMock || apiState === 'error';
  const isLoading = !forceMock && apiState === 'loading';

  // 树结构：API 模式由 mn_scopes 拼，节点 count 用 apiMeetings.scope_bindings 实时聚合；
  // 否则回 GROUP_TREES fixture（mock / error / 接口空都走这）
  const tree: TreeNode[] = useMemo(() => {
    if (apiScopes && apiScopes[groupBy]?.length) {
      const counts = new Map<string, number>();
      for (const m of (apiMeetings ?? [])) {
        const gid = m.groups[groupBy];
        if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1);
      }
      const colorPool: ColorKey[] = ['accent', 'teal', 'amber', 'ghost'];
      return apiScopes[groupBy].map((s, i) => ({
        id: s.id,
        name: s.name,
        color: colorPool[i % colorPool.length],
        count: counts.get(s.id) ?? counts.get(s.slug) ?? 0,
      }));
    }
    return GROUP_TREES[groupBy];
  }, [apiScopes, groupBy, apiMeetings]);

  const allGroupIds = useMemo(() => {
    const collect = (nodes: TreeNode[]): string[] =>
      nodes.flatMap(n => [n.id, ...(n.children ? collect(n.children) : [])]);
    return collect(tree);
  }, [tree]);

  const matchGroup = (m: Meeting, gid: string | null): boolean => {
    if (!gid) return true;
    const mid = m.groups[groupBy];
    if (mid === gid) return true;
    const node = findNode(tree, gid);
    if (node?.children) return node.children.some(c => c.id === mid);
    return false;
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
  const selected = meetingsDisplay.find(m => m.id === selectedId) ?? visible[0];

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

  // ── Scope CRUD ────────────────────────────────────────────────────────────
  const slugify = (s: string): string => {
    // 中文 → 拼音是个大坑；这里用 base36 timestamp 作为后缀以保证 UNIQUE(kind,slug)
    const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const tail = Date.now().toString(36).slice(-5);
    return ascii ? `${ascii}-${tail}` : `s-${tail}`;
  };
  const reloadScopes = () => setScopeReloadTick((t) => t + 1);
  const handleAddScope = async () => {
    if (forceMock) { alert('Mock 模式不支持创建分组 · 请先切到 API 模式'); return; }
    const name = window.prompt(`新建${groupBy === 'project' ? '项目' : groupBy === 'client' ? '客户' : '主题'}`)?.trim();
    if (!name) return;
    try {
      await meetingNotesApi.createScope({ kind: groupBy, slug: slugify(name), name });
      reloadScopes();
    } catch (e: any) { alert(`创建失败：${e?.message ?? e}`); }
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
        if (!apiScopes) {
          alert('未拉到 mn_scopes 列表 · 重启 api 后重试');
          return;
        }
        const list = apiScopes[groupBy] ?? [];
        if (list.length === 0) {
          alert(`当前 ${groupBy} 维度没有可选分组 · 先在左栏 + 新建一个`);
          return;
        }
        const currentScopeId = m.groups[groupBy];
        const optionsText = list
          .map((s, i) => `${i + 1}. ${s.name}${s.id === currentScopeId ? '  (当前)' : ''}`)
          .join('\n');
        const ans = window.prompt(
          `移动会议「${m.title}」到 ${groupBy} 分组：\n\n${optionsText}\n\n输入序号 1-${list.length}，输入 0 取消所有 ${groupBy} 绑定。`,
        );
        if (ans === null) return;
        const trimmed = ans.trim();
        if (trimmed === '0') {
          if (currentScopeId && UUID_RE.test(currentScopeId)) {
            setBusyAction('move');
            await meetingNotesApi.unbindScope(currentScopeId, m.id);
          }
        } else {
          const idx = parseInt(trimmed, 10) - 1;
          if (Number.isNaN(idx) || idx < 0 || idx >= list.length) {
            alert('序号无效');
            return;
          }
          const target = list[idx];
          if (target.id === currentScopeId) return;
          setBusyAction('move');
          if (currentScopeId && UUID_RE.test(currentScopeId)) {
            // 后端目前没有「换绑」语义 · 先解再绑
            try { await meetingNotesApi.unbindScope(currentScopeId, m.id); } catch { /* 旧绑定不存在也继续 */ }
          }
          await meetingNotesApi.bindMeeting(target.id, m.id, '由 library 手动移动');
        }
        // 重新拉 meetings 拿最新 scope_bindings
        const r = await meetingNotesApi.listMeetings({ limit: 50, status: showArchived ? 'archived' : 'active' });
        setApiMeetings((r?.items ?? []).map(adaptApiMeeting));
        return;
      }
      if (action === 'archive') {
        setBusyAction('archive');
        await meetingNotesApi.archiveMeeting(m.id);
        // 默认列表只显示 active：归档后从当前列表移除
        setApiMeetings((prev) => (prev ?? []).filter((x) => x.id !== m.id));
        if (selectedId === m.id) setSelectedId('');
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
        if (selectedId === m.id) setSelectedId('');
      }
    } catch (e: any) {
      alert(`操作失败：${e?.message ?? e}`);
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
      display: 'grid', gridTemplateRows: '56px 1fr', color: 'var(--ink)',
      fontFamily: 'var(--sans)', overflow: 'hidden',
    }}>
      {/* Top bar */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px',
        borderBottom: '1px solid var(--line-2)', background: 'var(--paper)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--ink)',
            color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600, fontSize: 14,
          }}>M</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>会议纪要库</span>
          <MonoMeta>/ library</MonoMeta>
        </div>

        <div style={{ height: 24, width: 1, background: 'var(--line)' }} />
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>分组方式</div>
        <div style={{ display: 'flex', gap: 2, border: '1px solid var(--line)', borderRadius: 6, padding: 2 }}>
          {groupTabs.map(g => (
            <button key={g.id} onClick={() => { setGroupBy(g.id); setActiveGroup(null); }} style={{
              padding: '4px 12px', border: 0, borderRadius: 4, fontSize: 12,
              background: groupBy === g.id ? 'var(--ink)' : 'transparent',
              color: groupBy === g.id ? 'var(--paper)' : 'var(--ink-2)',
              cursor: 'pointer', fontWeight: groupBy === g.id ? 600 : 450, fontFamily: 'var(--sans)',
            }}>{g.label}</button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {isMock && <MockBadge />}
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
          <Chip tone="ghost">{meetingsDisplay.length} 条会议 · {allGroupIds.length} 个分组</Chip>
          <button
            onClick={() => alert('全文搜索 · 待接入（TODO: search API）')}
            style={{
              padding: '6px 14px', border: '1px solid var(--line)', background: 'var(--paper)',
              color: 'var(--ink-2)', fontSize: 12, borderRadius: 5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)',
            }}>
            <Icon name="search" size={12} /> 搜索
          </button>
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

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 380px', overflow: 'hidden' }}>
        {/* Left: folder tree */}
        <aside style={{
          borderRight: '1px solid var(--line-2)', background: 'var(--paper-2)',
          padding: '18px 14px', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
            <SectionLabel>{groupBy === 'project' ? '项目' : groupBy === 'client' ? '客户' : '主题'}</SectionLabel>
            <button onClick={handleAddScope}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', padding: 2, borderRadius: 3, display: 'flex' }}
              title={forceMock ? 'Mock 模式不支持 · 切到 API 模式' : '新建分组'}
            >
              <Icon name="plus" size={13} />
            </button>
          </div>

          <button onClick={() => setActiveGroup(null)} style={folderRowStyle(activeGroup === null)}>
            <Icon name="layers" size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>全部</span>
            <MonoMeta style={{ fontSize: 10 }}>{meetingsDisplay.length}</MonoMeta>
          </button>

          <div style={{ height: 8 }} />

          {tree.map(node => (
            <FolderNode key={node.id} node={node} active={activeGroup}
              onSelect={setActiveGroup} onRename={setRenaming} renaming={renaming}
              onCommitRename={handleRenameScope} onDelete={handleDeleteScope} />
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
            拖拽会议到分组，或右键批量移动。分组可叠加标签与权限。
          </div>
        </aside>

        {/* Middle: meeting cards */}
        <main style={{ overflow: 'auto', padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
              {activeGroup ? (findNode(tree, activeGroup)?.name ?? '—') : '全部会议'}
            </h2>
            <MonoMeta>{visible.length} 条</MonoMeta>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>
            按生成时间倒序 · 点击卡片预览 · 拖拽到左侧分组移动
          </div>
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
              placeholder={'搜会议标题 / 类型 / 分组 — 回车跨会议全文搜索（如「张总」、「刘总」、「装修分期」…）'}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {visible.map(m => (
              <MeetingCard key={m.id} m={m}
                active={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
                onOpen={() => navigate(`/meeting/${m.id}/a`)}
                groupName={findNode(tree, m.groups[groupBy])?.name ?? ''}
              />
            ))}
            {visible.length === 0 && (
              <div style={{
                gridColumn: '1 / -1', padding: '40px 20px',
                textAlign: 'center', color: 'var(--ink-3)', fontSize: 13,
                background: 'var(--paper-2)', borderRadius: 6, border: '1px dashed var(--line)',
              }}>
                {isLoading ? '加载中…' : '这个分组里还没有会议纪要'}
              </div>
            )}
          </div>
        </main>

        {/* Right: preview panel */}
        <aside style={{ borderLeft: '1px solid var(--line-2)', background: 'var(--paper)', overflow: 'auto', padding: '22px 22px' }}>
          {selected && <PreviewPanel m={selected} tree={tree} groupBy={groupBy} onAction={handlePreviewAction} busy={busyAction} />}
        </aside>
      </div>
    </div>
  );
}

export default Library;
