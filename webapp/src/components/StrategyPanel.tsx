// Round 2: 专家应用策略配置面板
// 每个 LLM Step（2/3/5/topics）独立使用；3 个预设 + 高级自定义 + localStorage 持久化

import { useEffect, useState } from 'react';
import type { ExpertStrategySpec } from '../api/assetsAi';

export type PresetId = 'lite' | 'standard' | 'max' | 'custom';

interface PresetMeta {
  id: PresetId;
  name: string;
  desc: string;
}

const PRESETS: PresetMeta[] = [
  { id: 'lite', name: '精简', desc: '单专家 + EMM（最少 LLM 调用）' },
  { id: 'standard', name: '深度（推荐）', desc: '案例锚 + 校准 + 心智轮询' },
  { id: 'max', name: '极致', desc: '全量 12 策略堆叠，慢 5-8 倍' },
  { id: 'custom', name: '自定义', desc: '按 deliverable 细粒度勾选' },
];

interface BaseStrategyMeta { id: string; name: string; desc: string; }
interface DecoratorMeta { id: string; name: string; desc: string; }

const BASE_STRATEGIES: BaseStrategyMeta[] = [
  { id: 'single', name: '单专家', desc: '现行 Round 1 行为' },
  { id: 'debate', name: '多专家辩论', desc: '2+ 位专家独立分析 + 裁判合成' },
  { id: 'mental_model_rotation', name: '心智模型轮询', desc: '对每个心智模型跑一轮 + 汇总' },
  { id: 'heuristic_trigger_first', name: '启发式触发', desc: '按 trigger 关键词激活相关启发式' },
];

// 装饰器按固定优先级排序（从外到内）
const DECORATORS: DecoratorMeta[] = [
  { id: 'calibrated_confidence', name: '置信度校准', desc: 'Brier 分 × confidence' },
  { id: 'track_record_verify', name: '历史对照', desc: '过往判断问责' },
  { id: 'evidence_anchored', name: '案例锚定', desc: '相似过往案例 few-shot' },
  { id: 'knowledge_grounded', name: '严格引证', desc: '每结论必 [M#n]' },
  { id: 'signature_style', name: '签名风格', desc: 'DNA + 文字片段模仿' },
  { id: 'rubric_anchored_output', name: 'Rubric 锚定', desc: '按维度评分' },
  { id: 'contradictions_surface', name: '矛盾显式', desc: '已知矛盾自省' },
  { id: 'failure_check', name: '失效域自检', desc: '越界即降权' },
  { id: 'emm_iterative', name: 'EMM 迭代', desc: '失败反馈重试 2 次' },
];

// Step → 可配置 deliverables
const STEP_DELIVERABLES: Record<string, Array<{ id: string; name: string }>> = {
  step2: [
    { id: '⑤keyFacts', name: '⑤ 关键事实' },
    { id: '⑩insights', name: '⑩ 洞察' },
    { id: '⑫consensus', name: '⑫ 共识' },
    { id: '⑬controversy', name: '⑬ 争议' },
    { id: '⑭beliefEvolution', name: '⑭ 观点演化' },
    { id: '⑮crossDomain', name: '⑮ 跨领域' },
  ],
  step3: [{ id: 'step3-fact-review', name: '事实审定' }],
  step5: [{ id: 'step5-synthesis', name: '认知综合' }],
  topics: [{ id: '①topic-enrich', name: '议题包装' }],
};

interface Props {
  /** Step 标识，决定 localStorage key + 显示的 deliverable 列表 */
  stepId: 'step2' | 'step3' | 'step5' | 'topics';
  /** 当前选中的 preset / custom mapping (受控) */
  value: ExpertStrategySpec;
  onChange: (spec: ExpertStrategySpec) => void;
}

export function StrategyPanel({ stepId, value, onChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const presetId = value.preset || 'standard';
  const deliverables = STEP_DELIVERABLES[stepId] || [];

  // 切 preset
  const handlePresetChange = (id: PresetId) => {
    if (id === 'custom') {
      // 切到 custom：保留旧 perDeliverable（若有），否则空
      onChange({
        preset: 'custom',
        perDeliverable: value.perDeliverable || {},
      });
      setAdvancedOpen(true);
    } else {
      onChange({ preset: id });
    }
  };

  const handleDeliverableChange = (deliverableId: string, spec: string) => {
    const newPer = { ...(value.perDeliverable || {}), [deliverableId]: spec };
    onChange({ preset: 'custom', perDeliverable: newPer });
  };

  return (
    <div className="strategy-panel" style={{
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      padding: 10,
      marginTop: 8,
      background: '#fafbfc',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, color: '#444' }}>策略预设:</span>
        {PRESETS.map((p) => (
          <label key={p.id} style={{ cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <input
              type="radio"
              name={`preset-${stepId}`}
              checked={presetId === p.id}
              onChange={() => handlePresetChange(p.id)}
            />
            <span title={p.desc}>{p.name}</span>
          </label>
        ))}
      </div>
      <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
        {PRESETS.find((p) => p.id === presetId)?.desc}
      </div>

      {deliverables.length > 0 && (
        <details open={presetId === 'custom' || advancedOpen} style={{ marginTop: 8 }}>
          <summary
            style={{ cursor: 'pointer', color: '#475569', fontSize: 12 }}
            onClick={(e) => { e.preventDefault(); setAdvancedOpen(!advancedOpen); }}
          >
            ▸ 高级自定义（逐 deliverable 勾选）
          </summary>
          {advancedOpen && (
            <div style={{ marginTop: 6, padding: 6 }}>
              {deliverables.map((d) => (
                <DeliverableRow
                  key={d.id}
                  deliverable={d}
                  spec={value.perDeliverable?.[d.id] || ''}
                  onChange={(spec) => handleDeliverableChange(d.id, spec)}
                />
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  );
}

interface DeliverableRowProps {
  deliverable: { id: string; name: string };
  spec: string;
  onChange: (spec: string) => void;
}

function DeliverableRow({ deliverable, spec, onChange }: DeliverableRowProps) {
  // 从 spec 字符串解析出 base 和 decorators
  const { base, decorators } = parseSpec(spec);

  const handleBaseChange = (newBase: string) => {
    const newSpec = composeSpec(decorators, newBase);
    onChange(newSpec);
  };

  const handleDecoratorToggle = (id: string) => {
    const next = decorators.includes(id)
      ? decorators.filter((d) => d !== id)
      : [...decorators, id];
    // 按 DECORATORS 固定顺序重新排列（从外到内）
    const ordered = DECORATORS.filter((d) => next.includes(d.id)).map((d) => d.id);
    const newSpec = composeSpec(ordered, base);
    onChange(newSpec);
  };

  return (
    <div style={{
      borderTop: '1px dashed #e5e7eb',
      padding: '6px 0',
    }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{deliverable.name}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>基础策略:</span>
        {BASE_STRATEGIES.map((b) => (
          <label key={b.id} style={{ cursor: 'pointer', display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 11 }}>
            <input
              type="radio"
              name={`base-${deliverable.id}`}
              checked={base === b.id || (base === '' && b.id === 'single')}
              onChange={() => handleBaseChange(b.id)}
            />
            <span title={b.desc}>{b.name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#888', fontSize: 11 }}>装饰器:</span>
        {DECORATORS.map((d) => (
          <label key={d.id} style={{ cursor: 'pointer', display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 11 }}>
            <input
              type="checkbox"
              checked={decorators.includes(d.id)}
              onChange={() => handleDecoratorToggle(d.id)}
            />
            <span title={d.desc}>{d.name}</span>
          </label>
        ))}
      </div>
      {spec && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>
          {spec}
        </div>
      )}
    </div>
  );
}

function parseSpec(spec: string): { base: string; decorators: string[] } {
  if (!spec) return { base: 'single', decorators: [] };
  const parts = spec.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { base: 'single', decorators: [] };
  const last = parts[parts.length - 1];
  const isBase = BASE_STRATEGIES.some((b) => b.id === last);
  if (isBase) {
    return {
      base: last,
      decorators: parts.slice(0, -1).filter((p) => DECORATORS.some((d) => d.id === p)),
    };
  }
  return {
    base: 'single',
    decorators: parts.filter((p) => DECORATORS.some((d) => d.id === p)),
  };
}

function composeSpec(decoratorIds: string[], base: string): string {
  const b = base || 'single';
  // decoratorIds 已按 DECORATORS 固定顺序（外→内）
  if (decoratorIds.length === 0) return b;
  return [...decoratorIds, b].join('|');
}

/** 读 localStorage 得到指定 step 的 spec 配置 */
export function loadStrategyFromLocalStorage(stepId: string): ExpertStrategySpec {
  try {
    const raw = localStorage.getItem(`batchOps.${stepId}.expertStrategy`);
    if (!raw) return { preset: 'standard' };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* ignore */ }
  return { preset: 'standard' };
}

/** 保存到 localStorage */
export function saveStrategyToLocalStorage(stepId: string, spec: ExpertStrategySpec): void {
  try {
    localStorage.setItem(`batchOps.${stepId}.expertStrategy`, JSON.stringify(spec));
  } catch { /* ignore */ }
}

/** React hook: 读取 + 保存 step 的 spec */
export function useStrategySpec(stepId: string): [ExpertStrategySpec, (spec: ExpertStrategySpec) => void] {
  const [spec, setSpec] = useState<ExpertStrategySpec>(() => loadStrategyFromLocalStorage(stepId));
  useEffect(() => {
    saveStrategyToLocalStorage(stepId, spec);
  }, [stepId, spec]);
  return [spec, setSpec];
}
