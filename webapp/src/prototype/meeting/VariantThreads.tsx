// VariantThreads — C 视图 · 人物编织（骨架阶段）
// 原型来源：/tmp/mn-proto/variant-c.jsx VariantThreads

import { Placeholder } from './_placeholder';

export function VariantThreads() {
  return (
    <Placeholder
      title="C · Threads"
      subtitle="人物/观点关系编织：信念线 · 共识叉图 · focus nebula"
      protoSrc="variant-c.jsx"
      phase={2}
      preview={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--sans)' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
            Thread view — 每位参与者一条横向信念线，会议中观点的演化用节点标记。<br />
            Consensus graph — 对每条 divergence，用双向 fork 图展示两派的人员与理由。<br />
            Focus nebula — 把 focus map 转为星云图，每个议题是一个中心，围绕它的参与者是卫星。
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            后端需补：张力分类（#1）· 共识叉坐标（#2）· nebula 节点关系（#3）
          </div>
        </div>
      }
    />
  );
}

export default VariantThreads;
