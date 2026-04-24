// AxisRegeneratePanel — 轴内快捷重算浮层
// 原型来源：/tmp/mn-proto/axis-regenerate.jsx AxisRegeneratePanel

import { useState } from 'react';
import { Icon, Chip, MonoMeta, SectionLabel } from './_atoms';

// ── Mock data ────────────────────────────────────────────────────────────────

const AXIS_SUB: Record<string, {
  label: string;
  color: string;
  subs: { id: string; label: string; cost: 'low' | 'medium' | 'high'; depsOn: string[] }[];
}> = {
  people: {
    label: '人物轴', color: 'var(--accent)',
    subs: [
      { id: 'commit',  label: '承诺兑现', cost: 'medium', depsOn: ['commitment_trace','track_record_verify'] },
      { id: 'role',    label: '角色演化', cost: 'low',    depsOn: ['evidence_anchored'] },
      { id: 'voice',   label: '发言质量', cost: 'low',    depsOn: ['rubric_anchored_output'] },
      { id: 'silence', label: '沉默信号', cost: 'medium', depsOn: ['failure_check'] },
    ],
  },
  projects: {
    label: '项目轴', color: 'var(--teal)',
    subs: [
      { id: 'decision', label: '决议溯源', cost: 'high',   depsOn: ['knowledge_grounded','evidence_anchored'] },
      { id: 'hypo',     label: '假设清单', cost: 'medium', depsOn: ['contradictions_surface'] },
      { id: 'open',     label: '开放问题', cost: 'low',    depsOn: ['chronic_question_surface'] },
      { id: 'risk',     label: '风险热度', cost: 'medium', depsOn: ['calibrated_confidence'] },
    ],
  },
  knowledge: {
    label: '知识轴', color: 'oklch(0.55 0.08 280)',
    subs: [
      { id: 'judgement', label: '可复用判断',    cost: 'medium', depsOn: ['knowledge_grounded'] },
      { id: 'mmodel',    label: '心智模型命中率', cost: 'high',   depsOn: ['model_hitrate_audit'] },
      { id: 'bias',      label: '认知偏误',      cost: 'medium', depsOn: ['drift_detect'] },
      { id: 'counter',   label: '反事实',        cost: 'high',   depsOn: ['contradictions_surface','debate'] },
    ],
  },
  meta: {
    label: '会议本身', color: 'var(--amber)',
    subs: [
      { id: 'quality', label: '质量分',     cost: 'low',    depsOn: ['rubric_anchored_output'] },
      { id: 'need',    label: '必要性评估', cost: 'low',    depsOn: ['failure_check'] },
      { id: 'heat',    label: '情绪热力图', cost: 'medium', depsOn: ['evidence_anchored'] },
    ],
  },
};

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

export function AxisRegeneratePanel() {
  const [axis, setAxis] = useState('knowledge');
  const [selected, setSelected] = useState<string[]>(['mmodel', 'bias']);
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
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {Object.entries(AXIS_SUB).map(([id, a]) => {
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
            <button style={linkBtnStyle}>取消</button>
            <button style={{
              flex: 1, padding: '11px 18px', border: '1px solid var(--ink)', background: 'var(--ink)',
              color: 'var(--paper)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: selected.length === 0 ? 0.4 : 1,
            }} disabled={selected.length === 0}>
              入队 · 开始重算 →
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center' }}>
            任务进入<a style={{ color: 'var(--accent)' }}>生成中心</a>后台执行，可继续其他操作
          </div>
        </aside>
      </div>
    </div>
  );
}

export default AxisRegeneratePanel;
