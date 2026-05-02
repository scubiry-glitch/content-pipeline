// GenerationCenter — 生成中心
// 原型来源：/tmp/mn-proto/axis-regenerate.jsx GenerationCenter

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, Chip, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';
import { useMeetingScope } from './_scopeContext';

// ── Mock data ────────────────────────────────────────────────────────────────
// R3-A · 改动五：AXIS_SUB 改为从 _axisRegistry 共享，避免与 NewMeeting / Panorama 双写
import { AXIS_SUB } from './_axisRegistry';
// R5 · 粒度 1：sub_dim → 主驱动 tab 反向表（panel 已建好，复用避免双写）
import { SUB_AFFECTS, AXIS_SHORT_LABEL } from './AxisRegeneratePanel';

interface MockRun {
  id: string;
  // F5 · 加 'succeeded' / 'cancelled' 对齐后端 mn_runs.state 真实取值；
  //      之前只有 'done'，把后端的 'succeeded' 强转过来后 counts.done filter 永远 0
  state: 'running' | 'queued' | 'succeeded' | 'done' | 'failed' | 'cancelled';
  axis: string;
  subs: string[];
  preset: string;
  scope: string;
  scopeLabel: string;
  started: string;
  eta: string;
  pct: number;
  triggeredBy: string;
  cost: string;
  version?: string;
  // R3-B · DAG 字段（后端 mn_runs 新增列）；老 run 取 NULL
  stage?: 'L1_meeting' | 'L2_aggregate' | null;
  dependsOn?: string[];
  triggerMeetingId?: string;
  // 透传后端 module/prism 用于展开面板的上下文标签（CEO run 时显示棱镜名）
  module?: string;
  prism?: string;
  // R5 · 粒度 1：per-axis 聚合统计（含 subDimStats per-sub_dim 计数）
  axisStats?: Record<string, {
    durationMs?: number;
    subDimCount?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
    parseFailures?: number;
    subDimStats?: Record<string, {
      created: number; updated: number; skipped: number; errors: number;
      parseFailures: number;
      errorSamples?: Array<{ kind: string; message: string; excerpt?: string }>;
    }>;
  }>;
}

const MOCK_RUNS: MockRun[] = [
  // R3-B · 新 mock：体现 L1 → L2 链路
  { id: 'run-241', state: 'running', axis: 'meta',      subs: ['decision_quality','meeting_necessity','affect_curve'], preset: 'standard', scope: 'meeting', scopeLabel: 'M-2026-04-11', started: '09:38:00', eta: '预计 1m 20s', pct: 64, triggeredBy: 'auto · 新会议入库', cost: '~6k tok',  stage: 'L1_meeting',   triggerMeetingId: 'M-2026-04-11' },
  { id: 'run-240', state: 'queued',  axis: 'people',    subs: ['commitments','role_trajectory'],                       preset: 'standard', scope: 'project', scopeLabel: 'AI 基础设施 · Q2', started: '09:38:01', eta: '等待 L1 (run-241)', pct: 0, triggeredBy: 'cascade',          cost: '~10k tok', stage: 'L2_aggregate', dependsOn: ['run-241'], triggerMeetingId: 'M-2026-04-11' },
  { id: 'run-239', state: 'queued',  axis: 'knowledge', subs: ['mental_models','model_hitrate'],                       preset: 'standard', scope: 'project', scopeLabel: 'AI 基础设施 · Q2', started: '09:38:02', eta: '等待 L1 (run-241)', pct: 0, triggeredBy: 'cascade',          cost: '~12k tok', stage: 'L2_aggregate', dependsOn: ['run-241'], triggerMeetingId: 'M-2026-04-11' },
  // 老 mock 保留（stage=NULL 的兼容路径）
  { id: 'run-237', state: 'running', axis: 'knowledge', subs: ['mental_models','cognitive_biases'],         preset: 'standard', scope: 'project', scopeLabel: 'AI 基础设施 · Q2',   started: '09:41:22', eta: '预计 1m 40s',             pct: 48,  triggeredBy: 'auto · 新增 1 场会议', cost: '~16k tok' },
  { id: 'run-236', state: 'queued',  axis: 'people',    subs: ['commitments','silence_signal'],            preset: 'standard', scope: 'project', scopeLabel: 'AI 基础设施 · Q2',   started: '09:42:11', eta: '排队中 · 前面 1 个',        pct: 0,   triggeredBy: 'auto',                 cost: '~10k tok' },
  { id: 'run-235', state: 'done',    axis: 'people',    subs: ['commitments','role_trajectory','speech_quality'],  preset: 'standard', scope: 'library', scopeLabel: '全库 48 meetings',  started: '08:03:14', eta: '用时 4m 18s',               pct: 100, triggeredBy: 'manual · 陈汀',        cost: '42k tok',  version: 'v14',
    axisStats: { people: { subDimStats: {
      commitments:     { created: 18, updated: 3, skipped: 0, errors: 0, parseFailures: 0 },
      role_trajectory: { created:  9, updated: 2, skipped: 0, errors: 0, parseFailures: 0 },
      speech_quality:  { created: 11, updated: 0, skipped: 1, errors: 0, parseFailures: 0 },
    } } },
  },
  { id: 'run-234', state: 'done',    axis: 'knowledge', subs: ['mental_models'],                            preset: 'max',      scope: 'library', scopeLabel: '全库 48 meetings',  started: '昨天 22:11',eta: '用时 11m 04s',              pct: 100, triggeredBy: 'schedule · 月度',      cost: '88k tok',  version: 'v8',
    axisStats: { knowledge: { subDimStats: {
      mental_models: { created: 24, updated: 5, skipped: 0, errors: 0, parseFailures: 1 },
    } } },
  },
  { id: 'run-233', state: 'failed',  axis: 'projects',  subs: ['decision_provenance'],                      preset: 'max',      scope: 'library', scopeLabel: '全库 48 meetings',  started: '昨天 21:02',eta: '失败 · evidence_anchored 未命中', pct: 34, triggeredBy: 'manual',            cost: '12k tok',
    axisStats: { projects: { subDimStats: {
      decision_provenance: { created: 0, updated: 0, skipped: 0, errors: 1, parseFailures: 0,
        errorSamples: [{ kind: 'parse', message: 'evidence_anchored decorator 未命中：scope 下没有 mn_evidence_grades 数据；先跑 evidence_grading 再重试' }] },
    } } },
  },
  { id: 'run-232', state: 'done',    axis: 'knowledge', subs: ['mental_models','cognitive_biases','counterfactuals'],preset: 'standard', scope: 'project', scopeLabel: '消费硬件 · H1',     started: '2 天前',    eta: '用时 2m 50s',               pct: 100, triggeredBy: 'auto',                 cost: '21k tok',  version: 'v12',
    axisStats: { knowledge: { subDimStats: {
      mental_models:    { created: 6, updated: 2, skipped: 0, errors: 0, parseFailures: 0 },
      cognitive_biases: { created: 4, updated: 0, skipped: 0, errors: 0, parseFailures: 0 },
      counterfactuals:  { created: 3, updated: 1, skipped: 0, errors: 0, parseFailures: 0 },
    } } },
  },
];

const MOCK_VERSIONS = [
  { v: 'v14', axis: 'people · 承诺兑现', when: '今天 08:03', preset: 'standard', scope: 'library', diff: '+3 verified · -1 failed · 1 new at-risk' },
  { v: 'v13', axis: 'people · 承诺兑现', when: '昨天 07:45', preset: 'standard', scope: 'library', diff: '+2 verified · 0 failed' },
  { v: 'v12', axis: 'people · 承诺兑现', when: '3 天前',     preset: 'lite',     scope: 'library', diff: '+1 verified · 1 failed' },
  { v: 'v11', axis: 'people · 承诺兑现', when: '1 周前',     preset: 'standard', scope: 'library', diff: '初次全量' },
];

const MOCK_SCHEDULES = [
  // R3-B · 用 DAG 词汇刷新文案：体现 L1 体征 + L2 聚合 的两层调度
  { id: 's1', name: '每次会议上传后',       target: 'meeting · L1 体征(meta+tension) → L2 三轴(people/projects/knowledge) · standard', next: 'auto · DAG trigger', on: true  },
  { id: 's2', name: '每周一 09:00',          target: 'project · L2 知识轴 · max',      next: '下周一 09:00',   on: true  },
  { id: 's3', name: '每月 1 号 02:00',       target: 'library · L2 全轴 · standard',   next: '05-01 02:00',    on: true  },
  { id: 's4', name: '每季度 · 团队能力盘点', target: 'library · L2 知识轴 · max',      next: '2026-07-01',     on: false },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function mapApiRun(it: Record<string, unknown>): MockRun {
  const sub = (it.subDims as string[] | undefined) ?? [];
  // Phase 15.6 · tokens/cost 适配 · 兼容老 response (tokens: number) 与新 response (tokens: {input,output} + costUsd)
  const tokObj = it.tokens as (number | { input?: number; output?: number } | undefined);
  const costUsd = it.costUsd as (number | undefined);
  let costStr: string;
  if (costUsd != null) {
    const sumTok = typeof tokObj === 'object' && tokObj ? (Number(tokObj.input ?? 0) + Number(tokObj.output ?? 0)) : null;
    costStr = sumTok != null ? `${Math.round(sumTok / 1000)}k tok · $${costUsd.toFixed(2)}` : `$${costUsd.toFixed(2)}`;
  } else if (it.cost != null) {
    costStr = String(it.cost);
  } else if (typeof tokObj === 'object' && tokObj) {
    const sumTok = Number(tokObj.input ?? 0) + Number(tokObj.output ?? 0);
    costStr = `${Math.round(sumTok / 1000)}k tok`;
  } else if (typeof tokObj === 'number') {
    costStr = `${Math.round(tokObj / 1000)}k tok`;
  } else {
    costStr = '—';
  }
  // 后端 RunRecord 把 scope 包在 { kind, id } 对象里；兼容 mock 的平铺字段
  const scopeObj = (typeof it.scope === 'object' && it.scope !== null) ? (it.scope as Record<string, unknown>) : null;
  const scopeKindResolved = (it.scopeKind as string | undefined)
    ?? scopeObj?.kind as string | undefined
    ?? (typeof it.scope === 'string' ? it.scope : undefined)
    ?? 'project';
  const scopeIdResolved = (it.scopeId as string | undefined) ?? scopeObj?.id as string | undefined;
  return {
    id: String(it.id ?? ''),
    state: (it.state as MockRun['state']) ?? 'queued',
    axis: String(it.axis ?? ''),
    subs: sub,
    preset: String(it.preset ?? 'standard'),
    scope: scopeKindResolved,
    scopeLabel: String(it.scopeLabel ?? scopeIdResolved ?? ''),
    started: String(it.startedAt ?? it.started ?? ''),
    eta: String(it.eta ?? (it.state === 'done' ? '已完成' : '')),
    pct: Number(it.progress ?? it.pct ?? 0),
    triggeredBy: String(it.triggeredBy ?? ''),
    cost: costStr,
    version: (it.version as string | undefined),
    // R3-B · DAG 字段透传（后端 mn_runs.stage / depends_on / trigger_meeting_id）
    stage: (it.stage === 'L1_meeting' || it.stage === 'L2_aggregate') ? it.stage : null,
    dependsOn: Array.isArray(it.dependsOn) ? (it.dependsOn as string[]) : (Array.isArray(it.depends_on) ? (it.depends_on as string[]) : []),
    triggerMeetingId: typeof it.triggerMeetingId === 'string' ? it.triggerMeetingId : (typeof it.trigger_meeting_id === 'string' ? it.trigger_meeting_id : undefined),
    // R5 · 粒度 1：从 surfaces.axisStats 透出 per-sub_dim 计数（后端 mapRun 已写）
    axisStats: (it.surfaces?.axisStats ?? it.metadata?.axisStats ?? undefined) as MockRun['axisStats'],
    module: typeof it.module === 'string' ? it.module : undefined,
    // CEO 棱镜名常存于 metadata.prism 或顶层 prism；两条路径都吃
    prism: typeof it.prism === 'string'
      ? it.prism
      : (typeof (it.metadata as any)?.prism === 'string' ? (it.metadata as any).prism : undefined),
  };
}

function QueueView() {
  const navigate = useNavigate();
  const forceMock = useForceMock();
  const [runs, setRuns] = useState<MockRun[]>([]);
  const [isMock, setIsMock] = useState(true);
  /** 模块筛选: '' = 全部 / 'mn' = 会议分析 / 'ceo' = CEO */
  const [moduleFilter, setModuleFilter] = useState<string>('');
  /** 轴筛选: '' = 全部 / 具体 axis key */
  const [axisFilter, setAxisFilter] = useState<string>('');
  /** R3-B · stage filter: '' = 全部 / 'L1_meeting' / 'L2_aggregate' / 'null' = 老兼容路径 */
  const [stageFilter, setStageFilter] = useState<string>('');
  /** F5 · meetingId → title 反查表，让 meeting-scope 的 row 显示真名 */
  const [meetingTitles, setMeetingTitles] = useState<Record<string, string>>({});
  /** R5 · 粒度 1：展开哪一行查看 per-sub_dim 计数；null 全部折叠 */
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const refetch = () => {
    if (forceMock) { setRuns(MOCK_RUNS); setIsMock(true); return; }
    meetingNotesApi.listRuns({
      limit: 50,
      module: moduleFilter || undefined,
      axis: axisFilter || undefined,
    })
      .then((r) => {
        setRuns((r?.items ?? []).map(mapApiRun));
        setIsMock(false);
      })
      .catch(() => {});
  };
  useEffect(() => {
    refetch();
    if (forceMock) return;
    const t = setInterval(refetch, 5000);
    return () => clearInterval(t);
  }, [forceMock, moduleFilter, axisFilter]);

  // 拉一次 meetings 列表做 id→title 反查；100 条够用
  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    meetingNotesApi.listMeetings({ limit: 100 })
      .then((r: any) => {
        if (cancelled) return;
        const items: any[] = Array.isArray(r) ? r : (r?.items ?? []);
        const map: Record<string, string> = {};
        for (const m of items) if (m?.id) map[m.id] = m.title || '(未命名)';
        setMeetingTitles(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [forceMock]);

  // F5 · counts 修：后端 state 是 'succeeded' / 'cancelled'，之前 filter 'done'
  // 永远 0；'cancelled' 也没进任何统计。改成 succeeded + 兼容老 mock 'done'。
  const counts = {
    running: runs.filter((r) => r.state === 'running').length,
    queued:  runs.filter((r) => r.state === 'queued').length,
    done:    runs.filter((r) => r.state === 'succeeded' || r.state === 'done').length,
    failed:  runs.filter((r) => r.state === 'failed' || r.state === 'cancelled').length,
  };

  async function handleRowAction(r: MockRun) {
    if (r.state === 'queued' || r.state === 'running') {
      try { await meetingNotesApi.cancelRun(r.id); refetch(); }
      catch { alert('取消失败 · 后端无响应'); }
      return;
    }
    if (r.state === 'failed') {
      try {
        // 后端 router L605 校验 allowedKinds 全小写 ['library','project','client','topic','meeting']
        await meetingNotesApi.enqueueRun({ scope: { kind: r.scope.toLowerCase() }, axis: r.axis, subDims: r.subs, preset: r.preset });
        refetch();
      } catch { alert('重试失败'); }
      return;
    }
    // done → jump to versions
    navigate(`/meeting/generation-center?tab=versions&axis=${r.axis}`);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {isMock && <MockBadge />}
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>每 5 秒轮询 · listRuns</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { l: 'running',                 v: String(counts.running),  c: 'var(--teal)' },
          { l: 'queued',                  v: String(counts.queued),   c: 'var(--amber)' },
          // F5 · 'done · 24h' / 'failed · 24h' 标签虚假声称按 24h 窗口（实际是
          // 最近 50 条 listRuns），改为不带时间限定的口径
          { l: 'succeeded',               v: String(counts.done),     c: 'var(--accent)' },
          { l: 'failed / cancelled',      v: String(counts.failed),   c: 'oklch(0.55 0.16 25)' },
        ].map(s => (
          <div key={s.l} style={{
            padding: '14px 16px', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
            borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.l}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 600, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel>所有任务 · 近 48 小时</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5 }}>
          {/* 模块筛选：mn 会议分析 / ceo / 全部 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--ink-3)' }}>模块</span>
            <select
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value); setAxisFilter(''); }}
              style={{
                border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                padding: '4px 8px', fontSize: 11.5, fontFamily: 'var(--sans)', cursor: 'pointer',
              }}
            >
              <option value="">全部</option>
              <option value="mn">🤝 会议分析</option>
              <option value="ceo">🏢 CEO</option>
            </select>
          </div>
          {/* 轴筛选：按模块动态切换 MN 轴 vs CEO g3/g4/g5 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--ink-3)' }}>轴</span>
            <select
              value={axisFilter}
              onChange={(e) => setAxisFilter(e.target.value)}
              style={{
                border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                padding: '4px 8px', fontSize: 11.5, fontFamily: 'var(--sans)', cursor: 'pointer',
              }}
            >
              <option value="">全部</option>
              {(moduleFilter === '' || moduleFilter === 'mn') && <>
                <option value="meta">体征 (meta)</option>
                <option value="people">人物 (people)</option>
                <option value="projects">项目 (projects)</option>
                <option value="knowledge">知识 (knowledge)</option>
                <option value="tension">张力 (tension)</option>
              </>}
              {(moduleFilter === '' || moduleFilter === 'ceo') && <>
                <option value="g3">G3 专家标注</option>
                <option value="g4">G4 跨会重构</option>
                <option value="g5">G5 棱镜聚合</option>
              </>}
            </select>
          </div>
          {/* R3-B · stage filter — DAG L1/L2 (仅 mn 模块有意义) */}
          {moduleFilter !== 'ceo' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--ink-3)' }}>stage</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                style={{
                  border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                  padding: '4px 8px', fontSize: 11.5, fontFamily: 'var(--sans)', cursor: 'pointer',
                }}
              >
                <option value="">全部</option>
                <option value="L1_meeting">🔵 L1 体征</option>
                <option value="L2_aggregate">🟡 L2 聚合</option>
                <option value="null">⚪ 单条</option>
              </select>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)' }}>
        {runs.filter((r) => {
          if (!stageFilter) return true;
          if (stageFilter === 'null') return !r.stage;
          return r.stage === stageFilter;
        }).map((r, i) => {
          // F5 · 'succeeded' 跟 'done' 同色（绿）；'cancelled' 跟 'failed' 同色（红）
          const color = r.state === 'running'
            ? 'var(--teal)'
            : (r.state === 'done' || r.state === 'succeeded')
              ? 'var(--accent)'
              : (r.state === 'failed' || r.state === 'cancelled')
                ? 'oklch(0.55 0.16 25)'
                : 'var(--amber)';
          const CEO_AXIS_LABELS: Record<string, string> = { g3: 'G3 专家标注', g4: 'G4 跨会重构', g5: 'G5 棱镜聚合' };
          const axisMeta = AXIS_SUB[r.axis] ?? { label: CEO_AXIS_LABELS[r.axis] ?? r.axis, color: 'oklch(0.55 0.12 280)', subs: [] };
          const isExpanded = expandedRunId === r.id;
          // R5 · 粒度 1：拿这个 run 的 per-sub_dim 计数（仅展开时用）
          const subDimEntries: Array<[string, NonNullable<NonNullable<MockRun['axisStats']>[string]['subDimStats']>[string]]> = [];
          for (const ax of Object.keys(r.axisStats ?? {})) {
            const sds = r.axisStats?.[ax]?.subDimStats ?? {};
            for (const sd of Object.keys(sds)) subDimEntries.push([sd, sds[sd]]);
          }
          return (
            <div key={r.id}>
            <div style={{
              padding: '14px 18px', display: 'grid',
              gridTemplateColumns: '90px 1fr 180px 160px 180px 60px',
              gap: 14, alignItems: 'center',
              borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
              background: r.state === 'running' ? 'var(--teal-soft)' : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />
                <style>{`@keyframes blink{50%{opacity:.3}}`}</style>
                <MonoMeta>{r.state}</MonoMeta>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* R3-B · DAG stage 徽章：L1 蓝 / L2 琥珀；老 run 不显示 */}
                  {r.stage === 'L1_meeting' && (
                    <span title="L1 · per-meeting 体征" style={{
                      padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700,
                      background: 'oklch(0.94 0.04 240)', color: 'oklch(0.32 0.12 240)',
                      border: '1px solid oklch(0.82 0.08 240)', letterSpacing: '0.08em',
                    }}>L1</span>
                  )}
                  {r.stage === 'L2_aggregate' && (
                    <span title="L2 · 跨会聚合" style={{
                      padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700,
                      background: 'oklch(0.95 0.04 75)', color: 'oklch(0.40 0.10 75)',
                      border: '1px solid oklch(0.82 0.08 75)', letterSpacing: '0.08em',
                    }}>L2</span>
                  )}
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: axisMeta.color }} />
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>{axisMeta.label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                    · {r.subs.map(s => axisMeta.subs.find(x => x.id === s)?.label ?? s).join(' / ')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--ink-3)' }}>
                  <MonoMeta>{r.id}</MonoMeta>
                  <span>·</span>
                  <span>{r.triggeredBy}</span>
                  {r.dependsOn && r.dependsOn.length > 0 && (
                    <>
                      <span>·</span>
                      <span title="depends_on" style={{ fontFamily: 'var(--mono)' }}>
                        ↑ {r.dependsOn.map((d) => d.slice(0, 8)).join(', ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>
                  {r.scope === 'meeting' && '📄 '}
                  {r.scope === 'project' && '📁 '}
                  {r.scope === 'topic' && '🏷 '}
                  {r.scope === 'library' && '📚 '}
                  {r.scope} · {r.preset}
                </div>
                {/* F5 · meeting-scope 优先显示真实标题；其它 scope 保留原 scopeLabel */}
                <div style={{ fontFamily: 'var(--serif)', fontSize: 12, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.35 }}>
                  {r.scope === 'meeting' && meetingTitles[r.scopeLabel]
                    ? meetingTitles[r.scopeLabel]
                    : r.scopeLabel}
                </div>
              </div>
              <div>
                <MonoMeta>{r.started}</MonoMeta>
                <div style={{ fontSize: 11, color: r.state === 'failed' ? 'oklch(0.55 0.16 25)' : 'var(--ink-3)', marginTop: 2 }}>{r.eta}</div>
              </div>
              <div>
                {(r.state === 'running' || r.state === 'queued') ? (
                  <div>
                    <div style={{ height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${r.pct}%`, height: '100%', background: color }} />
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>
                      {r.pct}% · {r.cost}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                    {r.cost}{r.version && ` · ${r.version}`}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button onClick={() => handleRowAction(r)} style={{
                  border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                  padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-2)',
                }}>
                  {r.state === 'running' ? '暂停' : r.state === 'failed' ? '重试' : r.state === 'queued' ? '取消' : '查看'}
                </button>
                {(r.state === 'running' || r.state === 'queued') && (
                  <button
                    onClick={() => navigate(`/meeting/new?runId=${r.id}`)}
                    title="跳转到实时进度页"
                    style={{
                      border: '1px solid var(--line)', background: 'transparent', borderRadius: 4,
                      padding: '4px 9px', fontSize: 10, cursor: 'pointer', color: 'var(--ink-3)',
                      fontFamily: 'var(--mono)', letterSpacing: 0.2,
                    }}
                  >进度 →</button>
                )}
                {/* R5 · 粒度 1：展开看 per-sub_dim 计数 */}
                <button
                  onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                  title={isExpanded ? '折叠' : '展开 sub_dim 详情'}
                  style={{
                    border: '1px solid var(--line)', background: isExpanded ? 'var(--paper-2)' : 'transparent',
                    borderRadius: 4, padding: '4px 9px', fontSize: 10, cursor: 'pointer',
                    color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: 0.2,
                  }}
                >{isExpanded ? '▴ 折叠' : '▾ 详情'}</button>
              </div>
            </div>
            {isExpanded && (
              <div style={{
                padding: '10px 18px 14px 36px',
                background: 'var(--paper-2)',
                borderTop: '1px dashed var(--line-2)',
              }}>
                {/* 上下文标签条：展开后也能看到此 run 属于哪个 轴 / 会议(scope) / DAG 阶段 / CEO 棱镜 */}
                <div style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px',
                  marginBottom: 10, paddingBottom: 8, borderBottom: '1px dashed var(--line-2)',
                  fontSize: 11.5, color: 'var(--ink-3)',
                }}>
                  <span>
                    <span style={{ color: 'var(--ink-4)' }}>轴 </span>
                    <span style={{
                      width: 6, height: 6, borderRadius: 99, background: axisMeta.color,
                      display: 'inline-block', verticalAlign: 'middle', marginRight: 4,
                    }} />
                    <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--ink-1)' }}>{axisMeta.label}</span>
                  </span>
                  <span style={{ color: 'var(--line)' }}>·</span>
                  <span>
                    <span style={{ color: 'var(--ink-4)' }}>
                      {r.scope === 'meeting' ? '会议 ' : r.scope === 'project' ? '项目 ' : r.scope === 'topic' ? '话题 ' : r.scope === 'library' ? '会议库 ' : `${r.scope} `}
                    </span>
                    <span style={{ fontFamily: 'var(--serif)', color: 'var(--ink-2)' }}>
                      {r.scope === 'meeting' && meetingTitles[r.scopeLabel] ? meetingTitles[r.scopeLabel] : (r.scopeLabel || '—')}
                    </span>
                  </span>
                  {r.stage && (
                    <>
                      <span style={{ color: 'var(--line)' }}>·</span>
                      <span>
                        <span style={{ color: 'var(--ink-4)' }}>DAG </span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                          color: r.stage === 'L1_meeting' ? 'oklch(0.32 0.12 240)' : 'oklch(0.40 0.10 75)',
                        }}>
                          {r.stage === 'L1_meeting' ? 'L1 · per-meeting 体征' : 'L2 · 跨会聚合'}
                        </span>
                      </span>
                    </>
                  )}
                  {r.module === 'ceo' && (
                    <>
                      <span style={{ color: 'var(--line)' }}>·</span>
                      <span>
                        <span style={{ color: 'var(--ink-4)' }}>CEO 阶段 </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-1)' }}>{r.axis || '—'}</span>
                      </span>
                      {r.prism && (
                        <>
                          <span style={{ color: 'var(--line)' }}>·</span>
                          <span>
                            <span style={{ color: 'var(--ink-4)' }}>棱镜 </span>
                            <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--ink-1)' }}>{r.prism}</span>
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
                {subDimEntries.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                    暂无 sub_dim 详情（可能是改动前跑的老 run，或 axisStats 还未写入）
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {subDimEntries.map(([sdId, sdStats]) => {
                      const sdLabel = axisMeta.subs.find(x => x.id === sdId)?.label ?? sdId;
                      const failed = (sdStats.errors ?? 0) > 0 || (sdStats.parseFailures ?? 0) > 0;
                      const affects = SUB_AFFECTS[sdId] ?? [];
                      const primaryTab = affects[0];
                      // 构造跳转 URL：optional href 否则 disabled tooltip
                      let href: string | null = null;
                      let hrefHint = '';
                      if (primaryTab) {
                        const ax = primaryTab.axis;
                        if (ax === 'people' || ax === 'projects' || ax === 'knowledge' || ax === 'meta') {
                          // 通过 _axisRegistry tab id 查 — primaryTab.tabLabel 是中文 label，需要 tab id
                          // 简化：拼一个查询参数 tab=<tabLabel> 不够稳；这里用 axis 路由 + 让用户在 axis 页里
                          // 自己点对应 tab。改进版可加 tab id 反向表，本次先到 axis 一级。
                          href = `/meeting/axes/${ax}`;
                          hrefHint = `${AXIS_SHORT_LABEL[ax] ?? ax} · ${primaryTab.tabLabel}`;
                        } else if ((ax === 'a' || ax === 'b' || ax === 'c') && r.triggerMeetingId) {
                          href = `/meeting/${r.triggerMeetingId}/${ax}`;
                          hrefHint = `${AXIS_SHORT_LABEL[ax] ?? ax} · ${primaryTab.tabLabel}`;
                        }
                      }
                      return (
                        <div key={sdId} style={{
                          display: 'grid', gridTemplateColumns: '180px 1fr 220px',
                          gap: 12, alignItems: 'center',
                          fontSize: 11.5,
                        }}>
                          <div style={{ fontFamily: 'var(--serif)', fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                            {sdLabel}
                            <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)' }}>{sdId}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', color: failed ? 'oklch(0.55 0.16 25)' : 'var(--ink-2)' }}>
                            <span>{failed ? '⚠' : '✓'} {sdStats.created} created</span>
                            {sdStats.updated > 0 && <span>· {sdStats.updated} updated</span>}
                            {sdStats.skipped > 0 && <span>· {sdStats.skipped} skipped</span>}
                            {sdStats.errors > 0 && <span>· <b>{sdStats.errors} errors</b></span>}
                            {sdStats.parseFailures > 0 && <span>· {sdStats.parseFailures} parseFail</span>}
                            {failed && sdStats.errorSamples && sdStats.errorSamples[0] && (
                              <span title={sdStats.errorSamples[0].message} style={{ color: 'oklch(0.55 0.16 25)', fontStyle: 'italic' }}>
                                {sdStats.errorSamples[0].message.slice(0, 80)}
                              </span>
                            )}
                          </div>
                          <div>
                            {href ? (
                              <a
                                href={href}
                                onClick={(e) => { e.preventDefault(); navigate(href!); }}
                                style={{
                                  fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--accent)',
                                  textDecoration: 'none',
                                }}
                              >→ 查看（{hrefHint}）</a>
                            ) : (
                              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-4)' }}>
                                {primaryTab ? '需 meeting 上下文' : '无对应轴 tab'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MockVersion { v: string; axis: string; when: string; preset: string; scope: string; diff: string; }

function mapApiVersion(it: Record<string, unknown>): MockVersion {
  return {
    v: String(it.version ?? it.v ?? it.id ?? ''),
    axis: String(it.axis ?? ''),
    when: String(it.createdAt ?? it.when ?? ''),
    preset: String(it.preset ?? ''),
    scope: String((it.scopeKind as string | undefined) ?? it.scope ?? ''),
    diff: String(it.diffSummary ?? it.diff ?? ''),
  };
}

interface DiffRow { k: string; a: string; b: string; d: string; }

const MOCK_DIFF_ROWS: DiffRow[] = [
  { k: '承诺 · 已兑现',      a: '14',             b: '11',    d: '+3' },
  { k: '承诺 · 已违约',      a: '2',              b: '3',     d: '-1' },
  { k: '承诺 · 风险',        a: '5',              b: '4',     d: '+1' },
  { k: '新增 at-risk 人物',  a: 'Wei Tan (0.56)', b: '—',     d: 'new' },
  { k: '整体置信度',         a: '0.72',           b: '0.69',  d: '+0.03' },
];

function structuredDiffToRows(r: { added: any[]; removed: any[]; changed: Array<{ path: string; before: unknown; after: unknown }> } | null): DiffRow[] | null {
  if (!r) return null;
  const rows: DiffRow[] = [];
  for (const c of r.changed ?? []) {
    const before = c.before == null ? '—' : typeof c.before === 'number' ? String(c.before) : JSON.stringify(c.before).slice(0, 40);
    const after  = c.after  == null ? '—' : typeof c.after  === 'number' ? String(c.after)  : JSON.stringify(c.after).slice(0, 40);
    let d: string;
    if (typeof c.before === 'number' && typeof c.after === 'number') {
      const delta = c.after - c.before;
      d = delta > 0 ? `+${delta.toFixed(2)}` : `${delta.toFixed(2)}`;
    } else {
      d = '~';
    }
    rows.push({ k: c.path, a: after, b: before, d });
  }
  for (const it of r.added ?? []) {
    const label = typeof it === 'string' ? it : (it?.path ?? JSON.stringify(it).slice(0, 40));
    rows.push({ k: label, a: '(new)', b: '—', d: 'new' });
  }
  for (const it of r.removed ?? []) {
    const label = typeof it === 'string' ? it : (it?.path ?? JSON.stringify(it).slice(0, 40));
    rows.push({ k: label, a: '—', b: '(removed)', d: '-' });
  }
  return rows;
}

function VersionsView() {
  const [searchParams] = useSearchParams();
  const axisParam = searchParams.get('axis') ?? 'people';
  const forceMock = useForceMock();
  const meetingScope = useMeetingScope();
  // F5：同 4 轴页面 / AxisRegeneratePanel 同源 — kindId='all' 时按 library 查；
  // 其它（项目/客户/主题）按当前 scope.kind + effectiveScopeId 查。
  // 这样 sh-ai-2026 项目下写入的 vN 在这里也能列出来。
  const scopeKindForApi = meetingScope.kindId === 'all' ? 'library' : meetingScope.kindId;
  const scopeIdForApi = meetingScope.kindId === 'all' ? undefined : meetingScope.effectiveScopeId;
  const [versions, setVersions] = useState<MockVersion[]>([]);
  const [isMock, setIsMock] = useState(true);
  const [sel, setSel] = useState<string[]>(['v14', 'v13']);
  const [diffRows, setDiffRows] = useState<DiffRow[]>(MOCK_DIFF_ROWS);
  const [diffIsMock, setDiffIsMock] = useState(true);

  useEffect(() => {
    if (forceMock) { setVersions(MOCK_VERSIONS); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.listVersions(scopeKindForApi, axisParam, scopeIdForApi)
      .then((r) => {
        if (cancelled) return;
        const mapped = (r?.items ?? []).map(mapApiVersion);
        setVersions(mapped);
        setIsMock(false);
        if (mapped.length >= 2) setSel([mapped[0].v, mapped[1].v]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [axisParam, scopeKindForApi, scopeIdForApi, forceMock]);

  // Phase 15.5 · 结构化 diff 适配 · 先试 ?structured=1，失败或 shape 不合则回落 mock 对比表
  useEffect(() => {
    if (forceMock) { setDiffRows(MOCK_DIFF_ROWS); setDiffIsMock(true); return; }
    if (sel.length !== 2) return;
    let cancelled = false;
    meetingNotesApi.diffVersionsStructured(sel[0], sel[1])
      .then((r) => {
        if (cancelled) return;
        const rows = structuredDiffToRows(r);
        if (rows && rows.length > 0) {
          setDiffRows(rows);
          setDiffIsMock(false);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sel, forceMock]);
  const navigate = useNavigate();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 22 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SectionLabel>版本列表</SectionLabel>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>勾选 2 个对比</span>
        </div>
        {/* F5 · scope + axis 选择条 —— 没有这个的话用户只能看到 ?axis=people 默认轴 */}
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--ink-3)' }}>
          scope=<b style={{ color: 'var(--ink-2)' }}>{scopeKindForApi}</b>
          {scopeIdForApi && <> · id=<code style={{ fontFamily: 'var(--mono)' }}>{scopeIdForApi.slice(0, 8)}…</code></>}
          {' · '}{meetingScope.label}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {(['people', 'projects', 'knowledge', 'meta'] as const).map((ax) => {
            const active = ax === axisParam;
            return (
              <button
                key={ax}
                onClick={() => navigate(`/meeting/generation-center?tab=versions&axis=${ax}`)}
                style={{
                  border: '1px solid var(--line)', borderRadius: 4, padding: '4px 10px',
                  fontSize: 11, fontFamily: 'var(--mono)',
                  background: active ? 'var(--ink)' : 'var(--paper)',
                  color: active ? 'var(--paper)' : 'var(--ink-2)',
                  fontWeight: active ? 600 : 500, cursor: 'pointer',
                }}
              >
                {ax}
              </button>
            );
          })}
        </div>
        {versions.length === 0 && !isMock && (
          <div style={{
            padding: '14px 12px', background: 'var(--paper-2)',
            border: '1px dashed var(--line)', borderRadius: 5,
            fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6,
          }}>
            当前 scope × axis 暂无快照。
            {meetingScope.kindId === 'all' && (
              <>
                {' '}试试切到具体项目（ScopePill），或直接到{' '}
                <a
                  onClick={() => navigate('/meeting/axes/knowledge')}
                  style={{ color: 'var(--accent)', cursor: 'pointer' }}
                >
                  /meeting/axes/{axisParam}
                </a>
                {' '}点 📚 版本。
              </>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {versions.map(v => {
            const on = sel.includes(v.v);
            return (
              <button key={v.v} onClick={() => {
                setSel(prev => prev.includes(v.v) ? prev.filter(x => x !== v.v) : (prev.length >= 2 ? [prev[1], v.v] : [...prev, v.v]));
              }} style={{
                border: 0, textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 6,
                background: on ? 'var(--accent-soft)' : 'var(--paper-2)',
                boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : 'inset 0 0 0 1px var(--line-2)',
                display: 'grid', gridTemplateColumns: '22px 1fr', gap: 10, alignItems: 'center',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: on ? 'var(--accent)' : 'transparent',
                  border: on ? '1px solid var(--accent)' : '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)',
                }}>
                  {on && <Icon name="check" size={11} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{v.v}</span>
                    <MonoMeta>{v.when}</MonoMeta>
                  </div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 13, marginTop: 3 }}>{v.axis}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>
                    {v.preset} · {v.scope}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.5 }}>{v.diff}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionLabel>对比 · {sel.join('  ↔  ')}</SectionLabel>
          {diffIsMock && <MockBadge />}
          {diffIsMock && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>structured diff 未上线（Phase 15.5）</span>}
        </div>
        <div style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid var(--line-2)', background: 'var(--paper)' }}>
            {sel.map((v, i) => (
              <div key={v} style={{ padding: '12px 16px', borderLeft: i === 0 ? 'none' : '1px solid var(--line-2)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{v}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
                  {versions.find(x => x.v === v)?.when ?? ''}
                </div>
              </div>
            ))}
          </div>
          {diffRows.map((row, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '220px 1fr 1fr 80px', gap: 0, alignItems: 'center',
              padding: '12px 16px', borderTop: '1px solid var(--line-2)',
            }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink-2)' }}>{row.k}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)' }}>{row.a}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink-3)', borderLeft: '1px solid var(--line-2)', paddingLeft: 16 }}>{row.b}</div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, justifySelf: 'end',
                padding: '2px 8px', borderRadius: 3,
                background: row.d.startsWith('+') || row.d === 'new' ? 'var(--accent-soft)' : row.d.startsWith('-') ? 'var(--teal-soft)' : 'var(--paper)',
                color: row.d.startsWith('+') || row.d === 'new' ? 'oklch(0.3 0.1 40)' : row.d.startsWith('-') ? 'oklch(0.3 0.08 200)' : 'var(--ink-3)',
              }}>{row.d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {['回滚到 v13', '标记 v14 为基线', '导出 diff'].map(t => (
            <button key={t} style={{
              padding: '6px 12px', border: '1px solid var(--line)', background: 'var(--paper)',
              color: 'var(--ink-2)', borderRadius: 4, fontSize: 11.5, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ScheduleRow { id: string; name: string; target: string; next: string; on: boolean; }

function mapApiSchedule(it: Record<string, unknown>): ScheduleRow {
  const scope = String(it.scopeKind ?? it.scope ?? 'project');
  const axis = String(it.axis ?? '—');
  const preset = String(it.preset ?? 'standard');
  return {
    id: String(it.id ?? ''),
    name: String(it.name ?? it.cron ?? ''),
    target: it.target ? String(it.target) : `${scope} · ${axis} · ${preset}`,
    next: String(it.next ?? it.nextRunAt ?? '—'),
    on: Boolean(it.on ?? it.enabled ?? false),
  };
}

function ScheduleView() {
  const forceMock = useForceMock();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [isMock, setIsMock] = useState(true);

  const refetch = () => {
    if (forceMock) { setRows(MOCK_SCHEDULES); setIsMock(true); return; }
    meetingNotesApi.listSchedules()
      .then((r) => {
        setRows((r?.items ?? []).map(mapApiSchedule));
        setIsMock(false);
      })
      .catch(() => {});
  };
  useEffect(() => { refetch(); }, [forceMock]);

  async function toggleSchedule(row: ScheduleRow) {
    if (isMock) {
      setRows(rows.map(r => r.id === row.id ? { ...r, on: !r.on } : r));
      return;
    }
    try {
      await meetingNotesApi.updateSchedule(row.id, { on: !row.on });
      refetch();
    } catch { alert('切换失败 · 后端无响应'); }
  }

  async function handleCreate() {
    const name = prompt('规则名称（示例：每周一 09:00）');
    if (!name) return;
    if (isMock) {
      alert('当前为 mock 模式 · 后端 #20 未上线 · 不会持久化');
      return;
    }
    try {
      await meetingNotesApi.createSchedule({ name, on: true, scopeKind: 'project', axis: 'multi', preset: 'standard' });
      refetch();
    } catch { alert('创建失败'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SectionLabel>定时与触发规则</SectionLabel>
          {isMock && <MockBadge />}
          {isMock && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>后端 cron API（#20）未上线 · 编辑不持久化</span>}
          {!isMock && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>listSchedules · {rows.length} 条规则</span>}
        </div>
        <button
          onClick={handleCreate}
          style={{
            padding: '7px 14px', border: '1px solid var(--ink)', background: 'var(--ink)',
            color: 'var(--paper)', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <Icon name="plus" size={12} />
          新建规则
        </button>
      </div>
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)' }}>
        {rows.map((s, i) => (
          <div key={s.id} style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 1fr 180px 80px',
            gap: 16, alignItems: 'center', padding: '14px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
          }}>
            <div
              onClick={() => toggleSchedule(s)}
              style={{
                width: 36, height: 20, borderRadius: 99,
                background: s.on ? 'var(--accent)' : 'var(--line)',
                position: 'relative', cursor: 'pointer',
              }}>
              <div style={{
                position: 'absolute', top: 2, left: s.on ? 18 : 2,
                width: 16, height: 16, borderRadius: 99, background: 'var(--paper)',
              }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>{s.name}</div>
              <MonoMeta>{s.id}</MonoMeta>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{s.target}</div>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>NEXT</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{s.next}</div>
            </div>
            <button
              onClick={async () => {
                if (isMock) { alert('mock 模式 · 不会持久化'); return; }
                if (!confirm(`删除 ${s.name}？`)) return;
                try { await meetingNotesApi.deleteSchedule(s.id); refetch(); }
                catch { alert('删除失败'); }
              }}
              style={{
                border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-2)',
              }}>{isMock ? '编辑' : '删除'}</button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22, padding: '18px 22px', background: 'var(--amber-soft)', border: '1px solid oklch(0.85 0.08 75)', borderRadius: 8 }}>
        <SectionLabel>默认触发策略</SectionLabel>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { k: 'project 层', v: '自动增量', sub: '每次新会议上传后自动触发；可在这里关闭' },
            { k: 'library 层', v: '手动为主', sub: '默认不自动 · 通过按钮或月度定时任务触发' },
          ].map((r, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600 }}>{r.k}</span>
                <Chip tone={r.v === '自动增量' ? 'accent' : 'ghost'}>{r.v}</Chip>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.5 }}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Wiki View · G2 · claude-cli wiki 批量初始化 ─────────────────────────────

interface WikiRow {
  id: string;
  title: string;
  occurredAt: string | null;
  createdAt: string;
  attendees: number | null;
  claudeSessionId: string | null;
  archived: boolean;
}

function mapApiMeetingToWiki(it: Record<string, unknown>): WikiRow {
  return {
    id: String(it.id ?? ''),
    title: String(it.title ?? '(untitled)'),
    occurredAt: (it.occurred_at as string | null) ?? null,
    createdAt: String(it.created_at ?? ''),
    attendees: (it.attendee_count as number | null) ?? null,
    claudeSessionId: (it.claude_session_id as string | null) ?? null,
    archived: Boolean(it.archived),
  };
}

function WikiView() {
  const navigate = useNavigate();
  const forceMock = useForceMock();
  const [rows, setRows] = useState<WikiRow[]>([]);
  const [isMock, setIsMock] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [batching, setBatching] = useState(false);
  const [lastEnqueued, setLastEnqueued] = useState<{ id: string; at: number } | null>(null);

  const refetch = () => {
    if (forceMock) { setRows([]); setIsMock(true); return; }
    meetingNotesApi.listMeetings({ limit: 200, status: 'active' })
      .then((r) => {
        setRows((r?.items ?? []).map(mapApiMeetingToWiki));
        setIsMock(false);
      })
      .catch(() => {});
  };
  useEffect(() => { refetch(); }, [forceMock]);

  const generated = rows.filter((r) => r.claudeSessionId);
  const pending = rows.filter((r) => !r.claudeSessionId);

  async function enqueueOne(id: string) {
    if (isMock || forceMock) {
      alert('当前为 mock 模式 · 请关闭右下角 mock 开关再试');
      return;
    }
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const r = await meetingNotesApi.enqueueRun({
        scope: { kind: 'meeting', id },
        axis: 'all',
        preset: 'standard',
        triggeredBy: 'generation-center-wiki',
        mode: 'claude-cli',
      });
      // toast 替代 alert · 不打断用户视线
      setLastEnqueued({ id: r?.runId ?? '?', at: Date.now() });
    } catch (e: any) {
      alert(`入队失败 · ${e?.message ?? e}`);
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[id]; return next; });
      refetch();
    }
  }

  async function batchEnqueuePending() {
    if (pending.length === 0) return;
    if (!confirm(`将批量入队 ${pending.length} 场未生成 wiki 的会议（claude-cli 模式 · 一场约 4-5 分钟）？`)) return;
    setBatching(true);
    try {
      for (const r of pending) {
        try {
          await meetingNotesApi.enqueueRun({
            scope: { kind: 'meeting', id: r.id },
            axis: 'all',
            preset: 'standard',
            triggeredBy: 'generation-center-wiki-batch',
            mode: 'claude-cli',
          });
          await new Promise((res) => setTimeout(res, 200));
        } catch {
          // 不打断批处理 · 单条失败继续
        }
      }
    } finally {
      setBatching(false);
      refetch();
    }
  }

  // 5 秒内显示最近一次入队成功的 toast
  const toastVisible = lastEnqueued && Date.now() - lastEnqueued.at < 5000;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {isMock && <MockBadge />}
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          listMeetings · claude-cli 模式跑过的会议在 metadata.claudeSession.sessionId 留下 session id
        </span>
        {toastVisible && (
          <span style={{
            marginLeft: 'auto', padding: '3px 10px', borderRadius: 4,
            background: 'var(--accent-soft)', color: 'oklch(0.32 0.12 285)',
            border: '1px solid oklch(0.78 0.08 285)',
            fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
          }}>
            ✓ 入队 {String(lastEnqueued!.id).slice(0, 8)}…
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { l: '总数',           v: String(rows.length),       c: 'var(--ink)' },
          { l: '已生成 wiki',    v: String(generated.length),  c: 'var(--accent)' },
          { l: '未生成',         v: String(pending.length),    c: 'var(--amber)' },
        ].map((s) => (
          <div key={s.l} style={{
            padding: '14px 16px', background: 'var(--paper-2)', border: '1px solid var(--line-2)',
            borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.l}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 600, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel>会议列表 · {rows.length}</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/content-library/wiki')}
            style={{
              border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
              padding: '6px 12px', fontSize: 11.5, cursor: 'pointer', color: 'var(--ink-2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="arrow" size={11} />
            打开 wiki
          </button>
          <button
            onClick={batchEnqueuePending}
            disabled={pending.length === 0 || batching}
            style={{
              border: '1px solid var(--ink)',
              background: pending.length === 0 || batching ? 'var(--paper-2)' : 'var(--ink)',
              color: pending.length === 0 || batching ? 'var(--ink-3)' : 'var(--paper)',
              borderRadius: 5, padding: '7px 14px', fontSize: 12,
              cursor: pending.length === 0 || batching ? 'not-allowed' : 'pointer',
              fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="play" size={11} />
            {batching ? '入队中…' : `批量入队所有未生成 · ${pending.length}`}
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)' }}>
        {rows.length === 0 && (
          <div style={{ padding: '20px 24px', fontSize: 12, color: 'var(--ink-3)' }}>
            {isMock ? '当前为 mock 模式 · 无数据。切到真实 API 查看。' : '暂无会议。'}
          </div>
        )}
        {rows.map((r, i) => {
          const has = !!r.claudeSessionId;
          const isBusy = !!busy[r.id];
          return (
            <div key={r.id} style={{
              padding: '14px 18px', display: 'grid',
              gridTemplateColumns: '90px 1fr 160px 200px',
              gap: 14, alignItems: 'center',
              borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
            }}>
              <div>
                {has ? (
                  <Chip tone="accent">已生成</Chip>
                ) : (
                  <Chip tone="ghost">未生成</Chip>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{r.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--ink-3)' }}>
                  <MonoMeta>{r.id.slice(0, 8)}…</MonoMeta>
                  {r.occurredAt && <><span>·</span><span>{r.occurredAt.slice(0, 10)}</span></>}
                  {r.attendees != null && <><span>·</span><span>{r.attendees} 人</span></>}
                  {has && (
                    <>
                      <span>·</span>
                      <span style={{ color: 'var(--accent)' }}>session {r.claudeSessionId!.slice(0, 8)}…</span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                {has ? '已落 sources/.md' : '尚未运行 claude-cli'}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => enqueueOne(r.id)}
                  disabled={isBusy}
                  style={{
                    border: '1px solid var(--line)',
                    background: has ? 'var(--paper)' : 'var(--ink)',
                    color: has ? 'var(--ink-2)' : 'var(--paper)',
                    borderRadius: 4, padding: '5px 9px', fontSize: 11,
                    cursor: isBusy ? 'wait' : 'pointer',
                    opacity: isBusy ? 0.5 : 1,
                  }}
                >
                  {isBusy ? '入队中…' : has ? '重新生成' : '生成 wiki'}
                </button>
                <button
                  onClick={() => navigate(`/meeting/${r.id}/a`)}
                  style={{
                    border: '1px solid var(--line)', background: 'transparent', borderRadius: 4,
                    padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-3)',
                  }}
                >会议页 →</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 22, padding: '16px 22px', background: 'var(--paper-2)',
        border: '1px solid var(--line-2)', borderRadius: 8,
      }}>
        <SectionLabel>说明</SectionLabel>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          点击「生成 wiki」后台会以 <code style={{ fontFamily: 'var(--mono)' }}>mode=claude-cli</code> 入队一次完整 run，
          一场约 4-5 分钟，concurrency=2。结束后：<br />
          · <code style={{ fontFamily: 'var(--mono)' }}>content_facts</code> 写入 SPO 三元组<br />
          · <code style={{ fontFamily: 'var(--mono)' }}>data/content-wiki/default/sources/&lt;meetingId&gt;.md</code> 落地<br />
          · 同 meeting 的 session id 写入 <code style={{ fontFamily: 'var(--mono)' }}>assets.metadata.claudeSession.sessionId</code>，下次重跑 prompt cache 命中
        </div>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function GenerationCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') as 'queue' | 'versions' | 'schedule' | 'wiki' | null) ?? 'queue';
  const [tab, setTab] = useState<'queue' | 'versions' | 'schedule' | 'wiki'>(tabFromUrl);
  useEffect(() => {
    if (tab !== tabFromUrl) {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', tab);
        return p;
      }, { replace: true });
    }
  }, [tab]);
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)', color: 'var(--ink)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--sans)',
    }}>
      <header style={{ padding: '28px 36px 0', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 28, margin: 0, letterSpacing: '-0.01em' }}>
            生成中心
          </h2>
          <MonoMeta>generation.center</MonoMeta>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, maxWidth: 820, lineHeight: 1.55 }}>
          所有跨会议生成任务的统一入口。queue 看当前队列 · versions 对比历史版本 · schedule 配置定时任务 · wiki 批量入队 claude-cli 生成。
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 18 }}>
          {[
            { id: 'queue' as const,    label: '队列 · Queue',       count: MOCK_RUNS.filter(r => r.state !== 'done' && r.state !== 'failed').length },
            { id: 'versions' as const, label: '历史版本 · Versions', count: MOCK_VERSIONS.length },
            { id: 'schedule' as const, label: '定时 · Schedule',     count: MOCK_SCHEDULES.filter(s => s.on).length },
            { id: 'wiki' as const,     label: 'Wiki · Claude CLI',  count: 0 },
          ].map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                border: 0, background: 'transparent', padding: '10px 16px', cursor: 'pointer',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                color: active ? 'var(--ink)' : 'var(--ink-3)', fontSize: 13,
                fontWeight: active ? 600 : 500, fontFamily: 'var(--sans)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                {t.label}
                <MonoMeta style={{ fontSize: 9.5 }}>{t.count}</MonoMeta>
              </button>
            );
          })}
        </div>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: '22px 36px 32px' }}>
        {tab === 'queue'    && <QueueView />}
        {tab === 'versions' && <VersionsView />}
        {tab === 'schedule' && <ScheduleView />}
        {tab === 'wiki'     && <WikiView />}
      </div>
    </div>
  );
}

export default GenerationCenter;
