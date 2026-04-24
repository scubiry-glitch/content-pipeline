// AxisPeople — 人物轴（骨架阶段）
// 原型来源：/tmp/mn-proto/dimensions-people.jsx DimensionPeople

import { Placeholder } from './_placeholder';

export function AxisPeople() {
  return (
    <Placeholder
      title="人物轴"
      subtitle="4 sub-tab：承诺兑现 · 角色演化 · 发言质量 · 沉默信号"
      protoSrc="dimensions-people.jsx"
      phase={3}
      preview={
        <ul style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8, fontFamily: 'var(--sans)', paddingLeft: 18, margin: 0 }}>
          <li>承诺 · ACK / 履约 / 延期 / 作废（<b>后端缺口 #4</b>）</li>
          <li>轨迹 · 角色演化时间线</li>
          <li>发言 · 信息熵 · 问答比 · 术语密度（<b>后端缺口 #6</b>）</li>
          <li>沉默 · 在哪些议题上沉默 + 推测立场（<b>后端缺口 #5</b>）</li>
        </ul>
      }
    />
  );
}

export default AxisPeople;
