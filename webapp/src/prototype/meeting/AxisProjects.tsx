// AxisProjects — 项目轴（骨架阶段）
// 原型来源：/tmp/mn-proto/dimensions-projects.jsx DimensionProjects

import { Placeholder } from './_placeholder';

export function AxisProjects() {
  return (
    <Placeholder
      title="项目轴"
      subtitle="4 sub-tab：决议溯源 · 假设清单 · 开放问题 · 风险热度"
      protoSrc="dimensions-projects.jsx"
      phase={3}
      preview={
        <ul style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8, fontFamily: 'var(--sans)', paddingLeft: 18, margin: 0 }}>
          <li>决议溯源 — 一条决议往回追 N 层假设与依据（<b>后端缺口 #7</b>）</li>
          <li>假设清单 — 附 supersede 关系（<b>后端缺口 #8</b>）</li>
          <li>开放问题 — open / blocked / stale 分类（<b>后端缺口 #9</b>）</li>
          <li>风险热度 — 2D 矩阵：影响 × 概率（<b>后端缺口 #10</b>）</li>
        </ul>
      }
    />
  );
}

export default AxisProjects;
