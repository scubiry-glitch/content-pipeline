// VariantWorkbench — B 视图 · 三栏工作台（骨架阶段）
// 原型来源：/tmp/mn-proto/variant-b.jsx VariantWorkbench

import { Placeholder } from './_placeholder';

export function VariantWorkbench() {
  return (
    <Placeholder
      title="B · Workbench"
      subtitle="三栏工作台：导航+专家栈 / 维度选择器 / 原文真相"
      protoSrc="variant-b.jsx"
      phase={2}
      preview={
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 240px', gap: 12, maxWidth: 1040 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>导航 · 专家 · 调用历史</div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>维度切换 · 张力 / 新认知 / focus map 等</div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>原文片段 / 证据锚点</div>
        </div>
      }
    />
  );
}

export default VariantWorkbench;
