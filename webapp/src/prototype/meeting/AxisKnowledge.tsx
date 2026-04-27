// AxisKnowledge.tsx — 知识轴的五个细分维度
// 原型来源：/tmp/mn-proto/dimensions-knowledge.jsx DimensionKnowledge
// 可复用判断 · 心智模型激活 · 证据层级 · 认知偏差探测 · 反事实

import { useState, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Chip, MonoMeta, MockBadge } from './_atoms';
import { DimShell, CalloutCard, RegenerateOverlay } from './_axisShared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';
import { P, MEETING } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import { useMeetingScope } from './_scopeContext';

// ── Mock data ───────────────────────────────────────────────────────────────

const REUSABLE_JUDGMENTS = [
  { id: 'J-01', text: '当一个细分赛道的单位经济模型无法在 3 年内收敛到正向时，规模化会加速恶化，不会拯救它。',
    abstractedFrom: '推理层毛利讨论 · M-2026-04-11',
    generalityScore: 0.82, reuseCount: 4, linkedMeetings: ['M-2026-02-08', 'M-2026-04-11'],
    domain: '投资判断', author: 'E09-09 专家提炼' },
  { id: 'J-02', text: 'LP 表达的"提醒"里，90% 是为未来归因留证，10% 是真正的约束——区分二者是关键。',
    abstractedFrom: '林雾 · 集中度表态 · M-2026-04-11',
    generalityScore: 0.88, reuseCount: 7, linkedMeetings: ['M-2026-01-30', 'M-2026-03-14', 'M-2026-04-11'],
    domain: '治理 / 沟通', author: 'E09-09 专家提炼' },
  { id: 'J-03', text: 'Subadvisor 网络的真正价值不是 sourcing 数量，而是 allocation 决策权。',
    abstractedFrom: '北美渠道讨论 · M-2026-03-14',
    generalityScore: 0.75, reuseCount: 3, linkedMeetings: ['M-2026-03-14', 'M-2026-04-11'],
    domain: '运营结构', author: 'E04-12 专家提炼' },
  { id: 'J-04', text: '当两个观点看似在争技术路径时，真正的分歧往往是"风险预算归谁"。',
    abstractedFrom: '训练层 vs 推理层辩论 · M-2026-04-11',
    generalityScore: 0.91, reuseCount: 2, linkedMeetings: ['M-2026-04-11'],
    domain: '团队动力', author: 'E09-09 专家提炼' },
];

const MENTAL_MODELS: Array<{
  id: string; name: string; invokedBy: string; invokedCount: number;
  correctly: boolean | null; outcome: string; expert: string;
}> = [
  { id: 'MM-01', name: '二阶效应 · Second-order thinking', invokedBy: 'p1', invokedCount: 3,
    correctly: true, outcome: '帮助识别"规模护城河"的二阶脆弱性', expert: 'E09-09' },
  { id: 'MM-02', name: '基础利率 · Base rate', invokedBy: 'p4', invokedCount: 2,
    correctly: true, outcome: '同类样本中位数 38% 把毛利讨论锚定住', expert: 'E07-18' },
  { id: 'MM-03', name: '反身性 · Reflexivity', invokedBy: 'p3', invokedCount: 1,
    correctly: false, outcome: '误用 · 把市场情绪当作基本面证据', expert: 'E11-03' },
  { id: 'MM-04', name: '瓶颈分析 · Bottleneck', invokedBy: 'p2', invokedCount: 2,
    correctly: true, outcome: '定位 H-chip 作为关键外生变量', expert: 'E04-12' },
  { id: 'MM-05', name: '前事之鉴 · Pre-mortem', invokedBy: '—', invokedCount: 0,
    correctly: null, outcome: '本场未激活 · 建议下次由 p1 开启', expert: 'E09-09' },
];

const EVIDENCE_GRADES = [
  { grade: 'A · 硬数据',      tone: 'oklch(0.93 0.06 140)', fg: 'oklch(0.35 0.12 140)',
    count: 7, examples: ['推理层 7 家客户报价曲线', '北美 18 次 warm intro 数据', '同类样本历史中位数 38%'] },
  { grade: 'B · 类比 / 案例', tone: 'var(--teal-soft)',      fg: 'oklch(0.3 0.08 200)',
    count: 11, examples: ['北美 3 家对标公司毛利区间', '2023-2025 细分赛道案例', 'Omar 北美 subadvisor 经验'] },
  { grade: 'C · 直觉 / 口述', tone: 'var(--amber-soft)',     fg: 'oklch(0.38 0.09 75)',
    count: 9, examples: ['「规模你守不住」', '「LP 不会反弹」', '「估值模型应该校准」'] },
  { grade: 'D · 道听途说',    tone: 'var(--accent-soft)',    fg: 'oklch(0.32 0.1 40)',
    count: 4, examples: ['听说某家公司要合并', '某 GP 据说在 raise', '朋友圈看到的北美数据'] },
];

const COGNITIVE_BIASES = [
  { id: 'B-01', name: '锚定效应', where: '以 8000 万为起始上限讨论', by: ['p1'],
    severity: 'med', mitigated: true, mitigation: '林雾从合规口径另起锚点' },
  { id: 'B-02', name: '过度自信', where: '「LP 对 6000 万不会反弹」 · AS-04 支撑证据为 D 级', by: ['p1'],
    severity: 'high', mitigated: false },
  { id: 'B-03', name: '确认偏误', where: '沈岚在讨论中 5 次主动引用支持推理层的数据，1 次提反例', by: ['p2'],
    severity: 'med', mitigated: false },
  { id: 'B-04', name: '幸存者偏差', where: '北美对标 3 家 → 全行业结论', by: ['p6'],
    severity: 'med', mitigated: true, mitigation: 'p4 基础利率分析' },
  { id: 'B-05', name: '沉没成本', where: '「我们在训练层已经投了」未明说但影响判断', by: ['p3'],
    severity: 'high', mitigated: false },
];

const COUNTERFACTUALS = [
  { id: 'CF-01', path: '单笔上限定 8,000 万', rejectedAt: 'M-2026-04-11', rejectedBy: ['p5'],
    trackingNote: '6 个月后回看：如果头部出现一个 $80M 级 deal 我们错过了会怎样？',
    validityCheckAt: '2026-10-11' },
  { id: 'CF-02', path: '赛道保留训练 + 推理双端', rejectedAt: 'M-2026-03-22', rejectedBy: ['p2'],
    trackingNote: '12 个月后回看：训练层的头部如果跑出来，双端策略是否更稳？',
    validityCheckAt: '2027-03-22' },
  { id: 'CF-03', path: '团队自建北美办公室（而非 subadvisor）', rejectedAt: 'M-2026-03-14', rejectedBy: ['p6'],
    trackingNote: '关注 subadvisor 结构能否持续产生 allocation 决策权（J-03）',
    validityCheckAt: '2026-09-14' },
];

// ── Style lookups ───────────────────────────────────────────────────────────

const BIAS_SEV: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: 'var(--accent-soft)', fg: 'oklch(0.3 0.1 40)',    label: '高' },
  med:  { bg: 'var(--amber-soft)',  fg: 'oklch(0.38 0.09 75)', label: '中' },
};

// ── Sub-components ───────────────────────────────────────────────────────────

type JudgmentRow = typeof REUSABLE_JUDGMENTS[number];

function Judgments({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [items, setItems] = useState<JudgmentRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setItems(REUSABLE_JUDGMENTS); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.listScopeJudgments(scopeId)
      .then((r) => {
        if (cancelled) return;
        const list = r?.items ?? [];
        const mapped: JudgmentRow[] = list.map((j) => ({
          id: 'J-' + j.id.slice(0, 6).toUpperCase(),
          text: j.text,
          abstractedFrom: j.abstracted_from_meeting_id?.slice(0, 12) ?? '',
          generalityScore: Number(j.generality_score ?? 0.5),
          reuseCount: Number(j.reuse_count ?? 0),
          linkedMeetings: (j.linked_meeting_ids ?? []).map((m) => m.slice(0, 12)),
          domain: j.domain ?? '—',
          author: j.author_name ?? '—',
        }));
        setItems(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          可复用判断 · Reusable judgments
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        从具体讨论中抽离出的<b>脱离当前语境仍然成立</b>的通用结论。系统自动入知识库，并跟踪其在未来会议中的被引用次数。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(j => (
          <div key={j.id} style={{
            background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderLeft: '2px solid var(--accent)',
            borderRadius: 5, padding: '16px 20px',
            display: 'grid', gridTemplateColumns: '1fr 200px 100px', gap: 18, alignItems: 'start',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <MonoMeta>{j.id}</MonoMeta>
                <Chip tone="teal">{j.domain}</Chip>
                <MonoMeta style={{ marginLeft: 'auto', fontSize: 10 }}>{j.author}</MonoMeta>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 16, lineHeight: 1.55, fontWeight: 500, color: 'var(--ink)' }}>
                {j.text}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--ink-4)' }}>提炼自</span>{j.abstractedFrom}
              </div>
            </div>
            <div>
              <MonoMeta style={{ fontSize: 9.5 }}>GENERALITY</MonoMeta>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--line-2)', borderRadius: 2 }}>
                  <div style={{ width: `${j.generalityScore * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <MonoMeta style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>
                  {j.generalityScore.toFixed(2)}
                </MonoMeta>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 10 }}>
                跨 {j.linkedMeetings.length} 场会议链接
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {j.reuseCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>已复用</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type MentalModelRow = typeof MENTAL_MODELS[number];

function MentalModels({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<MentalModelRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(MENTAL_MODELS); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getScopeMentalModelHitRate(scopeId)
      .then((r) => {
        if (cancelled) return;
        const list = r?.items ?? [];
        const mapped: MentalModelRow[] = list.map((m) => ({
          id: 'MM-' + m.id.slice(0, 6).toUpperCase(),
          name: m.model_name,
          invokedBy: '—',
          invokedCount: Number(m.invocations ?? 0),
          correctly: m.flag === 'priority' ? true : m.flag === 'downweight' ? false : null,
          outcome: `命中率 ${(Number(m.hit_rate ?? 0) * 100).toFixed(0)}% · ${m.hits}/${m.invocations} · flag=${m.flag}`,
          expert: '—',
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
          心智模型激活 · Mental models invoked
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        会议中被激活的心智模型 —— 激活 ≠ 用得对。系统标记滥用与未激活的盲点。
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px 1fr 120px',
        padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: '1px solid var(--line-2)',
      }}>
        <span>模型</span><span>激活者</span><span>次数</span><span>使用</span><span>产出 / 说明</span><span>来源专家</span>
      </div>
      {rows.map((m, i) => {
        const p = m.invokedBy === '—' ? null : P(m.invokedBy);
        // mock 模式 · '—' 表示真"未激活"；API 模式 · 后端无 invoker 字段
        const noInvokerLabel = isMock ? (m.invokedCount === 0 ? '未激活' : '无人激活') : '后端未提供';
        return (
          <div key={m.id} style={{
            display: 'grid', gridTemplateColumns: '180px 1fr 80px 100px 1fr 120px',
            alignItems: 'center', gap: 10, padding: '14px 14px', borderBottom: '1px solid var(--line-2)',
            background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
          }}>
            <div>
              <MonoMeta style={{ fontSize: 9.5 }}>{m.id}</MonoMeta>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{m.name}</div>
            </div>
            <div>
              {p ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar p={p} size={20} radius={4} />
                  <span style={{ fontSize: 12 }}>{p.name}</span>
                </div>
              ) : <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>{noInvokerLabel}</span>}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600,
              color: m.invokedCount > 0 ? 'var(--ink)' : 'var(--ink-4)', letterSpacing: '-0.01em',
            }}>
              {m.invokedCount}
            </div>
            <div>
              {m.correctly === true  && <Chip tone="teal">正确</Chip>}
              {m.correctly === false && <Chip tone="accent">滥用</Chip>}
              {m.correctly === null  && <Chip tone="ghost">未激活</Chip>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--serif)', lineHeight: 1.5 }}>{m.outcome}</div>
            <MonoMeta style={{ fontSize: 10.5 }}>{m.expert}</MonoMeta>
          </div>
        );
      })}
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CalloutCard title="盲点 · MM-05 Pre-mortem 未激活" tone="accent">
          <b>对 6000 万上限的决议，没有人做「如果 6 个月后 LP 反弹」的前事之鉴分析。</b>
          建议下次决议前由 p1 开启一次正式 pre-mortem。
        </CalloutCard>
        <CalloutCard title="反身性被滥用">
          p3 在 M-2026-04-11 用反身性支持自己的判断，但证据仅是市场情绪。
          <i>反身性需要的是双向反馈链，不是情绪证据</i>。这是典型误用。
        </CalloutCard>
      </div>
    </div>
  );
}

function Evidence() {
  const total = EVIDENCE_GRADES.reduce((s, g) => s + g.count, 0);
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
        证据层级 · Evidence grading
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        本场 31 条论断按证据强度分级。<b>D 级是噪音信号</b>，不应支撑 current 决议。
      </div>

      <div style={{
        display: 'flex', height: 18, background: 'var(--paper-2)', borderRadius: 4, overflow: 'hidden',
        marginBottom: 14, border: '1px solid var(--line-2)',
      }}>
        {EVIDENCE_GRADES.map(g => (
          <div key={g.grade} title={g.grade} style={{
            width: `${(g.count / total) * 100}%`, background: g.tone,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: g.fg, fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--mono)',
            borderRight: '1px solid var(--paper)',
          }}>
            {g.count}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {EVIDENCE_GRADES.map(g => (
          <div key={g.grade} style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 3, fontWeight: 600, background: g.tone, color: g.fg }}>
                {g.grade}
              </span>
              <MonoMeta style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{g.count} 条</MonoMeta>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px', color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.8, fontFamily: 'var(--serif)' }}>
              {g.examples.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

type BiasRow = typeof COGNITIVE_BIASES[number];

function Biases({ meetingId }: { meetingId: string }) {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<BiasRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setRows(COGNITIVE_BIASES); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getMeetingBiases(meetingId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const mapped: BiasRow[] = items.map((b) => {
          const name = b.by_person_name?.trim();
          const where = b.where_excerpt?.trim();
          return {
            id: 'B-' + b.id.slice(0, 6).toUpperCase(),
            name: b.bias_type,
            where: where || '—',
            by: name ? [name] : ['—'],
            severity: b.severity,
            mitigated: Boolean(b.mitigated),
            mitigation: b.mitigation_strategy,
          };
        });
        setRows(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          认知偏差探测 · Cognitive-bias surface
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        系统不评价对错，只标记可疑的认知模式。对<b>未被化解的高等级偏差</b>保持警觉。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(b => {
          const sev = BIAS_SEV[b.severity];
          const p = P(b.by[0]);
          return (
            <div key={b.id} style={{
              background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
              padding: '14px 18px', display: 'grid',
              gridTemplateColumns: '160px 1fr 120px 80px', gap: 14, alignItems: 'center',
            }}>
              <div>
                <MonoMeta style={{ fontSize: 9.5 }}>{b.id}</MonoMeta>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{b.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontFamily: 'var(--serif)', lineHeight: 1.5, color: 'var(--ink)' }}>{b.where}</div>
                {b.mitigation && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, fontStyle: 'italic' }}>
                    化解: {b.mitigation}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar p={p} size={20} radius={4} />
                <span style={{ fontSize: 12 }}>{p.name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600, background: sev.bg, color: sev.fg }}>
                  {sev.label} 风险
                </span>
                <div style={{
                  marginTop: 6, fontSize: 10.5,
                  color: b.mitigated ? 'oklch(0.35 0.12 140)' : 'oklch(0.5 0.15 30)',
                }}>
                  {b.mitigated ? '已化解' : '未化解'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Counterfactuals() {
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
        反事实 / 未走的路 · Counterfactuals
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        本场<b>被否决的路径</b>会被持续追踪。每条反事实在未来某个检查点，都会被拉出来做"如果当时走了会怎样"的复盘。
        这是把"错过的教训"变成系统性反馈的关键。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {COUNTERFACTUALS.map(c => (
          <div key={c.id} style={{
            background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderLeft: '2px solid var(--teal)',
            borderRadius: 5, padding: '14px 18px',
            display: 'grid', gridTemplateColumns: '1fr 220px', gap: 18, alignItems: 'center',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <MonoMeta>{c.id}</MonoMeta>
                <Chip tone="teal">未走的路</Chip>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600, lineHeight: 1.45, textDecoration: 'line-through', color: 'var(--ink-2)' }}>
                {c.path}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                <span style={{ color: 'var(--ink-4)' }}>被否决于</span> {c.rejectedAt} · 由 {c.rejectedBy.map(id => P(id).name).join(' / ')}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 10, fontFamily: 'var(--serif)', fontStyle: 'italic', lineHeight: 1.55 }}>
                「{c.trackingNote}」
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 14px', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 5 }}>
              <MonoMeta style={{ fontSize: 9.5 }}>VALIDITY CHECK</MonoMeta>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, marginTop: 4 }}>{c.validityCheckAt}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>系统将提醒复盘</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function AxisKnowledge() {
  const [tab, setTab] = useState('judgments');
  const [regenOpen, setRegenOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const scope = useMeetingScope();
  const scopeId = scope.effectiveScopeId;
  const forceMock = useForceMock();

  // F7 → F9.1 · 智能 auto-pick：listScopeMeetings 后预拉 axes，选第一个 mental_models /
  // cognitive_biases / counterfactuals 任一非空的会议；都为空则用第一个（兜底）。
  // 之前按 created_at 顺序硬选，常落到刚建的"空会议"上 → tab 永远空。
  const [autoMeetingId, setAutoMeetingId] = useState<string | null>(null);
  useEffect(() => {
    if (forceMock || searchParams.get('meetingId')) { setAutoMeetingId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await meetingNotesApi.listScopeMeetings(scopeId);
        const ids: string[] = list?.meetingIds ?? [];
        if (ids.length === 0) return;
        // 并行拉每场 axes，找第一个 knowledge 三个 list-output subDim 任一非空的
        const axesArr = await Promise.all(ids.map((id) => meetingNotesApi.getMeetingAxes(id).catch(() => null)));
        let chosen = ids[0];
        for (let i = 0; i < ids.length; i++) {
          const k = axesArr[i]?.knowledge;
          if (!k) continue;
          const hasContent = (k.mental_models?.length ?? 0) > 0
            || (k.cognitive_biases?.length ?? 0) > 0
            || (k.counterfactuals?.length ?? 0) > 0
            || (k.judgments?.length ?? 0) > 0;
          if (hasContent) { chosen = ids[i]; break; }
        }
        if (!cancelled) setAutoMeetingId(chosen);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [searchParams, scopeId, forceMock]);
  const meetingId = searchParams.get('meetingId') ?? autoMeetingId ?? MEETING.id;

  // 一次性拉 getMeetingAxes，让 5 个 tab 读取真实 mn_* 数据（之前 mental_models /
  // evidence / counterfactuals 都查错表或纯 mock）
  const [knowledgeData, setKnowledgeData] = useState<any>(null);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setKnowledgeData(null); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getMeetingAxes(meetingId)
      .then((r) => {
        if (cancelled) return;
        setKnowledgeData(r?.knowledge ?? null);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);

  // F7.1 · evidence_grades 跨 scope 聚合：单 meeting 经常 0/0/0/0（如 db866879
  // 没跑 evidence_grading），需要把 scope 下三场会议的 dist_a/b/c/d 加总，重新
  // 计算 weighted_score = (4A+3B+2C+1D)/total，才能反映项目级证据分布
  const [aggregatedEvidence, setAggregatedEvidence] = useState<{
    dist_a: number; dist_b: number; dist_c: number; dist_d: number; weighted_score: number;
  } | null>(null);
  useEffect(() => {
    if (forceMock) { setAggregatedEvidence(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const meetings = await meetingNotesApi.listScopeMeetings(scopeId);
        const ids = meetings?.meetingIds ?? [];
        if (ids.length === 0) return;
        const axesList = await Promise.all(ids.map((mid) => meetingNotesApi.getMeetingAxes(mid).catch(() => null)));
        let A = 0, B = 0, C = 0, D = 0;
        for (const a of axesList) {
          const eg = a?.knowledge?.evidence_grades;
          if (!eg) continue;
          A += Number(eg.dist_a ?? 0);
          B += Number(eg.dist_b ?? 0);
          C += Number(eg.dist_c ?? 0);
          D += Number(eg.dist_d ?? 0);
        }
        const total = A + B + C + D;
        const weighted = total === 0 ? 0 : Math.round((4 * A + 3 * B + 2 * C + 1 * D) / total * 100) / 100;
        if (cancelled) return;
        setAggregatedEvidence({ dist_a: A, dist_b: B, dist_c: C, dist_d: D, weighted_score: weighted });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);

  const tabs = [
    { id: 'judgments',       label: '可复用判断',    sub: '从具体案例提炼的通用结论',  icon: 'book' as const },
    { id: 'mental_models',   label: '心智模型激活',  sub: '谁用了什么模型，用得对吗',  icon: 'compass' as const },
    { id: 'evidence',        label: '证据层级',       sub: 'A/B/C/D 分级统计',          icon: 'layers' as const },
    { id: 'biases',          label: '认知偏差',       sub: '本场激活的 5 种偏差',        icon: 'wand' as const },
    { id: 'counterfactuals', label: '反事实 / 未走的路', sub: '被否决的路径持续追踪',   icon: 'git' as const },
  ];
  return (
    <>
      <DimShell axis="知识" tabs={tabs} tab={tab} setTab={setTab} onOpenRegenerate={() => setRegenOpen(true)} mock={isMock}>
        {tab === 'judgments'       && <Judgments scopeId={scopeId} />}
        {tab === 'mental_models'   && <MentalModelsLive data={knowledgeData?.mental_models} fallback={<MentalModels scopeId={scopeId} />} />}
        {tab === 'evidence'        && <EvidenceLive data={aggregatedEvidence ?? knowledgeData?.evidence_grades} fallback={<Evidence />} scopeAggregated={!!aggregatedEvidence} />}
        {tab === 'biases'          && <BiasesLive data={knowledgeData?.cognitive_biases} fallback={<Biases meetingId={meetingId} />} />}
        {tab === 'counterfactuals' && <CounterfactualsLive data={knowledgeData?.counterfactuals} fallback={<Counterfactuals />} />}
      </DimShell>
      <RegenerateOverlay open={regenOpen} onClose={() => setRegenOpen(false)}>
        <AxisRegeneratePanel initialAxis="knowledge" onClose={() => setRegenOpen(false)} />
      </RegenerateOverlay>
    </>
  );
}

// ── F7 · Live wrappers：有数据 → 渲染真实；无数据 → fallback 到原 mock 组件 ──

function MentalModelsLive({ data, fallback }: { data: any[] | undefined; fallback: ReactNode }) {
  if (!data || data.length === 0) return <>{fallback}</>;
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          心智模型激活 · {data.length} 项
        </h3>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18 }}>
        来自 mn_mental_model_invocations · 该会议被激活的心智模型 + LLM 判断
      </div>
      {data.map((m: any, i: number) => (
        <div key={m.id ?? i} style={{
          padding: '12px 14px', borderBottom: '1px solid var(--line-2)',
          background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>{m.model_name}</span>
            {m.correctly_used === true  && <Chip tone="teal">用对</Chip>}
            {m.correctly_used === false && <Chip tone="accent">滥用</Chip>}
            {m.correctly_used == null   && <Chip tone="ghost">未判断</Chip>}
            <MonoMeta style={{ fontSize: 10 }}>conf {Number(m.confidence ?? 0).toFixed(2)}</MonoMeta>
          </div>
          {m.outcome && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, fontFamily: 'var(--serif)' }}>{m.outcome}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function BiasesLive({ data, fallback }: { data: any[] | undefined; fallback: ReactNode }) {
  if (!data || data.length === 0) return <>{fallback}</>;
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
        认知偏差 · {data.length} 项
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18 }}>
        来自 mn_cognitive_biases · 此会议被识别的偏差类型 + 原文摘录
      </div>
      {data.map((b: any, i: number) => (
        <div key={b.id ?? i} style={{
          padding: '12px 14px', borderBottom: '1px solid var(--line-2)',
          background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Chip tone={b.severity === 'high' ? 'accent' : b.severity === 'med' ? 'amber' : 'ghost'}>{b.bias_type}</Chip>
            <MonoMeta style={{ fontSize: 10 }}>severity={b.severity}</MonoMeta>
            {b.mitigated && <Chip tone="teal">已缓解</Chip>}
          </div>
          {b.where_excerpt && (
            <div style={{
              fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, fontFamily: 'var(--serif)',
              borderLeft: '2px solid var(--line)', paddingLeft: 10, fontStyle: 'italic',
            }}>「{b.where_excerpt}」</div>
          )}
        </div>
      ))}
    </div>
  );
}

function CounterfactualsLive({ data, fallback }: { data: any[] | undefined; fallback: ReactNode }) {
  if (!data || data.length === 0) return <>{fallback}</>;
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
        反事实 / 未走的路 · {data.length} 条
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18 }}>
        来自 mn_counterfactuals · 此会议明确否决或未选的路径，用于事后回看
      </div>
      {data.map((c: any, i: number) => (
        <div key={c.id ?? i} style={{
          padding: '12px 14px', borderBottom: '1px solid var(--line-2)',
          background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Chip tone={c.current_validity === 'invalid' ? 'accent' : c.current_validity === 'valid' ? 'teal' : 'ghost'}>
              {c.current_validity ?? 'unclear'}
            </Chip>
            {c.next_validity_check_at && (
              <MonoMeta style={{ fontSize: 10 }}>下次复核 {new Date(c.next_validity_check_at).toLocaleDateString()}</MonoMeta>
            )}
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{c.rejected_path}</div>
          {c.tracking_note && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>追踪：{c.tracking_note}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function EvidenceLive({ data, fallback, scopeAggregated }: { data: { dist_a: number; dist_b: number; dist_c: number; dist_d: number; weighted_score: number } | undefined | null; fallback: ReactNode; scopeAggregated?: boolean }) {
  if (!data) return <>{fallback}</>;
  const total = (data.dist_a ?? 0) + (data.dist_b ?? 0) + (data.dist_c ?? 0) + (data.dist_d ?? 0);
  if (total === 0) return <>{fallback}</>;
  const grades = [
    { k: 'A', n: data.dist_a, label: '硬数据', color: 'oklch(0.7 0.14 145)' },
    { k: 'B', n: data.dist_b, label: '类比/案例', color: 'oklch(0.78 0.12 95)' },
    { k: 'C', n: data.dist_c, label: '直觉/口述', color: 'oklch(0.78 0.13 70)' },
    { k: 'D', n: data.dist_d, label: '道听途说', color: 'oklch(0.65 0.18 30)' },
  ];
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
        证据层级 · 总 {total} 条 · 加权 {Number(data.weighted_score ?? 0).toFixed(2)}
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18 }}>
        {scopeAggregated
          ? '来自 mn_evidence_grades 跨 scope 聚合 · A=4 / B=3 / C=2 / D=1 加权均值'
          : '来自 mn_evidence_grades 单 meeting · A=4 / B=3 / C=2 / D=1 加权均值'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {grades.map((g) => {
          const pct = total > 0 ? ((g.n ?? 0) / total) * 100 : 0;
          return (
            <div key={g.k} style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 14 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600, color: g.color }}>{g.k}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{g.label}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 600 }}>{g.n ?? 0}</div>
              <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: g.color }} />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 4 }}>{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AxisKnowledge;
