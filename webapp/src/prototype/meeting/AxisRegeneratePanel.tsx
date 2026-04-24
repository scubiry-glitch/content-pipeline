// AxisRegeneratePanel — 轴内快捷重算浮层（骨架阶段）
// 原型来源：/tmp/mn-proto/axis-regenerate.jsx AxisRegeneratePanel

import { Placeholder } from './_placeholder';

export function AxisRegeneratePanel() {
  return (
    <Placeholder
      title="轴内快捷重算"
      subtitle="在任何一条轴页面上浮现的面板：选子维度 / scope / preset → 直接触发 run"
      protoSrc="axis-regenerate.jsx · AxisRegeneratePanel"
      phase={6}
      preview={
        <div style={{ fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--sans)', lineHeight: 1.7 }}>
          这个组件会作为四个 Axis 页面共享的浮层，支持在不离开本页的情况下重跑本轴对应的 run。<br />
          接 <code>enqueueRun(&#123; scope, axis, subDims, preset, strategy &#125;)</code>。
        </div>
      }
    />
  );
}

export default AxisRegeneratePanel;
