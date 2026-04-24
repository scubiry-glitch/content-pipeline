// AxisMeta — 会议本身轴（骨架阶段）
// 原型来源：/tmp/mn-proto/dimensions-meta.jsx DimensionMeta

import { Placeholder } from './_placeholder';

export function AxisMeta() {
  return (
    <Placeholder
      title="会议本身"
      subtitle="3 sub-tab：决策质量 · 必要性 · 情绪热力"
      protoSrc="dimensions-meta.jsx"
      phase={3}
      preview={
        <ul style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8, fontFamily: 'var(--sans)', paddingLeft: 18, margin: 0 }}>
          <li>决策质量 — rubric 5 维评分（<b>后端缺口 #14</b>）</li>
          <li>必要性 — 本会议可否被替代 + 节省时间（<b>后端缺口 #15</b>）</li>
          <li>情绪 — valence × intensity 时间曲线（<b>后端缺口 #16</b>）</li>
        </ul>
      }
    />
  );
}

export default AxisMeta;
