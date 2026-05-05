// AxisPeople.tsx — 人物轴的四个细分维度
// 原型来源：/tmp/mn-proto/dimensions-people.jsx DimensionPeople
// 承诺与兑现 · 角色画像演化 · 发言质量 · 沉默信号

import { useState, useEffect, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Chip, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import { DimShell, CalloutCard, StatCell, BigStat, RegenerateOverlay, useStickyTab, AxisLoadingSkeleton, useScopeUrlSync } from './_axisShared';
import { MeetingPicker } from './_meetingPicker';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';
import { PARTICIPANTS, P, MEETING, pickPerson } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import { useMeetingScope } from './_scopeContext';
import { useIsMobile } from '../_useIsMobile';
import { PersonLLMProfileModal } from './PersonLLMProfileModal';
import {
  SILENCE_INTRO,
  SILENCE_FALSE_POSITIVE_CRITIQUE,
} from '../../i18n/commentary';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Mock data ───────────────────────────────────────────────────────────────

const COMMITMENTS = [
  { id: 'K-0237-A1', who: 'p2', meeting: 'M-2026-04-11', what: '两周内提交推理层 3 家 candidate 尽调包',
    due: '2026-04-25', state: 'on-track', progress: 0.6 },
  { id: 'K-0237-A2', who: 'p3', meeting: 'M-2026-04-11', what: '整理北美 5 家同业在推理层的退出路径对比',
    due: '2026-04-22', state: 'at-risk', progress: 0.2 },
  { id: 'K-0237-A3', who: 'p4', meeting: 'M-2026-04-11', what: '补充 2023-2025 基础设施细分赛道基础利率',
    due: '2026-04-18', state: 'done', progress: 1.0 },
  { id: 'K-0188-A1', who: 'p2', meeting: 'M-2026-03-22', what: '估值模型 v2 —— 加入 workload cohort 维度',
    due: '2026-04-05', state: 'done', progress: 1.0 },
  { id: 'K-0188-A2', who: 'p1', meeting: 'M-2026-03-22', what: '与 LP 预沟通单笔上限的口径',
    due: '2026-04-01', state: 'slipped', progress: 0.3 },
  { id: 'K-0173-A1', who: 'p3', meeting: 'M-2026-03-14', what: 'subadvisor 条款 term sheet 草稿',
    due: '2026-03-28', state: 'done', progress: 1.0 },
  { id: 'K-0121-A1', who: 'p1', meeting: 'M-2026-02-08', what: 'H-chip 配额 Q2 预案文件',
    due: '2026-02-25', state: 'done', progress: 1.0 },
  { id: 'K-0107-A1', who: 'p3', meeting: 'M-2026-01-30', what: '退出预演 · 头部 3 家二级市场对标',
    due: '2026-02-15', state: 'done', progress: 1.0 },
];

const PEOPLE_STATS = [
  { who: 'p1', fulfillment: 0.72, avgLatency: '+2.4d', claims: 34, followThroughGrade: 'B',
    roleTrajectory: [{ m: 'M-2025-11', role: '提出者' }, { m: 'M-2026-01', role: '质疑者' }, { m: 'M-2026-04', role: '决策者' }],
    speechHighEntropy: 0.61, beingFollowedUp: 18, silentOnTopics: ['技术路线'] },
  { who: 'p2', fulfillment: 0.88, avgLatency: '-0.3d', claims: 51, followThroughGrade: 'A',
    roleTrajectory: [{ m: 'M-2025-11', role: '执行者' }, { m: 'M-2026-02', role: '提出者' }, { m: 'M-2026-04', role: '提出者' }],
    speechHighEntropy: 0.74, beingFollowedUp: 27, silentOnTopics: [] },
  { who: 'p3', fulfillment: 0.64, avgLatency: '+3.1d', claims: 42, followThroughGrade: 'B-',
    roleTrajectory: [{ m: 'M-2025-11', role: '决策者' }, { m: 'M-2026-02', role: '质疑者' }, { m: 'M-2026-04', role: '质疑者' }],
    speechHighEntropy: 0.52, beingFollowedUp: 22, silentOnTopics: ['合规边界'] },
  { who: 'p4', fulfillment: 0.95, avgLatency: '-1.1d', claims: 18, followThroughGrade: 'A+',
    roleTrajectory: [{ m: 'M-2025-11', role: '执行者' }, { m: 'M-2026-02', role: '执行者' }, { m: 'M-2026-04', role: '执行者' }],
    speechHighEntropy: 0.68, beingFollowedUp: 11, silentOnTopics: [] },
  { who: 'p5', fulfillment: 1.0, avgLatency: '-', claims: 6, followThroughGrade: '—',
    roleTrajectory: [{ m: 'M-2025-11', role: '旁观者' }, { m: 'M-2026-02', role: '旁观者' }, { m: 'M-2026-04', role: '旁观者' }],
    speechHighEntropy: 0.81, beingFollowedUp: 5, silentOnTopics: ['产业判断', '估值方法'] },
  { who: 'p6', fulfillment: 0.80, avgLatency: '+1.2d', claims: 14, followThroughGrade: 'A-',
    roleTrajectory: [{ m: 'M-2025-11', role: '旁观者' }, { m: 'M-2026-02', role: '提出者' }, { m: 'M-2026-04', role: '执行者' }],
    speechHighEntropy: 0.58, beingFollowedUp: 9, silentOnTopics: ['合规'] },
];

const stateStyle: Record<string, { bg: string; fg: string; bd: string; label: string }> = {
  'done':     { bg: 'oklch(0.93 0.06 140)', fg: 'oklch(0.35 0.12 140)', bd: 'oklch(0.85 0.08 140)', label: '已兑现' },
  'on-track': { bg: 'var(--teal-soft)',      fg: 'oklch(0.3 0.08 200)',   bd: 'oklch(0.85 0.05 200)', label: '进行中' },
  'at-risk':  { bg: 'var(--amber-soft)',     fg: 'oklch(0.38 0.09 75)',   bd: 'oklch(0.85 0.07 75)',  label: '有风险' },
  'slipped':  { bg: 'var(--accent-soft)',    fg: 'oklch(0.32 0.1 40)',    bd: 'oklch(0.85 0.07 40)',  label: '已逾期' },
};

const ROLE_TONES: Record<string, { bg: string; fg: string }> = {
  '提出者': { bg: 'var(--accent-soft)',    fg: 'oklch(0.32 0.1 40)' },
  '质疑者': { bg: 'var(--teal-soft)',       fg: 'oklch(0.28 0.08 200)' },
  '执行者': { bg: 'oklch(0.93 0.06 140)',   fg: 'oklch(0.32 0.12 140)' },
  '决策者': { bg: 'var(--amber-soft)',      fg: 'oklch(0.36 0.09 75)' },
  '旁观者': { bg: 'var(--paper-3)',         fg: 'var(--ink-3)' },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function EntropyBar({ v }: { v: number }) {
  const segs = 10;
  const filled = Math.round(v * segs);
  return (
    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} style={{
          width: 4, height: 4 + (i < filled ? 6 : 0),
          background: i < filled ? 'var(--accent)' : 'var(--line)', borderRadius: 1,
        }} />
      ))}
    </div>
  );
}

function LegendCell({ cellStyle, label }: { cellStyle: { bg: string; fg: string; symbol: string }; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 18, height: 18, background: cellStyle.bg, color: cellStyle.fg,
        border: '1px solid var(--line-2)', borderRadius: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
      }}>{cellStyle.symbol}</div>
      <span>{label}</span>
    </div>
  );
}

function SilenceFinding({ p, topic, note }: { p: ReturnType<typeof P>; topic: string; note: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'start' }}>
      <Avatar p={p} size={24} radius={5} />
      <div>
        <div style={{ fontSize: 12.5 }}>
          <b>{p.name}</b> <span style={{ color: 'var(--ink-3)' }}>on</span>{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{topic}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5, marginTop: 2, fontFamily: 'var(--serif)' }}>{note}</div>
      </div>
    </div>
  );
}

// ── P1 · 承诺与兑现 ─────────────────────────────────────────────────────────

type CommitmentRow = typeof COMMITMENTS[number];

function PCommitments({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<CommitmentRow[]>([]);
  const [personNames, setPersonNames] = useState<Record<string, string>>({});
  const [isMock, setIsMock] = useState(() => forceMock);
  const [loading, setLoading] = useState(() => !forceMock);
  useEffect(() => {
    if (forceMock || !UUID_RE.test(scopeId)) { setItems(COMMITMENTS); setPersonNames({}); setIsMock(true); setLoading(false); return; }
    setLoading(true); setIsMock(false);
    let cancelled = false;
    meetingNotesApi.listScopeCommitments(scopeId)
      .then((r) => {
        if (cancelled) return;
        const list = r?.items ?? [];
        const stateMap: Record<string, CommitmentRow['state']> = {
          'on_track': 'on-track',
          'at_risk': 'at-risk',
          'done': 'done',
          'slipped': 'slipped',
        };
        const names: Record<string, string> = {};
        const mapped: CommitmentRow[] = list.map((c) => {
          if (c.person_id && c.person_name) names[c.person_id] = c.person_name;
          return {
            id: 'K-' + c.id.slice(0, 6).toUpperCase(),
            who: c.person_id,
            meeting: c.meeting_id.slice(0, 12),
            what: c.text,
            due: c.due_at ? c.due_at.slice(0, 10) : '—',
            state: stateMap[c.state] ?? 'on-track',
            progress: Math.min(1, Number(c.progress ?? 0) / 100),
          };
        });
        setItems(mapped); setPersonNames(names); setIsMock(false); setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);
  if (loading) return <AxisLoadingSkeleton rows={5} />;

  const byPerson = isMock
    ? PARTICIPANTS.map(p => ({
        p,
        stats: PEOPLE_STATS.find(x => x.who === p.id),
        items: items.filter(c => c.who === p.id),
      })).filter(x => x.items.length > 0)
    : Array.from(new Set(items.map(i => i.who))).map(pid => ({
        p: { id: pid, name: personNames[pid] ?? pid.slice(0, 8), role: '', initials: (personNames[pid] ?? '?').slice(0, 2), tone: 'neutral' as const, speakingPct: 0 },
        stats: undefined as typeof PEOPLE_STATS[number] | undefined,
        items: items.filter(c => c.who === pid),
      })).filter(x => x.items.length > 0);

  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '24px 32px 36px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? 16 : 24 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
            承诺 ledger · 跨会议
          </h3>
          {isMock && <MockBadge />}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18, maxWidth: 600 }}>
          每一条行动项都被抽出为可追踪的承诺。谁说的话能当 signal、谁的话需要 discount，这张表会告诉你。
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {byPerson.map(({ p, stats, items }) => (
            <div key={p.id} style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Avatar p={p} size={36} radius={7} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.role}</div>
                </div>
                {stats && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <BigStat label="兑现率" v={Math.round(stats.fulfillment * 100) + '%'} accent />
                    <BigStat label="平均滞后" v={stats.avgLatency} />
                    <div style={{ textAlign: 'right' }}>
                      <MonoMeta>FOLLOW-THROUGH</MonoMeta>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
                        {stats.followThroughGrade}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {items.map((c, i) => {
                  const s = stateStyle[c.state];
                  return (
                    <div key={c.id} style={{
                      display: 'grid', gridTemplateColumns: '88px 1fr 80px 120px 70px',
                      alignItems: 'center', gap: 12, padding: '10px 0',
                      borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                    }}>
                      <MonoMeta>{c.id}</MonoMeta>
                      <div style={{ fontSize: 13, fontFamily: 'var(--serif)', color: 'var(--ink)' }}>{c.what}</div>
                      <div>
                        <div style={{ height: 3, background: 'var(--line-2)', borderRadius: 2 }}>
                          <div style={{ width: `${c.progress * 100}%`, height: '100%', background: s.fg, borderRadius: 2 }} />
                        </div>
                      </div>
                      <MonoMeta>{c.meeting} · {c.due}</MonoMeta>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                        background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, textAlign: 'center',
                      }}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CalloutCard title="这张表的价值">
          决策前看一眼：这个人历史上承诺过 {COMMITMENTS.length} 件事，平均兑现率 76%，滞后中位数 +1.8d。
          <b style={{ color: 'var(--ink)' }}>信号强度 = 发言权重 × 兑现率。</b>
        </CalloutCard>
        <CalloutCard title="批判提醒">
          兑现率 100% 的人未必最可信 —— 可能只承诺了他能轻松完成的事情。配合
          <i> 承诺难度 </i> 维度一起读。
        </CalloutCard>
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 16px' }}>
          <SectionLabel>团队整体</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <StatCell l="团队兑现率" v="76%" />
            <StatCell l="平均滞后" v="+1.8d" />
            <StatCell l="跨会议承诺" v={COMMITMENTS.length} />
            <StatCell l="逾期率" v="13%" />
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── P2 · 角色画像演化 ───────────────────────────────────────────────────────

// LLM 抽出的 role_label 多为英文小写，前端配色表是中文 — 这里映射一次
const ROLE_LABEL_ZH: Record<string, string> = {
  proposer: '提出者', challenger: '质疑者', executor: '执行者',
  decider: '决策者', moderator: '决策者', observer: '旁观者',
  '提出者': '提出者', '质疑者': '质疑者', '执行者': '执行者',
  '决策者': '决策者', '主持者': '决策者', '旁观者': '旁观者',
};

interface TrajectoryRow {
  who: string;            // person id (real uuid 或 mock 'p1')
  name: string;
  role: string | null;
  points: { role: string; m: string }[];   // m = 'YYYY-MM' 或 'M-YYYY-MM'
}

function PTrajectory({ scopeId }: { scopeId: string }) {
  const forceMock = useForceMock();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<TrajectoryRow[]>([]);
  const [isMock, setIsMock] = useState(() => forceMock);
  const [loading, setLoading] = useState(() => !forceMock);

  useEffect(() => {
    if (forceMock || !UUID_RE.test(scopeId)) {
      setRows(PEOPLE_STATS.map(s => ({
        who: s.who, name: P(s.who).name, role: P(s.who).role,
        points: s.roleTrajectory.map(r => ({ role: r.role, m: r.m })),
      })));
      setIsMock(true); setLoading(false);
      return;
    }
    setLoading(true); setIsMock(false);
    let cancelled = false;
    meetingNotesApi.getScopeRoleTrajectory(scopeId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        if (items.length === 0) {
          // API 返回空：降级到 mock 演示数据
          setRows(PEOPLE_STATS.map(s => ({
            who: s.who, name: P(s.who).name, role: P(s.who).role,
            points: s.roleTrajectory.map(r => ({ role: r.role, m: r.m })),
          })));
          setIsMock(true); setLoading(false);
          return;
        }
        const mapped: TrajectoryRow[] = items.map(it => ({
          who: it.person_id,
          name: it.canonical_name,
          role: it.role,
          points: (it.points ?? []).map(p => ({
            role: ROLE_LABEL_ZH[p.role_label] ?? p.role_label,
            m: (p.occurred_at ?? '').slice(0, 7) || '?',
          })),
        }));
        setRows(mapped); setIsMock(false); setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [scopeId, forceMock]);
  if (loading) return <AxisLoadingSkeleton rows={6} />;

  const allMonths = rows.flatMap(r => r.points.map(p => p.m)).sort();
  const monthRange = allMonths.length > 0
    ? `${allMonths[0]} → ${allMonths[allMonths.length - 1]}`
    : '—';

  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '24px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          角色画像演化 · {rows.length} 人
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20, maxWidth: 660 }}>
        每场会议，系统按发言模式把参与者归类到一个功能角色。<i>漂移</i> 本身就是信号：
        一个从"决策者"漂到"质疑者"的人，可能是在主动让位，也可能是在失去主导权。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '200px 1fr 100px', padding: '8px 14px',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          <span>PARTICIPANT</span><span>TRAJECTORY ({monthRange})</span><span style={{ textAlign: 'right' }}>DRIFT</span>
        </div>
        {rows.map(s => {
          const p = isMock ? P(s.who) : { id: s.who, name: s.name, role: s.role ?? '', initials: s.name.slice(0, 2), tone: 'neutral' as const, speakingPct: 0 };
          const drift = s.points.length > 1 && s.points[0].role !== s.points[s.points.length - 1].role;
          return (
            <div key={s.who} style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 100px', alignItems: 'center', gap: 14,
              padding: '14px 14px', background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar p={p} size={28} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
                {s.points.map((r, i) => {
                  const tone = ROLE_TONES[r.role] ?? { bg: 'var(--paper-3)', fg: 'var(--ink-3)' };
                  return (
                    <Fragment key={i}>
                      <div style={{
                        padding: '5px 12px', background: tone.bg, color: tone.fg,
                        fontSize: 12, fontWeight: 600, borderRadius: 5, whiteSpace: 'nowrap',
                        border: `1px solid ${tone.fg}22`,
                      }}>{r.role}</div>
                      {i < s.points.length - 1 && (
                        <div style={{ flex: 1, maxWidth: 60, height: 1.5, background: 'var(--line)', position: 'relative' }}>
                          <div style={{
                            position: 'absolute', left: '50%', top: -7, transform: 'translateX(-50%)',
                            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-4)', whiteSpace: 'nowrap',
                          }}>
                            {s.points[i + 1].m.slice(-5)}
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
                {s.points.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>· 无角色样本</span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                {drift ? <Chip tone="accent">漂移</Chip> : <Chip tone="ghost">稳定</Chip>}
              </div>
            </div>
          );
        })}
      </div>

      {isMock && (
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CalloutCard title="读图示例 · 陈汀" tone="accent">
            提出者 → 质疑者 → <b>决策者</b>。从半年前在提方案，到现在专门做最终拍板。
            <i>团队正在把决策权上收给他</i>，这可能是健康的（抗干扰），也可能是不健康的（单点故障）。
          </CalloutCard>
          <CalloutCard title="读图示例 · Wei Tan" tone="teal">
            决策者 → 质疑者 → 质疑者。过去主导决策，近 4 个月固定在质疑者位置。
            需要问：他是在防守立场、还是在给别人让路？
          </CalloutCard>
        </div>
      )}
    </div>
  );
}

// ── P3 · 发言质量 ───────────────────────────────────────────────────────────

interface SpeechRow { who: string; role?: string; claims: number; speechHighEntropy: number; beingFollowedUp: number; }

function PSpeech({ meetingId }: { meetingId: string }) {
  const forceMock = useForceMock();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<SpeechRow[]>([]);
  const [isMock, setIsMock] = useState(() => forceMock);
  const [loading, setLoading] = useState(() => !forceMock);
  useEffect(() => {
    if (forceMock || !UUID_RE.test(meetingId)) { setRows(PEOPLE_STATS); setIsMock(true); setLoading(false); return; }
    setLoading(true); setIsMock(false);
    let cancelled = false;
    meetingNotesApi.getSpeechMetrics(meetingId)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        const mapped: SpeechRow[] = items.map((it) => ({
          who: pickPerson(it.personId, it.personName),
          role: it.personRole ?? undefined,
          claims: 0,
          speechHighEntropy: Number(it.entropy ?? 0),
          beingFollowedUp: Number(it.followedUp ?? 0),
        }));
        setRows(mapped); setIsMock(false); setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);
  if (loading) return <AxisLoadingSkeleton rows={6} />;

  const max = Math.max(1, ...rows.map(s => s.claims));
  const hasClaims = rows.some(s => s.claims > 0);
  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '24px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          发言质量 ≠ 发言数量
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20, maxWidth: 640 }}>
        信息熵衡量"这句话提供了多少新信息"；被追问率衡量"这句话点燃了多少后续讨论"。
        高熵 + 高追问 = 真正的贡献。发言多但双低的人，可能只是在填充空气。
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
       <div style={{ minWidth: 680 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '220px 1fr 110px 110px 110px',
        padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: 0.3, textTransform: 'uppercase',
      }}>
        <span>PARTICIPANT</span>
        <span>CLAIMS (VOLUME)</span>
        <span style={{ textAlign: 'right' }}>HIGH-ENTROPY %</span>
        <span style={{ textAlign: 'right' }}>FOLLOWED UP</span>
        <span style={{ textAlign: 'right' }}>QUALITY</span>
      </div>
      {rows.map((s, idx) => {
        const p = P(s.who);
        const qualityScore = Math.round((s.speechHighEntropy * 0.6 + (s.beingFollowedUp / 30) * 0.4) * 100);
        return (
          <div key={s.who} style={{
            display: 'grid', gridTemplateColumns: '220px 1fr 110px 110px 110px',
            alignItems: 'center', gap: 12, padding: '12px 14px',
            borderTop: '1px solid var(--line-2)',
            background: idx % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar p={p} size={26} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.role || s.role || ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {hasClaims ? (
                <>
                  <div style={{ flex: 1, maxWidth: 240, height: 8, background: 'var(--line-2)', borderRadius: 2 }}>
                    <div style={{ width: `${(s.claims / max) * 100}%`, height: '100%', background: 'var(--ink-3)', borderRadius: 2 }} />
                  </div>
                  <MonoMeta style={{ width: 28 }}>{s.claims}</MonoMeta>
                </>
              ) : (
                <MonoMeta style={{ color: 'var(--ink-4)' }}>· 后端未提供</MonoMeta>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <EntropyBar v={s.speechHighEntropy} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <MonoMeta style={{ fontSize: 12, color: 'var(--ink)' }}>×{s.beingFollowedUp}</MonoMeta>
            </div>
            <div style={{
              textAlign: 'right', fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600,
              color: qualityScore > 60 ? 'var(--accent)' : 'var(--ink-3)', letterSpacing: '-0.01em',
            }}>
              {qualityScore}
            </div>
          </div>
        );
      })}
       </div>
      </div>

      <div style={{ marginTop: 24, padding: '14px 18px', background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, maxWidth: 720 }}>
        <SectionLabel>批判提醒</SectionLabel>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.65, marginTop: 8, color: 'var(--ink-2)' }}>
          沈岚的发言量最高(51)、质量也最高(65)。但这不是对她的褒奖，而是对团队的
          <b style={{ color: 'var(--accent)' }}>警告</b>：她若离场，信息生产力下降的中位估计是 34%。
          分散信息生产是团队韧性的核心。
        </div>
      </div>
    </div>
  );
}

// ── P4 · 沉默信号 ───────────────────────────────────────────────────────────

function PSilence({ meetingId }: { meetingId: string }) {
  const forceMock = useForceMock();
  const isMobile = useIsMobile();
  const defaultTopics = ['推理层', '训练层', '估值方法', '合规 / LP', '退出路径', '地缘 / 政策', '技术路线'];
  const defaultMatrix = [
    { who: 'p1', vals: ['spoke', 'spoke', 'spoke', 'abnormalSilence', 'spoke', 'normalSilence', 'normalSilence'] },
    { who: 'p2', vals: ['spoke', 'spoke', 'spoke', 'spoke', 'spoke', 'spoke', 'normalSilence'] },
    { who: 'p3', vals: ['spoke', 'spoke', 'spoke', 'abnormalSilence', 'spoke', 'normalSilence', 'spoke'] },
    { who: 'p4', vals: ['spoke', 'normalSilence', 'spoke', 'normalSilence', 'spoke', 'normalSilence', 'normalSilence'] },
    { who: 'p5', vals: ['normalSilence', 'normalSilence', 'abnormalSilence', 'spoke', 'normalSilence', 'normalSilence', 'normalSilence'] },
    { who: 'p6', vals: ['spoke', 'spoke', 'normalSilence', 'abnormalSilence', 'spoke', 'normalSilence', 'normalSilence'] },
  ];
  const [topics, setTopics] = useState(defaultTopics);
  const [matrix, setMatrix] = useState(defaultMatrix);
  const [personNames, setPersonNames] = useState<Record<string, string>>({});
  const [isMock, setIsMock] = useState(() => forceMock);
  const [loading, setLoading] = useState(() => !forceMock);
  // 质量v2 Phase 7 · 保存原始 items 用于"反常沉默"callout 派生
  type SilenceItem = { id: string; person_id: string; topic_id: string; state: string; prior_topics_spoken?: number; anomaly_score?: number; person_name?: string };
  const [silenceItems, setSilenceItems] = useState<SilenceItem[]>([]);

  useEffect(() => {
    if (forceMock) { setTopics(defaultTopics); setMatrix(defaultMatrix); setPersonNames({}); setSilenceItems([]); setIsMock(true); setLoading(false); return; }
    setLoading(true); setIsMock(false);
    let cancelled = false;
    meetingNotesApi.getMeetingSilence(meetingId)
      .then((r) => {
        if (cancelled) return;
        const items = (r?.items ?? []) as SilenceItem[];
        const stateMap: Record<string, string> = {
          'spoke': 'spoke',
          'normal_silence': 'normalSilence',
          'abnormal_silence': 'abnormalSilence',
          'absent': 'absent',
        };
        const topicSet = Array.from(new Set(items.map(i => i.topic_id)));
        const names: Record<string, string> = {};
        const grouped: Record<string, Record<string, string>> = {};
        for (const it of items) {
          if (it.person_name) names[it.person_id] = it.person_name;
          grouped[it.person_id] ??= {};
          grouped[it.person_id][it.topic_id] = stateMap[it.state] ?? 'normalSilence';
        }
        const newMatrix = Object.keys(grouped).map((pid) => ({
          who: pid,
          vals: topicSet.map((t) => grouped[pid][t] ?? 'normalSilence'),
        }));
        setTopics(topicSet); setMatrix(newMatrix); setPersonNames(names);
        setSilenceItems(items);
        setIsMock(false); setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);
  if (loading) return <AxisLoadingSkeleton rows={6} />;
  const cellStyle: Record<string, { bg: string; fg: string; symbol: string; hint: string }> = {
    'spoke':           { bg: 'var(--ink)',        fg: 'var(--paper)',  symbol: '●', hint: '发言' },
    'normalSilence':   { bg: 'var(--paper-3)',    fg: 'var(--ink-4)', symbol: '·', hint: '未涉及 · 符合常态' },
    'abnormalSilence': { bg: 'var(--accent-soft)', fg: 'var(--accent)', symbol: '○', hint: '反常沉默' },
    'absent':          { bg: 'transparent',        fg: 'var(--ink-4)', symbol: '—', hint: '缺席' },
    'silent':          { bg: 'var(--line)',         fg: 'var(--ink-4)', symbol: '·', hint: '' },
  };

  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '24px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          沉默信号 · Silence as signal
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 680 }}>
        {SILENCE_INTRO}
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
      <div style={{ display: 'inline-grid', gridTemplateColumns: `200px repeat(${topics.length}, minmax(70px, 1fr))`, gap: 6, alignItems: 'center', minWidth: `${200 + topics.length * 70}px` }}>
        <div />
        {topics.map(t => (
          <div key={t} style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: '0 4px', lineHeight: 1.3, fontWeight: 500 }}>
            {t}
          </div>
        ))}
        {matrix.map(row => {
          const displayName = personNames[row.who];
          const p = displayName ? { id: row.who, name: displayName, role: '', initials: displayName.slice(0, 2), tone: 'neutral' as const, speakingPct: 0 } : P(row.who);
          return (
            <Fragment key={row.who}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar p={p} size={24} radius={5} />
                <span style={{ fontSize: 12.5 }}>{p.name}</span>
              </div>
              {row.vals.map((v, i) => {
                const s = cellStyle[v];
                return (
                  <div key={i} title={`${p.name} · ${topics[i]} · ${s.hint}`} style={{
                    height: 42, background: s.bg,
                    border: v === 'abnormalSilence' ? '1.5px solid var(--accent)' : '1px solid var(--line-2)',
                    borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: s.fg, fontSize: v === 'abnormalSilence' ? 18 : 14,
                    fontWeight: v === 'spoke' ? 700 : 500, position: 'relative',
                  }}>
                    {s.symbol}
                    {v === 'abnormalSilence' && (
                      <span style={{ position: 'absolute', top: -5, right: -5, width: 8, height: 8, borderRadius: 99, background: 'var(--accent)' }} />
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 18, fontSize: 11.5, color: 'var(--ink-3)' }}>
        <LegendCell cellStyle={cellStyle.spoke} label="发言" />
        <LegendCell cellStyle={cellStyle.normalSilence} label="未涉及 (常态)" />
        <LegendCell cellStyle={cellStyle.abnormalSilence} label="反常沉默" />
      </div>

      <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* 质量v2 Phase 7 · 反常沉默 callout 改派生自 silenceItems */}
        <CalloutCard
          title={`今日反常沉默 · ${isMock ? 3 : silenceItems.filter((it) => it.state === 'abnormal_silence').length} 处`}
          tone="accent"
        >
          {isMock ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <SilenceFinding p={P('p1')} topic="合规 / LP"
                note="过去 4 场合规话题平均发言 5+ 次，今次 0。他可能已在会前与林雾达成默契。" />
              <SilenceFinding p={P('p3')} topic="合规 / LP"
                note="Wei Tan 通常会反问合规的细节，今次未问。疑似回避单笔上限讨论。" />
              <SilenceFinding p={P('p5')} topic="估值方法"
                note="LP 代表第一次在估值议题上表态。需要跟进沟通。" />
            </div>
          ) : (() => {
            const abnormalFindings = silenceItems
              .filter((it) => it.state === 'abnormal_silence')
              .sort((a, b) => Number(b.anomaly_score ?? 0) - Number(a.anomaly_score ?? 0))
              .slice(0, 3);
            if (abnormalFindings.length === 0) {
              return (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
                  本场无反常沉默信号。
                </div>
              );
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {abnormalFindings.map((it) => {
                  const displayName = it.person_name || personNames[it.person_id] || P(it.person_id).name || it.person_id.slice(0, 8);
                  const initials = displayName.slice(0, 2);
                  const synthP = { id: it.person_id, name: displayName, role: '', initials, tone: 'neutral' as const, speakingPct: 0 };
                  const prior = Number(it.prior_topics_spoken ?? 0);
                  const score = Number(it.anomaly_score ?? 0);
                  const note = prior > 0
                    ? `过去 ${prior} 场该议题有发言，本场归零（anomaly=${score.toFixed(2)}）。`
                    : `anomaly_score ${score.toFixed(2)} · 该议题反常沉默。`;
                  return (
                    <SilenceFinding key={it.id} p={synthP} topic={it.topic_id} note={note} />
                  );
                })}
              </div>
            );
          })()}
        </CalloutCard>
        <CalloutCard title="批判：沉默也会误报">
          {SILENCE_FALSE_POSITIVE_CRITIQUE}
        </CalloutCard>
      </div>

      {/* R4 · 改动一：沉默信号 tab 内追加 RASIC 矩阵子段
            (Responsible / Accountable / Support / Informed / Consulted)
          v1 lite：从 mock 派生（spoke→R, abnormalSilence→A, normalSilence→I, absent→—），
          后续可换成 LLM 抽取的真实角色矩阵。 */}
      <RasicMatrixSection topics={topics} matrix={matrix} personNames={personNames} />
    </div>
  );
}

function RasicMatrixSection({ topics, matrix, personNames }: {
  topics: string[];
  matrix: Array<{ who: string; vals: string[] }>;
  personNames: Record<string, string>;
}) {
  // 派生规则（lite v1）：spoke→R, abnormalSilence→A (问责), normalSilence→I, absent→—
  const stateToRasic = (s: string): { code: string; tone: string } => {
    if (s === 'spoke') return { code: 'R', tone: 'oklch(0.40 0.14 160)' };
    if (s === 'abnormalSilence') return { code: 'A', tone: 'oklch(0.42 0.16 25)' };
    if (s === 'normalSilence') return { code: 'I', tone: 'var(--ink-3)' };
    if (s === 'absent') return { code: '—', tone: 'var(--ink-4)' };
    return { code: '·', tone: 'var(--ink-4)' };
  };
  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
        <SectionLabel>RASIC 矩阵</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          (人 × 议题) 角色映射 · v1 lite 派生
        </span>
      </div>
      <div style={{
        background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6,
        padding: '12px 14px', overflow: 'auto',
      }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--mono)' }}>person \ topic</th>
              {topics.map((t) => (
                <th key={t} style={{ padding: '4px 8px', color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                  {t.length > 8 ? t.slice(0, 7) + '…' : t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const name = personNames[row.who] || P(row.who).name;
              return (
                <tr key={row.who}>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{name}</td>
                  {row.vals.map((v, i) => {
                    const r = stateToRasic(v);
                    return (
                      <td key={i} style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, color: r.tone }}>
                        {r.code}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          R = Responsible · A = Accountable · S = Support · I = Informed · C = Consulted
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

const AXIS_PEOPLE_TABS = ['commitments', 'trajectory', 'speech', 'silence', 'belief', 'formation', 'blind_spots', 'manage'] as const;

export function AxisPeople() {
  const [stickyTab, setStickyTab] = useStickyTab('axis.people.tab', 'commitments', AXIS_PEOPLE_TABS);
  const [regenOpen, setRegenOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const forceMock = useForceMock();
  const scope = useMeetingScope();

  // URL params 优先：?scopeId / ?version / ?tab
  const urlScopeId = searchParams.get('scopeId') ?? undefined;
  const urlScopeKind = searchParams.get('scopeKind') ?? undefined;
  const version = searchParams.get('version') ?? undefined;
  const scopeId = urlScopeId ?? scope.effectiveScopeId;
  const scopeKind = urlScopeKind ?? (urlScopeId ? 'project' : scope.kindId === 'all' ? 'project' : scope.kindId);

  // 双向同步 scopeId ↔ URL（ScopePill 切换 → 更新 URL；URL 有 ?scopeId → 同步到 context）
  useScopeUrlSync(setSearchParams, urlScopeId);

  // tab：URL ?tab 优先，写回时同步 URL（replace 不进历史）
  const urlTab = searchParams.get('tab');
  const tab = (urlTab && (AXIS_PEOPLE_TABS as readonly string[]).includes(urlTab)) ? urlTab : stickyTab;
  const setTab = (next: string) => {
    setStickyTab(next);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('tab', next); return n; }, { replace: true });
  };

  // F7 (sibling) · auto-pick scope 下首场会议；URL ?meetingId 优先；否则 fixture
  const [autoMeetingId, setAutoMeetingId] = useState<string | null>(null);
  useEffect(() => {
    if (forceMock || searchParams.get('meetingId') || !UUID_RE.test(scopeId)) { setAutoMeetingId(null); return; }
    let cancelled = false;
    meetingNotesApi
      .listScopeMeetings(scopeId)
      .then((r) => { if (!cancelled) setAutoMeetingId(r?.meetingIds?.[0] ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams, scopeId, forceMock]);
  const meetingId = searchParams.get('meetingId') ?? autoMeetingId ?? MEETING.id;

  // 各 sub-tab 自己拉 live（PTrajectory/PSpeech/PSilence 都内置 live 拉取）
  // 这里只判一次 isMock 给 DimShell 顶部 badge 用
  const [isMock, setIsMock] = useState(() => forceMock);
  useEffect(() => {
    if (forceMock || !UUID_RE.test(meetingId)) { setIsMock(true); return; }
    setIsMock(false);
    let cancelled = false;
    meetingNotesApi.getMeetingAxes(meetingId)
      .then((r) => { if (!cancelled) setIsMock(!r?.people); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);

  // R4 · 改动一：4 → 8 tabs（保留人物管理）
  const tabs = [
    { id: 'commitments', label: '承诺与兑现', sub: '说到做到率 · 跨会议承诺 ledger', icon: 'check' as const },
    { id: 'trajectory',  label: '角色画像演化', sub: '功能角色的漂移 · 提出者 / 质疑者 / 执行者', icon: 'git' as const },
    { id: 'speech',      label: '发言质量',   sub: '信息熵 · 被追问率 · 引用率', icon: 'mic' as const },
    { id: 'silence',     label: '沉默信号 + RASIC', sub: '反常沉默 + (人 × 议题) 角色矩阵', icon: 'wand' as const },
    // R4 · 跨模块下沉
    { id: 'belief',      label: '信念轨迹', sub: '同议题上同人随时间的判断变化 · 来自 longitudinal', icon: 'arrow' as const },
    { id: 'formation',   label: '阵型',     sub: 'CEO War Room · 团队战术编队', icon: 'layers' as const },
    // R4 · 跨轴搬家：cognitive_biases 知识 → 人物
    { id: 'blind_spots', label: '盲区档案', sub: '认知偏差 + 自认矛盾', icon: 'wand' as const },
    // 保留：人物管理（R4 设计原则 #2）
    { id: 'manage',      label: '人物管理',   sub: '改名 · alias 历史映射', icon: 'users' as const },
  ];
  return (
    <>
      <DimShell axis="人物" tabs={tabs} tab={tab} setTab={setTab} onOpenRegenerate={() => setRegenOpen(true)} mock={isMock} version={version}>
        <MeetingPicker
          scopeId={scopeId}
          autoMeetingId={autoMeetingId}
          scopeKind={scopeKind}
          scopeOverridden={!!urlScopeId}
        />
        {tab === 'commitments' && <PCommitments scopeId={scopeId} />}
        {tab === 'trajectory'  && <PTrajectory scopeId={scopeId} />}
        {tab === 'speech'      && <PSpeech meetingId={meetingId} />}
        {tab === 'silence'     && <PSilence meetingId={meetingId} />}
        {/* R4 · 3 个新 tab */}
        {tab === 'belief'      && <BeliefThreadTab scopeId={scopeId} />}
        {tab === 'formation'   && <FormationTab scopeId={scopeId} />}
        {tab === 'blind_spots' && <BlindSpotsTab scopeId={scopeId} />}
        {tab === 'manage'      && <PeopleManage scopeId={scopeId} />}
      </DimShell>
      <RegenerateOverlay open={regenOpen} onClose={() => setRegenOpen(false)}>
        <AxisRegeneratePanel initialAxis="people" currentTab={tab} onClose={() => setRegenOpen(false)} />
      </RegenerateOverlay>
    </>
  );
}

export default AxisPeople;

// ── R4 · 跨模块/跨轴 3 个新 tab 组件 ──────────────────────────────

/** 信念轨迹：从 mn_belief_drift_series 读，与 longitudinal 同源。lite v1 复用 longitudinal API */
function BeliefThreadTab({ scopeId }: { scopeId: string }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!UUID_RE.test(scopeId)) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    meetingNotesApi.getLongitudinal(scopeId, 'belief_drift')
      .then((r) => { if (!cancelled) { setData(r); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scopeId]);
  return (
    <div style={{ padding: isMobile ? '14px 14px' : '24px 28px' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>信念轨迹</h2>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
          mn_belief_drift_series · 与 /meeting/longitudinal?tab=drift 同源
        </span>
      </div>
      {loading && <div style={{ color: 'var(--ink-3)' }}>加载中…</div>}
      {err && <div style={{ color: 'oklch(0.45 0.16 25)' }}>{err}</div>}
      {!loading && !err && (
        <div style={{ background: 'var(--paper-2)', border: '1px dashed var(--line-2)', borderRadius: 6, padding: '16px 18px' }}>
          {data && (Array.isArray(data.series) ? data.series.length : 0) > 0 ? (
            <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>
              {JSON.stringify(data, null, 2).slice(0, 800)}{(JSON.stringify(data).length > 800) ? '\n…' : ''}
            </pre>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              本 scope 暂无信念轨迹数据 · 跑生成中心 → longitudinal/belief_drift 触发
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 阵型：调 CEO War Room API */
function FormationTab({ scopeId }: { scopeId: string }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const url = `/api/v1/ceo/war-room/formation${scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : ''}`;
    fetch(url, { headers: { 'X-API-Key': (import.meta as any).env?.VITE_API_KEY ?? '' } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scopeId]);
  const conflictTemp = data?.conflict_temp;
  const formationData = data?.formation_data;
  return (
    <div style={{ padding: isMobile ? '14px 14px' : '24px 28px' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>阵型</h2>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
          来源 GET /api/v1/ceo/war-room/formation · ceo_formation_snapshots
        </span>
      </div>
      {loading && <div style={{ color: 'var(--ink-3)' }}>加载中…</div>}
      {err && <div style={{ color: 'oklch(0.45 0.16 25)' }}>{err}</div>}
      {!loading && !err && (
        <>
          {conflictTemp !== undefined && conflictTemp !== null && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--ink-2)' }}>
              冲突温度 <strong style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'oklch(0.40 0.14 25)' }}>
                {Number(conflictTemp).toFixed(2)}
              </strong>
            </div>
          )}
          <div style={{ background: 'var(--paper-2)', border: '1px dashed var(--line-2)', borderRadius: 6, padding: '16px 18px' }}>
            {formationData ? (
              <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>
                {JSON.stringify(formationData, null, 2).slice(0, 1200)}
              </pre>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                本 scope 暂无阵型快照 · 在 /ceo/internal/ceo/war-room 触发后回看
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 盲区档案：cognitive_biases + 自认矛盾。scope 下先选人，再拉数据 */
function BlindSpotsTab({ scopeId }: { scopeId: string }) {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const personId = searchParams.get('personId') || '';

  // 人员列表（无 personId 时加载）
  const [people, setPeople] = useState<Array<{ id: string; canonical_name: string; role: string | null; org: string | null }>>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  useEffect(() => {
    if (personId || !scopeId) return;
    let cancelled = false;
    setPeopleLoading(true);
    meetingNotesApi.listScopePeople(scopeId)
      .then((r) => { if (!cancelled) { setPeople(r?.items ?? []); setPeopleLoading(false); } })
      .catch(() => { if (!cancelled) setPeopleLoading(false); });
    return () => { cancelled = true; };
  }, [scopeId, personId]);

  // 当前人物姓名（用于 header 面包屑）
  const selectedName = people.find((p) => p.id === personId)?.canonical_name ?? '';

  const [data, setData] = useState<{ biases: any[]; selfContradictions: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    setLoading(true); setErr(null); setData(null);
    meetingNotesApi.getPersonBlindSpots(personId)
      .then((r) => { if (!cancelled) { setData(r); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [personId]);

  function selectPerson(id: string) {
    setSearchParams((prev) => { prev.set('personId', id); return prev; }, { replace: true });
  }
  function clearPerson() {
    setSearchParams((prev) => { prev.delete('personId'); return prev; }, { replace: true });
  }

  return (
    <div style={{ padding: isMobile ? '14px 14px' : '24px 28px' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>盲区档案</h2>
        {personId && selectedName && (
          <button
            onClick={clearPerson}
            style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← {selectedName}
          </button>
        )}
        {!personId && (
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
            认知偏差 + 自认矛盾派生
          </span>
        )}
      </div>

      {/* 人员选择器：没有 personId 时显示 */}
      {!personId && (
        peopleLoading ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>加载人员列表…</div>
        ) : people.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>该 scope 下暂无人物记录</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPerson(p.id)}
                style={{
                  textAlign: 'left', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
                  borderRadius: 6, padding: '10px 12px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--ink-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line-2)')}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 3 }}>{p.canonical_name}</div>
                {(p.role || p.org) && (
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                    {[p.role, p.org].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        )
      )}

      {personId && loading && <div style={{ color: 'var(--ink-3)' }}>加载中…</div>}
      {personId && err && <div style={{ color: 'oklch(0.45 0.16 25)' }}>{err}</div>}
      {personId && !loading && !err && data && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              认知偏差 · {data.biases.length}
            </div>
            {data.biases.length === 0 ? (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>未识别偏差</div>
            ) : (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.biases.slice(0, 8).map((b: any) => (
                  <div key={b.id} style={{ borderLeft: '2px solid oklch(0.55 0.18 285)', paddingLeft: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <Chip tone={b.severity === 'high' ? 'accent' : b.severity === 'med' ? 'amber' : 'ghost'}>{b.bias_type}</Chip>
                      {b.mitigated && <span style={{ fontSize: 10, color: 'oklch(0.40 0.10 160)' }}>已缓解</span>}
                    </div>
                    {b.where_excerpt && (
                      <div style={{ marginTop: 4, fontSize: 11.5, fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                        "{b.where_excerpt}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              自认矛盾 · {data.selfContradictions.length}
            </div>
            {data.selfContradictions.length === 0 ? (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>同议题上未发现立场翻号</div>
            ) : (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.selfContradictions.slice(0, 8).map((f: any) => (
                  <div key={f.id} style={{ borderLeft: '2px solid oklch(0.55 0.16 75)', paddingLeft: 10 }}>
                    <div style={{ fontSize: 12, fontFamily: 'var(--serif)', color: 'var(--ink-2)' }}>
                      <code style={{ color: 'var(--ink)' }}>{f.topic_id}</code>
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                      {f.from > 0 ? '+' : ''}{Number(f.from).toFixed(2)} → {f.to > 0 ? '+' : ''}{Number(f.to).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── F11 · 人物管理：改名 + alias 历史映射 ──────────────────────────

interface PersonRow {
  id: string;
  canonical_name: string;
  aliases: string[];
  role: string | null;
  org: string | null;
  commitment_count: number;
  updated_at: string;
}

function PeopleManage({ scopeId }: { scopeId: string }) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // F11.1 · merge UI 状态机：
  //   idle → mergeSource selected → mergeTarget selected → preview (dryRun) → confirm → done
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    targetId: string;
    targetName: string;
    sourceName: string;
    refs: Array<{ t: string; n: number }>;
    previewMergedAliases: string[];
  } | null>(null);

  // T2 · AI 画像 modal（基于该人物全部历史会议轨迹喂 LLM 生成）
  const [aiProfileFor, setAiProfileFor] = useState<{ id: string; name: string } | null>(null);

  async function reload() {
    if (!UUID_RE.test(scopeId)) return;
    setRows(null); setErr(null);
    try {
      const r = await meetingNotesApi.listScopePeople(scopeId);
      setRows(r.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopeId]);

  async function startMerge(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    try {
      const r = await meetingNotesApi.mergePeople(targetId, { fromId: sourceId, dryRun: true });
      if (!('dryRun' in r) || !r.dryRun) throw new Error('expected dryRun preview');
      setMergePreview({
        targetId,
        targetName: r.target.canonical_name,
        sourceName: r.source.canonical_name,
        refs: r.refs,
        previewMergedAliases: r.previewMergedAliases,
      });
    } catch (e: any) {
      setToast({ kind: 'err', text: `合并预览失败：${e?.message ?? String(e)}` });
      setMergeSourceId(null);
      setMergePreview(null);
    }
  }

  async function confirmMerge() {
    if (!mergePreview || !mergeSourceId) return;
    setSubmitting(true);
    try {
      const r = await meetingNotesApi.mergePeople(mergePreview.targetId, { fromId: mergeSourceId });
      setSubmitting(false);
      if ('ok' in r && r.ok) {
        const reassigned = r.affected.reduce((s, x) => s + (x.rows_reassigned ?? 0), 0);
        const dropped = r.affected.reduce((s, x) => s + (x.rows_dropped ?? 0), 0) - 1; // -1 减掉 mn_people 那行
        setToast({
          kind: 'ok',
          text: `已合并「${mergePreview.sourceName}」 → 「${mergePreview.targetName}」· 重路由 ${reassigned} 行引用 · 删去 ${Math.max(0, dropped)} 行 UNIQUE 冲突 · target.aliases 现含 ${r.target.aliases.length} 项`,
        });
        setMergeSourceId(null);
        setMergePreview(null);
        reload();
      }
    } catch (e: any) {
      setSubmitting(false);
      setToast({ kind: 'err', text: `合并失败：${e?.message ?? String(e)}` });
    }
    setTimeout(() => setToast(null), 9000);
  }

  async function submitRename() {
    if (!editingId || !editName.trim()) return;
    setSubmitting(true);
    try {
      const r = await meetingNotesApi.renamePerson(editingId, { canonical_name: editName.trim() });
      setSubmitting(false);
      setEditingId(null);
      setEditName('');
      if (r.changed) {
        setToast({
          kind: 'ok',
          text: `已改名「${r.previousName}」 → 「${r.canonical_name}」（旧名进入 aliases，未来 LLM 抽取里若再出现旧名仍能映射到同一人）`,
        });
        reload();
      }
    } catch (e: any) {
      setSubmitting(false);
      const code = e?.code as string | undefined;
      const msg = code === 'CANONICAL_NAME_CONFLICT'
        ? `改名失败：scope 下已存在同名人物。要合并而非改名（合并能力暂未实现）。${e.message}`
        : `改名失败：${e?.message ?? String(e)}`;
      setToast({ kind: 'err', text: msg });
    }
    setTimeout(() => setToast(null), 7000);
  }

  return (
    <div style={{ padding: isMobile ? '14px 14px 24px' : '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          人物管理 · {rows?.length ?? '-'} 人
        </h3>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 18, maxWidth: 720, lineHeight: 1.6 }}>
        点 ✏ 改 canonical_name，旧名自动入 aliases[]。之后 LLM 抽取 / 导入时遇到旧名仍能 dedupe 到同一行（mn_people.aliases ANY 匹配），不会产生重复人物。
      </div>

      {toast && (
        <div style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 5, fontSize: 12.5,
          background: toast.kind === 'ok' ? '#ecfdf5' : '#fef2f2',
          color: toast.kind === 'ok' ? '#065f46' : '#991b1b',
          border: '1px solid ' + (toast.kind === 'ok' ? '#a7f3d0' : '#fecaca'),
        }}>{toast.text}</div>
      )}

      {err && <div style={{ color: '#991b1b', fontSize: 13 }}>加载失败：{err}</div>}
      {!rows && !err && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>载入中…</div>}
      {rows?.length === 0 && (
        <div style={{
          padding: '20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13,
          border: '1px dashed var(--line)', borderRadius: 6,
        }}>
          当前 scope 下还没有任何关联人物。先跑过 LLM 或导入数据后这里会出现。
        </div>
      )}
      {/* 合并模式提示 banner */}
      {mergeSourceId && !mergePreview && (() => {
        const src = rows?.find((p) => p.id === mergeSourceId);
        return (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 5,
            background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe',
            display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5,
          }}>
            <span>🔗 合并模式 · 已选源：<b>{src?.canonical_name}</b> · 现在请点列表中要合并到的目标人物 ↓</span>
            <button
              onClick={() => setMergeSourceId(null)}
              style={{
                marginLeft: 'auto', padding: '4px 10px', borderRadius: 3, fontSize: 11,
                border: '1px solid #93c5fd', background: '#fff', color: '#1e3a8a', cursor: 'pointer',
              }}
            >退出合并模式</button>
          </div>
        );
      })()}

      {rows && rows.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 100px 80px 140px',
          padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
          letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: '1px solid var(--line-2)',
        }}>
          <span>姓名 · 历史别名</span><span>角色</span><span>承诺数</span><span>操作</span>
        </div>
      )}
      {rows?.map((p, i) => {
        const isEditing = editingId === p.id;
        const isMergeSource = mergeSourceId === p.id;
        const isMergeTargetable = mergeSourceId && mergeSourceId !== p.id;
        return (
          <div key={p.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 100px 80px 140px',
            alignItems: 'center', gap: 10, padding: '12px 14px',
            borderBottom: '1px solid var(--line-2)',
            background: isMergeSource
              ? '#fef3c7'
              : isMergeTargetable
              ? '#ecfdf5'
              : i % 2 === 0 ? 'var(--paper-2)' : 'var(--paper)',
            cursor: isMergeTargetable ? 'pointer' : 'default',
          }}
          onClick={() => { if (isMergeTargetable) startMerge(mergeSourceId!, p.id); }}
          >
            <div>
              {isEditing ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingId(null); }}
                    style={{
                      flex: 1, padding: '6px 10px', border: '1px solid var(--accent)',
                      borderRadius: 4, fontSize: 13, fontFamily: 'var(--sans)',
                    }}
                  />
                  <button
                    onClick={submitRename}
                    disabled={submitting || !editName.trim() || editName.trim() === p.canonical_name}
                    style={{
                      padding: '6px 12px', border: '1px solid var(--accent)',
                      background: 'var(--accent)', color: 'var(--paper)', borderRadius: 4,
                      fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
                      opacity: (!editName.trim() || editName.trim() === p.canonical_name) ? 0.5 : 1,
                    }}
                  >{submitting ? '保存中…' : '保存'}</button>
                  <button
                    onClick={() => { setEditingId(null); setEditName(''); }}
                    style={{
                      padding: '6px 10px', border: '1px solid var(--line)', background: 'var(--paper)',
                      color: 'var(--ink-2)', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    }}
                  >取消</button>
                </div>
              ) : (
                <div>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 14.5, fontWeight: 600 }}>{p.canonical_name}</span>
                  {p.aliases && p.aliases.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 8, fontStyle: 'italic' }}>
                      曾用名：{p.aliases.join(' / ')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.role ?? '—'}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)' }}>{p.commitment_count}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {!isEditing && !mergeSourceId && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditName(p.canonical_name); }}
                    title="改名"
                    style={{
                      border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                      padding: '4px 8px', fontSize: 13, cursor: 'pointer', color: 'var(--ink-2)',
                    }}
                  >✏</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMergeSourceId(p.id); }}
                    title="合并到另一个人物"
                    style={{
                      border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                      padding: '4px 8px', fontSize: 13, cursor: 'pointer', color: 'var(--ink-2)',
                    }}
                  >🔗</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setAiProfileFor({ id: p.id, name: p.canonical_name }); }}
                    title="基于该人物历史会议轨迹生成 LLM 画像"
                    style={{
                      border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                      padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-2)',
                      fontFamily: 'var(--mono)', letterSpacing: 0.3,
                    }}
                  >AI</button>
                </>
              )}
              {isMergeSource && (
                <span style={{ fontSize: 11, color: '#92400e', fontFamily: 'var(--mono)' }}>← 源</span>
              )}
              {isMergeTargetable && (
                <span style={{ fontSize: 11, color: '#065f46', fontFamily: 'var(--mono)' }}>点击设为目标</span>
              )}
            </div>
          </div>
        );
      })}

      {/* 合并确认对话框 */}
      {mergePreview && (
        <div
          onClick={() => { setMergePreview(null); setMergeSourceId(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--sans)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--paper)', borderRadius: 10, width: 560, maxHeight: '80vh',
              overflow: 'auto', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.4)',
              border: '2px solid #d97706',
            }}
          >
            <div style={{
              padding: '14px 22px', borderBottom: '1px solid #fde68a',
              background: '#fffbeb', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e' }}>合并人物 · 不可回退</div>
                <MonoMeta style={{ fontSize: 11, color: '#78350f' }}>people.merge · destructive</MonoMeta>
              </div>
            </div>
            <div style={{ padding: '18px 22px', fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)' }}>
              <div style={{ marginBottom: 10 }}>
                即将把 <b>「{mergePreview.sourceName}」</b> 合并到 <b>「{mergePreview.targetName}」</b>。
              </div>
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--paper-2)', borderRadius: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  源在 mn_* 表的引用（合并后将全部 reassign 到目标）：
                </div>
                {mergePreview.refs.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>（源没有任何引用，仅合并 aliases + 删除源行）</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5 }}>
                    {mergePreview.refs.map((r) => (
                      <li key={r.t}><code style={{ fontFamily: 'var(--mono)' }}>{r.t}</code>: <b>{r.n}</b> 行</li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>合并后 target.aliases 预览：</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                  [{mergePreview.previewMergedAliases.map((a) => `"${a}"`).join(', ')}]
                </div>
              </div>
              <div style={{
                padding: '10px 12px', background: '#fef2f2', borderRadius: 5, color: '#991b1b',
                fontSize: 11.5, lineHeight: 1.55,
              }}>
                ⚠ 源行将被永久删除。3 张 UNIQUE 表（role_trajectory / speech_quality / silence_signals）
                若源和目标在同一 meeting 都有行，源的对撞行会被 DELETE（target 胜出）。
                所有操作在 PG 函数内原子完成，任一步失败全 rollback。
              </div>
            </div>
            <div style={{
              padding: '12px 22px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end',
              borderTop: '1px solid var(--line-2)',
            }}>
              <button
                onClick={() => { setMergePreview(null); setMergeSourceId(null); }}
                style={{
                  padding: '8px 16px', border: '1px solid var(--line)', background: 'var(--paper)',
                  color: 'var(--ink-2)', borderRadius: 5, fontSize: 13, cursor: 'pointer',
                }}
              >取消</button>
              <button
                onClick={confirmMerge}
                disabled={submitting}
                style={{
                  padding: '8px 18px', border: '1px solid #92400e',
                  background: submitting ? '#fde68a' : '#d97706',
                  color: 'var(--paper)', borderRadius: 5, fontSize: 13, fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >{submitting ? '合并中…' : '确认合并'}</button>
            </div>
          </div>
        </div>
      )}

      {aiProfileFor && (
        <PersonLLMProfileModal
          personId={aiProfileFor.id}
          personName={aiProfileFor.name}
          scopeId={scopeId}
          onClose={() => setAiProfileFor(null)}
        />
      )}
    </div>
  );
}

