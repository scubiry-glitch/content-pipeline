// LongitudinalView — 纵向视图 · 跨会议（骨架阶段）
// 原型来源：/tmp/mn-proto/longitudinal.jsx LongitudinalView / BeliefDrift / DecisionTree / ModelHitrate

import { Placeholder } from './_placeholder';

export function LongitudinalView() {
  return (
    <Placeholder
      title="纵向视图 · 跨会议"
      subtitle="三 tab：信念漂移 · 决策树 · 心智模型命中率"
      protoSrc="longitudinal.jsx"
      phase={7}
      preview={
        <ul style={{
          fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7,
          fontFamily: 'var(--sans)', paddingLeft: 18, margin: 0,
        }}>
          <li>信念漂移 — 同主题在多场会议间的立场变化曲线（接 <code>getLongitudinal(scopeId, 'belief_drift')</code>）</li>
          <li>决策树 — 跨会议决策链 + 分叉与合并（接 <code>getLongitudinal(scopeId, 'decision_tree')</code>）</li>
          <li>心智模型命中率 — 每种 model 在历次决策中的触发与准确率（接 <code>getLongitudinal(scopeId, 'model_hit_rate')</code>）</li>
        </ul>
      }
    />
  );
}

export default LongitudinalView;
