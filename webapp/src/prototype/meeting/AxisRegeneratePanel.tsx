// AxisRegeneratePanel — 轴内快捷重算浮层
// 原型来源：/tmp/mn-proto/axis-regenerate.jsx AxisRegeneratePanel

import { useState } from 'react';
import { Icon, Chip, MonoMeta, SectionLabel } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useMeetingScope } from './_scopeContext';
import { AXIS_REGISTRY, ALL_AXES } from './_axisRegistry';

// P1：把后端 4xx 的 code 翻成给用户看的中文文案
function mapEnqueueError(raw: string): string {
  // raw 形如：POST /runs → 400 [INSUFFICIENT_TRANSCRIPT]: scope 下 ... 字符...
  if (raw.includes('[SCOPE_ID_REQUIRED]')) {
    return '入队失败：当前 scope 缺少具体 id。请在右上 ScopePill 选一个具体的项目/客户/主题，再重试。';
  }
  if (raw.includes('[EMPTY_SCOPE]')) {
    return '入队失败：当前 scope 下还没绑定任何会议。请先到「会议纪要库」绑定至少一场会议。';
  }
  if (raw.includes('[INSUFFICIENT_TRANSCRIPT]')) {
    return `入队失败：scope 下会议的 transcript 总字数不足，LLM 跑出来会是空集（直接覆盖原数据更危险）。请先把 transcript 文本上传到 assets.content。\n\n${raw}`;
  }
  if (raw.includes('[UNKNOWN_SUBDIMS]')) {
    return `入队失败：选中的子维度后端不识别。请刷新前端代码（通常是 proto 用了过期的短 id）。\n\n${raw}`;
  }
  return `入队失败：${raw}`;
}

// ── Sub-dim 元数据（cost / depsOn） ───────────────────────────────────────────
// 派生数据：sub_dim 列表与 label 全部来自 _axisRegistry.ts → AXIS_REGISTRY
// （后端 api/src/modules/meeting-notes/axes/registry.ts AXIS_SUBDIMS 镜像）。
// 仅 cost / depsOn 是 panel 自身的展示元数据，按 sub_id 维护一张表。
type Cost = 'low' | 'medium' | 'high';
const SUB_META: Record<string, { cost: Cost; depsOn: string[] }> = {
  // people
  commitments:         { cost: 'medium', depsOn: ['commitment_trace', 'track_record_verify'] },
  role_trajectory:     { cost: 'low',    depsOn: ['evidence_anchored'] },
  speech_quality:      { cost: 'low',    depsOn: ['rubric_anchored_output'] },
  silence_signal:      { cost: 'medium', depsOn: ['failure_check'] },
  // projects
  decision_provenance: { cost: 'high',   depsOn: ['knowledge_grounded', 'evidence_anchored'] },
  assumptions:         { cost: 'medium', depsOn: ['contradictions_surface'] },
  open_questions:      { cost: 'low',    depsOn: ['chronic_question_surface'] },
  risk_heat:           { cost: 'medium', depsOn: ['calibrated_confidence'] },
  // knowledge
  reusable_judgments:  { cost: 'medium', depsOn: ['knowledge_grounded'] },
  mental_models:       { cost: 'high',   depsOn: ['model_hitrate_audit'] },
  cognitive_biases:    { cost: 'medium', depsOn: ['drift_detect'] },
  counterfactuals:     { cost: 'high',   depsOn: ['contradictions_surface', 'debate'] },
  evidence_grading:    { cost: 'low',    depsOn: ['evidence_anchored'] },
  model_hitrate:       { cost: 'medium', depsOn: ['mental_models'] },
  consensus_track:     { cost: 'medium', depsOn: ['reusable_judgments', 'cognitive_biases'] },
  concept_drift:       { cost: 'medium', depsOn: ['reusable_judgments'] },
  topic_lineage:       { cost: 'medium', depsOn: ['reusable_judgments'] },
  external_experts:    { cost: 'low',    depsOn: [] },
  // meta
  decision_quality:    { cost: 'low',    depsOn: ['rubric_anchored_output'] },
  meeting_necessity:   { cost: 'low',    depsOn: ['failure_check'] },
  affect_curve:        { cost: 'medium', depsOn: ['evidence_anchored'] },
  // tension
  intra_meeting:       { cost: 'medium', depsOn: ['contradictions_surface'] },
};

// AXIS_SUB 派生：subs 来自 registry，cost/depsOn 来自 SUB_META
// 这样新增 sub_dim 只需在 SUB_META 加一行 + registry 已有即可（registry 是 SSoT）
const AXIS_SUB: Record<string, {
  label: string;
  color: string;
  subs: { id: string; label: string; cost: Cost; depsOn: string[] }[];
}> = Object.fromEntries(
  ALL_AXES.map((axisId) => {
    const meta = AXIS_REGISTRY[axisId];
    return [axisId, {
      label: meta.label,
      color: meta.color,
      subs: meta.subDims.map((sd) => ({
        id: sd.id,
        label: sd.label,
        cost: SUB_META[sd.id]?.cost ?? 'medium',
        depsOn: SUB_META[sd.id]?.depsOn ?? [],
      })),
    }];
  }),
);

const COST_TABLE = {
  low:    { tok: '~4k',  time: '20-40s' },
  medium: { tok: '~12k', time: '1-2m'   },
  high:   { tok: '~30k', time: '3-6m'   },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600, marginTop: 2 }}>{v}</div>
    </div>
  );
}

const cardBase = {
  background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '14px 16px',
};

const linkBtnStyle: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid var(--line)', background: 'var(--paper)',
  color: 'var(--ink-2)', borderRadius: 4, fontSize: 11.5, cursor: 'pointer',
};

// ── Main export ──────────────────────────────────────────────────────────────

export function AxisRegeneratePanel({
  initialAxis = 'knowledge',
  onClose,
}: {
  initialAxis?: string;
  onClose?: () => void;
} = {}) {
  const [axis, setAxis] = useState(initialAxis);
  const [selected, setSelected] = useState<string[]>(() => {
    // 默认选中初始 axis 的全部 subDims；用户取消勾选保留交互
    const meta = AXIS_SUB[initialAxis];
    return meta ? meta.subs.map((s) => s.id) : [];
  });
  const [preset, setPreset] = useState<'lite' | 'standard' | 'max'>('standard');
  const [scope, setScope] = useState<'project' | 'library'>('project');
  const axisMeta = AXIS_SUB[axis];

  const total = selected.reduce((acc, id) => {
    const sub = axisMeta.subs.find(s => s.id === id);
    if (!sub) return acc;
    const tk = { low: 4, medium: 12, high: 30 }[sub.cost];
    return acc + tk * (preset === 'lite' ? 0.5 : preset === 'max' ? 2.5 : 1) * (scope === 'library' ? 3 : 1);
  }, 0);

  const toggle = (id: string) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const meetingScope = useMeetingScope();
  const [submitting, setSubmitting] = useState(false);
  // 确认对话框：LLM 重算会 DELETE 现有 axis 数据后重写，是不可撤销的覆盖动作
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 二次确认输入框：用户必须键入 "重算" 才能解锁红色按钮
  const [confirmText, setConfirmText] = useState('');
  // 三道闸门 #2：复选框确认（必须在临时版本快照成功后才能勾）
  const [confirmCheck, setConfirmCheck] = useState(false);
  // 三道闸门 #1：弹窗一打开就自动 POST /versions 把当前数据快照为 vN
  // saved 后才允许勾选复选框 + 解锁红色按钮，相当于"先备份，后覆盖"。
  type SnapshotState =
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; versionLabel: string; versionId: string; meetingCount: number; warning?: string }
    | { kind: 'failed'; message: string };
  const [snapshot, setSnapshot] = useState<SnapshotState>({ kind: 'idle' });

  async function openConfirm() {
    if (selected.length === 0) return;
    setConfirmText('');
    setConfirmCheck(false);
    setSnapshot({ kind: 'saving' });
    setConfirmOpen(true);
    try {
      const r = await meetingNotesApi.createVersion({
        scopeKind: scope, // 'project' | 'library'
        scopeId: scope === 'library' ? null : meetingScope.effectiveScopeId,
        axis,
      });
      setSnapshot({
        kind: 'saved',
        versionLabel: r.versionLabel,
        versionId: r.versionId,
        meetingCount: r.meetingCount,
        warning: r.warning,
      });
    } catch (e) {
      setSnapshot({
        kind: 'failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  async function handleEnqueue() {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      // P1 闸门：必须显式传 scope.id（仅 library 例外）
      // jsonb_typeof 把 undefined 编码为缺字段；library 时不传 id，其它必传
      const r: { runId?: string } = await meetingNotesApi.enqueueRun({
        scope: scope === 'library'
          ? { kind: 'library' }
          : { kind: scope, id: meetingScope.effectiveScopeId },
        axis,
        subDims: selected,
        preset,
        triggeredBy: 'axis-regenerate-panel',
      });
      setSubmitting(false);
      if (r?.runId) {
        // 入队成功 · 关闭浮层
        if (onClose) onClose();
      } else {
        alert('入队失败 · 后端未返回 runId');
      }
    } catch (e) {
      setSubmitting(false);
      // 解析后端 4xx 的 P1 闸门 code，给具体提示文案
      const raw = e instanceof Error ? e.message : String(e);
      const friendly = mapEnqueueError(raw);
      alert(friendly);
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper-2)', padding: '36px 44px',
      fontFamily: 'var(--sans)', color: 'var(--ink)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>
          重新生成 · 轴视图
        </h2>
        <MonoMeta>axis.regenerate · inline</MonoMeta>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22, maxWidth: 720, lineHeight: 1.55 }}>
        从轴视图右上角「↻ 重算」打开。只暴露核心参数：选哪些子维度 · 用什么 preset · 在什么 scope 下。
        <b style={{ color: 'var(--ink-2)' }}>project 层自动增量</b>，你只在需要更深分析时手动覆盖；
        <b style={{ color: 'var(--ink-2)' }}>library 层全量手动</b>，每次都在这里决定。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 22, flex: 1, overflow: 'hidden' }}>
        {/* Main: axis picker + sub-dimension checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
          <div>
            <SectionLabel>① 选择轴</SectionLabel>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: `repeat(${ALL_AXES.length},1fr)`, gap: 8 }}>
              {ALL_AXES.map((id) => {
                const a = AXIS_SUB[id];
                const active = id === axis;
                return (
                  <button key={id} onClick={() => { setAxis(id); setSelected([]); }} style={{
                    border: 0, cursor: 'pointer', padding: '12px 14px', borderRadius: 7, textAlign: 'left',
                    background: 'var(--paper)',
                    boxShadow: active ? `inset 0 0 0 2px ${a.color}` : 'inset 0 0 0 1px var(--line-2)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: a.color }} />
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600 }}>{a.label}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{a.subs.length} sub</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>② 勾选要重算的子维度（可多选）</SectionLabel>
            <div style={{
              marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5,
              border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper)',
            }}>
              {axisMeta.subs.map((sub, i) => {
                const on = selected.includes(sub.id);
                const cost = COST_TABLE[sub.cost];
                return (
                  <div key={sub.id} onClick={() => toggle(sub.id)} style={{
                    display: 'grid', gridTemplateColumns: '20px 1fr 100px 80px 80px', gap: 14, alignItems: 'center',
                    padding: '12px 16px', cursor: 'pointer',
                    background: on ? 'var(--accent-soft)' : 'transparent',
                    borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 4,
                      background: on ? 'var(--accent)' : 'transparent',
                      border: on ? '1px solid var(--accent)' : '1px solid var(--line)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)',
                    }}>
                      {on && <Icon name="check" size={11} />}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: on ? 600 : 500 }}>{sub.label}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>
                        deps: {sub.depsOn.slice(0, 2).join(' · ')}{sub.depsOn.length > 2 && ' …'}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 10.5, padding: '2px 8px', borderRadius: 3,
                      background: sub.cost === 'high' ? 'var(--amber-soft)' : sub.cost === 'medium' ? 'var(--teal-soft)' : 'var(--paper-2)',
                      color: 'var(--ink-2)', justifySelf: 'start',
                    }}>{sub.cost}</span>
                    <MonoMeta>{cost.tok}</MonoMeta>
                    <MonoMeta>{cost.time}</MonoMeta>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setSelected(axisMeta.subs.map(s => s.id))} style={linkBtnStyle}>全选</button>
              <button onClick={() => setSelected([])} style={linkBtnStyle}>清空</button>
            </div>
          </div>
        </div>

        {/* Right: scope + preset + estimate */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div style={cardBase}>
            <SectionLabel>③ 作用 scope</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { id: 'project' as const, label: '项目层', auto: true,  sub: '当前项目内跨会议增量' },
                { id: 'library' as const, label: '库层',   auto: false, sub: '全库跨项目重扫 · 慢且贵' },
              ].map(s => {
                const active = s.id === scope;
                return (
                  <button key={s.id} onClick={() => setScope(s.id)} style={{
                    border: 0, textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 5,
                    background: active ? 'var(--paper-2)' : 'transparent',
                    boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : 'inset 0 0 0 1px var(--line-2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 13, fontWeight: active ? 600 : 500 }}>{s.label}</span>
                      <Chip tone={s.auto ? 'accent' : 'ghost'} style={{ padding: '1px 6px', fontSize: 9.5 }}>
                        {s.auto ? 'auto · 默认自动增量' : 'manual · 每次手动'}
                      </Chip>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{s.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={cardBase}>
            <SectionLabel>④ Preset</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', gap: 4, background: 'var(--paper-2)', padding: 3, borderRadius: 6 }}>
              {(['lite', 'standard', 'max'] as const).map(p => {
                const active = p === preset;
                return (
                  <button key={p} onClick={() => setPreset(p)} style={{
                    flex: 1, border: 0, padding: '7px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--paper)' : 'var(--ink-2)',
                    fontFamily: 'var(--mono)', fontWeight: active ? 600 : 500,
                  }}>{p}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
              {preset === 'lite'     && '只跑核心装饰器 · 快速刷新'}
              {preset === 'standard' && '默认 · 案例锚定 + 校准 + 知识接地'}
              {preset === 'max'      && '全装饰器堆叠 · 成本 ×2.5'}
            </div>
          </div>

          <div style={cardBase}>
            <SectionLabel>预估</SectionLabel>
            <div style={{
              marginTop: 10, padding: '14px 12px', background: 'var(--paper-2)', borderRadius: 6,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
            }}>
              <Stat label="子维度" v={`${selected.length} / ${axisMeta.subs.length}`} />
              <Stat label="tokens (估)" v={`${total.toFixed(0)}k`} />
              <Stat label="preset" v={preset} />
              <Stat label="scope" v={scope} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button style={linkBtnStyle} onClick={onClose} disabled={submitting}>取消</button>
            <button style={{
              flex: 1, padding: '11px 18px', border: '1px solid var(--ink)', background: 'var(--ink)',
              color: 'var(--paper)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: (selected.length === 0 || submitting) ? 0.4 : 1,
            }} disabled={selected.length === 0 || submitting} onClick={openConfirm}>
              {submitting ? '入队中…' : '入队 · 开始重算 →'}
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center' }}>
            任务进入<a style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => { if (onClose) onClose(); }}>生成中心</a>后台执行，可继续其他操作
          </div>
        </aside>
      </div>

      {confirmOpen && (
        <div
          onClick={() => setConfirmOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--sans)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--paper)', borderRadius: 10, maxWidth: 560, width: '90%',
              border: '2px solid #b91c1c', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
          >
            {/* Red banner header */}
            <div style={{
              background: '#fef2f2', borderBottom: '1px solid #fecaca',
              padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', letterSpacing: '-0.005em' }}>
                  此操作会删除并覆盖现有数据
                </div>
                <div style={{ fontSize: 11.5, color: '#7f1d1d', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  axis-regenerate · destructive
                </div>
              </div>
            </div>

            <div style={{ padding: '18px 22px 6px', fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)' }}>
              {/* 闸门 #1：临时版本快照状态条（弹窗一打开自动 fire） */}
              {snapshot.kind === 'saving' && (
                <div style={{
                  marginBottom: 14, padding: '10px 12px', borderRadius: 6, fontSize: 12.5,
                  background: 'var(--paper-2)', color: 'var(--ink-2)',
                  border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>⏳</span>
                  <span>正在快照当前 <b>「{axisMeta.label}」</b> 数据到临时版本…</span>
                </div>
              )}
              {snapshot.kind === 'saved' && (
                <div style={{
                  marginBottom: 14, padding: '10px 12px', borderRadius: 6, fontSize: 12.5,
                  background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>✓</span>
                    <span>
                      已快照为 <b>{snapshot.versionLabel}</b>
                      {' '}<code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#047857' }}>
                        id={snapshot.versionId.slice(0, 8)}…
                      </code>
                      （覆盖 {snapshot.meetingCount} 场会议） · 即使重算翻车也能从此版本回溯
                    </span>
                  </div>
                  {snapshot.warning && (
                    <div style={{
                      marginTop: 6, padding: '6px 8px', borderRadius: 4,
                      background: '#fffbeb', color: '#92400e', fontSize: 11.5,
                      border: '1px solid #fde68a',
                    }}>
                      ⚠ {snapshot.warning}
                    </div>
                  )}
                </div>
              )}
              {snapshot.kind === 'failed' && (
                <div style={{
                  marginBottom: 14, padding: '10px 12px', borderRadius: 6, fontSize: 12.5,
                  background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>✗</span>
                    <span><b>临时版本快照失败</b>：{snapshot.message}</span>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: '#7f1d1d' }}>
                    继续按钮已锁死。请关闭弹窗重试，或检查后端 <code style={{ fontFamily: 'var(--mono)' }}>POST /versions</code> 路由。
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                即将对 <b>「{axisMeta.label}」</b> · scope=<b>{scope}</b> · 子维度
                {' '}<b>{selected.length}</b> 个 触发 LLM 重算。开始后将发生：
              </div>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12.5 }}>
                <li>
                  对每个所选子维度，<b style={{ color: '#991b1b' }}>先 DELETE 现有 mn_* 行</b>，再用 LLM 抽取重写
                  （后端 <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>replaceExisting=true</code>）
                </li>
                <li>
                  调用真实 LLM（DeepSeek/Kimi）· 估算 <b>~{total.toFixed(0)}k tokens</b> · 不可中途回滚
                </li>
                <li>
                  会议 transcript（<code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>assets.content</code>）必须有内容，否则抽取空集 → 旧数据被删却没新数据填回
                </li>
                <li style={{ color: '#991b1b' }}>
                  <b>已手工导入的高质量人工聚合数据将永久丢失</b>，被 LLM 自动抽取（质量较低）替换
                </li>
              </ul>

              <div style={{
                background: 'var(--paper-2)', borderRadius: 6, padding: '10px 12px', marginBottom: 12,
                fontSize: 12, color: 'var(--ink-3)', borderLeft: '3px solid #b91c1c',
              }}>
                <b style={{ color: 'var(--ink-2)' }}>建议</b>：上面的临时版本是兜底，
                出问题可在 <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>mn_axis_versions</code>
                {' '}表按 <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>id</code> 找回原 snapshot。
              </div>

              {/* 闸门 #2：复选框（仅快照成功后可勾） */}
              <label style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, marginBottom: 10,
                cursor: snapshot.kind === 'saved' ? 'pointer' : 'not-allowed',
                opacity: snapshot.kind === 'saved' ? 1 : 0.5,
                color: 'var(--ink-2)',
              }}>
                <input
                  type="checkbox"
                  checked={confirmCheck}
                  disabled={snapshot.kind !== 'saved'}
                  onChange={(e) => setConfirmCheck(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  我确认临时版本{' '}
                  <b>{snapshot.kind === 'saved' ? snapshot.versionLabel : '(未保存)'}</b>
                  {' '}已存档，可以覆盖现有数据
                </span>
              </label>

              {/* 闸门 #3：键入"重算"（仅复选框勾选后才能聚焦） */}
              <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>
                输入 <code style={{
                  fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--paper-2)',
                  padding: '1px 6px', borderRadius: 3, color: '#991b1b',
                }}>重算</code> 以解锁继续按钮：
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={snapshot.kind !== 'saved' || !confirmCheck}
                placeholder={snapshot.kind === 'saved' && confirmCheck ? '重算' : '先勾选上方复选框'}
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid var(--line)',
                  borderRadius: 4, fontSize: 13, fontFamily: 'var(--sans)', boxSizing: 'border-box',
                  marginBottom: 14,
                  opacity: snapshot.kind === 'saved' && confirmCheck ? 1 : 0.5,
                }}
              />
            </div>

            <div style={{
              padding: '12px 22px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end',
              borderTop: '1px solid var(--line-2)', background: 'var(--paper-2)',
            }}>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  padding: '8px 16px', border: '1px solid var(--line)', background: 'var(--paper)',
                  color: 'var(--ink-2)', borderRadius: 5, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                }}
              >
                取消（不改任何运行数据；快照保留）
              </button>
              <button
                onClick={handleEnqueue}
                disabled={
                  snapshot.kind !== 'saved'
                  || !confirmCheck
                  || confirmText.trim() !== '重算'
                }
                style={{
                  padding: '8px 18px', border: '1px solid #991b1b',
                  background: (snapshot.kind === 'saved' && confirmCheck && confirmText.trim() === '重算')
                    ? '#b91c1c' : '#fca5a5',
                  color: 'var(--paper)', borderRadius: 5, fontSize: 13, fontWeight: 600,
                  cursor: (snapshot.kind === 'saved' && confirmCheck && confirmText.trim() === '重算')
                    ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--sans)',
                  opacity: (snapshot.kind === 'saved' && confirmCheck && confirmText.trim() === '重算') ? 1 : 0.7,
                }}
              >
                我已确认 · 继续重算
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AxisRegeneratePanel;
