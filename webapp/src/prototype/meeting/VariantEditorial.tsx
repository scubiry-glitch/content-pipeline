// VariantEditorial — A 视图 · 文档精读（骨架阶段）
// 原型来源：/tmp/mn-proto/variant-a.jsx VariantEditorial

import { Placeholder } from './_placeholder';

export function VariantEditorial() {
  return (
    <Placeholder
      title="A · Editorial"
      subtitle="文档式精读：三栏（目录+元数据 / 主体 / 评论侧栏）"
      protoSrc="variant-a.jsx"
      phase={2}
      preview={
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 220px', gap: 12, maxWidth: 1040 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>目录 + 元数据</div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>主体 · 纪要 / 张力 / 新认知 / 共识</div>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>评论侧栏 · 参与者语录</div>
        </div>
      }
    />
  );
}

export default VariantEditorial;
