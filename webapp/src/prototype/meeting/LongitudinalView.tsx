// LongitudinalView — 纵向视图 · 跨会议
// 原型来源：/tmp/mn-proto/longitudinal.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Chip, MonoMeta, MockBadge } from './_atoms';
import { DimShell, CalloutCard, RegenerateOverlay } from './_axisShared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';
import { P } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useMeetingScope } from './_scopeContext';
import { useForceMock } from './_mockToggle';

// ── Mock data ────────────────────────────────────────────────────────────────

const BELIEF_DRIFT = {
  who: 'p1',
  topic: '单笔投资上限',
  points: [
    { meeting: 'M-2025-11', date: '2025-11-12', value: '$40M', confidence: 0.65, note: '保守期' },
    { meeting: 'M-2026-01', date: '2026-01-09', value: '$50M', confidence: 0.7,  note: 'Q4 退出回款' },
    { meeting: 'M-2026-02', date: '2026-02-22', value: '$65M', confidence: 0.72, note: 'LP 加仓意向' },
    { meeting: 'M-2026-03', date: '2026-03-28', value: '$80M', confidence: 0.6,  note: '看到头部 deal 规模' },
    { meeting: 'M-2026-04', date: '2026-04-11', value: '$60M', confidence: 0.78, note: '妥协至决议值' },
  ],
};

const DECISION_TREE_DATA = {
  root: { id: 'R', label: 'AI 基础设施方向', meeting: 'M-2025-11', date: '2025-11' },
  nodes: [
    { id: 'N1', parent: 'R',  branch: '训练层 vs 推理层', decided: '两端布局',        meeting: 'M-2025-12', date: '2025-12', current: false, pending: false },
    { id: 'N2', parent: 'N1', branch: '团队 ramp-up',    decided: '招 2 位 PM',       meeting: 'M-2026-01', date: '2026-01', current: false, pending: false },
    { id: 'N3', parent: 'N1', branch: '渠道选择',        decided: 'subadvisor 结构',  meeting: 'M-2026-03', date: '2026-03', current: false, pending: false },
    { id: 'N4', parent: 'N1', branch: '权重再平衡',      decided: '精选推理层 · 上限 6000 万', meeting: 'M-2026-04', date: '2026-04', current: true, pending: false },
    { id: 'N5', parent: 'N4', branch: 'LP 沟通',        decided: '待定',             meeting: 'next',      date: '',       current: false, pending: true },
  ],
};

const MODEL_HITRATE = [
  { id: 'MM-01', name: '二阶效应',      invoked: 47, hits: 39, hitrate: 0.83, byTopExpert: 'E09-09', warn: false },
  { id: 'MM-02', name: '基础利率',      invoked: 33, hits: 30, hitrate: 0.91, byTopExpert: 'E07-18', warn: false },
  { id: 'MM-04', name: '瓶颈分析',      invoked: 28, hits: 22, hitrate: 0.79, byTopExpert: 'E04-12', warn: false },
  { id: 'MM-03', name: '反身性',        invoked: 24, hits: 14, hitrate: 0.58, byTopExpert: 'E11-03', warn: true  },
  { id: 'MM-06', name: "Wright's Law",  invoked: 12, hits: 10, hitrate: 0.83, byTopExpert: 'E04-12', warn: false },
  { id: 'MM-07', name: '叙事周期',      invoked: 18, hits: 11, hitrate: 0.61, byTopExpert: 'E11-03', warn: false },
];

// ── Sub-components ───────────────────────────────────────────────────────────

interface DriftPoint { meeting: string; date: string; value: string; confidence: number; note: string; }
interface DriftData { who: string; topic: string; points: DriftPoint[]; band?: { min: number; max: number }; confidenceTrace?: number[]; }

// 返回 null 表示"形态不合 · 不能用"（保留 mock）
// 返回对象（即使 points 为空）表示"形态合法 · API 可用"（切换到 API 数据 · 即使空）
function adaptBeliefDrift(r: unknown): DriftData | null {
  if (!r || typeof r !== 'object') return null;
  const obj = r as Record<string, unknown>;
  const points = obj.points as unknown[] | undefined;
  if (!Array.isArray(points)) return null;
  const who = String(obj.who ?? obj.personId ?? 'p1');
  const topic = String(obj.topic ?? '—');
  const mapped: DriftPoint[] = points.map((x: any) => ({
    meeting: String(x.meeting ?? x.meetingId ?? ''),
    date: String(x.date ?? ''),
    value: String(x.value ?? ''),
    confidence: Number(x.confidence ?? 0.5),
    note: String(x.note ?? ''),
  }));
  const band = obj.band as { min?: number; max?: number } | undefined;
  const confidenceTrace = obj.confidence_trace as number[] | undefined;
  return { who, topic, points: mapped, band: band ? { min: Number(band.min ?? 30), max: Number(band.max ?? 90) } : undefined, confidenceTrace };
}

function BeliefDrift({ scopeId }: { scopeId: string }) {
  const navigate = useNavigate();
  const forceMock = useForceMock();
  const [d, setD] = useState<DriftData>(BELIEF_DRIFT);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setD(BELIEF_DRIFT); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getLongitudinal(scopeId, 'belief_drift')
      .then((r) => {
        if (cancelled) return;
        const adapted = adaptBeliefDrift(r);
        if (adapted) setD(adapted);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  const p = P(d.who);
  const W = 820, H = 260, PAD = 60;
  const vals = d.points.map(pt => parseFloat(pt.value.replace(/[^0-9.]/g, '')));
  const vMin = d.band?.min ?? 30, vMax = d.band?.max ?? 90;
  const xFor = (i: number) => PAD + (i / Math.max(1, d.points.length - 1)) * (W - PAD * 2);
  const yFor = (v: number) => H - PAD - ((v - vMin) / (vMax - vMin)) * (H - PAD * 1.5);

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Avatar p={p} size={30} />
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
          {p.name} · 信念漂移
        </h3>
        <Chip tone="ghost">议题: {d.topic}</Chip>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18, maxWidth: 700 }}>
        5 场会议跨 5 个月 · 观察<b>真实的心理价格区间</b>，而非某一次的表态。
      </div>

      <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '18px' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {[30, 50, 70, 90].map(v => (
            <g key={v}>
              <line x1={PAD} x2={W - PAD / 2} y1={yFor(v)} y2={yFor(v)} stroke="var(--line-2)" strokeDasharray="2 4" />
              <text x={PAD - 6} y={yFor(v) + 3} fontSize="9.5" fontFamily="var(--mono)" fill="var(--ink-4)" textAnchor="end">${v}M</text>
            </g>
          ))}
          <path
            d={[
              'M', xFor(0), yFor(vals[0]) - d.points[0].confidence * 20,
              ...d.points.slice(1).map((pt, i) => `L ${xFor(i + 1)} ${yFor(vals[i + 1]) - pt.confidence * 20}`),
              ...d.points.slice().reverse().map((pt, j) => {
                const i = d.points.length - 1 - j;
                return `L ${xFor(i)} ${yFor(vals[i]) + pt.confidence * 20}`;
              }),
              'Z',
            ].join(' ')}
            fill="oklch(0.75 0.1 40 / 0.15)" stroke="none"
          />
          <path
            d={d.points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(vals[i])}`).join(' ')}
            fill="none" stroke="var(--accent)" strokeWidth="2"
          />
          {d.points.map((pt, i) => (
            <g key={i} onClick={() => navigate(`/meeting/${pt.meeting}/a`)} style={{ cursor: 'pointer' }}>
              <circle cx={xFor(i)} cy={yFor(vals[i])} r={i === d.points.length - 1 ? 7 : 5}
                fill={i === d.points.length - 1 ? 'var(--accent)' : 'var(--paper)'}
                stroke="var(--accent)" strokeWidth={2}>
                <title>点击查看 {pt.meeting}</title>
              </circle>
              <text x={xFor(i)} y={yFor(vals[i]) - 16} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="600" fill="var(--ink)">
                {pt.value}
              </text>
              <text x={xFor(i)} y={H - 24} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-3)">
                {pt.date.slice(5)}
              </text>
              <text x={xFor(i)} y={H - 10} textAnchor="middle" fontFamily="var(--sans)" fontSize="10" fill="var(--ink-4)">
                {pt.note}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CalloutCard title="观察 · 锚定的真实价格">
          陈汀在讨论中反复漂向 $70-80M，最终落在 $60M。
          真实心理均衡值约 <b>$65M</b>，这与 LP 的隐含偏好非常接近。下次决议前参考这个值。
        </CalloutCard>
        <CalloutCard title="置信度轨迹" tone="accent">
          在 M-2026-03 置信度骤降（0.6）—— 正是从 $65M 跳到 $80M 的那次。
          <i>置信度下降 + 判断变激进</i> 通常是警示信号。
        </CalloutCard>
      </div>
    </div>
  );
}

interface TreeNode { id: string; parent?: string; branch?: string; label?: string; decided?: string; meeting?: string; date?: string; current?: boolean; pending?: boolean; }
interface TreeData { root: TreeNode; nodes: TreeNode[]; }

// 返回 null：形态不识别 → 保留 mock
// 返回对象（含空 nodes）：形态合法 → 切换到 API · 渲染空树
function adaptDecisionTree(r: unknown): TreeData | null {
  if (!r || typeof r !== 'object') return null;
  const obj = r as Record<string, unknown>;
  // New shape: { nodes: [...], edges: [...], current?, pending?: [...] }
  if (Array.isArray(obj.nodes)) {
    const nodes = obj.nodes as TreeNode[];
    if (nodes.length === 0) {
      // API 返回空树 · 给一个占位 root 让渲染不崩
      return { root: { id: '__empty__', label: '暂无决策链路' }, nodes: [] };
    }
    const pending = (obj.pending as string[] | undefined) ?? [];
    const currentId = obj.current as string | undefined;
    const root = nodes.find(n => !n.parent) ?? nodes[0];
    const rest = nodes.filter(n => n.id !== root.id).map(n => ({
      ...n,
      current: n.current ?? n.id === currentId,
      pending: n.pending ?? pending.includes(n.id),
    }));
    return { root, nodes: rest };
  }
  // Legacy shape: { root, nodes }
  if (obj.root && Array.isArray(obj.nodes)) {
    return { root: obj.root as TreeNode, nodes: obj.nodes as TreeNode[] };
  }
  return null;
}

function DecisionTree({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [tree, setTree] = useState<TreeData>(DECISION_TREE_DATA);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setTree(DECISION_TREE_DATA); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getLongitudinal(scopeId, 'decision_tree')
      .then((r) => {
        if (cancelled) return;
        const adapted = adaptDecisionTree(r);
        if (adapted) setTree(adapted);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  const allNodes = [tree.root, ...tree.nodes];
  const W = 860, H = 360;
  const pos: Record<string, { x: number; y: number }> = {
    'R':  { x: 80,  y: H / 2 },
    'N1': { x: 240, y: H / 2 },
    'N2': { x: 420, y: H / 2 - 110 },
    'N3': { x: 420, y: H / 2 },
    'N4': { x: 420, y: H / 2 + 110 },
    'N5': { x: 620, y: H / 2 + 110 },
  };
  // 对新 shape 里未在 pos 中的节点，粗略平铺
  allNodes.forEach((n, i) => {
    if (!pos[n.id]) pos[n.id] = { x: 80 + (i % 5) * 180, y: 60 + Math.floor(i / 5) * 100 };
  });

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          项目决策树 · AI 基础设施方向
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18, maxWidth: 700 }}>
        每个节点是一次会议上的分岔决定。红点 = 当前待决节点。整棵树可时间回溯。
      </div>
      <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '18px' }}>
        <svg width={W} height={H}>
          {tree.nodes.map(n => {
            if (!n.parent) return null;
            const p1 = pos[n.parent], p2 = pos[n.id];
            if (!p1 || !p2) return null;
            return (
              <path key={n.id}
                d={`M ${p1.x + 40} ${p1.y} C ${(p1.x + p2.x) / 2} ${p1.y}, ${(p1.x + p2.x) / 2} ${p2.y}, ${p2.x - 40} ${p2.y}`}
                fill="none" stroke={n.pending ? 'var(--accent)' : 'var(--ink-3)'}
                strokeWidth="1.4" strokeDasharray={n.pending ? '4 3' : ''} opacity="0.55"
              />
            );
          })}
          {allNodes.map(n => {
            const p = pos[n.id];
            const { current, pending } = (n as { current?: boolean; pending?: boolean });
            return (
              <g key={n.id}>
                <rect x={p.x - 80} y={p.y - 26} width={160} height={52} rx={5}
                  fill={current ? 'var(--accent-soft)' : 'var(--paper)'}
                  stroke={current ? 'oklch(0.6 0.13 40)' : pending ? 'var(--accent)' : 'var(--line-2)'}
                  strokeDasharray={pending ? '4 3' : ''}
                  strokeWidth={current ? 1.5 : 1} />
                <text x={p.x} y={p.y - 9} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-4)">
                  {(n as { date?: string }).date || ''} · {n.meeting || ''}
                </text>
                <text x={p.x} y={p.y + 5} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="600" fill="var(--ink)">
                  {(n as { branch?: string }).branch || (n as { label?: string }).label || ''}
                </text>
                <text x={p.x} y={p.y + 18} textAnchor="middle" fontFamily="var(--sans)" fontSize="10" fill="var(--ink-2)">
                  {(n as { decided?: string }).decided ? `→ ${(n as { decided?: string }).decided}` : ''}
                </text>
                {current && <circle cx={p.x + 70} cy={p.y - 18} r={5} fill="var(--accent)" stroke="var(--paper)" strokeWidth={2} />}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-3)' }}>
        <b style={{ color: 'var(--ink)' }}>当前节点</b>: M-2026-04 · 「精选推理层 · 上限 6000 万」 · 下一分支待 M-2026-05 LP 沟通会决定
      </div>
    </div>
  );
}

type MMRow = typeof MODEL_HITRATE[number];

function ModelHitrate({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<MMRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(MODEL_HITRATE); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getScopeMentalModelHitRate(scopeId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const mapped: MMRow[] = items.map((m) => ({
          id: 'MM-' + m.id.slice(0, 6).toUpperCase(),
          name: m.model_name,
          invoked: Number(m.invocations ?? 0),
          hits: Number(m.hits ?? 0),
          hitrate: Number(m.hit_rate ?? 0),
          byTopExpert: '—',
          warn: m.flag === 'downweight',
        }));
        setRows(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          心智模型命中率 · 反向校准专家库
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 720 }}>
        6 个月内所有会议的模型激活 × 后验命中。这张表用于<b>反向修正专家池</b> —— 命中率长期低于 65% 的模型，
        会被系统降低匹配权重。
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '180px 80px 1fr 100px 120px',
        padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: '1px solid var(--line-2)',
      }}>
        <span>模型</span><span>激活</span><span>命中率</span><span>命中</span><span>主要专家</span>
      </div>
      {rows.map((m, i) => (
        <div key={m.id} style={{
          display: 'grid', gridTemplateColumns: '180px 80px 1fr 100px 120px',
          alignItems: 'center', gap: 10, padding: '14px 14px',
          borderBottom: '1px solid var(--line-2)',
          background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
        }}>
          <div>
            <MonoMeta style={{ fontSize: 9.5 }}>{m.id}</MonoMeta>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{m.name}</div>
            {m.warn && <Chip tone="accent" style={{ marginTop: 6 }}>建议降权</Chip>}
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>{m.invoked}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 5, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${m.hitrate * 100}%`, height: '100%',
                background: m.hitrate > 0.8 ? 'oklch(0.6 0.1 140)' : m.hitrate > 0.65 ? 'var(--amber)' : 'var(--accent)',
              }} />
            </div>
            <MonoMeta style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
              {(m.hitrate * 100).toFixed(0)}%
            </MonoMeta>
          </div>
          <MonoMeta>{m.hits} / {m.invoked}</MonoMeta>
          <MonoMeta style={{ fontSize: 11 }}>{m.byTopExpert}</MonoMeta>
        </div>
      ))}
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CalloutCard title="建议 · 反身性模型降权" tone="accent">
          反身性（MM-03）命中率仅 0.58，持续 3 个月低于阈值。
          系统建议在匹配 E11-03 (叙事追踪者) 时，自动降低反身性权重至 0.7。
        </CalloutCard>
        <CalloutCard title="最强信号 · 基础利率">
          MM-02 命中率 0.91，6 个月稳定。E07-18 (基础利率检察官) 应被优先匹配到所有
          含「这次不一样」表述的会议。
        </CalloutCard>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function LongitudinalView() {
  const [tab, setTab] = useState('drift');
  const [regenOpen, setRegenOpen] = useState(false);
  const scope = useMeetingScope();
  const scopeId = scope.kindId === 'all' ? 'p-ai-q2' : scope.instanceId;
  const forceMock = useForceMock();
  const [headerMock, setHeaderMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setHeaderMock(true); return; }
    let cancelled = false;
    const kind = tab === 'drift' ? 'belief_drift' : tab === 'tree' ? 'decision_tree' : 'model_hit_rate';
    meetingNotesApi.getLongitudinal(scopeId, kind)
      .then((r) => { if (!cancelled && r && Object.keys(r).length > 0) setHeaderMock(false); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, tab, forceMock]);
  const tabs = [
    { id: 'drift',   label: '信念漂移',       sub: '同一人在同一议题上随时间的判断变化', icon: 'arrow' as const },
    { id: 'tree',    label: '决策树',         sub: '项目的所有分岔点与未来待决',          icon: 'git' as const },
    { id: 'hitrate', label: '心智模型命中率', sub: '反向校准专家库',                       icon: 'target' as const },
  ];
  return (
    <>
      <DimShell axis="纵向视图 · 跨会议" tabs={tabs} tab={tab} setTab={setTab} onOpenRegenerate={() => setRegenOpen(true)} mock={headerMock}>
        {tab === 'drift'   && <BeliefDrift scopeId={scopeId} />}
        {tab === 'tree'    && <DecisionTree scopeId={scopeId} />}
        {tab === 'hitrate' && <ModelHitrate scopeId={scopeId} />}
      </DimShell>
      <RegenerateOverlay open={regenOpen} onClose={() => setRegenOpen(false)}>
        <AxisRegeneratePanel initialAxis="knowledge" onClose={() => setRegenOpen(false)} />
      </RegenerateOverlay>
    </>
  );
}

export default LongitudinalView;
