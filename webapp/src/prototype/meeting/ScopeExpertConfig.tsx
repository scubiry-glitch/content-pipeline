// ScopeExpertConfig — 专家调用系统的作用层配置
// 原型来源：/tmp/mn-proto/scope-expert-config.jsx

import { useState, useEffect, useRef, Fragment } from 'react';
import { Icon, Chip, MonoMeta, SectionLabel, MockBadge } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useForceMock } from './_mockToggle';

// ── Mock data ────────────────────────────────────────────────────────────────

type ScopeId = 'meeting' | 'project' | 'library';

const SCOPE_STRATEGIES: Record<ScopeId, { id: string; scope: string; desc: string; badge: string }[]> = {
  meeting: [
    { id: 'single',                  scope: 'meeting', desc: '单专家直接调用（baseline）',            badge: 'base' },
    { id: 'debate',                  scope: 'meeting', desc: '正反方 + 裁判（三段式）',               badge: 'base' },
    { id: 'mental_model_rotation',   scope: 'meeting', desc: '心智模型逐个应用 + 跨模型综合',          badge: 'base' },
    { id: 'heuristic_trigger_first', scope: 'meeting', desc: '关键词触发专家决策启发式',               badge: 'base' },
  ],
  project: [
    { id: 'single',               scope: 'project', desc: 'baseline',                                          badge: 'base' },
    { id: 'longitudinal_compare', scope: 'project', desc: '跨会议比对 · 同一专家在 N 次会议中的判断演化',       badge: 'new' },
    { id: 'commitment_trace',     scope: 'project', desc: '承诺/断言追踪 · 从提出到验证的全链路',              badge: 'new' },
    { id: 'debate',               scope: 'project', desc: '用于项目内决策争议的复盘',                         badge: 'base' },
  ],
  library: [
    { id: 'single',                 scope: 'library', desc: 'baseline（慎用 · 全库会很慢）',                   badge: 'base' },
    { id: 'longitudinal_compare',   scope: 'library', desc: '跨项目比对 · 同一专家 / 同一主题的全库演化',       badge: 'new' },
    { id: 'cross_project_pattern',  scope: 'library', desc: '跨项目规律挖掘 · 识别重复出现的判断模式',         badge: 'new' },
    { id: 'drift_aggregate',        scope: 'library', desc: '汇总全库信念漂移 · 输出团队级偏误报告',            badge: 'new' },
  ],
};

const SCOPE_DECORATORS: Record<ScopeId, { id: string; available: boolean; badge: string; role?: string }[]> = {
  meeting: [
    { id: 'failure_check',          available: true, badge: 'base' },
    { id: 'emm_iterative',          available: true, badge: 'base' },
    { id: 'evidence_anchored',      available: true, badge: 'base' },
    { id: 'calibrated_confidence',  available: true, badge: 'base' },
    { id: 'knowledge_grounded',     available: true, badge: 'base' },
    { id: 'signature_style',        available: true, badge: 'base' },
    { id: 'contradictions_surface', available: true, badge: 'base' },
    { id: 'rubric_anchored_output', available: true, badge: 'base' },
    { id: 'track_record_verify',    available: true, badge: 'base' },
  ],
  project: [
    { id: 'evidence_anchored',      available: true, badge: 'base' },
    { id: 'calibrated_confidence',  available: true, badge: 'base' },
    { id: 'knowledge_grounded',     available: true, badge: 'base' },
    { id: 'drift_detect',           available: true, badge: 'new', role: '检测同一专家在项目内判断的漂移方向与幅度' },
    { id: 'commitment_trace',       available: true, badge: 'new', role: '标记每一个承诺的状态：open / verified / failed' },
    { id: 'chronic_question_surface', available: true, badge: 'new', role: '识别项目内被反复提及但未解决的问题' },
    { id: 'track_record_verify',    available: true, badge: 'base' },
    { id: 'failure_check',          available: true, badge: 'base' },
  ],
  library: [
    { id: 'calibrated_confidence',  available: true, badge: 'base' },
    { id: 'drift_detect',           available: true, badge: 'new', role: '全库漂移汇总 · 输出团队级置信度热力' },
    { id: 'cross_scope_contrast',   available: true, badge: 'new', role: '跨 scope 对比同一判断在不同项目中的表现' },
    { id: 'chronic_question_surface', available: true, badge: 'new', role: '识别跨项目反复出现的开放问题' },
    { id: 'model_hitrate_audit',    available: true, badge: 'new', role: '审计每个心智模型的长期命中率' },
    { id: 'track_record_verify',    available: true, badge: 'base' },
    { id: 'knowledge_grounded',     available: true, badge: 'base' },
  ],
};

const DECORATOR_ROLES_BASE: Record<string, string> = {
  'failure_check':           'mentalModels[].failureCondition 自检',
  'emm_iterative':           'EMM 门禁不通过则迭代重跑',
  'evidence_anchored':       '注入 3 条相似案例作 few-shot',
  'calibrated_confidence':   'Brier + overbias 校准',
  'knowledge_grounded':      '强制 [M#n] 引用',
  'signature_style':         '注入 expressionDNA',
  'contradictions_surface':  '激活内部矛盾并表态',
  'rubric_anchored_output':  '强制 rubric_scores JSON',
  'track_record_verify':     '回顾近 180 天预测',
};

interface ScopePreset {
  id: string;
  title: string;
  strategy: string;
  decorators: string[];
  position: string;
  cost: string;
  default?: boolean;
}

const SCOPE_PRESETS: Record<ScopeId, ScopePreset[]> = {
  meeting: [
    { id: 'lite',     title: 'meeting.lite',     strategy: 'single',           decorators: ['failure_check','emm_iterative'],                                                                                                   position: '日常批量', cost: '1×' },
    { id: 'standard', title: 'meeting.standard', strategy: 'debate → single',  decorators: ['failure_check','evidence_anchored','calibrated_confidence','knowledge_grounded','rubric_anchored_output'],                       position: '默认 · 案例锚定 + 校准 + 心智模型', cost: '5×', default: true },
    { id: 'max',      title: 'meeting.max',      strategy: 'mmr + debate',     decorators: ['failure_check','emm_iterative','evidence_anchored','calibrated_confidence','track_record_verify','signature_style','knowledge_grounded','contradictions_surface','rubric_anchored_output'], position: '7-8 装饰器全量 · 专家 DNA 可识别', cost: '25×' },
  ],
  project: [
    { id: 'lite',     title: 'project.lite',     strategy: 'single',                                      decorators: ['calibrated_confidence','commitment_trace'],                                                                                                         position: '轻量纵向 · 只跟承诺', cost: '2×' },
    { id: 'standard', title: 'project.standard', strategy: 'longitudinal_compare',                        decorators: ['evidence_anchored','calibrated_confidence','drift_detect','commitment_trace','chronic_question_surface'],                                        position: '默认 · 漂移 + 承诺 + 慢性问题', cost: '8×', default: true },
    { id: 'max',      title: 'project.max',      strategy: 'longitudinal_compare + commitment_trace + debate', decorators: ['evidence_anchored','calibrated_confidence','drift_detect','commitment_trace','chronic_question_surface','track_record_verify','knowledge_grounded','failure_check'], position: '项目复盘深度模式 · 建议月度使用', cost: '30×' },
  ],
  library: [
    { id: 'lite',     title: 'library.lite',     strategy: 'drift_aggregate',                                      decorators: ['calibrated_confidence','drift_detect'],                                                                                                                              position: '全库漂移速览 · 周度', cost: '4×' },
    { id: 'standard', title: 'library.standard', strategy: 'longitudinal_compare + cross_project_pattern',         decorators: ['calibrated_confidence','drift_detect','chronic_question_surface','model_hitrate_audit','track_record_verify'],                                                  position: '默认 · 月度团队认知审计', cost: '15×', default: true },
    { id: 'max',      title: 'library.max',      strategy: 'cross_project_pattern + drift_aggregate',              decorators: ['calibrated_confidence','drift_detect','cross_scope_contrast','chronic_question_surface','model_hitrate_audit','track_record_verify','knowledge_grounded'],    position: '季度团队能力盘点', cost: '45×' },
  ],
};

// ── Main export ──────────────────────────────────────────────────────────────

// scopeId 映射：UI 层 scope (meeting/project/library) → API 的 scopeId 实例
// 原型中这是 3 类层级（不是特定实例），后端 #19 尚未确定是否需要 instanceId
// Phase 14 先以固定 placeholder 实例 id 呼叫，backend 对齐 schema 后再迭代
const SCOPE_TO_API_ID: Record<ScopeId, string> = {
  meeting: 'current-meeting',
  project: 'p-ai-q2',
  library: 'all',
};

export function ScopeExpertConfig() {
  const [scope, setScope] = useState<ScopeId>('meeting');
  const [preset, setPreset] = useState('standard');
  const forceMock = useForceMock();
  const [isMockPersistence, setIsMockPersistence] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初次载入 / 切 scope：尝试拉配置
  useEffect(() => {
    if (forceMock) { setIsMockPersistence(true); return; }
    let cancelled = false;
    meetingNotesApi.getScopeConfig(SCOPE_TO_API_ID[scope])
      .then((r) => {
        if (cancelled || !r) return;
        if (r.preset) setPreset(r.preset);
        setIsMockPersistence(false);
      })
      .catch(() => { /* 后端 #19 未上线 → 保留本地 state + MockBadge */ });
    return () => { cancelled = true; };
  }, [scope, forceMock]);

  // preset / decorator stack 改动 → debounce 1s 保存
  useEffect(() => {
    if (forceMock || isMockPersistence) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      meetingNotesApi.saveScopeConfig(SCOPE_TO_API_ID[scope], { kind: scope, preset })
        .catch(() => setIsMockPersistence(true));
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [scope, preset, forceMock, isMockPersistence]);

  const scopes = [
    { id: 'meeting' as ScopeId, label: '会议层', kind: 'PER-MEETING', sub: '单场会议 · 产出 6 维解析', input: '原始素材', output: '6 维解析纪要' },
    { id: 'project' as ScopeId, label: '项目层', kind: 'PER-PROJECT', sub: '项目内跨会议 · 纵向演化',  input: 'N 场已解析纪要', output: '项目纵向报告' },
    { id: 'library' as ScopeId, label: '库层',   kind: 'PER-LIBRARY', sub: '全库跨项目 · 团队级偏误审计', input: '全库纪要 + 专家校准表', output: '团队认知报告' },
  ];
  const scopeMeta = scopes.find(s => s.id === scope)!;
  const strategies = SCOPE_STRATEGIES[scope];
  const decorators = SCOPE_DECORATORS[scope];
  const presets = SCOPE_PRESETS[scope];
  const activePreset = presets.find(p => p.id === preset) ?? presets[1];

  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)', color: 'var(--ink)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--sans)',
    }}>
      <header style={{ padding: '26px 36px 18px', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>
            专家调用 · 作用层配置
          </h2>
          <MonoMeta>presets.scope.ts</MonoMeta>
          {isMockPersistence && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <MockBadge />
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                后端 #19 未上线 · 刷新将丢失修改
              </span>
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, maxWidth: 820, lineHeight: 1.55 }}>
          同一套专家 × 三个作用层：会议 → 项目 → 库。切换 scope 时，策略、装饰器、预设都会切到对应层。
          专家本身是共享的（E09-09 / E11-03 / E04-12…），变的是<i>装配方式</i>。
        </div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {scopes.map(s => {
            const active = s.id === scope;
            return (
              <button key={s.id} onClick={() => { setScope(s.id); setPreset('standard'); }} style={{
                border: 0, cursor: 'pointer', textAlign: 'left', padding: '14px 18px', borderRadius: 7,
                background: active ? 'var(--ink)' : 'var(--paper-2)',
                color: active ? 'var(--paper)' : 'var(--ink)',
                boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--line-2)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 0.5,
                    padding: '2px 6px', borderRadius: 3,
                    background: active ? 'rgba(255,255,255,.12)' : 'var(--paper)',
                    color: active ? 'var(--paper)' : 'var(--ink-3)',
                    border: active ? 'none' : '1px solid var(--line-2)',
                  }}>{s.kind}</span>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 12, opacity: active ? 0.85 : 0.7, lineHeight: 1.4 }}>{s.sub}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, marginTop: 4, color: active ? 'rgba(255,255,255,.7)' : 'var(--ink-3)' }}>
                  <span>in: {s.input}</span>
                  <span style={{ margin: '0 6px' }}>→</span>
                  <span>out: {s.output}</span>
                </div>
              </button>
            );
          })}
        </div>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: '22px 36px 30px' }}>
        {/* Presets row */}
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Presets · {scopeMeta.label}的 3 档</SectionLabel>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {presets.map(p => {
              const active = p.id === preset;
              const tone = p.id === 'standard' ? 'accent' : p.id === 'max' ? 'teal' : 'ghost';
              const bg = active
                ? (tone === 'accent' ? 'var(--accent-soft)' : tone === 'teal' ? 'var(--teal-soft)' : 'var(--paper-2)')
                : 'var(--paper-2)';
              const bd = active
                ? (tone === 'accent' ? 'var(--accent)' : tone === 'teal' ? 'var(--teal)' : 'var(--ink)')
                : 'var(--line-2)';
              return (
                <div key={p.id} onClick={() => setPreset(p.id)} style={{
                  background: bg, border: `1px solid ${bd}`, borderRadius: 8,
                  padding: '16px 18px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>
                      {p.title}
                    </div>
                    {p.default && <Chip tone="accent">default</Chip>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, minHeight: 36 }}>
                    {p.position}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>
                    <span>cost {p.cost}</span>
                    <span>·</span>
                    <span>{p.decorators.length} decorators</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active preset detail */}
        <div style={{ marginBottom: 24, padding: '18px 22px', background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
            <SectionLabel>当前选中</SectionLabel>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{activePreset.title}</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>· 等同于以下组合</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, alignItems: 'start', marginBottom: 10 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 3 }}>
              strategy
            </div>
            <div>
              <code style={{
                fontFamily: 'var(--mono)', fontSize: 12.5, padding: '4px 10px',
                background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 4,
                color: 'oklch(0.3 0.1 40)',
              }}>{activePreset.strategy}</code>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, alignItems: 'start' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 3 }}>
              decorator stack
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {activePreset.decorators.map((d, i) => {
                const meta = decorators.find(x => x.id === d);
                const isNew = meta?.badge === 'new';
                return (
                  <Fragment key={d}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 11, padding: '3px 9px',
                      background: isNew ? 'var(--teal-soft)' : 'var(--paper)',
                      border: '1px solid var(--line-2)', borderRadius: 4,
                      color: isNew ? 'oklch(0.3 0.08 200)' : 'var(--ink-2)',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      {isNew && <span style={{
                        fontSize: 8.5, letterSpacing: 0.5, padding: '0 4px', borderRadius: 2,
                        background: 'var(--teal)', color: 'var(--paper)',
                      }}>NEW</span>}
                      {d}
                    </span>
                    {i < activePreset.decorators.length - 1 && (
                      <span style={{ color: 'var(--ink-4)', fontSize: 11, alignSelf: 'center' }}>→</span>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Two-column: strategies + decorators */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <section>
            <SectionLabel>可用策略 · {strategies.length}</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {strategies.map(s => {
                const isNew = s.badge === 'new';
                const inUse = activePreset.strategy.includes(s.id);
                return (
                  <div key={s.id} style={{
                    padding: '10px 14px', borderRadius: 6,
                    background: 'var(--paper-2)',
                    border: `1px solid ${inUse ? 'var(--accent)' : 'var(--line-2)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{s.id}</code>
                      {isNew && <span style={{
                        fontSize: 8.5, letterSpacing: 0.5, padding: '1px 5px', borderRadius: 2,
                        background: 'var(--teal)', color: 'var(--paper)', fontFamily: 'var(--mono)',
                      }}>NEW</span>}
                      {inUse && <Chip tone="accent" style={{ padding: '1px 6px', fontSize: 9.5 }}>in use</Chip>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <SectionLabel>可用装饰器 · {decorators.length}</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {decorators.map(d => {
                const isNew = d.badge === 'new';
                const inUse = activePreset.decorators.includes(d.id);
                const role = d.role ?? DECORATOR_ROLES_BASE[d.id] ?? '';
                return (
                  <div key={d.id} style={{
                    padding: '9px 12px', borderRadius: 5,
                    background: 'var(--paper-2)',
                    border: `1px solid ${inUse ? 'var(--teal)' : 'var(--line-2)'}`,
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600 }}>{d.id}</code>
                        {isNew && <span style={{
                          fontSize: 8.5, letterSpacing: 0.5, padding: '1px 5px', borderRadius: 2,
                          background: 'var(--teal)', color: 'var(--paper)', fontFamily: 'var(--mono)',
                        }}>NEW</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.45 }}>{role}</div>
                    </div>
                    {inUse && (
                      <div style={{
                        width: 14, height: 14, borderRadius: 99, background: 'var(--teal)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name="check" size={9} style={{ color: 'var(--paper)' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Cross-scope cost table */}
        <div style={{ marginTop: 26 }}>
          <SectionLabel>跨 scope 的调用频率与成本预算</SectionLabel>
          <div style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden', background: 'var(--paper-2)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 140px 160px',
              padding: '9px 16px', background: 'var(--paper)', borderBottom: '1px solid var(--line-2)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: 0.3, textTransform: 'uppercase',
            }}>
              <span>scope</span><span>触发时机</span><span>频率</span><span>典型 preset</span>
            </div>
            {[
              { s: 'meeting', when: '每次会议上传后自动触发 · 可手动重跑',    freq: '高 · 每日 N 场', p: 'standard' },
              { s: 'project', when: '进入项目纵向视图时触发 · 也可定时增量',   freq: '中 · 每周一次', p: 'standard' },
              { s: 'library', when: '「团队认知审计」按钮触发 · 或月度自动',    freq: '低 · 每月一次', p: 'standard' },
            ].map((r, i) => (
              <div key={r.s} style={{
                display: 'grid', gridTemplateColumns: '120px 1fr 140px 160px',
                padding: '11px 16px', alignItems: 'center', fontSize: 12,
                borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                background: r.s === scope ? 'var(--accent-soft)' : 'transparent',
              }}>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: r.s === scope ? 600 : 500 }}>{r.s}</code>
                <div style={{ color: 'var(--ink-2)' }}>{r.when}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{r.freq}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'oklch(0.3 0.1 40)' }}>{r.s}.{r.p}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScopeExpertConfig;
