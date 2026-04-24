// AxisKnowledge — 知识轴（骨架阶段）
// 原型来源：/tmp/mn-proto/dimensions-knowledge.jsx DimensionKnowledge

import { Placeholder } from './_placeholder';

export function AxisKnowledge() {
  return (
    <Placeholder
      title="知识轴"
      subtitle="4 sub-tab：判断库 · 心智模型 · 证据 · 偏误"
      protoSrc="dimensions-knowledge.jsx"
      phase={3}
      preview={
        <ul style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8, fontFamily: 'var(--sans)', paddingLeft: 18, margin: 0 }}>
          <li>判断库 — 跨会议沉淀的 judgments + 置信/时效（<b>后端缺口 #11</b>）</li>
          <li>心智模型 — 触发历史 + 命中率（<b>后端缺口 #12</b>）</li>
          <li>证据 — 评级 + 来源链</li>
          <li>偏误 — anchoring / sunk-cost / confirmation 检测（<b>后端缺口 #13</b>）</li>
        </ul>
      }
    />
  );
}

export default AxisKnowledge;
