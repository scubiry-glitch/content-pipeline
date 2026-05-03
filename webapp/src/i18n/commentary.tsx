// commentary.ts — 产品教育 / 批评类静态文案，与数据派生组件隔离
//
// 项目目前只支持中文，这里没引入 i18n 框架；文件本身就是「中文文案的集中处」。
// 将来需要多语 / A/B 时再升级为按 locale 解析的 lookup。
//
// 每个 export 对应一处 UI narrative。用 React 节点保留 <b>/<i> 等排版语义。
// 数据相关动态文案（高危假设具体 ID、证据分布数字、反常沉默的人名等）走
// Phase 5/6/7 的派生路径，不放进本文件。

import type { ReactNode } from 'react';

// AxisProjects · 假设清单 (Assumptions ledger) ─────────────────────────────────

/** 假设清单顶部说明 */
export const ASSUMPTIONS_INTRO: ReactNode = (
  <>把决议背后的 <b>未经验证的信念</b> 明摆出来，并给每一条安排一个 verifier 和 deadline。
    这就是<i>"把会议室里的自信变成可验证的 bet"</i>。</>
);

/** 假设清单底部"机制价值"callout 正文 */
export const ASSUMPTIONS_MECHANISM_VALUE: ReactNode = (
  <>这张表让团队习惯把<i>"我觉得"</i>翻译成可证伪的陈述。
    3 个月后回头看，被证伪的假设是最有价值的学习材料。</>
);

// AxisProjects · 风险热度 (Risk heat) ──────────────────────────────────────────

/** 风险热度底部"批判：热度是滞后指标"callout 正文 */
export const RISKS_LAGGING_CRITIQUE: ReactNode = (
  <>到它变热的时候，往往已经晚了。配合<i>假设清单</i>一起读 ——
    每个孤儿风险背后都有一条快要崩掉的假设。</>
);

// AxisPeople · 沉默信号 (Silence signals) ─────────────────────────────────────

/** 沉默信号顶部说明 */
export const SILENCE_INTRO: ReactNode = (
  <>反常的沉默 = 这个议题他过去总会参与，但这次没有。可能是让步、回避、不适、不同意却不便说。
    <b> 最危险的信息往往藏在没说的话里。</b></>
);

/** 沉默信号底部"批判：沉默也会误报"callout 正文 */
export const SILENCE_FALSE_POSITIVE_CRITIQUE: ReactNode = (
  <>不是所有沉默都值得深究。需要和<i>议程优先级、发言机会窗口</i>一起看 ——
    如果议题只谈了 3 分钟，没人来得及说话，那不是信号，那是噪声。</>
);
