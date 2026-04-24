// ScopeExpertConfig — 专家调用系统的作用层配置（骨架阶段）
// 原型来源：/tmp/mn-proto/scope-expert-config.jsx ScopeExpertConfig

import { Placeholder } from './_placeholder';

export function ScopeExpertConfig() {
  return (
    <Placeholder
      title="调用配置 · 作用层"
      subtitle="meeting / project / library 三层 scope 切换，配每层的专家 + 策略 + 装饰器栈"
      protoSrc="scope-expert-config.jsx"
      phase={7}
      preview={
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7, fontFamily: 'var(--sans)' }}>
          单会议 scope：按本场的话题特征临时装配；<br />
          project scope：按项目长期沉淀的习惯装配；<br />
          library scope：全库维度，主要喂给心智模型命中率与判断库。
        </div>
      }
    />
  );
}

export default ScopeExpertConfig;
