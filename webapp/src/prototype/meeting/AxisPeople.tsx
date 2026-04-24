// AxisPeople.tsx — 人物轴的四个细分维度
// 原型来源：/tmp/mn-proto/dimensions-people.jsx DimensionPeople
// 承诺与兑现 · 角色画像演化 · 发言质量 · 沉默信号

import { useState, Fragment } from 'react';
import { Avatar, Chip, MonoMeta, SectionLabel } from './_atoms';
import { DimShell, CalloutCard, StatCell, BigStat, RegenerateOverlay } from './_axisShared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';
import { PARTICIPANTS, P } from './_fixtures';

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

function PCommitments() {
  const byPerson = PARTICIPANTS.map(p => ({
    p,
    stats: PEOPLE_STATS.find(x => x.who === p.id),
    items: COMMITMENTS.filter(c => c.who === p.id),
  })).filter(x => x.items.length > 0);

  return (
    <div style={{ padding: '24px 32px 36px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
      <div>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
          承诺 ledger · 跨会议
        </h3>
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

function PTrajectory() {
  return (
    <div style={{ padding: '24px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
        角色画像演化 · 6 个月
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20, maxWidth: 660 }}>
        每场会议，系统按发言模式把参与者归类到一个功能角色。半年下来，<i>漂移</i> 本身就是信号：
        一个从"决策者"漂到"质疑者"的人，可能是在主动让位，也可能是在失去主导权。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '200px 1fr 100px', padding: '8px 14px',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          <span>PARTICIPANT</span><span>TRAJECTORY (2025-11 → 2026-04)</span><span style={{ textAlign: 'right' }}>DRIFT</span>
        </div>
        {PEOPLE_STATS.map(s => {
          const p = P(s.who);
          const drift = s.roleTrajectory[0].role !== s.roleTrajectory[s.roleTrajectory.length - 1].role;
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
                {s.roleTrajectory.map((r, i) => {
                  const tone = ROLE_TONES[r.role] ?? { bg: 'var(--paper-3)', fg: 'var(--ink-3)' };
                  return (
                    <Fragment key={i}>
                      <div style={{
                        padding: '5px 12px', background: tone.bg, color: tone.fg,
                        fontSize: 12, fontWeight: 600, borderRadius: 5, whiteSpace: 'nowrap',
                        border: `1px solid ${tone.fg}22`,
                      }}>{r.role}</div>
                      {i < s.roleTrajectory.length - 1 && (
                        <div style={{ flex: 1, maxWidth: 60, height: 1.5, background: 'var(--line)', position: 'relative' }}>
                          <div style={{
                            position: 'absolute', left: '50%', top: -7, transform: 'translateX(-50%)',
                            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-4)', whiteSpace: 'nowrap',
                          }}>
                            {s.roleTrajectory[i + 1].m.slice(5)}
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
              <div style={{ textAlign: 'right' }}>
                {drift ? <Chip tone="accent">漂移</Chip> : <Chip tone="ghost">稳定</Chip>}
              </div>
            </div>
          );
        })}
      </div>

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
    </div>
  );
}

// ── P3 · 发言质量 ───────────────────────────────────────────────────────────

function PSpeech() {
  const max = Math.max(...PEOPLE_STATS.map(s => s.claims));
  return (
    <div style={{ padding: '24px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
        发言质量 ≠ 发言数量
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20, maxWidth: 640 }}>
        信息熵衡量"这句话提供了多少新信息"；被追问率衡量"这句话点燃了多少后续讨论"。
        高熵 + 高追问 = 真正的贡献。发言多但双低的人，可能只是在填充空气。
      </div>

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
      {PEOPLE_STATS.map((s, idx) => {
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
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.role}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, maxWidth: 240, height: 8, background: 'var(--line-2)', borderRadius: 2 }}>
                <div style={{ width: `${(s.claims / max) * 100}%`, height: '100%', background: 'var(--ink-3)', borderRadius: 2 }} />
              </div>
              <MonoMeta style={{ width: 28 }}>{s.claims}</MonoMeta>
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

function PSilence() {
  const topics = ['推理层', '训练层', '估值方法', '合规 / LP', '退出路径', '地缘 / 政策', '技术路线'];
  const matrix = [
    { who: 'p1', vals: ['spoke', 'spoke', 'spoke', 'abnormalSilence', 'spoke', 'normalSilence', 'normalSilence'] },
    { who: 'p2', vals: ['spoke', 'spoke', 'spoke', 'spoke', 'spoke', 'spoke', 'normalSilence'] },
    { who: 'p3', vals: ['spoke', 'spoke', 'spoke', 'abnormalSilence', 'spoke', 'normalSilence', 'spoke'] },
    { who: 'p4', vals: ['spoke', 'normalSilence', 'spoke', 'normalSilence', 'spoke', 'normalSilence', 'normalSilence'] },
    { who: 'p5', vals: ['normalSilence', 'normalSilence', 'abnormalSilence', 'spoke', 'normalSilence', 'normalSilence', 'normalSilence'] },
    { who: 'p6', vals: ['spoke', 'spoke', 'normalSilence', 'abnormalSilence', 'spoke', 'normalSilence', 'normalSilence'] },
  ];
  const cellStyle: Record<string, { bg: string; fg: string; symbol: string; hint: string }> = {
    'spoke':           { bg: 'var(--ink)',        fg: 'var(--paper)',  symbol: '●', hint: '发言' },
    'normalSilence':   { bg: 'var(--paper-3)',    fg: 'var(--ink-4)', symbol: '·', hint: '未涉及 · 符合常态' },
    'abnormalSilence': { bg: 'var(--accent-soft)', fg: 'var(--accent)', symbol: '○', hint: '反常沉默' },
    'absent':          { bg: 'transparent',        fg: 'var(--ink-4)', symbol: '—', hint: '缺席' },
    'silent':          { bg: 'var(--line)',         fg: 'var(--ink-4)', symbol: '·', hint: '' },
  };

  return (
    <div style={{ padding: '24px 32px 36px' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.005em' }}>
        沉默信号 · Silence as signal
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 680 }}>
        反常的沉默 = 这个议题他过去总会参与，但这次没有。可能是让步、回避、不适、不同意却不便说。
        <b> 最危险的信息往往藏在没说的话里。</b>
      </div>

      <div style={{ display: 'inline-grid', gridTemplateColumns: `200px repeat(${topics.length}, 1fr)`, gap: 6, alignItems: 'center', maxWidth: '100%' }}>
        <div />
        {topics.map(t => (
          <div key={t} style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: '0 4px', lineHeight: 1.3, fontWeight: 500 }}>
            {t}
          </div>
        ))}
        {matrix.map(row => {
          const p = P(row.who);
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

      <div style={{ display: 'flex', gap: 14, marginTop: 18, fontSize: 11.5, color: 'var(--ink-3)' }}>
        <LegendCell cellStyle={cellStyle.spoke} label="发言" />
        <LegendCell cellStyle={cellStyle.normalSilence} label="未涉及 (常态)" />
        <LegendCell cellStyle={cellStyle.abnormalSilence} label="反常沉默" />
      </div>

      <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CalloutCard title="今日反常沉默 · 3 处" tone="accent">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <SilenceFinding p={P('p1')} topic="合规 / LP"
              note="过去 4 场合规话题平均发言 5+ 次，今次 0。他可能已在会前与林雾达成默契。" />
            <SilenceFinding p={P('p3')} topic="合规 / LP"
              note="Wei Tan 通常会反问合规的细节，今次未问。疑似回避单笔上限讨论。" />
            <SilenceFinding p={P('p5')} topic="估值方法"
              note="LP 代表第一次在估值议题上表态。需要跟进沟通。" />
          </div>
        </CalloutCard>
        <CalloutCard title="批判：沉默也会误报">
          不是所有沉默都值得深究。需要和<i>议程优先级、发言机会窗口</i>一起看 ——
          如果议题只谈了 3 分钟，没人来得及说话，那不是信号，那是噪声。
        </CalloutCard>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function AxisPeople() {
  const [tab, setTab] = useState('commitments');
  const [regenOpen, setRegenOpen] = useState(false);
  const tabs = [
    { id: 'commitments', label: '承诺与兑现', sub: '说到做到率 · 跨会议承诺 ledger', icon: 'check' as const },
    { id: 'trajectory',  label: '角色画像演化', sub: '功能角色的漂移 · 提出者 / 质疑者 / 执行者', icon: 'git' as const },
    { id: 'speech',      label: '发言质量',   sub: '信息熵 · 被追问率 · 引用率', icon: 'mic' as const },
    { id: 'silence',     label: '沉默信号',   sub: '谁在什么议题上反常沉默', icon: 'wand' as const },
  ];
  return (
    <>
      <DimShell axis="人物" tabs={tabs} tab={tab} setTab={setTab} onOpenRegenerate={() => setRegenOpen(true)}>
        {tab === 'commitments' && <PCommitments />}
        {tab === 'trajectory'  && <PTrajectory />}
        {tab === 'speech'      && <PSpeech />}
        {tab === 'silence'     && <PSilence />}
      </DimShell>
      <RegenerateOverlay open={regenOpen} onClose={() => setRegenOpen(false)}>
        <AxisRegeneratePanel initialAxis="people" onClose={() => setRegenOpen(false)} />
      </RegenerateOverlay>
    </>
  );
}

export default AxisPeople;
