// AxisProjects.tsx — 项目轴的四个细分维度
// 原型来源：/tmp/mn-proto/dimensions-projects.jsx DimensionProjects
// 决策溯源链 · 假设清单 · 未解问题 · 风险热度

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Chip, MonoMeta, Icon, MockBadge } from './_atoms';
import { DimShell, CalloutCard, RegenerateOverlay } from './_axisShared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';
import { P, MEETING, pickPerson } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import { useMeetingScope } from './_scopeContext';

// ── Mock data ───────────────────────────────────────────────────────────────

const PROJECT = {
  id: 'PRJ-INFRA-Q2',
  name: 'AI 基础设施 · Q2 加配',
  status: 'active',
  meetings: 11,
  decisions: 14,
  openItems: 8,
};

const DECISION_CHAIN = [
  { id: 'D-01', at: 'M-2025-11-08', title: '基础设施方向从观察 → 加配', who: 'p1',
    basedOn: '2025 Q3 退出案例 + 产业调研 #142', confidence: 0.62, superseded: false },
  { id: 'D-02', at: 'M-2025-12-20', title: '赛道收敛到「训练 + 中游推理」两端',
    who: 'p3', basedOn: 'Omar 提供的北美 subadvisor 数据', confidence: 0.58, superseded: true, supersededBy: 'D-06' },
  { id: 'D-03', at: 'M-2026-01-30', title: '单笔上限提升到 5,000 万',
    who: 'p1', basedOn: 'LP 委员会口径更新', confidence: 0.70, superseded: true, supersededBy: 'D-07' },
  { id: 'D-04', at: 'M-2026-02-08', title: 'H-chip 配额作为关键外生变量纳入估值',
    who: 'p2', basedOn: '供应链分析报告 #2026-02', confidence: 0.75, superseded: false },
  { id: 'D-05', at: 'M-2026-03-14', title: '北美渠道采用 subadvisor 结构',
    who: 'p6', basedOn: '过去 6 个月 18 次 warm intro 数据', confidence: 0.80, superseded: false },
  { id: 'D-06', at: 'M-2026-03-22', title: '赛道收敛到「精选 · 推理层为主」',
    who: 'p2', basedOn: '推理层 7 家客户报价曲线 + 毛利结构', confidence: 0.74, superseded: false },
  { id: 'D-07', at: 'M-2026-04-11', title: '单笔上限定为 6,000 万（非 8,000 万）',
    who: 'p1', basedOn: 'LP 反馈 + 集中度自查', confidence: 0.78, superseded: false, current: true },
];

const ASSUMPTIONS = [
  { id: 'AS-01', text: '推理层毛利在 2027 之前保持 > 45%',
    underpins: ['D-06', 'D-07'], introducedAt: 'M-2026-02-08', by: 'p2',
    evidenceGrade: 'B', verificationState: '测试中', verifier: 'p4', verifyDue: '2026-04-25', confidence: 0.62 },
  { id: 'AS-02', text: 'H-chip 配额不会在 Q3 再次收紧',
    underpins: ['D-04', 'D-06'], introducedAt: 'M-2026-02-08', by: 'p2',
    evidenceGrade: 'C', verificationState: '未验证', verifier: '—', verifyDue: '—', confidence: 0.48 },
  { id: 'AS-03', text: 'Subadvisor 结构每月可稳定产生 3-5 个 warm intro',
    underpins: ['D-05'], introducedAt: 'M-2026-03-14', by: 'p6',
    evidenceGrade: 'A', verificationState: '已验证', verifier: 'p6', verifyDue: '2026-03-28', confidence: 0.85 },
  { id: 'AS-04', text: 'LP 对 6,000 万单笔上限不会显著反弹',
    underpins: ['D-07'], introducedAt: 'M-2026-04-11', by: 'p1',
    evidenceGrade: 'D', verificationState: '未验证 · 高风险', verifier: 'p1', verifyDue: '2026-04-18', confidence: 0.55 },
  { id: 'AS-05', text: '推理层头部 3 家在 2026 内不会合并',
    underpins: ['D-06'], introducedAt: 'M-2026-03-22', by: 'p3',
    evidenceGrade: 'C', verificationState: '观察中', verifier: 'p3', verifyDue: '持续', confidence: 0.50 },
  { id: 'AS-06', text: '同类样本历史毛利中位数可作为基准',
    underpins: ['D-06', 'D-07'], introducedAt: 'M-2026-04-11', by: 'p4',
    evidenceGrade: 'B', verificationState: '已验证', verifier: 'p4', verifyDue: '2026-04-18', confidence: 0.72 },
];

const OPEN_QUESTIONS = [
  { id: 'Q-01', text: '若训练层突然出现一个碾压性玩家，我们的敞口需要如何调整？',
    raisedAt: 'M-2026-01-30', by: 'p3', timesRaised: 4, lastRaised: 'M-2026-04-11',
    category: 'strategic', status: 'open', owner: '—', note: '每次被提起都被推迟；没有明确负责人。' },
  { id: 'Q-02', text: '推理层定价能力的 3 年压力测试模型还没建',
    raisedAt: 'M-2026-02-08', by: 'p2', timesRaised: 3, lastRaised: 'M-2026-04-11',
    category: 'analytical', status: 'assigned', owner: 'p4', due: '2026-05-01' },
  { id: 'Q-03', text: '集中度警戒线的具体阈值（vs LP 表达的口径）',
    raisedAt: 'M-2026-03-22', by: 'p5', timesRaised: 2, lastRaised: 'M-2026-04-11',
    category: 'governance', status: 'open', owner: '—', note: 'LP 代表反复提醒，团队反复回避。' },
  { id: 'Q-04', text: 'Subadvisor 条款里的 sourcing fee 如何分成？',
    raisedAt: 'M-2026-03-14', by: 'p3', timesRaised: 2, lastRaised: 'M-2026-03-22',
    category: 'operational', status: 'resolved', resolvedAt: 'M-2026-03-22' },
  { id: 'Q-05', text: '退出路径的 Plan B：如果 IPO 通道关闭怎么办？',
    raisedAt: 'M-2025-12-20', by: 'p1', timesRaised: 5, lastRaised: 'M-2026-04-11',
    category: 'strategic', status: 'chronic', owner: '—', note: '慢性问题 · 每次被提起、每次被轻描淡写地放下。' },
  { id: 'Q-06', text: '团队 ramp-up 的具体时间表',
    raisedAt: 'M-2026-02-22', by: 'p2', timesRaised: 3, lastRaised: 'M-2026-04-11',
    category: 'operational', status: 'assigned', owner: 'p2', due: '2026-04-30' },
];

const RISKS = [
  { id: 'R-01', text: 'LP 集中度不满', mentions: 14, hasAction: false, severity: 'high', heat: 0.92, meetings: 7, trend: 'up' },
  { id: 'R-02', text: 'H-chip 进口配额再次收紧', mentions: 11, hasAction: true,
    action: 'A-0107-A1 (陈汀 · 2026-02-25 · 已完成)', severity: 'high', heat: 0.55, meetings: 5, trend: 'flat' },
  { id: 'R-03', text: '推理层毛利被规模效应压低', mentions: 9, hasAction: false, severity: 'med', heat: 0.80, meetings: 6, trend: 'up' },
  { id: 'R-04', text: '北美 subadvisor 关系破裂', mentions: 6, hasAction: false, severity: 'med', heat: 0.68, meetings: 3, trend: 'up' },
  { id: 'R-05', text: '头部 2 家被竞争对手抢走', mentions: 5, hasAction: true,
    action: 'A-0188-A1 (沈岚 · 2026-04-05 · 已完成)', severity: 'med', heat: 0.30, meetings: 4, trend: 'down' },
  { id: 'R-06', text: '地缘摩擦影响北美 deal flow', mentions: 4, hasAction: false, severity: 'low', heat: 0.50, meetings: 3, trend: 'flat' },
  { id: 'R-07', text: '估值模型假设被市场证伪', mentions: 7, hasAction: false, severity: 'high', heat: 0.85, meetings: 5, trend: 'up' },
];

// ── Style lookups ───────────────────────────────────────────────────────────

const EVIDENCE_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  'A': { bg: 'oklch(0.93 0.06 140)', fg: 'oklch(0.35 0.12 140)', label: '硬数据' },
  'B': { bg: 'var(--teal-soft)',     fg: 'oklch(0.3 0.08 200)',   label: '类比 / 案例' },
  'C': { bg: 'var(--amber-soft)',    fg: 'oklch(0.38 0.09 75)',   label: '直觉 / 口述' },
  'D': { bg: 'var(--accent-soft)',   fg: 'oklch(0.32 0.1 40)',    label: '道听途说' },
};

const VERIFY_TONE: Record<string, { bg: string; fg: string }> = {
  '已验证':           { bg: 'oklch(0.93 0.06 140)', fg: 'oklch(0.35 0.12 140)' },
  '测试中':           { bg: 'var(--teal-soft)',     fg: 'oklch(0.3 0.08 200)' },
  '观察中':           { bg: 'var(--paper-3)',       fg: 'var(--ink-3)' },
  '未验证':           { bg: 'var(--amber-soft)',    fg: 'oklch(0.38 0.09 75)' },
  '未验证 · 高风险':  { bg: 'var(--accent-soft)',   fg: 'oklch(0.32 0.1 40)' },
};

const QCATEGORY: Record<string, { label: string; tone: 'accent' | 'teal' | 'amber' | 'ghost' }> = {
  strategic:   { label: '战略', tone: 'accent' },
  analytical:  { label: '分析', tone: 'teal' },
  governance:  { label: '治理', tone: 'amber' },
  operational: { label: '运营', tone: 'ghost' },
};

const QSTATUS: Record<string, { label: string; fg: string }> = {
  open:     { label: '开放',   fg: 'var(--ink-2)' },
  assigned: { label: '已分派', fg: 'oklch(0.3 0.08 200)' },
  chronic:  { label: '慢性',   fg: 'oklch(0.32 0.1 40)' },
  resolved: { label: '已解决', fg: 'oklch(0.35 0.12 140)' },
};

const SEV: Record<string, { fg: string; label: string }> = {
  high: { fg: 'oklch(0.5 0.15 30)', label: '高' },
  med:  { fg: 'oklch(0.55 0.1 75)', label: '中' },
  low:  { fg: 'var(--ink-3)',        label: '低' },
};

const TREND: Record<string, { symbol: string; color: string }> = {
  up:   { symbol: '↗', color: 'oklch(0.5 0.15 30)' },
  flat: { symbol: '→', color: 'var(--ink-3)' },
  down: { symbol: '↘', color: 'oklch(0.35 0.12 140)' },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function ProjectBanner() {
  return (
    <div style={{
      padding: '18px 32px 12px', borderBottom: '1px solid var(--line-2)', background: 'var(--paper-2)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <MonoMeta>{PROJECT.id}</MonoMeta>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, letterSpacing: '-0.005em' }}>{PROJECT.name}</div>
      <Chip tone="teal">active</Chip>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, fontSize: 11.5, color: 'var(--ink-3)' }}>
        <span>{PROJECT.meetings} 场会议</span>
        <span>·</span>
        <span>{PROJECT.decisions} 个决议</span>
        <span>·</span>
        <span>{PROJECT.openItems} 个未解项</span>
      </div>
    </div>
  );
}

type DecisionRow = typeof DECISION_CHAIN[number];

function ProvenanceChain({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(DECISION_CHAIN); setIsMock(true); return; }
    setIsMock(false);
    let cancelled = false;
    meetingNotesApi.listScopeDecisions(scopeId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const mapped: DecisionRow[] = items.map((d) => ({
          id: d.id.slice(0, 6),
          at: d.meeting_id ? d.meeting_id.slice(0, 12) : '',
          title: d.title,
          who: pickPerson(d.proposer_person_id, d.proposer_name),
          basedOn: d.rationale ?? (d.based_on_ids?.length ? `${d.based_on_ids.length} 个前置决策` : '无显式前置'),
          confidence: Number(d.confidence ?? 0.5),
          superseded: Boolean(d.superseded_by_id),
          supersededBy: d.superseded_by_id?.slice(0, 6),
          current: Boolean(d.is_current),
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
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          决策溯源链 · Decision provenance
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 680 }}>
        今天的每一个决议，都可以回溯到一条由若干次会议、若干份证据、若干个人共同编织的链条。
        当结论崩坏时，这张图告诉你 <i>要推翻哪一环</i>。
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 26, top: 14, bottom: 14, width: 2, background: 'var(--line)' }} />
        {rows.map((d) => {
          const p = P(d.who);
          const currentColor = d.current ? 'var(--accent)' : d.superseded ? 'var(--ink-4)' : 'var(--ink)';
          return (
            <div key={d.id} style={{
              display: 'grid', gridTemplateColumns: '54px 1fr 260px', gap: 14, alignItems: 'start',
              padding: '14px 0', position: 'relative',
              opacity: d.superseded ? 0.55 : 1,
            }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
                <div style={{
                  width: d.current ? 16 : 12, height: d.current ? 16 : 12, borderRadius: 99,
                  background: currentColor, border: d.current ? '3px solid var(--accent-soft)' : '2px solid var(--paper)',
                  zIndex: 2,
                }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <MonoMeta>{d.id}</MonoMeta>
                  <MonoMeta style={{ color: 'var(--ink)' }}>{d.at}</MonoMeta>
                  {d.current && <Chip tone="accent">current</Chip>}
                  {d.superseded && <Chip tone="ghost">superseded by {(d as { supersededBy?: string }).supersededBy}</Chip>}
                </div>
                <div style={{
                  fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, marginTop: 4,
                  letterSpacing: '-0.005em', textDecoration: d.superseded ? 'line-through' : 'none',
                }}>
                  {d.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <Avatar p={p} size={20} radius={4} />
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.name} · 提出</span>
                </div>
              </div>
              <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 5, padding: '8px 12px' }}>
                <MonoMeta style={{ fontSize: 9.5 }}>BASED ON</MonoMeta>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5, fontFamily: 'var(--serif)' }}>
                  {d.basedOn}
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MonoMeta style={{ fontSize: 9.5 }}>CONFIDENCE</MonoMeta>
                  <div style={{ flex: 1, height: 3, background: 'var(--line-2)', borderRadius: 2 }}>
                    <div style={{
                      width: `${d.confidence * 100}%`, height: '100%',
                      background: d.confidence > 0.7 ? 'var(--accent)' : 'var(--ink-3)', borderRadius: 2,
                    }} />
                  </div>
                  <MonoMeta style={{ fontSize: 10.5 }}>{d.confidence.toFixed(2)}</MonoMeta>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CalloutCard title={'当前决议 D-07 的"脆弱点"'} tone="accent">
          这条链上有 <b>3 处关键支点</b>：AS-01 (推理层毛利) · AS-04 (LP 容忍度) · D-04 (H-chip 配额)。
          其中 <b>AS-04 置信度仅 0.55 且未验证</b> —— 推翻它会使整条链崩溃。
        </CalloutCard>
        <CalloutCard title="批判提醒">
          溯源链会给人一种<i>"决策是理性累积的"</i>幻觉。事实上 D-02 曾被完全推翻。
          下次重要决议前，回看这张图 2 分钟，比开半小时会更有价值。
        </CalloutCard>
      </div>

      {/* R4 · 改动二：决策溯源 tab 内追加决策树视图（mn_decision_tree_snapshots） */}
      <DecisionTreeSection scopeId={scopeId} />
    </div>
  );
}

function DecisionTreeSection({ scopeId }: { scopeId: string }) {
  const [data, setData] = useState<{ rootId?: string; nodes?: any; computedAt?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    meetingNotesApi.getLongitudinal(scopeId, 'decision_tree')
      .then((r: any) => { if (!cancelled) { setData(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scopeId]);
  return (
    <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--line-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
        <SectionLabel>决策树</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          mn_decision_tree_snapshots · 项目所有分岔点 + 未来待决
        </span>
      </div>
      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>加载中…</div>
      ) : !data || !data.nodes ? (
        <div style={{ background: 'var(--paper-2)', border: '1px dashed var(--line-2)', borderRadius: 6, padding: '16px 20px', fontSize: 12, color: 'var(--ink-3)' }}>
          本 scope 暂无决策树快照 · 跑生成中心 → longitudinal/decision_tree 触发
        </div>
      ) : (
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 18px', overflow: 'auto' }}>
          <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>
            {JSON.stringify(data.nodes, null, 2).slice(0, 1500)}
          </pre>
        </div>
      )}
    </div>
  );
}

type AssumptionRow = typeof ASSUMPTIONS[number];

function AssumptionLedger({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<AssumptionRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(ASSUMPTIONS); setIsMock(true); return; }
    setIsMock(false);
    let cancelled = false;
    meetingNotesApi.listScopeAssumptions(scopeId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const stateLabel: Record<string, string> = {
          'unverified': '未验证',
          'verifying': '验证中',
          'confirmed': '已验证',
          'falsified': '已证伪',
        };
        const mapped: AssumptionRow[] = items.map((a) => {
          // 后端 mn_assumptions 不存独立的 introducer 字段；borrow verifier 作 fallback
          const verifierKey = pickPerson(a.verifier_person_id, a.verifier_name);
          return {
            id: a.id.slice(0, 8).toUpperCase(),
            text: a.text,
            underpins: a.underpins_decision_ids?.map((u) => u.slice(0, 6)) ?? [],
            introducedAt: a.meeting_id?.slice(0, 12) ?? '',
            by: verifierKey,
            evidenceGrade: a.evidence_grade,
            verificationState: stateLabel[a.verification_state] ?? a.verification_state,
            verifier: verifierKey,
            verifyDue: a.due_at ? a.due_at.slice(0, 10) : '—',
            confidence: Number(a.confidence ?? 0.5),
          };
        });
        setRows(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          假设清单 · Assumptions ledger
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20, maxWidth: 700 }}>
        把决议背后的 <b>未经验证的信念</b> 明摆出来，并给每一条安排一个 verifier 和 deadline。
        这就是<i>"把会议室里的自信变成可验证的 bet"</i>。
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '80px minmax(280px,1fr) 110px 140px 140px 80px',
        padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: '1px solid var(--line-2)',
      }}>
        <span>ID</span><span>假设</span><span>证据级</span><span>验证状态</span>
        <span>验证人 / 截止</span><span style={{ textAlign: 'right' }}>置信</span>
      </div>
      {rows.map((a, i) => {
        const e = EVIDENCE_TONE[a.evidenceGrade];
        const v = VERIFY_TONE[a.verificationState] ?? { bg: 'var(--paper-3)', fg: 'var(--ink-3)' };
        const verifier = a.verifier === '—' ? null : P(a.verifier);
        return (
          <div key={a.id} style={{
            display: 'grid', gridTemplateColumns: '80px minmax(280px,1fr) 110px 140px 140px 80px',
            alignItems: 'center', gap: 10, padding: '14px 14px',
            borderBottom: '1px solid var(--line-2)', background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
          }}>
            <MonoMeta>{a.id}</MonoMeta>
            <div>
              <div style={{ fontSize: 13.5, fontFamily: 'var(--serif)', lineHeight: 1.5 }}>{a.text}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span>支撑:</span>
                {a.underpins.map(u => <span key={u} style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{u}</span>)}
                <span style={{ marginLeft: 8, color: 'var(--ink-4)' }}>· 首次引入 {a.introducedAt}</span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600, background: e.bg, color: e.fg }}>
                {a.evidenceGrade} · {e.label}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 500, background: v.bg, color: v.fg }}>
                {a.verificationState}
              </span>
            </div>
            <div style={{ fontSize: 11.5 }}>
              {verifier ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar p={verifier} size={18} radius={4} />
                  <span>{verifier.name}</span>
                </div>
              ) : <span style={{ color: 'var(--ink-4)' }}>未分派</span>}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>{a.verifyDue}</div>
            </div>
            <div style={{
              textAlign: 'right', fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600,
              color: a.confidence < 0.6 ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.01em',
            }}>{a.confidence.toFixed(2)}</div>
          </div>
        );
      })}

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <CalloutCard title="高危假设 · 未验证" tone="accent">
          <b>AS-04</b> (LP 反弹) 和 <b>AS-02</b> (配额) 两条同时未验证，且共同支撑 D-06/D-07。
          建议立刻为 AS-04 排期 LP 预沟通。
        </CalloutCard>
        <CalloutCard title="证据分布">
          A 级 1 · B 级 2 · C 级 2 · D 级 1。
          <b>D 级假设不该出现在 current 决议的支撑链里</b> —— 它是噪音级别的。
        </CalloutCard>
        <CalloutCard title="机制价值">
          这张表让团队习惯把<i>"我觉得"</i>翻译成可证伪的陈述。
          3 个月后回头看，被证伪的假设是最有价值的学习材料。
        </CalloutCard>
      </div>
    </div>
  );
}

type OpenQuestionRow = typeof OPEN_QUESTIONS[number];

function OpenQuestions({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<OpenQuestionRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(OPEN_QUESTIONS); setIsMock(true); return; }
    setIsMock(false);
    let cancelled = false;
    meetingNotesApi.listScopeOpenQuestions(scopeId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const mapped: OpenQuestionRow[] = items.map((q) => {
          // 后端 mn_open_questions 不存独立的 raiser 字段；borrow owner 作 fallback
          const ownerKey = pickPerson(q.owner_person_id, q.owner_name);
          return {
            id: q.id.slice(0, 8).toUpperCase(),
            text: q.text,
            raisedAt: q.first_raised_meeting_id?.slice(0, 12) ?? '',
            by: ownerKey,
            timesRaised: Number(q.times_raised ?? 1),
            lastRaised: q.last_raised_meeting_id?.slice(0, 12) ?? '',
            category: q.category,
            status: q.status,
            owner: ownerKey,
            note: '',
          };
        });
        setRows(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  const sorted = [...rows].sort((a, b) => b.timesRaised - a.timesRaised);
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          未解问题 · Open questions
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        被提起、被讨论、但没有结论的问题。系统持续追踪：每次被提起都算一次 tick；
        提起 3 次以上仍未分派负责人的，自动升级为<b>慢性问题</b>。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(q => {
          const cat = QCATEGORY[q.category] ?? { label: q.category, tone: 'ghost' as const };
          const st = QSTATUS[q.status] ?? { label: q.status, fg: 'var(--ink-3)' };
          const raiser = P(q.by);
          const owner = q.owner && q.owner !== '—' ? P(q.owner) : null;
          const chronic = q.status === 'chronic';
          return (
            <div key={q.id} style={{
              background: chronic ? 'var(--accent-soft)' : 'var(--paper-2)',
              border: chronic ? '1px solid oklch(0.85 0.07 40)' : '1px solid var(--line-2)',
              borderRadius: 6, padding: '14px 18px',
              display: 'grid', gridTemplateColumns: '1fr 180px 140px 80px', gap: 14, alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <MonoMeta>{q.id}</MonoMeta>
                  <Chip tone={cat.tone}>{cat.label}</Chip>
                  {chronic && <Chip tone="accent">慢性 · {q.timesRaised}× 提起</Chip>}
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{q.text}</div>
                {q.note && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6, fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
                    {q.note}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar p={raiser} size={16} radius={3} />
                  <span>{raiser.name} 首次提出</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, marginTop: 4 }}>{q.raisedAt}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>最近 {q.lastRaised}</div>
              </div>
              <div>
                {owner ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <Avatar p={owner} size={20} radius={4} />
                    <div>
                      <div>{owner.name}</div>
                      <MonoMeta style={{ fontSize: 10 }}>{(q as { due?: string }).due}</MonoMeta>
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>未分派负责人</span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>RAISED</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600, color: st.fg, letterSpacing: '-0.01em' }}>
                  {q.timesRaised}<span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>×</span>
                </div>
                <div style={{ fontSize: 10.5, color: st.fg }}>{st.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RiskRow = typeof RISKS[number];

function RiskHeat({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(RISKS); setIsMock(true); return; }
    setIsMock(false);
    let cancelled = false;
    meetingNotesApi.listScopeRisks(scopeId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const mapped: RiskRow[] = items.map((x) => ({
          id: x.id.slice(0, 6).toUpperCase(),
          text: x.text,
          mentions: Number(x.mention_count ?? 1),
          hasAction: Boolean(x.action_taken),
          action: x.action_taken ? '已分派 · 见 action items' : '',
          severity: x.severity === 'critical' ? 'high' : x.severity,
          heat: Math.min(1, Number(x.heat_score ?? 0) / 100),
          meetings: Math.max(1, Math.round(Number(x.mention_count ?? 1) / 2)),
          trend: (x.trend as 'up' | 'flat' | 'down') ?? 'flat',
        }));
        setRows(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  const sorted = [...rows].sort((a, b) => b.heat - a.heat);
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          风险热度 · Risk heat
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        <b>热度 = 被反复提及 × 严重程度 × 是否分派</b>。
        最危险的不是"严重的风险"，是"严重的风险但没人管"。系统把这两条信号合在一起，给你一个 triage 队列。
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 80px 80px 100px 180px 100px',
        padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: '1px solid var(--line-2)',
      }}>
        <span>风险</span><span>严重</span><span>趋势</span><span>提及 × 会议</span>
        <span>处理状态</span><span style={{ textAlign: 'right' }}>热度</span>
      </div>
      {sorted.map((r, i) => {
        const sev = SEV[r.severity];
        const tr = TREND[r.trend];
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 80px 80px 100px 180px 100px',
            alignItems: 'center', gap: 10, padding: '14px 14px', borderBottom: '1px solid var(--line-2)',
            background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MonoMeta>{r.id}</MonoMeta>
              <div style={{ fontSize: 13.5, fontFamily: 'var(--serif)', fontWeight: 500 }}>{r.text}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: sev.fg }}>{sev.label}</span>
            <span style={{ fontSize: 18, color: tr.color, fontWeight: 600 }}>{tr.symbol}</span>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
              {r.mentions}× / {r.meetings} 场
            </div>
            <div>
              {r.hasAction ? (
                <div style={{ fontSize: 11, color: 'oklch(0.35 0.12 140)' }}>
                  <Icon name="check" size={11} style={{ display: 'inline', marginRight: 4 }} />
                  已分派
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)', marginTop: 2 }}>
                    {(r as { action?: string }).action}
                  </div>
                </div>
              ) : (
                <Chip tone="accent">未分派 · 孤儿</Chip>
              )}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <div style={{ width: 52, height: 6, background: 'var(--line-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${r.heat * 100}%`, height: '100%',
                  background: r.heat > 0.7 ? 'oklch(0.55 0.15 30)' : r.heat > 0.5 ? 'var(--amber)' : 'var(--ink-3)',
                }} />
              </div>
              <MonoMeta style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>
                {r.heat.toFixed(2)}
              </MonoMeta>
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CalloutCard title="3 个孤儿风险 · 需要 Triage" tone="accent">
          <b>R-01 · R-03 · R-07</b> 都是高 / 中严重度 + 趋势上行 + 无人处理。
          建议下次会议前 15 分钟做一次 triage，否则它们会出现在<i>未来事故复盘</i>的第一行。
        </CalloutCard>
        <CalloutCard title="批判：热度是滞后指标">
          到它变热的时候，往往已经晚了。配合<i>假设清单</i>一起读 ——
          每个孤儿风险背后都有一条快要崩掉的假设。
        </CalloutCard>
      </div>

      {/* R4 · 改动二：风险 tab 内追加 收益 × 风险 散点图 */}
      <RiskRewardScatter rows={rows} />
    </div>
  );
}

function RiskRewardScatter({ rows }: { rows: Array<{ id: string; text: string; severity: string; heat: number; trend: string }> }) {
  const W = 720, H = 280, padL = 40, padB = 32, padT = 14, padR = 14;
  const sevToRisk = (s: string) => s === 'high' ? 0.8 : s === 'med' ? 0.5 : s === 'low' ? 0.25 : 0.5;
  const points = rows.slice(0, 12).map((r) => ({
    id: r.id,
    text: r.text || '',
    risk: sevToRisk(r.severity) * 0.5 + Math.min(1, Math.max(0, r.heat ?? 0)) * 0.5,
    // 收益维度：trend 'up' 当作正向期望（待人工标注前的占位）
    reward: r.trend === 'up' ? 0.7 : r.trend === 'down' ? 0.25 : 0.5,
  }));
  const xFor = (v: number) => padL + v * (W - padL - padR);
  const yFor = (v: number) => H - padB - v * (H - padB - padT);
  return (
    <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--line-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
        <SectionLabel>风险 × 收益散点</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          v1 lite · 收益维度暂从 trend 派生 (up=0.7 / down=0.25 / flat=0.5)
        </span>
      </div>
      {points.length === 0 ? (
        <div style={{ background: 'var(--paper-2)', border: '1px dashed var(--line-2)', borderRadius: 6, padding: '16px 20px', fontSize: 12, color: 'var(--ink-3)' }}>
          暂无风险数据
        </div>
      ) : (
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '12px 14px' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }}>
            {/* 网格 */}
            {[0.25, 0.5, 0.75].map((g) => (
              <g key={g}>
                <line x1={xFor(g)} y1={padT} x2={xFor(g)} y2={H - padB} stroke="var(--line-2)" strokeDasharray="2 4" />
                <line x1={padL} y1={yFor(g)} x2={W - padR} y2={yFor(g)} stroke="var(--line-2)" strokeDasharray="2 4" />
              </g>
            ))}
            {/* 坐标轴 */}
            <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line)" />
            <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--line)" />
            <text x={W - padR} y={H - padB + 18} textAnchor="end" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">风险 →</text>
            <text x={padL - 6} y={padT + 4} textAnchor="end" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">↑ 收益</text>
            {/* 散点 */}
            {points.map((p) => {
              const cx = xFor(p.risk), cy = yFor(p.reward);
              const isStar = p.reward >= 0.6 && p.risk <= 0.4;
              const isTrap = p.reward <= 0.4 && p.risk >= 0.6;
              const fill = isStar ? 'oklch(0.55 0.16 160)' : isTrap ? 'oklch(0.55 0.18 25)' : 'oklch(0.50 0.12 75)';
              return (
                <g key={p.id}>
                  <circle cx={cx} cy={cy} r={6} fill={fill} opacity={0.85}>
                    <title>{p.text}</title>
                  </circle>
                  <text x={cx + 8} y={cy + 3} fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)">{p.id}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function AxisProjects() {
  const [tab, setTab] = useState('provenance');
  const [regenOpen, setRegenOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const meetingId = searchParams.get('meetingId') ?? MEETING.id;
  const scope = useMeetingScope();
  const scopeId = scope.effectiveScopeId;
  const forceMock = useForceMock();
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setIsMock(true); return; }
    setIsMock(false);
    let cancelled = false;
    meetingNotesApi.getMeetingAxes(meetingId)
      .then((r) => { if (!cancelled && r && (r.axes?.projects || r.projects)) setIsMock(false); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);
  // R4 · 改动二：4 → 6 tabs；决策溯源合并链+树；新增责任盘点 + 对外影响
  const tabs = [
    { id: 'provenance',     label: '决策溯源',     sub: '链 + 树 · 决策如何一步步走到这里', icon: 'git' as const },
    { id: 'assumptions',    label: '假设清单',     sub: '每个决策背后的未验证假设',   icon: 'layers' as const },
    { id: 'questions',      label: '未解问题',     sub: '跨会议追踪',                 icon: 'search' as const },
    { id: 'risks',          label: '风险与收益',   sub: '风险热度 + 收益散点',         icon: 'bolt' as const },
    // R4 · 跨模块下沉
    { id: 'responsibility', label: '责任盘点',     sub: '承诺 × 清晰度 × 兑现率',     icon: 'check' as const },
    { id: 'stakeholders',   label: '对外影响',     sub: '利益相关方热力图 · CEO Situation', icon: 'target' as const },
  ];
  return (
    <>
      <DimShell axis="项目" tabs={tabs} tab={tab} setTab={setTab} onOpenRegenerate={() => setRegenOpen(true)} mock={isMock}>
        <ProjectBanner />
        {tab === 'provenance'     && <ProvenanceChain scopeId={scopeId} />}
        {tab === 'assumptions'    && <AssumptionLedger scopeId={scopeId} />}
        {tab === 'questions'      && <OpenQuestions scopeId={scopeId} />}
        {tab === 'risks'          && <RiskHeat scopeId={scopeId} />}
        {/* R4 · 2 个新 tab */}
        {tab === 'responsibility' && <ResponsibilityTab scopeId={scopeId} />}
        {tab === 'stakeholders'   && <StakeholderInfluenceTab scopeId={scopeId} />}
      </DimShell>
      <RegenerateOverlay open={regenOpen} onClose={() => setRegenOpen(false)}>
        <AxisRegeneratePanel initialAxis="projects" onClose={() => setRegenOpen(false)} />
      </RegenerateOverlay>
    </>
  );
}

// ── R4 · 跨模块 2 个新 tab 组件 ──────────────────────────────────

/** 责任盘点：mn_commitments × ceo_attention_alloc 跨模块聚合 */
function ResponsibilityTab({ scopeId }: { scopeId: string }) {
  const [data, setData] = useState<{ items: any[]; computedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    meetingNotesApi.getScopeResponsibility(scopeId)
      .then((r) => { if (!cancelled) { setData(r); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scopeId]);
  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>责任盘点</h2>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
          mn_commitments × ceo_attention_alloc · 4 周窗口
        </span>
      </div>
      {loading && <div style={{ color: 'var(--ink-3)' }}>加载中…</div>}
      {err && <div style={{ color: 'oklch(0.45 0.16 25)' }}>{err}</div>}
      {!loading && !err && data && (
        data.items.length === 0 ? (
          <div style={{ background: 'var(--paper-2)', border: '1px dashed var(--line-2)', borderRadius: 6, padding: '20px 24px', fontSize: 12, color: 'var(--ink-3)' }}>
            本 scope 暂无承诺数据 · 跑生成中心 → people/commitments 后回看
          </div>
        ) : (
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '12px 14px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                  <th style={{ textAlign: 'left',  padding: '6px 10px', fontWeight: 500 }}>person</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>承诺总数</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>已兑现</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>滑期</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>开放</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>兑现率</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>4w 投入</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => {
                  const rate = it.fulfillRate;
                  const rateColor = rate === null ? 'var(--ink-3)'
                    : rate >= 0.7 ? 'oklch(0.40 0.10 160)'
                    : rate >= 0.4 ? 'oklch(0.45 0.10 75)'
                    : 'oklch(0.45 0.16 25)';
                  return (
                    <tr key={it.personId} style={{ borderTop: '1px solid var(--line-2)' }}>
                      <td style={{ padding: '6px 10px', color: 'var(--ink-2)' }}>{it.personName || it.personId.slice(0, 8)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{it.total}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'oklch(0.40 0.10 160)' }}>{it.done}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'oklch(0.45 0.16 25)' }}>{it.slipped}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{it.open}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--serif)', fontWeight: 600, color: rateColor }}>
                        {rate === null ? '—' : `${(rate * 100).toFixed(0)}%`}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                        {it.attentionHours4w === null ? '—' : `${Number(it.attentionHours4w).toFixed(1)}h`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

/** 对外影响：直接调 CEO Situation 的 stakeholders endpoint（跨模块） */
function StakeholderInfluenceTab({ scopeId }: { scopeId: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const url = `/api/v1/ceo/situation/stakeholders${scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : ''}`;
    fetch(url, { headers: { 'X-API-Key': (import.meta as any).env?.VITE_API_KEY ?? '' } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scopeId]);
  const items: Array<any> = Array.isArray(data?.items) ? data.items : [];
  // heat 排序 + 简单热力色阶
  const sorted = [...items].sort((a, b) => Number(b.heat ?? 0) - Number(a.heat ?? 0));
  const heatColor = (h: number) => h >= 0.7 ? 'oklch(0.55 0.18 25)' : h >= 0.4 ? 'oklch(0.65 0.16 75)' : 'oklch(0.55 0.10 160)';
  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>对外影响 · 利益相关方热力图</h2>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
          来源 GET /api/v1/ceo/situation/stakeholders · ceo_stakeholders
        </span>
      </div>
      {loading && <div style={{ color: 'var(--ink-3)' }}>加载中…</div>}
      {err && <div style={{ color: 'oklch(0.45 0.16 25)' }}>{err}</div>}
      {!loading && !err && (
        sorted.length === 0 ? (
          <div style={{ background: 'var(--paper-2)', border: '1px dashed var(--line-2)', borderRadius: 6, padding: '20px 24px', fontSize: 12, color: 'var(--ink-3)' }}>
            本 scope 暂无利益相关方数据 · 在 /ceo/internal/ceo/situation 配置后回看
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {sorted.map((it: any) => (
              <div key={it.id} style={{
                background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                    {it.kind || 'stakeholder'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600,
                    color: heatColor(Number(it.heat ?? 0)),
                  }}>
                    {Number(it.heat ?? 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                {it.description && (
                  <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    {it.description.slice(0, 80)}{it.description.length > 80 ? '…' : ''}
                  </div>
                )}
                {it.last_signal_at && (
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                    last signal · {new Date(it.last_signal_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default AxisProjects;
