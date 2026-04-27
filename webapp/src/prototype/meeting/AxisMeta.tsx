// AxisMeta.tsx — 会议本身轴（Meeting-as-object 维度）
// 原型来源：/tmp/mn-proto/dimensions-meta.jsx DimensionMeta
// 决策质量打分 · 必要性审计 · 情绪温度曲线

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chip, MonoMeta, StatTile, MockBadge } from './_atoms';
import { DimShell, CalloutCard, RegenerateOverlay } from './_axisShared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';
import { MEETING } from './_fixtures';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import { useMeetingScope } from './_scopeContext';

// ── Mock data ───────────────────────────────────────────────────────────────

const DECISION_QUALITY = {
  overall: 0.71,
  dims: [
    { id: 'clarity',     label: '清晰度', score: 0.82, note: '上限、资金曲线、交付时点均明确' },
    { id: 'actionable',  label: '可执行', score: 0.88, note: '3 条 action items 附 owner + due' },
    { id: 'traceable',   label: '可追溯', score: 0.65, note: '关键假设未被充分暴露' },
    { id: 'falsifiable', label: '可证伪', score: 0.52, note: '缺少失败条件与回看时点' },
    { id: 'aligned',     label: '对齐度', score: 0.68, note: 'D1 分歧以妥协收尾，非真正对齐' },
  ],
};

const NECESSITY = {
  verdict: '可缩减至 60 分钟',
  score: 0.64,
  reasons: [
    { k: '只读汇报段', t: '前 18 分钟为周报回顾，应前置为异步文档' },
    { k: '重复共识',   t: 'C1「AI 基础设施主航道」在过去 3 场已达成，无需重开' },
    { k: '信息不对称', t: 'p5 / p6 旁听无发言需求的 22 分钟可剪除' },
    { k: '值得保留',   t: '第 39-74 分钟的辩论是本场唯一不可替代的部分' },
  ],
};

const EMOTION_CURVE = [
  { t: 0,   v: 0.2,  i: 0.3,  tag: '开场 · 平和' },
  { t: 18,  v: 0.1,  i: 0.2 },
  { t: 30,  v: 0.2,  i: 0.5 },
  { t: 38,  v: -0.3, i: 0.75, tag: '张力 T1 起点' },
  { t: 42,  v: -0.55, i: 0.92, tag: '最激烈 · 沈岚 vs Wei Tan' },
  { t: 50,  v: -0.35, i: 0.65 },
  { t: 55,  v: -0.2, i: 0.5,  tag: '林雾 介入' },
  { t: 62,  v: 0.0,  i: 0.4 },
  { t: 74,  v: 0.3,  i: 0.55, tag: 'N3 更新 · 温度回暖' },
  { t: 88,  v: 0.25, i: 0.35 },
  { t: 108, v: 0.45, i: 0.6,  tag: '决议达成' },
  { t: 118, v: 0.4,  i: 0.3,  tag: '收尾' },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function Quality({ meetingId }: { meetingId: string }) {
  const forceMock = useForceMock();
  const [d, setD] = useState(DECISION_QUALITY);
  const [teamAvg, setTeamAvg] = useState<number | null>(null);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setD(DECISION_QUALITY); setTeamAvg(null); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getDecisionQuality(meetingId)
      .then((r) => {
        if (cancelled || !r) return;
        setD({
          overall: Number(r.overall ?? 0),
          dims: (r.dims ?? []).map(x => ({ id: x.id, label: x.label, score: Number(x.score ?? 0), note: x.note ?? '' })),
        });
        setTeamAvg(r.teamAvg != null ? Number(r.teamAvg) : null);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          决策质量打分 · Decision quality
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        一场会议的产出是一个<b>决议对象</b> —— 它可以被打分。本场决议在「可证伪性」上失分显著。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 22 }}>
        <div style={{
          background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 8,
          padding: '20px 22px', textAlign: 'center',
        }}>
          <MonoMeta>OVERALL</MonoMeta>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 64, fontWeight: 500, letterSpacing: '-0.03em', margin: '6px 0', color: 'var(--ink)' }}>
            {d.overall.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>团队 6 场均值 {teamAvg != null ? teamAvg.toFixed(2) : '0.68'}</div>
          <div style={{ marginTop: 16, height: 1, background: 'var(--line-2)' }} />
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, fontFamily: 'var(--serif)', textAlign: 'left' }}>
            建议：在决议文里追加<b>失败条件</b>（若 Q3 recheck 时 X 成立则回滚）与<b>回看时点</b>。
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {d.dims.map(x => (
            <div key={x.id} style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>{x.label}</span>
                <MonoMeta style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>
                  {x.score.toFixed(2)}
                </MonoMeta>
              </div>
              <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${x.score * 100}%`, height: '100%',
                  background: x.score > 0.75 ? 'oklch(0.6 0.1 140)' : x.score > 0.6 ? 'var(--amber)' : 'var(--accent)',
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{x.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Necessity({ meetingId }: { meetingId: string }) {
  const forceMock = useForceMock();
  const [n, setN] = useState(NECESSITY);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setN(NECESSITY); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getMeetingNecessityAudit(meetingId)
      .then((r) => {
        if (cancelled || !r) return;
        const verdictMap: Record<string, string> = {
          'async_ok': '可完全异步处理',
          'partial': '可部分异步 · 建议缩减',
          'needed': '必须同步讨论',
        };
        setN({
          verdict: verdictMap[r.verdict] ?? r.verdict,
          score: r.suggested_duration_min != null ? Math.max(0, Math.min(1, 1 - r.suggested_duration_min / 120)) : NECESSITY.score,
          reasons: (r.reasons ?? []).map((x: { k?: string; t?: string }) => ({
            k: String(x.k ?? '段落'),
            t: String(x.t ?? ''),
          })),
        });
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);

  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          会议必要性审计 · Necessity audit
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        这场会议是否本可用文档替代？哪些段落是不可替代的、哪些是仪式性冗余？
      </div>
      <div style={{
        background: 'var(--accent-soft)', border: '1px solid oklch(0.85 0.07 40)', borderRadius: 6,
        padding: '18px 22px', marginBottom: 22,
        display: 'grid', gridTemplateColumns: '1fr 160px', gap: 18, alignItems: 'center',
      }}>
        <div>
          <MonoMeta style={{ color: 'oklch(0.4 0.1 40)' }}>VERDICT</MonoMeta>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, marginTop: 4, color: 'oklch(0.28 0.1 40)', letterSpacing: '-0.01em' }}>
            {n.verdict}
          </div>
          <div style={{ fontSize: 12.5, color: 'oklch(0.35 0.08 40)', marginTop: 6 }}>
            当前 118 分钟 → 建议 60 分钟 · 节省 49%
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', color: 'oklch(0.3 0.1 40)' }}>
            {n.score.toFixed(2)}
          </div>
          <div style={{ fontSize: 10.5, color: 'oklch(0.4 0.1 40)' }}>必要性评分</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {n.reasons.map((r, i) => (
          <div key={i} style={{
            background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 5,
            padding: '12px 16px', display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'center',
          }}>
            <Chip tone={r.k === '值得保留' ? 'teal' : 'ghost'}>{r.k}</Chip>
            <div style={{ fontSize: 12.5, color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: 1.55 }}>{r.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type EmotionPoint = typeof EMOTION_CURVE[number];

function Emotion({ meetingId }: { meetingId: string }) {
  const forceMock = useForceMock();
  const [curve, setCurve] = useState<EmotionPoint[]>([]);
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setCurve(EMOTION_CURVE); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getMeetingEmotionCurve(meetingId)
      .then((r) => {
        if (cancelled || !r) return;
        const samples = r.samples ?? [];
        const valid = samples.filter((s) => s.t_sec != null);
        const mapped: EmotionPoint[] = valid.map((s) => ({
          t: Math.round(Number(s.t_sec) / 60),
          v: Number(s.valence ?? 0),
          i: Number(s.intensity ?? 0),
          tag: s.tag,
        }));
        setCurve(mapped);
        setIsMock(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);

  const W = 900, H = 280, PAD = 40;
  const maxT = Math.max(60, ...curve.map(p => p.t));
  const xFor = (t: number) => PAD + (t / maxT) * (W - PAD * 2);
  const yFor = (v: number) => H / 2 - v * (H / 2 - PAD);
  const sizeFor = (i: number) => 3 + i * 8;
  return (
    <div style={{ padding: '22px 32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          情绪温度曲线 · Affective trace
        </h3>
        {isMock && <MockBadge />}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 700 }}>
        时间轴上的<b>情绪价 × 强度</b>。负值 = 紧张 / 争执；正值 = 松弛 / 认同。点大小 = 强度。
      </div>
      <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '18px', overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={PAD - 6} y={PAD + 4} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)" textAnchor="end">+1 松弛</text>
          <text x={PAD - 6} y={H - PAD + 8} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)" textAnchor="end">-1 紧张</text>
          {[0, 30, 60, 90, 118].map(m => (
            <g key={m}>
              <line x1={xFor(m)} x2={xFor(m)} y1={H / 2 - 4} y2={H / 2 + 4} stroke="var(--line)" />
              <text x={xFor(m)} y={H - 6} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-4)">{m}m</text>
            </g>
          ))}
          <path
            d={curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.t)} ${yFor(p.v)}`).join(' ')}
            fill="none" stroke="var(--accent)" strokeWidth="1.8" opacity="0.8"
          />
          {curve.map((p, i) => (
            <g key={i}>
              <circle cx={xFor(p.t)} cy={yFor(p.v)} r={sizeFor(p.i)}
                fill={p.v < 0 ? 'oklch(0.6 0.14 30 / 0.75)' : 'oklch(0.7 0.11 140 / 0.7)'}
                stroke="var(--paper)" strokeWidth="1.5" />
              {p.tag && (
                <text x={xFor(p.t)} y={yFor(p.v) + (p.v < 0 ? -14 : 22)}
                  textAnchor="middle" fontSize="10" fontFamily="var(--sans)"
                  fill="var(--ink-2)" fontWeight="500">{p.tag}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
        {(() => {
          if (curve.length === 0) {
            return (
              <>
                <StatTile label="最低温" value="—" sub="无数据" tone="accent" />
                <StatTile label="最高温" value="—" sub="无数据" tone="teal" />
                <StatTile label="转折点数" value="0" sub="无数据" />
              </>
            );
          }
          const lo = curve.reduce((a, p) => (p.v < a.v ? p : a), curve[0]);
          const hi = curve.reduce((a, p) => (p.v > a.v ? p : a), curve[0]);
          const tagged = curve.filter((p) => p.tag);
          const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
          return (
            <>
              <StatTile label="最低温" value={fmt(lo.v)} sub={`第 ${lo.t} 分钟${lo.tag ? ` · ${lo.tag}` : ''}`} tone="accent" />
              <StatTile label="最高温" value={fmt(hi.v)} sub={`第 ${hi.t} 分钟${hi.tag ? ` · ${hi.tag}` : ''}`} tone="teal" />
              <StatTile label="转折点数" value={String(tagged.length)} sub={tagged.slice(0, 3).map((p) => p.tag).filter(Boolean).join(' · ') || '无标记'} />
            </>
          );
        })()}
      </div>

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CalloutCard title="第 42 分钟 · 全场最高张力" tone="accent">
          沈岚与 Wei Tan 的直接交锋。情绪强度 0.92 是本场最高值。这段对话产生了唯一一次真正的认知更新（N3）——
          <i>紧张不一定有害，压制紧张才有害</i>。
        </CalloutCard>
        <CalloutCard title="批判：情绪曲线的局限">
          本曲线基于语音特征与用词分析，无法捕捉<i>非语言信号</i>（停顿、肢体、沉默）。
          当曲线显示平静时，可能只是争议转移到了线下。
        </CalloutCard>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function AxisMeta() {
  const [tab, setTab] = useState('quality');
  const [regenOpen, setRegenOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const scope = useMeetingScope();
  const forceMock = useForceMock();
  // 解析顺序：URL ?meetingId 显式指定 → 当前 scope 下首场会议（API 拉取）→ fixture
  const [autoMeetingId, setAutoMeetingId] = useState<string | null>(null);
  useEffect(() => {
    if (forceMock || searchParams.get('meetingId')) { setAutoMeetingId(null); return; }
    let cancelled = false;
    meetingNotesApi
      .listScopeMeetings(scope.effectiveScopeId)
      .then((r) => { if (!cancelled) setAutoMeetingId(r?.meetingIds?.[0] ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams, scope.effectiveScopeId, forceMock]);
  const meetingId = searchParams.get('meetingId') ?? autoMeetingId ?? MEETING.id;
  const [isMock, setIsMock] = useState(true);
  useEffect(() => {
    if (forceMock) { setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.getMeetingAxes(meetingId)
      .then((r) => { if (!cancelled && r) setIsMock(false); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [meetingId, forceMock]);
  const tabs = [
    { id: 'quality',   label: '决策质量',   sub: '5 维打分 · 可证伪度最低',  icon: 'scale' as const },
    { id: 'necessity', label: '会议必要性', sub: '本场可缩减 58 分钟',        icon: 'clock' as const },
    { id: 'emotion',   label: '情绪温度',   sub: '时间 × 情绪 × 强度',        icon: 'bolt' as const },
  ];
  return (
    <>
      <DimShell axis="会议本身" tabs={tabs} tab={tab} setTab={setTab} onOpenRegenerate={() => setRegenOpen(true)} mock={isMock}>
        {tab === 'quality'   && <Quality meetingId={meetingId} />}
        {tab === 'necessity' && <Necessity meetingId={meetingId} />}
        {tab === 'emotion'   && <Emotion meetingId={meetingId} />}
      </DimShell>
      <RegenerateOverlay open={regenOpen} onClose={() => setRegenOpen(false)}>
        <AxisRegeneratePanel initialAxis="meta" onClose={() => setRegenOpen(false)} />
      </RegenerateOverlay>
    </>
  );
}

export default AxisMeta;
