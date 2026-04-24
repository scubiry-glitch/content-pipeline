// StrategiesPanel — §6.3/6.4/6.5 参考表
// 原型来源：/tmp/mn-proto/strategy-panel.jsx StrategiesTable / DecoratorsTable / PresetsTable

import { useState } from 'react';
import { Chip, MonoMeta, SectionLabel } from './_atoms';

// ── Mock data (from strategy-panel.jsx — richer than _fixtures.ts) ───────────

const STRATEGIES_FULL = [
  {
    id: 'single', desc: '单专家直接调用（baseline）', experts: '≥1',
    task: ['analysis','evaluation','generation'],
    meta: ['modelApplications','rubricScores'],
    file: 'strategies/single.ts',
    note: '作为 fallback 链的基座。低成本、高可预测性。',
  },
  {
    id: 'debate', desc: '正反方 + 裁判（三段式）', experts: '≥2（推荐 3）',
    task: ['analysis','evaluation'],
    meta: ['debate.expertAId / BId / judgeId'],
    file: 'strategies/debate.ts',
    note: '≥3 人时效果最佳；1 人时 fallback 到 single。',
  },
  {
    id: 'mental_model_rotation', desc: '专家心智模型逐个应用 + 跨模型综合', experts: '1（需模型）',
    task: ['analysis','generation'],
    meta: ['mentalModelRotation.modelsUsed'],
    file: 'strategies/mentalModelRotation.ts',
    note: 'MAX_MODELS_PER_ROUND = 4。适合多模型交叉查验。',
  },
  {
    id: 'heuristic_trigger_first', desc: '关键词触发专家决策启发式', experts: '1（需启发式）',
    task: ['analysis','evaluation','generation'],
    meta: ['heuristicsTriggered'],
    file: 'strategies/heuristicTriggerFirst.ts',
    note: '先触发启发式，再决定是否走完整推理路径。',
  },
];

const DECORATORS_FULL = [
  { id: 'failure_check',          role: '针对 mentalModels[].failureCondition 自检，命中则 confidence ×0.5', needs: 'expert.mentalModels[].failureCondition', meta: 'confidence ×0.5 on hit' },
  { id: 'emm_iterative',          role: 'EMM 门禁不通过则迭代重跑，最多 2 轮，选最佳', needs: '—', meta: 'emmRounds ∈ [1,2]' },
  { id: 'evidence_anchored',      role: '从 knowledgeService.retrieveKnowledge() 注入 3 条相似案例作 few-shot', needs: 'knowledge-index', meta: 'evidenceAnchored.refs[3]' },
  { id: 'calibrated_confidence',  role: '读 expert_calibration (Brier + overbias) 调整 confidence', needs: 'expert_calibration table', meta: 'factor ∈ [0.3, 1.2]' },
  { id: 'track_record_verify',    role: '拉取近 180 天 ≤3 条预测，强制专家回顾是否一致', needs: 'trackRecord index', meta: 'consistencyFlag' },
  { id: 'signature_style',        role: '注入 expressionDNA + signature_phrases + 风格样本', needs: 'expert.expressionDNA', meta: 'styleHash' },
  { id: 'knowledge_grounded',     role: '强制 [M#n] 引用；无引用段落会被过滤', needs: 'memory-index', meta: 'citationRate' },
  { id: 'contradictions_surface', role: '要求专家明确激活哪条内部矛盾并表态', needs: 'expert.contradictions[]', meta: 'activatedContradictionId' },
  { id: 'rubric_anchored_output', role: '强制输出 rubric_scores JSON，对齐 output_schema.rubrics', needs: 'output_schema.rubrics', meta: 'rubricScores{}' },
];

interface PresetFull {
  id: string;
  title: string;
  position: string;
  cost: string;
  decorators: string[];
  strategy: string;
  tone: 'ghost' | 'accent' | 'teal';
}

const PRESETS_FULL: PresetFull[] = [
  {
    id: 'lite', title: 'lite · 精简模式',
    position: '日常批量处理；failure_check|emm_iterative|single（2 装饰器 + 单专家）',
    cost: '最低 · 约为 standard 的 1/5',
    decorators: ['failure_check','emm_iterative'],
    strategy: 'single', tone: 'ghost',
  },
  {
    id: 'standard', title: 'standard · 深度模式（默认）',
    position: '案例锚定 + 校准 + 心智模型；争议走 debate 中',
    cost: '均衡',
    decorators: ['failure_check','evidence_anchored','calibrated_confidence','knowledge_grounded','rubric_anchored_output'],
    strategy: 'debate (→ single fallback)', tone: 'accent',
  },
  {
    id: 'max', title: 'max · 极致模式',
    position: '7-8 装饰器全量堆叠；每条产出都带专家 DNA',
    cost: '慢 5-8×',
    decorators: ['failure_check','emm_iterative','evidence_anchored','calibrated_confidence','track_record_verify','signature_style','knowledge_grounded','contradictions_surface','rubric_anchored_output'],
    strategy: 'mental_model_rotation + debate', tone: 'teal',
  },
];

const DELIVERABLES = [
  { key: '⑩ insights',        lite: 'single · failure_check',         standard: 'debate · evidence+calibrated+grounded', max: 'mmr · ALL decorators' },
  { key: '⑫ consensus',       lite: 'single',                          standard: 'single · evidence_anchored',            max: 'debate · evidence+calibrated+contradictions' },
  { key: '⑬ controversy',     lite: '—',                               standard: 'debate · evidence+contradictions',      max: 'debate · ALL' },
  { key: '⑭ beliefEvolution', lite: '—',                               standard: 'single · track_record_verify',          max: 'mmr · track_record+signature' },
  { key: '① topic-enrich',    lite: 'single',                          standard: 'heuristic_first · evidence_anchored',   max: 'heuristic_first · ALL' },
  { key: 'step3-fact-review',  lite: 'single · failure_check',         standard: 'single · evidence+calibrated+grounded', max: 'debate · ALL' },
  { key: 'step5-synthesis',    lite: 'single · emm_iterative',         standard: 'mmr · evidence+rubric',                 max: 'mmr · ALL' },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function StrategiesTable() {
  return (
    <div style={{
      width: '100%', background: 'var(--paper)', color: 'var(--ink)',
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--sans)',
    }}>
      <header style={{ padding: '28px 36px 18px', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>
            Base Strategies · 4 种调用策略
          </h2>
          <MonoMeta>api/src/services/expert-application/strategies/</MonoMeta>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, maxWidth: 760 }}>
          §6.3 · 每一次专家调用都会被分派到下述策略之一；策略决定了专家数、任务形态与产出的元数据键。
        </div>
      </header>
      <div style={{ padding: '0 36px', overflow: 'auto', flex: 1 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '180px 1fr 120px 1fr 1fr',
          padding: '14px 0', borderBottom: '1px solid var(--line-2)',
          fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)',
          letterSpacing: 0.3, textTransform: 'uppercase', gap: 14,
        }}>
          <span>ID</span><span>描述</span><span>专家数</span><span>TaskType</span><span>关键 meta</span>
        </div>
        {STRATEGIES_FULL.map((s, i) => (
          <div key={s.id} style={{
            display: 'grid', gridTemplateColumns: '180px 1fr 120px 1fr 1fr',
            gap: 14, padding: '16px 0', alignItems: 'start',
            borderBottom: i === STRATEGIES_FULL.length - 1 ? 'none' : '1px solid var(--line-2)',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{s.id}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>{s.file}</div>
            </div>
            <div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', fontWeight: 500 }}>{s.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.55 }}>{s.note}</div>
            </div>
            <div style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{s.experts}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {s.task.map((t, j) => <Chip key={j} tone="ghost" style={{ alignSelf: 'flex-start' }}>{t}</Chip>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {s.meta.map((m, j) => (
                <span key={j} style={{
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'oklch(0.3 0.1 40)',
                  background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 3, alignSelf: 'flex-start',
                }}>{m}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecoratorsTable() {
  return (
    <div style={{
      width: '100%', background: 'var(--paper)', color: 'var(--ink)',
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--sans)',
    }}>
      <header style={{ padding: '28px 36px 18px', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>
            Decorators · 9 个装饰器
          </h2>
          <MonoMeta>api/src/services/expert-application/decorators/&lt;name&gt;.ts</MonoMeta>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, maxWidth: 760 }}>
          §6.4 · 装饰器以 pipeline 形式叠加在策略外层，按顺序注入证据、校准 confidence、强制引用格式。每条都有明确的对 expert profile 的要求。
        </div>
      </header>
      <div style={{ padding: '0 36px', overflow: 'auto', flex: 1 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '210px 1fr 180px 180px',
          padding: '14px 0', borderBottom: '1px solid var(--line-2)',
          fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)',
          letterSpacing: 0.3, textTransform: 'uppercase', gap: 14,
        }}>
          <span>ID</span><span>作用</span><span>对 profile 的要求</span><span>主要副作用 / meta</span>
        </div>
        {DECORATORS_FULL.map((d, i) => (
          <div key={d.id} style={{
            display: 'grid', gridTemplateColumns: '210px 1fr 180px 180px',
            gap: 14, padding: '14px 0', alignItems: 'start',
            borderBottom: i === DECORATORS_FULL.length - 1 ? 'none' : '1px solid var(--line-2)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 18, height: 18, background: 'var(--paper-2)', border: '1px solid var(--line)',
                  borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600,
                }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{d.id}</div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 6 }}>
                decorators/{d.id}.ts
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>{d.role}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{d.needs}</div>
            <div>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 11, color: 'oklch(0.3 0.08 200)',
                background: 'var(--teal-soft)', padding: '2px 8px', borderRadius: 3,
              }}>{d.meta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetsTable() {
  return (
    <div style={{
      width: '100%', background: 'var(--paper)', color: 'var(--ink)',
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--sans)',
    }}>
      <header style={{ padding: '28px 36px 18px', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>
            Presets · 3 个预设
          </h2>
          <MonoMeta>api/src/services/expert-application/presets.ts</MonoMeta>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, maxWidth: 800 }}>
          §6.5 · 预设将策略 + 装饰器打包。用户选择 preset，系统决定每条 deliverable 的组合方式。
        </div>
      </header>
      <div style={{ padding: '22px 36px', overflow: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 28 }}>
          {PRESETS_FULL.map(p => {
            const bg = p.tone === 'accent' ? 'var(--accent-soft)' : p.tone === 'teal' ? 'var(--teal-soft)' : 'var(--paper-2)';
            const accentBd = p.tone === 'accent' ? 'oklch(0.85 0.07 40)' : p.tone === 'teal' ? 'oklch(0.85 0.05 200)' : 'var(--line-2)';
            return (
              <div key={p.id} style={{ background: bg, border: `1px solid ${accentBd}`, borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.005em' }}>
                    {p.title}
                  </div>
                  {p.id === 'standard' && <Chip tone="accent">default</Chip>}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>{p.position}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10, fontFamily: 'var(--mono)' }}>
                  strategy: {p.strategy}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  cost: {p.cost}
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {p.decorators.map(d => (
                    <span key={d} style={{
                      fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 7px',
                      background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 3,
                      color: 'var(--ink-2)',
                    }}>{d}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <SectionLabel>每个 preset × 7 条 deliverable 的映射</SectionLabel>
          <div style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden', background: 'var(--paper)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr',
              padding: '10px 16px', background: 'var(--paper-2)', borderBottom: '1px solid var(--line-2)',
              fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.3, textTransform: 'uppercase',
            }}>
              <span>Deliverable</span><span>lite</span><span>standard</span><span>max</span>
            </div>
            {DELIVERABLES.map((d, i) => (
              <div key={d.key} style={{
                display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr',
                padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                fontSize: 12.5, alignItems: 'center',
              }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 13, fontWeight: 500 }}>{d.key}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{d.lite}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'oklch(0.3 0.1 40)', fontWeight: 500 }}>{d.standard}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'oklch(0.3 0.08 200)' }}>{d.max}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function StrategiesPanel() {
  const [tab, setTab] = useState<'strategies' | 'decorators' | 'presets'>('strategies');
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden', fontFamily: 'var(--sans)',
    }}>
      <div style={{
        display: 'flex', gap: 2, padding: '0 36px', borderBottom: '1px solid var(--line-2)',
        flexShrink: 0, background: 'var(--paper-2)',
      }}>
        {[
          { id: 'strategies' as const, label: 'Strategies · 4', sub: '§6.3 Base Strategies' },
          { id: 'decorators' as const, label: 'Decorators · 9', sub: '§6.4' },
          { id: 'presets' as const,    label: 'Presets · 3',     sub: '§6.5 lite/standard/max' },
        ].map(t => {
          const active = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              border: 0, background: 'transparent', padding: '14px 16px', cursor: 'pointer',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              color: active ? 'var(--ink)' : 'var(--ink-3)', fontSize: 13,
              fontWeight: active ? 600 : 500, fontFamily: 'var(--sans)',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
            }}>
              <span>{t.label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)' }}>{t.sub}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'strategies' && <StrategiesTable />}
        {tab === 'decorators' && <DecoratorsTable />}
        {tab === 'presets'    && <PresetsTable />}
      </div>
    </div>
  );
}

export default StrategiesPanel;
