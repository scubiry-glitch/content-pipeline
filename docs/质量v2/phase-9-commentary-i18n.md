# Phase 9 · 静态产品文案 i18n 抽离

## 现状

Phase 5–7 把"高危假设 / 证据分布 / 反常沉默"三组数据型 callout 改成了真实派生。但 callout 周围还有一类**产品教育文案 / 批评提醒** —— 它们与具体数据无关，是产品对用户的解释/警告 narrative，目前直接以 JSX 字面量内嵌在组件里：

| 文件:行 | 文案 | 类型 |
|---|---|---|
| `AxisProjects.tsx:424` | "这就是『把会议室里的自信变成可验证的 bet』" | 假设清单导引 |
| `AxisProjects.tsx:535-536` | "机制价值"卡片正文（"这张表让团队习惯把『我觉得』翻译成可证伪的陈述。3 个月后回头看…"） | 机制价值 |
| `AxisProjects.tsx:773-775` | "批判：热度是滞后指标" | 风险卡反思 |
| `AxisPeople.tsx:617` | "最危险的信息往往藏在没说的话里" | 沉默信号导引 |
| `AxisPeople.tsx:713-714` | "批判：沉默也会误报"正文 | 沉默卡反思 |

这些不需要 i18n 框架（项目现在只支持中文），但应该集中放一个文件：

- 改文案不用动业务组件
- 后续真要做多语 / 文案 A/B 时只是替换数据来源
- 评论性文字与逻辑代码解耦，便于内容运营独立维护

## 设计

新增 `webapp/src/i18n/commentary.ts`：

```ts
// commentary.ts — 产品教育 / 批评类静态文案，与数据派生隔离
// 每个 export 对应一处 UI narrative。用 React 节点（含 <b>/<i>）保留排版。

import type { ReactNode } from 'react';

export const ASSUMPTIONS_INTRO: ReactNode = (
  <>把决议背后的 <b>未经验证的信念</b> 明摆出来，并给每一条安排一个 verifier 和 deadline。
    这就是<i>"把会议室里的自信变成可验证的 bet"</i>。</>
);

export const ASSUMPTIONS_MECHANISM: ReactNode = (
  <>这张表让团队习惯把<i>"我觉得"</i>翻译成可证伪的陈述。
    3 个月后回头看，被证伪的假设是最有价值的学习材料。</>
);

export const RISKS_LAGGING_CRITIQUE: ReactNode = (
  <>到它变热的时候，往往已经晚了。配合<i>假设清单</i>一起读 ——
    每个孤儿风险背后都有一条快要崩掉的假设。</>
);

export const SILENCE_INTRO: ReactNode = (
  <>反常的沉默 = 这个议题他过去总会参与，但这次没有。可能是让步、回避、不适、不同意却不便说。
    <b> 最危险的信息往往藏在没说的话里。</b></>
);

export const SILENCE_FALSE_POSITIVE_CRITIQUE: ReactNode = (
  <>不是所有沉默都值得深究。需要和<i>议程优先级、发言机会窗口</i>一起看 ——
    如果议题只谈了 3 分钟，没人来得及说话，那不是信号，那是噪声。</>
);
```

替换：

- `AxisProjects.tsx` 假设清单 intro：原 inline → `<>{ASSUMPTIONS_INTRO}</>`
- 同文件"机制价值"卡片：原 inline → `<CalloutCard title="机制价值">{ASSUMPTIONS_MECHANISM}</CalloutCard>`
- 同文件"批判：热度是滞后指标"卡片
- `AxisPeople.tsx` 沉默 intro 段
- 同文件"批判：沉默也会误报"卡片

**保留不动：**
- `AxisProjects.tsx:515` "D 级假设不该出现在 current 决议的支撑链里 —— 它是噪音级别的" 在 isMock 分支里 + 已有 dynamic 版本（Phase 6 添加）。这是 mock fallback 文案，不抽。
- 数据相关动态文案（"AS-04 (LP 反弹) 和 AS-02..." 等）—— Phase 5/7 已派生掉，不在 i18n 范围。

## AxisRegeneratePanel 同步

i18n 文案不影响 sub-dim 注册或重算路径。无需改 panel。

## 回归

1. `cd webapp && npx tsc --noEmit` exit 0
2. dev：核对每处文案视觉与原版完全一致（包含粗体 / 斜体）
3. grep 验证："机制价值" / "批判：热度" / "批判：沉默" / "把会议室里的自信" / "最危险的信息" 在三个 axis 文件里都不再有 inline 出现，只在 `i18n/commentary.ts` 里一处

## 提交

```
git add webapp/src/i18n/commentary.ts \
        webapp/src/prototype/meeting/AxisProjects.tsx \
        webapp/src/prototype/meeting/AxisPeople.tsx \
        docs/质量v2/phase-9-commentary-i18n.md
git commit -m "refactor(web/mn): 静态产品文案抽到 webapp/src/i18n/commentary.ts(Phase 9)"
```

## 质量提升效果

- 5 处产品教育 / 批评 narrative 从 JSX 字面量 → 集中配置文件
- 改文案不再需要动业务组件 → 内容运营可独立维护
- 后续多语 / 文案 A/B 测试只需替换 `commentary.ts` 实现
- 业务组件代码减少 narrative 噪音，逻辑可读性提升
