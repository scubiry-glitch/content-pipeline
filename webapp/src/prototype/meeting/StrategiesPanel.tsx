// StrategiesPanel — §6.3/6.4/6.5 参考表（骨架阶段）
// 原型来源：/tmp/mn-proto/strategy-panel.jsx StrategiesTable / DecoratorsTable / PresetsTable

import { Placeholder } from './_placeholder';
import { STRATEGIES, DECORATORS, PRESETS } from './_fixtures';

export function StrategiesPanel() {
  return (
    <Placeholder
      title="策略 · 装饰器 · 预设"
      subtitle="§6.3 Base Strategies(4) · §6.4 Decorators(9) · §6.5 Presets(lite/standard/max)"
      protoSrc="strategy-panel.jsx · StrategiesTable / DecoratorsTable / PresetsTable"
      phase={7}
      preview={
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Strategies · {STRATEGIES.length}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
              {STRATEGIES.map((s) => <div key={s.id}>· {s.label}</div>)}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Decorators · {DECORATORS.length}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
              {DECORATORS.slice(0, 5).map((d) => <div key={d.id}>· {d.label}</div>)}
              <div style={{ color: 'var(--ink-4)' }}>… +{DECORATORS.length - 5}</div>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Presets · {PRESETS.length}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
              {PRESETS.map((p) => <div key={p.id}>· {p.label} ({p.cost})</div>)}
            </div>
          </div>
        </div>
      }
    />
  );
}

export default StrategiesPanel;
