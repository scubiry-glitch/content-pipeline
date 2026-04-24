// GenerationCenter — 生成中心
// 原型来源：/tmp/mn-proto/axis-regenerate.jsx GenerationCenter

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, Chip, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';

// ── Mock data ────────────────────────────────────────────────────────────────

const AXIS_SUB: Record<string, { label: string; color: string; subs: { id: string; label: string }[] }> = {
  people:    { label: '人物轴', color: 'var(--accent)',           subs: [{ id: 'commit', label: '承诺兑现' }, { id: 'role', label: '角色演化' }, { id: 'voice', label: '发言质量' }, { id: 'silence', label: '沉默信号' }] },
  projects:  { label: '项目轴', color: 'var(--teal)',             subs: [{ id: 'decision', label: '决议溯源' }, { id: 'hypo', label: '假设清单' }, { id: 'open', label: '开放问题' }, { id: 'risk', label: '风险热度' }] },
  knowledge: { label: '知识轴', color: 'oklch(0.55 0.08 280)',   subs: [{ id: 'judgement', label: '可复用判断' }, { id: 'mmodel', label: '心智模型命中率' }, { id: 'bias', label: '认知偏误' }, { id: 'counter', label: '反事实' }] },
  meta:      { label: '会议本身', color: 'var(--amber)',          subs: [{ id: 'quality', label: '质量分' }, { id: 'need', label: '必要性评估' }, { id: 'heat', label: '情绪热力图' }] },
};

interface MockRun {
  id: string;
  state: 'running' | 'queued' | 'done' | 'failed';
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
}

const MOCK_RUNS: MockRun[] = [
  { id: 'run-237', state: 'running', axis: 'knowledge', subs: ['mmodel','bias'],         preset: 'standard', scope: 'project', scopeLabel: 'AI 基础设施 · Q2',   started: '09:41:22', eta: '预计 1m 40s',             pct: 48,  triggeredBy: 'auto · 新增 1 场会议', cost: '~16k tok' },
  { id: 'run-236', state: 'queued',  axis: 'people',    subs: ['commit','silence'],       preset: 'standard', scope: 'project', scopeLabel: 'AI 基础设施 · Q2',   started: '09:42:11', eta: '排队中 · 前面 1 个',        pct: 0,   triggeredBy: 'auto',                 cost: '~10k tok' },
  { id: 'run-235', state: 'done',    axis: 'people',    subs: ['commit','role','voice'],  preset: 'standard', scope: 'library', scopeLabel: '全库 48 meetings',  started: '08:03:14', eta: '用时 4m 18s',               pct: 100, triggeredBy: 'manual · 陈汀',        cost: '42k tok',  version: 'v14' },
  { id: 'run-234', state: 'done',    axis: 'knowledge', subs: ['mmodel'],                 preset: 'max',      scope: 'library', scopeLabel: '全库 48 meetings',  started: '昨天 22:11',eta: '用时 11m 04s',              pct: 100, triggeredBy: 'schedule · 月度',      cost: '88k tok',  version: 'v8'  },
  { id: 'run-233', state: 'failed',  axis: 'projects',  subs: ['decision'],               preset: 'max',      scope: 'library', scopeLabel: '全库 48 meetings',  started: '昨天 21:02',eta: '失败 · evidence_anchored 未命中', pct: 34, triggeredBy: 'manual',            cost: '12k tok' },
  { id: 'run-232', state: 'done',    axis: 'knowledge', subs: ['mmodel','bias','counter'],preset: 'standard', scope: 'project', scopeLabel: '消费硬件 · H1',     started: '2 天前',    eta: '用时 2m 50s',               pct: 100, triggeredBy: 'auto',                 cost: '21k tok',  version: 'v12' },
];

const MOCK_VERSIONS = [
  { v: 'v14', axis: 'people · 承诺兑现', when: '今天 08:03', preset: 'standard', scope: 'library', diff: '+3 verified · -1 failed · 1 new at-risk' },
  { v: 'v13', axis: 'people · 承诺兑现', when: '昨天 07:45', preset: 'standard', scope: 'library', diff: '+2 verified · 0 failed' },
  { v: 'v12', axis: 'people · 承诺兑现', when: '3 天前',     preset: 'lite',     scope: 'library', diff: '+1 verified · 1 failed' },
  { v: 'v11', axis: 'people · 承诺兑现', when: '1 周前',     preset: 'standard', scope: 'library', diff: '初次全量' },
];

const MOCK_SCHEDULES = [
  { id: 's1', name: '每次会议上传后',       target: 'project · 所有轴 · standard', next: 'auto · trigger', on: true  },
  { id: 's2', name: '每周一 09:00',          target: 'project · 知识轴 · max',      next: '下周一 09:00',   on: true  },
  { id: 's3', name: '每月 1 号 02:00',       target: 'library · 全轴 · standard',   next: '05-01 02:00',    on: true  },
  { id: 's4', name: '每季度 · 团队能力盘点', target: 'library · 知识轴 · max',      next: '2026-07-01',     on: false },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function mapApiRun(it: Record<string, unknown>): MockRun {
  const sub = (it.subDims as string[] | undefined) ?? [];
  return {
    id: String(it.id ?? ''),
    state: (it.state as MockRun['state']) ?? 'queued',
    axis: String(it.axis ?? ''),
    subs: sub,
    preset: String(it.preset ?? 'standard'),
    scope: String((it.scopeKind as string | undefined) ?? (it.scope as string | undefined) ?? 'project'),
    scopeLabel: String(it.scopeLabel ?? it.scopeId ?? ''),
    started: String(it.startedAt ?? it.started ?? ''),
    eta: String(it.eta ?? (it.state === 'done' ? '已完成' : '')),
    pct: Number(it.progress ?? it.pct ?? 0),
    triggeredBy: String(it.triggeredBy ?? ''),
    cost: String(it.cost ?? (it.tokens ? `${it.tokens} tok` : '—')),
    version: (it.version as string | undefined),
  };
}

function QueueView() {
  const navigate = useNavigate();
  const forceMock = useForceMock();
  const [runs, setRuns] = useState<MockRun[]>(MOCK_RUNS);
  const [isMock, setIsMock] = useState(true);

  const refetch = () => {
    if (forceMock) { setRuns(MOCK_RUNS); setIsMock(true); return; }
    meetingNotesApi.listRuns({ limit: 50 })
      .then((r) => {
        const items = r?.items ?? [];
        if (items.length > 0) {
          setRuns(items.map(mapApiRun));
          setIsMock(false);
        }
      })
      .catch(() => {});
  };
  useEffect(() => {
    refetch();
    if (forceMock) return;
    const t = setInterval(refetch, 5000);
    return () => clearInterval(t);

  }, [forceMock]);

  const counts = {
    running: runs.filter((r) => r.state === 'running').length,
    queued:  runs.filter((r) => r.state === 'queued').length,
    done:    runs.filter((r) => r.state === 'done').length,
    failed:  runs.filter((r) => r.state === 'failed').length,
  };

  async function handleRowAction(r: MockRun) {
    if (r.state === 'queued' || r.state === 'running') {
      try { await meetingNotesApi.cancelRun(r.id); refetch(); }
      catch { alert('取消失败 · 后端无响应'); }
      return;
    }
    if (r.state === 'failed') {
      try {
        await meetingNotesApi.enqueueRun({ scope: { kind: r.scope.toUpperCase() }, axis: r.axis, subDims: r.subs, preset: r.preset });
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
          { l: 'running',    v: String(counts.running),  c: 'var(--teal)' },
          { l: 'queued',     v: String(counts.queued),   c: 'var(--amber)' },
          { l: 'done · 24h', v: String(counts.done),     c: 'var(--accent)' },
          { l: 'failed · 24h', v: String(counts.failed), c: 'oklch(0.55 0.16 25)' },
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

      <SectionLabel>所有任务 · 近 48 小时</SectionLabel>
      <div style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)' }}>
        {runs.map((r, i) => {
          const color = r.state === 'running' ? 'var(--teal)' : r.state === 'done' ? 'var(--accent)' : r.state === 'failed' ? 'oklch(0.55 0.16 25)' : 'var(--amber)';
          const axisMeta = AXIS_SUB[r.axis] ?? { label: r.axis, color: 'var(--ink-3)', subs: [] };
          return (
            <div key={r.id} style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>{r.scope} · {r.preset}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{r.scopeLabel}</div>
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
              <button onClick={() => handleRowAction(r)} style={{
                border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
                padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-2)',
              }}>
                {r.state === 'running' ? '暂停' : r.state === 'failed' ? '重试' : r.state === 'queued' ? '取消' : '查看'}
              </button>
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

function VersionsView() {
  const [searchParams] = useSearchParams();
  const axisParam = searchParams.get('axis') ?? 'people';
  const forceMock = useForceMock();
  const [versions, setVersions] = useState<MockVersion[]>(MOCK_VERSIONS);
  const [isMock, setIsMock] = useState(true);
  const [sel, setSel] = useState<string[]>(['v14', 'v13']);

  useEffect(() => {
    if (forceMock) { setVersions(MOCK_VERSIONS); setIsMock(true); return; }
    let cancelled = false;
    meetingNotesApi.listVersions('library', axisParam)
      .then((r) => {
        if (cancelled) return;
        const items = r?.items ?? [];
        if (items.length > 0) {
          const mapped = items.map(mapApiVersion);
          setVersions(mapped);
          setIsMock(false);
          if (mapped.length >= 2) setSel([mapped[0].v, mapped[1].v]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [axisParam, forceMock]);

  // diff 预取（后续可用来替换下方硬编码对比行；Phase 15.5 完成后端结构化输出再接入）
  useEffect(() => {
    if (forceMock) return;
    if (sel.length !== 2) return;
    meetingNotesApi.diffVersions(sel[0], sel[1]).catch(() => {});
  }, [sel, forceMock]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 22 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <SectionLabel>版本列表</SectionLabel>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>勾选 2 个对比</span>
        </div>
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
        <SectionLabel>对比 · {sel.join('  ↔  ')}</SectionLabel>
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
          {[
            { k: '承诺 · 已兑现',      a: '14',             b: '11',    d: '+3' },
            { k: '承诺 · 已违约',      a: '2',              b: '3',     d: '-1' },
            { k: '承诺 · 风险',        a: '5',              b: '4',     d: '+1' },
            { k: '新增 at-risk 人物',  a: 'Wei Tan (0.56)', b: '—',     d: 'new' },
            { k: '整体置信度',         a: '0.72',           b: '0.69',  d: '+0.03' },
          ].map((row, i) => (
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

function ScheduleView() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SectionLabel>定时与触发规则</SectionLabel>
          <MockBadge />
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>后端 cron API（#20）未上线 · 编辑不持久化</span>
        </div>
        <button
          onClick={() => alert('新建规则 · 待接入（Phase 15.7 · POST /schedules）')}
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
        {MOCK_SCHEDULES.map((s, i) => (
          <div key={s.id} style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 1fr 180px 80px',
            gap: 16, alignItems: 'center', padding: '14px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
          }}>
            <div style={{
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
            <button style={{
              border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 4,
              padding: '5px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-2)',
            }}>编辑</button>
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

// ── Main export ──────────────────────────────────────────────────────────────

export function GenerationCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') as 'queue' | 'versions' | 'schedule' | null) ?? 'queue';
  const [tab, setTab] = useState<'queue' | 'versions' | 'schedule'>(tabFromUrl);
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
          所有跨会议生成任务的统一入口。queue 看当前队列 · versions 对比历史版本 · schedule 配置定时任务。
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 18 }}>
          {[
            { id: 'queue' as const,    label: '队列 · Queue',       count: MOCK_RUNS.filter(r => r.state !== 'done' && r.state !== 'failed').length },
            { id: 'versions' as const, label: '历史版本 · Versions', count: MOCK_VERSIONS.length },
            { id: 'schedule' as const, label: '定时 · Schedule',     count: MOCK_SCHEDULES.filter(s => s.on).length },
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
      </div>
    </div>
  );
}

export default GenerationCenter;
